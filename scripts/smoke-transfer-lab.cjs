const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs"),
  { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private/validation", "transfer-lab-" + randomUUID()),
  dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const store = new ImportStore(dataDir),
  spending = store.addAccount("Chequing", "pc", "chequing"),
  card = store.addAccount("Mastercard", "pc", "credit");
store.addAccount("Savings", "eq", "savings");
store.addAccount("Simplii", "simplii", "chequing");
function add(name, account, entries) {
  const file = path.join(root, name + ".csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ...entries.map(([text, amount, date = "08/31/2026"]) => [
        text,
        "SYNTHETIC",
        "SAMPLE",
        date,
        "12:00 AM",
        amount,
      ]),
    ]),
  );
  store.resolveAccount(store.enqueue([file]).ids[0], account, false);
}
add("out", spending, [
  ["Unique send", -200],
  ["Ambiguous send", -100],
  ["Fee send", -300],
  ["Old send", -400],
  ["Late send", -500],
]);
add("in", card, [
  ["Unique receive", 200, "09/01/2026"],
  ["Option A", 100],
  ["Option B", 100],
  ["Fee receive", 299],
  ["Old receive", 400],
  ["Late receive", 500, "09/05/2026"],
]);
let rows = store.review.records(),
  a = rows.find((r) => r.description === "Old send"),
  b = rows.find((r) => r.description === "Old receive");
store.review.linkTransfer(a.id, a.version, b.id, b.version, 0);
const old = store.review.records().filter((r) => [a.id, b.id].includes(r.id));
store.close();
const env = {
  ...process.env,
  URBANOMICS_DATA_DIR: dataDir,
  URBANOMICS_CONFIG_DIR: path.join(root, "config"),
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
const shot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
const click = (name) => page.getByRole("button", { name, exact: true }).click();
const records = () =>
  page.evaluate(() => window.urbanomics.reviewState()).then((s) => s.records);
async function launch() {
  app = await _electron.launch({ args: [repo], cwd: repo, env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Snapshots", exact: true }).waitFor();
  await page.locator(".nav-item").filter({ hasText: "Review" }).click();
  await page
    .getByRole("navigation", { name: "Transaction tools" })
    .getByRole("button", { name: "Transfers", exact: true })
    .click();
  await click("Auto-link lab");
  await page.getByLabel("Lab date window").waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
}
(async () => {
  try {
    await launch();
    assert.equal(await page.getByLabel("Lab date window").inputValue(), "1");
    assert.equal(
      await page.getByLabel("Lab amount tolerance").inputValue(),
      "0",
    );
    assert.ok(
      await page
        .getByLabel("Allow Chequing to Mastercard", { exact: true })
        .isChecked(),
    );
    assert.ok(
      !(await page
        .getByLabel("Allow Mastercard to Chequing", { exact: true })
        .isChecked()),
    );
    assert.ok(
      !(await page
        .getByLabel("Allow Savings to Simplii", { exact: true })
        .isChecked()),
    );
    await click("Run preview");
    await page.getByText("1 unique pair", { exact: true }).waitFor();
    await shot("lab-default");
    assert.equal(
      (await records()).filter((r) => r.review.kind === "transfer").length,
      2,
    );
    await click("Existing pairs");
    await page.getByText("Recovered", { exact: true }).waitFor();
    await shot("lab-history");
    await page.getByLabel("Lab amount tolerance").fill("2");
    assert.equal(
      await page
        .getByRole("button", { name: "Link 0 selected pairs", exact: true })
        .count(),
      0,
    );
    await click("Run preview");
    await page.getByText("2 unique pairs", { exact: true }).waitFor();
    await click("Ambiguous");
    await page
      .getByLabel("Select pair Ambiguous send to Option A", { exact: true })
      .check();
    assert.ok(
      await page
        .getByLabel("Select pair Ambiguous send to Option B", { exact: true })
        .isDisabled(),
    );
    await shot("lab-ambiguous");
    await click("Clear selection");
    await click("Select all 2 unique pairs");
    await click("Unique");
    await shot("lab-selected");
    // Changed setup blocks stale linking without partially applying a batch.
    await page.evaluate(async () => {
      const s = await window.urbanomics.transferLabState();
      await window.urbanomics.saveTransferLab(s.config, s.config.version);
    });
    await click("Link 2 selected pairs");
    await page
      .getByRole("alert")
      .filter({ hasText: "Transactions or setup changed" })
      .first()
      .waitFor();
    assert.equal(
      (await records()).filter((r) => r.review.kind === "transfer").length,
      2,
    );
    await click("Reload setup");
    await page.getByLabel("Lab amount tolerance").fill("2");
    await click("Save setup");
    await page
      .getByText("Setup saved. No transfers were linked.", { exact: true })
      .waitFor();
    await click("Run preview");
    await click("Select all 2 unique pairs");
    await click("Link 2 selected pairs");
    await page.getByText(/2 pairs linked\./).waitFor();
    let after = await records();
    assert.equal(after.filter((r) => r.review.kind === "transfer").length, 6);
    assert.equal(
      after.find((r) => r.description === "Fee send").review.transferFeeCents,
      100,
    );
    assert.deepEqual(
      after.filter((r) => old.some((p) => p.id === r.id)),
      old,
    );
    await click("Run preview");
    await click("Ambiguous");
    await page
      .getByLabel("Select pair Ambiguous send to Option A", { exact: true })
      .check();
    await click("Link 1 selected pair");
    await page.getByText(/1 pair linked\./).waitFor();
    await page
      .getByLabel("Allow Chequing to Mastercard", { exact: true })
      .uncheck();
    await click("Run preview");
    await click("Existing pairs");
    await page
      .getByText("Route not allowed", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      (await records()).filter((r) => r.review.kind === "transfer").length,
      8,
    );
    await page
      .getByLabel("Allow Chequing to Mastercard", { exact: true })
      .check();
    await page.getByLabel("Lab date window").fill("5");
    await click("Run preview");
    await click("Unique");
    await page
      .getByLabel("Select pair Late send to Late receive", { exact: true })
      .waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await page.getByLabel("Lab amount tolerance").focus();
    await shot("lab-narrow");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByLabel("Lab date window").fill("32");
    assert.ok(
      await page
        .getByRole("button", { name: "Run preview", exact: true })
        .isDisabled(),
    );
    await page.getByLabel("Lab date window").fill("5");
    await click("Save setup");
    await page
      .getByText("Setup saved. No transfers were linked.", { exact: true })
      .waitFor();
    const saved = await records();
    await app.close();
    app = null;
    await launch();
    assert.equal(await page.getByLabel("Lab date window").inputValue(), "5");
    assert.equal(
      await page.getByLabel("Lab amount tolerance").inputValue(),
      "2",
    );
    assert.deepEqual(await records(), saved);
    assert.deepEqual(errors, []);
    const sql = fs.readFileSync(
      path.join(root, "config/workspace.sql"),
      "utf8",
    );
    assert.ok(sql.includes("transfer_lab_config"));
    assert.ok(!sql.includes("Unique send"));
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "directional defaults; cross-month preview; ambiguity/reuse prevention; historical simulation; stale batch; exact and fee links; existing pair protection; date changes; configuration restart; narrow layout",
      }),
    );
  } catch (e) {
    if (page) await shot("failure");
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  console.error("Artifacts:", root);
  process.exitCode = 1;
});
