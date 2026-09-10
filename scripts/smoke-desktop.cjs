// Real Electron renderer/main/preload integration, using synthetic files only.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, "..");
const root = path.join(
  repo,
  "private",
  "validation",
  "desktop-" + randomUUID(),
);
const dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const file = path.join(root, "synthetic_card_initial.csv");
fs.writeFileSync(
  file,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    [
      "Synthetic cafe",
      "PURCHASE",
      "SAMPLE PERSON",
      "08/15/2026",
      "12:00 AM",
      "-12.34",
    ],
    [
      "Synthetic repayment",
      "PAYMENT",
      "SAMPLE PERSON",
      "08/16/2026",
      "12:00 AM",
      "6.17",
    ],
    [
      "September excluded",
      "PURCHASE",
      "SAMPLE PERSON",
      "09/01/2026",
      "12:00 AM",
      "-9.99",
    ],
  ]),
);
const env = { ...process.env, URBANOMICS_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch() {
  app = await electron.launch({ args: [repo], cwd: repo, env, timeout: 30000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page
    .getByRole("heading", { name: "A place for every file." })
    .waitFor();
  return page;
}
async function select(page) {
  // Stub only the OS picker response; the UI, preload, IPC and importer are real.
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await page.getByRole("button", { name: "Upload CSVs" }).click();
}
(async () => {
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() => window.urbanomics.setScope("2026-01", "2026-08"));
  await select(page);
  await page
    .getByRole("button", { name: "Choose account", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "New account name" })
    .fill("Synthetic Mastercard");
  await page.getByRole("button", { name: "Add account & queue" }).click();
  await page
    .getByRole("button", { name: "Process 1 queued file", exact: true })
    .waitFor();
  let staged = await page.evaluate(() => window.urbanomics.state());
  assert.equal(staged.months.length, 0);
  assert.equal(staged.jobs[0].status, "queued");
  assert.equal(fs.readdirSync(path.join(dataDir, "dropbox")).length, 1);
  await page.evaluate(() => {
    window.processingEvents = [];
    window.urbanomics.onProgress((p) => window.processingEvents.push(p));
  });
  // Pause only this synthetic test run to inspect the renderer's in-flight state.
  await app.evaluate(async (_electron, repo) => {
    const { ImportStore } = process.mainModule.require(
      repo + "/electron/imports/store.cjs",
    );
    const original = ImportStore.prototype.processReadyWithProgress;
    ImportStore.prototype.processReadyWithProgress = async function (...args) {
      ImportStore.prototype.processReadyWithProgress = original;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return original.apply(this, args);
    };
  }, repo);
  await page
    .getByRole("button", { name: "Process 1 queued file", exact: true })
    .click();
  await page.getByRole("progressbar", { name: "Files processed" }).waitFor();
  assert.equal(
    await page
      .locator(".dr-file-flight i")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
    "dr-file-flight",
  );
  await page.screenshot({ path: path.join(root, "processing.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".dr-file-flight i")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByText("Nothing waiting.", { exact: true }).waitFor();
  let state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.months[0].count, 2);
  assert.equal(state.history[0].result.excluded, 1);
  assert.equal(state.jobs.length, 0);
  assert.equal(state.lastProcessResult.added, 2);
  assert.equal(state.lastProcessResult.excluded, 1);
  assert.deepEqual(
    await page.evaluate(() => window.processingEvents.map((p) => p.done)),
    [0, 1],
  );
  assert.equal(await page.locator(".dr-cell").count(), 12);
  assert.equal(await page.getByRole("tab").count(), 0);
  await page
    .getByRole("button", { name: /Synthetic Mastercard, August 2026/ })
    .hover();
  await page
    .locator(".dr-tooltip")
    .filter({ hasText: "2 transactions" })
    .waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(root, "calendar-tooltip.png") });
  await page.locator(".dr-heading").hover();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, "import-desk.png") });
  await page
    .getByRole("button", { name: /Synthetic Mastercard, August 2026/ })
    .click();
  await page
    .getByRole("button", { name: "Inspect snapshot", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "August 2026", exact: true })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 2);
  await page.getByRole("textbox", { name: "Search transactions" }).fill("cafe");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page
    .getByRole("button", { name: "Synthetic cafe", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Transaction source" }).waitFor();
  assert.ok(
    (await page.locator(".source-row").innerText()).includes("CSV record 2"),
  );
  await page.getByRole("button", { name: "Close transaction" }).click();
  await page.getByRole("textbox", { name: "Search transactions" }).fill("");
  await page.screenshot({ path: path.join(root, "monthly-snapshot.png") });
  await page.getByRole("button", { name: "Data", exact: false }).click();
  await select(page);
  await page
    .getByRole("button", { name: "Process 1 queued file", exact: true })
    .click();
  await page.waitForFunction(
    async () => (await window.urbanomics.state()).history.length === 2,
  );
  state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.history[0].result.added, 0);
  assert.equal(state.history[0].result.matched, 2);
  assert.equal(state.snapshots.length, 1);
  // Browser-native File objects exercise the real drop handler and webUtils path bridge.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "smoke-file";
    input.hidden = true;
    document.body.append(input);
  });
  await page.locator("#smoke-file").setInputFiles(file);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(document.querySelector("#smoke-file").files[0]);
    document.querySelector(".data-room").dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
  });
  await page
    .getByRole("button", { name: "Process 1 queued file", exact: true })
    .click();
  await page.waitForFunction(
    async () => (await window.urbanomics.state()).history.length === 3,
  );
  state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.history[0].result.matched, 2);
  assert.ok(fs.existsSync(file));
  assert.equal(state.sources.length, 1);
  assert.equal(state.snapshotIndex.length, 1);
  assert.equal(fs.readdirSync(path.join(dataDir, "dropbox")).length, 0);
  await app.evaluate(({ shell }) => {
    globalThis.openedLocations = [];
    shell.openPath = async (p) => {
      globalThis.openedLocations.push(p);
      return "";
    };
  });
  await page
    .getByRole("region", { name: "Dropbox", exact: true })
    .getByRole("button", { name: "Open folder", exact: false })
    .click();
  assert.equal(
    await app.evaluate(() => globalThis.openedLocations.at(-1)),
    path.join(dataDir, "dropbox"),
  );
  fs.writeFileSync(
    path.join(dataDir, "dropbox/bad-export.csv"),
    "Unsupported,CSV",
  );
  fs.writeFileSync(
    path.join(dataDir, "dropbox/notes.txt"),
    "Preserve this non-CSV",
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByRole("button", { name: "Review error", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear intake copies", exact: true })
    .click();
  assert.ok(fs.existsSync(path.join(dataDir, "dropbox/bad-export.csv")));
  await page.getByRole("button", { name: "Clear 1 copy", exact: true }).click();
  await page.getByText("Nothing waiting.", { exact: true }).waitFor();
  assert.ok(fs.existsSync(path.join(dataDir, "dropbox/notes.txt")));
  state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.activity[0].status, "dismissed");
  assert.equal(state.sources.length, 2);
  assert.equal(state.snapshots.length, 1);
  await page.getByRole("button", { name: /View upload history/ }).click();
  await page
    .getByRole("heading", { name: "Upload history", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(root, "upload-history.png") });
  await page
    .getByRole("button", { name: "Close Upload history", exact: true })
    .click();
  await page.getByRole("button", { name: /Browse archive/ }).click();
  await page
    .getByRole("heading", { name: "Original files", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(root, "archive.png") });
  await page
    .getByRole("button", { name: "Close Archive", exact: true })
    .click();
  await page.getByRole("button", { name: /Accounts/ }).click();
  await page
    .getByRole("button", { name: "Edit Synthetic Mastercard", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Account name", exact: true })
    .fill("Everyday card");
  await page.getByRole("textbox", { name: "Filename prefix regex" }).fill("[");
  await page.getByText(/Invalid prefix regex/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Save account", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "Filename prefix regex" })
    .fill("synthetic[_-]card");
  await page
    .getByRole("textbox", { name: "Try a filename" })
    .fill("SYNTHETIC_CARD_new.csv");
  await page.getByText("Matches this prefix.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Color #9674B7", exact: true })
    .click();
  await page.screenshot({ path: path.join(root, "account-editor.png") });
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.accounts[0].name, "Everyday card");
  assert.equal(state.accounts[0].color, "#9674B7");
  await page.screenshot({ path: path.join(root, "accounts.png") });
  await page.getByRole("button", { name: "Data", exact: false }).click();
  assert.equal(
    await page
      .locator(".dr-cell.filled span")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(150, 116, 183)",
  );
  // New bytes route using the configured prefix, independently of a known source.
  const prefixed = path.join(dataDir, "dropbox", "synthetic-card-new.csv");
  fs.writeFileSync(
    prefixed,
    fs
      .readFileSync(file, "utf8")
      .replace("Synthetic cafe", "New synthetic merchant"),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByRole("button", { name: "Process 1 queued file", exact: true })
    .waitFor();
  state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.jobs[0].accountId, state.accounts[0].id);
  await page
    .getByRole("button", {
      name: "Remove synthetic-card-new.csv from intake",
      exact: true,
    })
    .click();
  await page.getByText("Nothing waiting.", { exact: true }).waitFor();
  await page.getByRole("button", { name: /View upload history/ }).click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: /View upload history/ })
      .evaluate((e) => document.activeElement === e),
    true,
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(900, 700),
  );
  await page.screenshot({ path: path.join(root, "data-narrow.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await select(page); // Leave a staged repeat across restart; it must not auto-process.
  assert.equal(fs.readdirSync(path.join(dataDir, "inbox")).length, 1);
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(
    await page.evaluate(() =>
      fetch("https://example.com").then(
        () => true,
        () => false,
      ),
    ),
    false,
  );
  assert.deepEqual(errors, []);
  await app.close();
  page = await launch();
  state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.months[0].count, 2);
  assert.equal(state.history.length, 3);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].status, "queued");
  assert.equal(state.accounts[0].name, "Everyday card");
  assert.equal(state.accounts[0].prefixRegex, "synthetic[_-]card");
  assert.equal(state.accounts[0].color, "#9674B7");
  assert.equal(state.lastProcessResult.matched, 2);
  await page
    .getByRole("button", { name: "Clear intake copies", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear 1 copy", exact: true }).click();
  await page.getByText("Nothing waiting.", { exact: true }).waitFor();
  await app.close();
  app = null;
  console.log(
    "Electron smoke passed: staged uploads, explicit processing, account snapshot map, sources, archive/history, Dropbox folder access and cleanup, deduplication, narrow layout, privacy boundary, and queued restart persistence.",
  );
  console.log("Synthetic screenshots: " + root);
})().catch(async (e) => {
  console.error(e);
  if (app) {
    const pages = app.windows();
    if (pages[0])
      await pages[0]
        .screenshot({ path: path.join(root, "failure.png") })
        .catch(() => {});
    await app.close().catch(() => {});
  }
  process.exitCode = 1;
});
