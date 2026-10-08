// Codex features end to end in the real app: connecting the CLI, Smart organizing on the Organize desk,
// Suggest missing tags, Suggest a restructure and Suggest aliases, each approved through its review and
// checked against the workspace afterwards. Runs against an isolated synthetic workspace
// (scripts/codex-demo-data.cjs) and the Codex CLI installed and signed in on this computer, so it uses the
// account's Codex limits and sends only invented data. Records one video per feature under
// private/validation/codex-<time>/videos (MP4 too when ffmpeg is on PATH).
//
//   node scripts/smoke-codex.cjs [--model gpt-6-luna] [--install] [--only organize,tags,...]
//
// --install also records installing Codex with npm into a private prefix inside the validation folder
// (URBANOMICS_CODEX_PREFIX), leaving the computer's own Codex untouched.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { startWebServer } = require("../electron/web-server.cjs");
const { seedCodexDemo } = require("./codex-demo-data.cjs");

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const MODEL = arg("--model") || "gpt-6-luna", ONLY = arg("--only")?.split(","), INSTALL = process.argv.includes("--install");
const wanted = (name) => !ONLY || ONLY.includes(name);
const root = path.resolve("private/validation/codex-" + Date.now()), videos = path.join(root, "videos");
fs.mkdirSync(videos, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// A visible pointer for the recordings, kept above dialogs by living in the top layer.
const pointer = () => addEventListener("DOMContentLoaded", () => {
  const d = document.createElement("div");
  d.setAttribute("popover", "manual");
  Object.assign(d.style, { position: "fixed", inset: "auto", left: "0", top: "0", width: "20px", height: "20px", margin: "-10px 0 0 -10px", padding: "0", border: "2px solid rgb(38 92 58 / 0.9)", borderRadius: "50%", background: "rgb(70 140 90 / 0.25)", pointerEvents: "none", transition: "transform 180ms ease-out, background 120ms", overflow: "visible" });
  document.body.append(d); d.showPopover();
  const lift = () => { d.hidePopover(); d.showPopover(); };
  new MutationObserver(lift).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  addEventListener("mousemove", (e) => { d.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, true);
  addEventListener("mousedown", () => { d.style.background = "rgb(70 140 90 / 0.7)"; }, true);
  addEventListener("mouseup", () => { d.style.background = "rgb(70 140 90 / 0.25)"; }, true);
});

(async () => {
  const server = await startWebServer({ root: path.join(root, "data"), port: 0, seed: false }), store = server.store;
  seedCodexDemo(store, root);
  const call = async (channel, ...args) => { const r = await server.service.invoke(channel, ...args); if (!r.ok) throw new Error(`${channel}: ${r.error}`); return r.value; };
  const status = await call("ai:state", true);
  assert.ok(status.codex.installed, "Codex CLI is installed on this computer");
  assert.ok(status.codex.signedIn, "Codex is signed in on this computer");
  const models = await call("ai:models");
  assert.ok(models.some((m) => m.id === MODEL), `${MODEL} is offered by this account`);
  log(`Codex ${status.codex.version}, ${models.length} models, testing with ${MODEL}`);

  const browser = await chromium.launch({ channel: "chrome", headless: true }), errors = [], results = {};
  async function scene(name, origin, fn) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(videos, "raw-" + name), size: { width: 1440, height: 900 } } });
    await context.addInitScript(pointer);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    await page.mouse.move(900, 500); // start away from the sidebar rail, which opens on hover
    const started = Date.now();
    try { await fn(page, origin); }
    catch (e) { await page.screenshot({ path: path.join(root, `failed-${name}.png`) }).catch(() => {}); throw e; }
    finally {
      await page.waitForTimeout(800);
      const video = page.video(); await context.close();
      const file = path.join(videos, name + ".webm");
      fs.renameSync(await video.path(), file); fs.rmSync(path.join(videos, "raw-" + name), { recursive: true, force: true });
      if (spawnSync("ffmpeg", ["-version"]).status === 0) {
        spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", file.replace(/\.webm$/, ".mp4")]);
        // Long runs also get a 4× time-lapse.
        if (Date.now() - started > 3 * 60 * 1000) spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-vf", "setpts=PTS/4", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "25", "-movflags", "+faststart", file.replace(/\.webm$/, "-4x.mp4")]);
      }
      log(`${name}: ${Math.round((Date.now() - started) / 1000)} s recorded`);
    }
  }
  // Pointer-visible helpers: move there, then act.
  const moveTo = async (page, locator) => { await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox(); if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 }); await page.waitForTimeout(150); };
  const click = async (page, locator) => { await moveTo(page, locator); await locator.click(); };
  const type = async (page, locator, text) => { await click(page, locator); await locator.fill(""); await locator.pressSequentially(text, { delay: 45 }); };
  const pause = (page, ms = 1200) => page.waitForTimeout(ms);
  const settle = async (page) => { await page.waitForTimeout(100); await page.waitForFunction(() => !document.querySelector(".organize-desk[data-busy]"), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(250); };

  try {
    if (INSTALL && wanted("install")) {
      // A second host whose Codex lives only in a private prefix, so installing touches nothing else.
      // Its own empty CODEX_HOME, too, so it starts signed out and the computer's sign-in is untouched.
      const prefix = path.join(root, "codex-prefix"), home = path.join(root, "codex-home"); fs.mkdirSync(prefix, { recursive: true }); fs.mkdirSync(home, { recursive: true });
      const child = spawn(process.execPath, ["-e", `require(${JSON.stringify(path.resolve("electron/web-server.cjs"))}).startWebServer({root:${JSON.stringify(path.join(root, "install-data"))},port:0}).then(s=>console.log("ORIGIN "+s.origin))`], { env: { ...process.env, URBANOMICS_CODEX_PREFIX: prefix, CODEX_HOME: home }, stdio: ["ignore", "pipe", "inherit"] });
      const origin = await new Promise((resolve, reject) => { child.stdout.on("data", (d) => { const m = String(d).match(/ORIGIN (\S+)/); if (m) resolve(m[1]); }); child.on("exit", () => reject(new Error("Install host stopped."))); });
      try {
        await scene("00-install-codex", origin, async (page) => {
          await page.goto(origin + "/#settings/codex"); await page.getByText("It isn't on this computer yet").waitFor({ timeout: 30000 }); await pause(page, 1500);
          await click(page, page.getByRole("button", { name: "Install Codex" }));
          await page.getByText(/Codex [\d.]+ is installed/).waitFor({ timeout: 10 * 60 * 1000 }); await pause(page, 1500);
          results.install = await page.locator(".cx-status").first().innerText();
          // Sign-in opens ChatGPT's own page; finishing it needs the person, so the run checks the page and cancels.
          const signIn = page.getByRole("button", { name: "Sign in with ChatGPT" }); await signIn.waitFor({ timeout: 60000 }); await pause(page, 1500);
          const popup = page.waitForEvent("popup", { timeout: 30000 });
          await click(page, signIn);
          const auth = await popup; await auth.waitForLoadState("domcontentloaded").catch(() => {});
          results.signInPage = new URL(auth.url()).origin; await auth.close();
          await page.getByText("Finish signing in with ChatGPT in your browser.").waitFor({ timeout: 30000 }); await pause(page, 2500);
          await click(page, page.getByRole("button", { name: "Cancel" })); await signIn.waitFor({ timeout: 30000 }); await pause(page, 1500);
          assert.match(results.signInPage, /^https:\/\/(auth\.openai\.com|chatgpt\.com)/, "sign-in opens OpenAI");
        });
      } finally { child.kill(); }
    }

    if (wanted("connect")) await scene("01-connect-codex", server.origin, async (page, origin) => {
      await page.goto(origin + "/#settings/codex"); await page.getByText(/Codex [\d.]+ is installed/).waitFor({ timeout: 30000 });
      await page.getByText(/Signed in with ChatGPT/).waitFor({ timeout: 30000 }); await pause(page, 1500);
      await click(page, page.getByText("Let Codex read my transactions when I ask for a suggestion")); await page.getByRole("button", { name: "Try the connection" }).waitFor();
      await pause(page, 800);
      for (const [feature, effort] of [["Suggest missing tags", "low"], ["Suggest a restructure", "medium"], ["Suggest aliases", "low"], ["Smart organizing", "low"]]) {
        const model = page.getByLabel("Model for " + feature); await moveTo(page, model); await model.selectOption(MODEL); await pause(page, 500);
        const reasoning = page.getByLabel("Reasoning for " + feature); await moveTo(page, reasoning); await reasoning.selectOption(effort); await pause(page, 500);
      }
      await click(page, page.getByText("Suggest when I open a transaction")); await pause(page, 800);
      await click(page, page.getByRole("button", { name: "Try the connection" }));
      await page.locator(".toast-item", { hasText: "Codex answered" }).waitFor({ timeout: 120000 }); await pause(page, 2000);
      const s = (await call("ai:state")).settings;
      assert.equal(s.consent, true); assert.equal(s.smartOrganize, true);
      assert.deepEqual(s.features.restructure, { model: MODEL, effort: "medium" }); assert.deepEqual(s.features.organize, { model: MODEL, effort: "low" });
    });
    else await call("ai:settings", { consent: true, smartOrganize: true, features: Object.fromEntries(["tags", "restructure", "aliases", "organize"].map((f) => [f, { model: MODEL, effort: f === "restructure" ? "medium" : "low" }])) });

    if (wanted("organize")) await scene("02-smart-organizing", server.origin, async (page, origin) => {
      await page.goto(origin + "/#organize"); await page.locator(".od-ledger").waitFor(); await pause(page, 1500);
      const row = (name) => store.review.records().find((r) => r.description === name && r.date === picks.find((p) => p[1] === name)[2]);
      const picks = [["green market", "GREEN MARKET #0021", "2026-09-22"], ["tfr to savings", "TFR TO SAVINGS", "2026-08-16"], ["e-transfer received sam", "E-TRANSFER RECEIVED SAM RIVERA", "2026-08-20"], ["shoreline", "SHORELINE FUEL 88", "2026-08-15"], ["petpal", "PETPAL SUPPLIES 39", "2026-09-08"], ["e-transfer sent priya", "E-TRANSFER SENT PRIYA NAIR", "2026-09-12"]];
      results.organize = [];
      for (const [query, name, date] of picks) {
        await type(page, page.getByLabel("Find a transaction"), query); await pause(page, 500);
        const target = page.locator(`[data-row="${row(name).id}"] .od-row-main`); await click(page, target);
        await page.locator(`[data-row="${row(name).id}"] .od-suggest:not(.is-loading)`).waitFor({ timeout: 120000 }); await pause(page, 2200);
        const panel = page.locator(`[data-row="${row(name).id}"] .od-suggest`), text = (await panel.innerText()).replace(/\n+/g, " | ");
        const apply = panel.getByRole("button", { name: /^Apply/ });
        if (await apply.count()) { await click(page, apply); await settle(page); await pause(page, 1600); }
        const after = store.review.records().find((r) => r.id === row(name).id);
        results.organize.push({ name, date, suggested: text, tags: after.review.tags.map((t) => store.review.entities().find((e) => e.id === t.id)?.name), kind: after.review.kind, transfer: !!after.review.transferId, person: after.review.personId || after.review.assignedPersonId || "", groups: after.review.groups.length });
        log("organize", name, "→", JSON.stringify(results.organize.at(-1)));
        await page.keyboard.press("Escape"); await pause(page, 400);
      }
      const done = results.organize.filter((r) => r.tags.length || r.transfer || r.person || r.groups);
      assert.ok(done.length >= 4, `smart organizing sorted ${done.length} of ${picks.length} rows`);
      assert.ok(results.organize.find((r) => r.name === "TFR TO SAVINGS").transfer, "the savings transfer was linked to its twin");
    });

    if (wanted("tags")) await scene("03-suggest-missing-tags", server.origin, async (page, origin) => {
      const before = store.review.entities().filter((e) => e.kind === "category").length;
      await page.goto(origin + "/#settings/category"); await page.locator(".th-groups").waitFor(); await pause(page, 1200);
      await click(page, page.getByRole("button", { name: "Suggest" })); await pause(page, 600);
      await click(page, page.getByText("Suggest missing tags", { exact: true }));
      await page.locator(".cx-item").first().waitFor({ timeout: 240000 }); await pause(page, 2500);
      const items = page.locator(".cx-item"), count = await items.count();
      for (let i = 0; i < Math.min(count, 6); i++) { await moveTo(page, items.nth(i)); await pause(page, 700); }
      if (count > 2) { await click(page, items.nth(count - 1).locator('input[type="checkbox"]').first()); await pause(page, 800); }
      const create = page.getByRole("button", { name: /^Create \d+ tags?$/ }); await click(page, create);
      await page.getByRole("button", { name: "Close", exact: true }).waitFor({ timeout: 120000 }); await pause(page, 2500);
      results.tags = await page.locator(".cx-outcome").allInnerTexts();
      await click(page, page.getByRole("button", { name: "Close", exact: true })); await pause(page, 1500);
      await page.mouse.wheel(0, 500); await pause(page, 1500);
      const after = store.review.entities().filter((e) => e.kind === "category").length;
      assert.ok(after > before, "approved tags were created");
      log("missing tags:", results.tags.join(" · "));
    });

    if (wanted("restructure")) await scene("04-suggest-restructure", server.origin, async (page, origin) => {
      await page.goto(origin + "/#settings/category"); await page.locator(".th-groups").waitFor(); await pause(page, 1200);
      await click(page, page.getByRole("button", { name: "Suggest" })); await pause(page, 600);
      await click(page, page.getByText("Suggest a restructure", { exact: true }));
      await page.locator(".cx-item, .workspace-dialog .empty-state").first().waitFor({ timeout: 300000 }); await pause(page, 3000);
      const items = page.locator(".cx-item"), count = await items.count();
      for (let i = 0; i < count; i++) { await moveTo(page, items.nth(i)); await pause(page, 700); }
      const apply = page.getByRole("button", { name: /^Apply \d+ changes?$/ });
      if (await apply.count()) {
        await click(page, apply);
        await page.getByRole("button", { name: "Close", exact: true }).waitFor({ timeout: 120000 }); await pause(page, 2500);
        results.restructure = await page.locator(".cx-outcome").allInnerTexts();
      } else results.restructure = ["no changes suggested"];
      await click(page, page.getByRole("button", { name: /^(Close|Cancel)$/ }).last()); await pause(page, 2000);
      log("restructure:", results.restructure.join(" · "));
    });

    if (wanted("aliases")) await scene("05-suggest-aliases", server.origin, async (page, origin) => {
      await page.goto(origin + "/#settings/aliases"); await page.locator(".aliases-workspace").waitFor(); await pause(page, 1200);
      await click(page, page.getByRole("button", { name: "Suggest aliases" }));
      await page.locator(".cx-item").first().waitFor({ timeout: 240000 }); await pause(page, 2500);
      // Rename one suggestion before saving, to show the review is editable.
      const names = page.getByLabel("Alias name"), values = await names.evaluateAll((els) => els.map((e) => e.value));
      const pick = values.findIndex((v) => /^Paycheque from /i.test(v));
      if (pick >= 0) { await type(page, names.nth(pick), "Northwind payroll"); await pause(page, 1500); }
      const items = page.locator(".cx-item"), count = await items.count();
      for (let i = 1; i < Math.min(count, 6); i++) { await moveTo(page, items.nth(i)); await pause(page, 500); }
      await click(page, page.getByRole("button", { name: /^Save \d+ alias(es)?$/ }));
      await page.getByRole("button", { name: "Close", exact: true }).waitFor({ timeout: 120000 }); await pause(page, 2000);
      results.aliases = await page.locator(".cx-outcome").allInnerTexts();
      await click(page, page.getByRole("button", { name: "Close", exact: true })); await pause(page, 2500);
      assert.ok(store.aliases.rules().length > 0, "approved aliases were saved");
      log("aliases:", store.aliases.rules().map((r) => r.name).join(", "));
    });

    if (wanted("batch")) await scene("06-suggest-for-all-unsorted", server.origin, async (page, origin) => {
      // Smart organizing off: the batch is its own action. Stars show idle, loading and ready per row.
      await call("ai:settings", { smartOrganize: false });
      await page.goto(origin + "/#organize"); await page.locator(".od-ledger").waitFor(); await pause(page, 1500);
      const unsortedBefore = await page.locator(".od-count").first().innerText();
      await click(page, page.getByRole("button", { name: "Suggest for all unsorted" }));
      await page.locator(".od-batch-run").waitFor(); await pause(page, 6000);
      await page.mouse.wheel(0, 400); await pause(page, 4000); await page.mouse.wheel(0, -400);
      await page.locator(".od-batch-run").waitFor({ state: "detached", timeout: 20 * 60 * 1000 }); await pause(page, 2000);
      const ready = await page.locator(".od-star.is-ready").count(), idle = await page.locator(".od-star.is-idle").count();
      results.batch = { unsortedBefore, ready, idle, applied: [] };
      assert.ok(ready > 0, "the batch left suggestions on unsorted rows");
      await click(page, page.locator(".toast-item").getByRole("button", { name: "Show them" })); await pause(page, 1500);
      // Go through three suggested rows: open, apply, and the desk moves on to the next suggested one.
      await click(page, page.locator(".od-row-main").first());
      for (let i = 0; i < 3; i++) {
        const open = page.locator(".od-row.is-open"); await open.locator(".od-suggest:not(.is-loading)").waitFor({ timeout: 120000 }); await pause(page, 1800);
        const name = await open.locator(".od-who > b").innerText(), apply = open.locator(".od-suggest").getByRole("button", { name: /^Apply/ });
        if (!(await apply.count())) break;
        await click(page, apply); await settle(page); await pause(page, 1500);
        results.batch.applied.push(name);
      }
      log("batch:", JSON.stringify(results.batch));
      assert.ok(results.batch.applied.length >= 2, "suggested rows can be applied one after another");
    });

    // Fresh workspaces for the next two, so neither starts from what the earlier scenes did.
    const extras = [];
    async function freshWorkspace(name, options) {
      const extra = await startWebServer({ root: path.join(root, name), port: 0, seed: false }); extras.push(extra);
      seedCodexDemo(extra.store, root, options);
      const r = await extra.service.invoke("ai:settings", { consent: true, smartOrganize: false, autoApply: false, features: Object.fromEntries(["tags", "restructure", "aliases", "organize"].map((f) => [f, { model: MODEL, effort: f === "restructure" ? "medium" : "low" }])) });
      assert.ok(r.ok, r.error);
      return extra;
    }

    // Ten earlier months make 313 unsorted rows, the size where batches used to lose rows.
    if (wanted("auto")) { const extra = await freshWorkspace("auto-data", { history: 10 }); await scene("07-organize-all-automatically", extra.origin, async (page, origin) => {
      const untagged = () => extra.store.review.records().filter((r) => !r.deleted && r.amountCents !== 0 && !r.review.tags.length && !r.review.transferId && r.review.kind !== "repayment" && !r.review.assignedPersonId).length;
      const before = untagged();
      await page.goto(origin + "/#organize"); await page.locator(".od-ledger").waitFor(); await pause(page, 1500);
      await click(page, page.getByText("Apply automatically")); await page.getByRole("button", { name: "Organize all unsorted" }).waitFor(); await pause(page, 1000);
      const started = Date.now();
      await click(page, page.getByRole("button", { name: "Organize all unsorted" }));
      await page.locator(".od-batch-run").waitFor(); await pause(page, 5000);
      await page.mouse.wheel(0, 500); await pause(page, 4000); await page.mouse.wheel(0, -500);
      await page.locator(".od-batch-run").waitFor({ state: "detached", timeout: 30 * 60 * 1000 });
      const seconds = Math.round((Date.now() - started) / 1000); await pause(page, 2500);
      // Every row ends in exactly one outcome: the counts in the closing toast add up to the rows queued.
      const summary = await page.locator(".toast-item", { hasText: "Codex went through" }).innerText();
      const total = Number(summary.match(/went through (\d+)/)[1]), outcomes = [...summary.matchAll(/(\d+) (?:rows? organized|waits?|had nothing|already sorted|failed)/g)].map((m) => Number(m[1]));
      assert.equal(outcomes.reduce((a, b) => a + b, 0), total, "outcome counts add up to the rows queued: " + summary);
      assert.equal(total, before, "every unsorted row was queued");
      // The Unsorted and Suggested chips agree with the summary: what is left unsorted is exactly what waits for review, had nothing, failed or was only partly organized.
      const chip = async (name) => Number((await page.getByRole("button", { name: new RegExp("^" + name) }).first().innerText()).match(/(\d+)\s*$/)?.[1] || 0);
      const n = (re) => Number(summary.match(re)?.[1] || 0);
      assert.equal(await chip("Unsorted"), n(/(\d+) waits? for review/) + n(/(\d+) had nothing/) + n(/(\d+) failed/) + n(/\((\d+) still/), "Unsorted chip matches the summary");
      if (await page.getByRole("button", { name: /^Suggested/ }).count()) assert.equal(await chip("Suggested"), n(/(\d+) waits? for review/), "Suggested chip matches the rows waiting for review");
      await click(page, page.locator(".toast-item").getByRole("button", { name: "Review them" })); await pause(page, 2500);
      await page.mouse.wheel(0, 600); await pause(page, 2000); await page.mouse.wheel(0, 600); await pause(page, 2000);
      results.auto = { seconds, summary: summary.replace(/\n+/g, " | "), untaggedBefore: before, untaggedAfter: untagged(), linked: extra.store.review.records().filter((r) => r.review.transferId).length, autoApplied: await page.locator(".od-row").count() };
      log("auto:", JSON.stringify(results.auto));
      assert.ok(results.auto.untaggedAfter < before / 2, "Organize all unsorted applied most suggestions on its own");
      assert.ok(!/(\d+) failed/.test(summary) || Number(summary.match(/(\d+) failed/)[1]) <= total * 0.05, "almost nothing failed once refusals are retried");
    }); }

    if (wanted("scratch")) { const extra = await freshWorkspace("scratch-data", { bare: true }); await scene("08-restructure-from-scratch", extra.origin, async (page, origin) => {
      await page.goto(origin + "/#settings/category"); await page.getByText("No categories yet.").waitFor(); await pause(page, 2000);
      await click(page, page.getByRole("button", { name: "Suggest a structure from my transactions" }));
      await page.locator(".cx-item").first().waitFor({ timeout: 300000 }); await pause(page, 3000);
      const items = page.locator(".cx-item"), count = await items.count();
      for (let i = 0; i < count; i += 3) { await moveTo(page, items.nth(i)); await pause(page, 500); }
      await click(page, page.getByRole("button", { name: /^Apply \d+ changes?$/ }));
      await page.getByRole("button", { name: "Close", exact: true }).waitFor({ timeout: 180000 }); await pause(page, 2500);
      await click(page, page.getByRole("button", { name: "Close", exact: true })); await pause(page, 1500);
      await page.mouse.wheel(0, 500); await pause(page, 2000); await page.mouse.wheel(0, 500); await pause(page, 2000);
      const entities = extra.store.review.entities(), tagged = extra.store.review.records().filter((r) => r.review.tags.length).length;
      results.scratch = { categories: entities.filter((e) => e.kind === "bucket").length, tags: entities.filter((e) => e.kind === "category" && !e.systemRole).length, tagged };
      log("scratch:", JSON.stringify(results.scratch));
      assert.ok(results.scratch.categories >= 3 && results.scratch.tags >= 8, "a structure was created from nothing");
      assert.ok(tagged >= 20, "the new tags were applied to the transactions they fit");
    }); }
    for (const extra of extras) await extra.close();

    assert.deepEqual(errors, [], "no page errors");
    fs.writeFileSync(path.join(root, "results.json"), JSON.stringify(results, null, 2));
    log("Codex smoke passed. Videos:", videos);
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
