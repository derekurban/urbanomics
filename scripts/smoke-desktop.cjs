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
    .getByRole("heading", { name: "Everything starts with a drop." })
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
  await page.getByRole("button", { name: "Choose CSV files" }).click();
}
(async () => {
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() => window.urbanomics.setScope("2026-01", "2026-08"));
  await select(page);
  await page.locator(".job-row").click();
  await page
    .getByRole("textbox", { name: "New account name" })
    .fill("Synthetic Mastercard");
  await page.getByRole("button", { name: "Add account & import" }).click();
  await page.getByText("All sorted. Your intake is clear.").waitFor();
  let state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.months[0].count, 2);
  assert.equal(state.history[0].result.excluded, 1);
  assert.equal(state.jobs.length, 0);
  await page.screenshot({ path: path.join(root, "import-desk.png") });
  await page.getByRole("button", { name: "Monthly snapshots" }).click();
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
  await page.getByRole("button", { name: "Import desk", exact: false }).click();
  await select(page);
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
    document
      .querySelector(".drop-zone")
      .dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
  });
  await page.waitForFunction(
    async () => (await window.urbanomics.state()).history.length === 3,
  );
  state = await page.evaluate(() => window.urbanomics.state());
  assert.equal(state.history[0].result.matched, 2);
  assert.ok(fs.existsSync(file));
  assert.equal(fs.readdirSync(path.join(dataDir, "inbox")).length, 0);
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
  assert.equal(state.jobs.length, 0);
  await app.close();
  app = null;
  console.log(
    "Electron smoke passed: native picker intake, account routing, month filtering, source inspection, deduplication, privacy boundary, and restart persistence.",
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
