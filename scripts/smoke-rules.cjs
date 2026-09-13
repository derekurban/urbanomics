const { _electron } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs"),
  { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "rules-" + randomUUID()),
  dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const store = new ImportStore(dataDir),
  account = store.addAccount("Everyday card", "pc", "credit"),
  second = store.addAccount("Savings", "pc", "savings");
const category = store.review.entity("category", {
    name: "Groceries",
    color: "#78976A",
  }),
  home = store.review.entity("category", { name: "Home", color: "#8FA6CB" }),
  person = store.review.entity("person", { name: "Alex", color: "#AF8EB5" });
store.review.entity("group", {
  name: "Mountain weekend",
  color: "#C8A06D",
  startDate: "2026-08-15",
  endDate: "2026-08-20",
  bufferDays: 1,
});
function fixture(name, rows) {
  const file = path.join(root, name);
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ...rows.map(([text, amount]) => [
        text,
        "SYNTHETIC",
        "SAMPLE",
        "08/20/2026",
        "12:00 AM",
        amount,
      ]),
    ]),
  );
  return file;
}
function add(file, acct) {
  store.resolveAccount(store.enqueue([file]).ids[0], acct, false);
}
const originals = [
  ["MARKET 100", -25],
  ["MARKET MANUAL", -50],
  ["MARKET CREDIT", 10],
  ["TRANSFER OUT", -101],
];
add(fixture("card.csv", originals), account);
add(fixture("savings.csv", [["TRANSFER IN", 100]]), second);
let records = store.review.records(),
  manual = records.find((r) => r.description === "MARKET MANUAL");
store.review.organize([
  { id: manual.id, version: manual.version, tags: [{ id: home, cents: 5000 }] },
]);
const out = records.find((r) => r.amountCents === -10100),
  incoming = records.find((r) => r.amountCents === 10000);
store.review.linkTransfer(
  out.id,
  out.version,
  incoming.id,
  incoming.version,
  200,
);
store.aliases.save({ name: "Friendly market", pattern: "^MARKET 100" });
store.aliases.save({ name: "Corner cafe", pattern: "^CORNER" });
const rawBefore = store.db
  .prepare("SELECT * FROM transactions ORDER BY id")
  .all();
store.close();
const env = {
  ...process.env,
  URBANOMICS_DATA_DIR: dataDir,
  URBANOMICS_CONFIG_DIR: path.join(root, "config"),
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
const nav = (name) =>
  page.locator(".nav-item").filter({ hasText: name }).click();
const section = (name) =>
  page
    .getByRole("navigation", { name: "Organize sections" })
    .getByRole("button", { name, exact: true })
    .click();
const state = () =>
  page.evaluate(() => window.urbanomics.transactionRulesState());
const shot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
async function freshRules() {
  await nav("Snapshots");
  await nav("Organize");
  await section("Rules");
  await page
    .getByRole("button", { name: "+ New rule", exact: true })
    .first()
    .waitFor();
}
async function newRule(name, pattern, cat, who) {
  await page
    .getByRole("button", { name: "+ New rule", exact: true })
    .first()
    .click();
  const d = page.getByRole("dialog", { name: "New rule", exact: true });
  await d.getByLabel("Name", { exact: true }).fill(name);
  await d.getByLabel("Direction", { exact: true }).selectOption("out");
  await d.getByRole("button", { name: "Regex", exact: true }).click();
  await d.getByLabel("Bank description regex", { exact: true }).fill(pattern);
  if (cat) await d.getByLabel("Tag", { exact: true }).selectOption(cat);
  if (who) await d.getByLabel("Person", { exact: true }).selectOption(who);
  return d;
}
async function save(d) {
  await d.getByRole("button", { name: "Save rule", exact: true }).click();
  await d.waitFor({ state: "hidden" });
}
(async () => {
  try {
    app = await _electron.launch({ args: [repo], cwd: repo, env });
    page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page
      .getByRole("heading", { name: "Snapshots", exact: true })
      .waitFor();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await nav("Organize");
    await page
      .getByText("Linked transfers with a difference", { exact: true })
      .waitFor();
    await shot("overview");
    await page
      .getByRole("button", { name: "Inspect transfers", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: /^Linked/ })
        .getAttribute("aria-pressed"),
      "true",
    );
    await freshRules();
    await page
      .getByRole("button", { name: "+ New rule", exact: true })
      .first()
      .click();
    let d = page.getByRole("dialog", { name: "New rule", exact: true });
    assert.equal(
      await d
        .getByRole("button", { name: "Aliases / vendors", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await d.getByLabel("Bank description regex", { exact: true }).count(),
      0,
    );
    await d.getByLabel("Name", { exact: true }).fill("Saved vendors");
    await d.getByLabel("Tag", { exact: true }).selectOption(category);
    await d.getByLabel("Person", { exact: true }).selectOption(person);
    await d
      .getByRole("checkbox", { name: "Friendly market", exact: true })
      .check();
    await d
      .getByLabel("Search aliases / vendors", { exact: true })
      .fill("corner");
    await d.getByRole("checkbox", { name: "Corner cafe", exact: true }).check();
    assert.equal(
      await d
        .getByRole("button", { name: "Remove Friendly market", exact: true })
        .count(),
      1,
    );
    await d.getByText("1 match", { exact: true }).waitFor();
    await shot("alias-rule-picker");
    await page.setViewportSize({ width: 900, height: 720 });
    await d.getByLabel("Search aliases / vendors", { exact: true }).fill("");
    await shot("alias-rule-narrow");
    const bounds = await d.evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    assert.ok(
      bounds.scroll <= bounds.width + 1,
      "alias editor fits without horizontal overflow",
    );
    await save(d);
    let aliasState = await state();
    const aliasRule = aliasState.rules.find((r) => r.name === "Saved vendors");
    assert.equal(aliasRule.matchType, "aliases");
    assert.equal(aliasRule.aliasIds.length, 2);
    assert.equal(aliasRule.pattern, "");
    assert.equal(
      aliasState.records.find((r) => r.description === "Friendly market").review
        .tags.length,
      0,
    );
    await page
      .getByRole("button", { name: "Edit rule Saved vendors", exact: true })
      .first()
      .click();
    d = page.getByRole("dialog", { name: "Edit rule", exact: true });
    assert.ok(
      await d
        .getByRole("checkbox", { name: "Friendly market", exact: true })
        .isChecked(),
    );
    await d
      .getByRole("button", { name: "Remove Corner cafe", exact: true })
      .click();
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(
      (await state()).rules.find((r) => r.id === aliasRule.id).aliasIds.length,
      2,
    );
    // Clear only the synthetic rule so the established regression flow starts clean.
    await page.evaluate(
      (r) => window.urbanomics.removeTransactionRule(r.id, r.version),
      aliasRule,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await freshRules();
    d = await newRule("Market groceries", "^MARKET", category, person);
    await d.getByText("2 matches", { exact: true }).waitFor();
    assert.equal((await state()).rules.length, 0);
    await shot("rule-preview");
    await save(d);
    let s = await state();
    assert.equal(
      s.records.find((r) => r.description === "Friendly market").review.tags
        .length,
      0,
      "saving does not apply existing matches",
    );
    d = await newRule("Conflicting category", "^MARKET", home);
    await d.getByText("2 matches", { exact: true }).waitFor();
    await d.locator(".rl-summary .is-conflict").waitFor();
    await shot("conflicting-preview");
    await save(d);
    await page
      .getByRole("button", {
        name: "Apply to 0 ready transactions",
        exact: true,
      })
      .waitFor();
    assert.ok(
      await page
        .getByRole("button", {
          name: "Apply to 0 ready transactions",
          exact: true,
        })
        .isDisabled(),
    );
    await shot("rule-conflicts");
    await page
      .getByRole("button", {
        name: "Edit rule Conflicting category",
        exact: true,
      })
      .first()
      .click();
    d = page.getByRole("dialog", { name: "Edit rule", exact: true });
    await d
      .getByLabel("Enabled. Runs on every new import.", { exact: true })
      .uncheck();
    await save(d);
    await page
      .getByRole("button", {
        name: "Apply to 2 ready transactions",
        exact: true,
      })
      .click();
    await page.getByText(/Applied 2\./).waitFor();
    s = await state();
    let row = s.records.find((r) => r.description === "Friendly market");
    assert.deepEqual(row.review.tags, [{ id: category, cents: 2500 }]);
    assert.equal(row.review.assignedPersonId, person);
    assert.equal(row.review.kind, "unreviewed");
    assert.deepEqual(
      s.records.find((r) => r.description === "MARKET MANUAL").review.tags,
      [{ id: home, cents: 5000 }],
    );
    assert.equal(
      s.records.find((r) => r.description === "MARKET CREDIT").review
        .assignedPersonId,
      "",
    );
    await shot("rules-applied");
    // Transaction settings can edit associations without inventing repayments.
    await nav("Transactions");
    await page
      .locator(".rv-task-list > button")
      .filter({ hasText: "Friendly market" })
      .click();
    await page.getByRole("button", { name: "Edit tags", exact: true }).click();
    d = page.getByRole("dialog", { name: "Transaction settings", exact: true });
    assert.equal(
      await d.getByLabel("Associated person", { exact: true }).inputValue(),
      person,
    );
    await d.getByLabel("Associated person", { exact: true }).selectOption("");
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    s = await state();
    assert.equal(
      s.records.find((r) => r.id === row.id).review.assignedPersonId,
      "",
    );
    // A stale Apply never writes. Change the underlying rules after the screen loaded.
    await freshRules();
    await page
      .getByRole("button", {
        name: "Apply to 1 ready transaction",
        exact: true,
      })
      .waitFor();
    await page.evaluate(async () => {
      const s = await window.urbanomics.transactionRulesState();
      const r = s.rules.find((r) => r.enabled);
      await window.urbanomics.saveTransactionRule({
        ...r,
        name: "Market mapping",
      });
    });
    await page
      .getByRole("button", {
        name: "Apply to 1 ready transaction",
        exact: true,
      })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Transactions or rules changed" })
      .first()
      .waitFor();
    assert.equal(
      (await state()).records.find((r) => r.id === row.id).review
        .assignedPersonId,
      "",
    );
    // Import a repeat export with one new identity through the real picker/IPC path.
    const next = fixture("card-next.csv", [...originals, ["MARKET NEW", -17]]);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, next);
    await page.evaluate(() => window.urbanomics.choose(false));
    let intake = await page.evaluate(() => window.urbanomics.state());
    const pending =
      intake.jobs.find((p) => p.filename === "card-next.csv") || intake.jobs[0];
    if (pending)
      await page.evaluate(
        ({ id, account }) => window.urbanomics.route(id, account, false),
        { id: pending.id, account },
      );
    s = await state();
    assert.equal(s.records.length, 6);
    assert.deepEqual(
      s.records.find((r) => r.description === "MARKET NEW").review.tags,
      [{ id: category, cents: 1700 }],
    );
    assert.equal(
      s.records.find((r) => r.id === row.id).review.assignedPersonId,
      "",
      "duplicate imports preserve manual clearing",
    );
    await freshRules();
    await page
      .getByRole("button", { name: "Edit rule Market mapping", exact: true })
      .first()
      .click();
    d = page.getByRole("dialog", { name: "Edit rule", exact: true });
    await d
      .getByLabel("Bank description regex", { exact: true })
      .fill("(?=MARKET)");
    await d.getByRole("alert").filter({ hasText: "regex" }).waitFor();
    assert.ok(
      await d
        .getByRole("button", { name: "Save rule", exact: true })
        .isDisabled(),
    );
    await d
      .getByLabel("Bank description regex", { exact: true })
      .fill("^MARKET");
    await d.getByText("3 matches", { exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await d.getByLabel("Bank description regex", { exact: true }).focus();
    await shot("narrow-rule-editor");
    assert.ok(
      await d
        .getByRole("button", { name: "Save rule", exact: true })
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom <= innerHeight && r.top >= 0;
        }),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    await shot("narrow-rules");
    await section("Overview");
    await shot("narrow-overview");
    await section("Rules");
    await page
      .getByRole("button", {
        name: "Edit rule Conflicting category",
        exact: true,
      })
      .first()
      .click();
    d = page.getByRole("dialog", { name: "Edit rule", exact: true });
    await d.getByRole("button", { name: "Delete rule", exact: true }).click();
    await d
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    assert.equal((await state()).rules.length, 1);
    assert.deepEqual(errors, []);
    await app.close();
    app = null;
    const verify = new ImportStore(dataDir);
    try {
      const raw = verify.db
        .prepare("SELECT * FROM transactions ORDER BY id")
        .all();
      assert.deepEqual(
        raw.filter((r) => rawBefore.some((b) => b.id === r.id)),
        rawBefore,
      );
      assert.equal(verify.transactionRules.rules().length, 1);
    } finally {
      verify.close();
    }
    const config = fs.readFileSync(
      path.join(root, "config", "workspace.sql"),
      "utf8",
    );
    assert.ok(config.includes("Market mapping"));
    assert.ok(!config.includes("MARKET NEW"));
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "alias multi-select/search/persistence/cancel; regex mode; overview linked navigation; live previews; conflicts; explicit apply; manual protection; person edit; stale apply; new-vs-repeat imports; regex errors; deletion; narrow/focused layouts; raw preservation",
      }),
    );
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  console.error("Artifacts:", root);
  process.exitCode = 1;
});
