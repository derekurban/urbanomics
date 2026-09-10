const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs");
const { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "aliases-" + randomUUID()),
  dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const store = new ImportStore(dataDir, {
  now: () => new Date("2026-09-10T12:00:00Z"),
});
const account = store.addAccount("Synthetic chequing", "pc", "chequing"),
  file = path.join(root, "synthetic.csv");
fs.writeFileSync(
  file,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    [
      "WALMART #1234 EDMONTON",
      "SYNTHETIC",
      "SAMPLE PERSON",
      "08/28/2026",
      "12:00 AM",
      "-240",
    ],
    [
      "WALMART #5678 CALGARY",
      "SYNTHETIC",
      "SAMPLE PERSON",
      "01/28/2026",
      "12:00 AM",
      "-120",
    ],
    [
      "PAYROLL DEP 98765",
      "SYNTHETIC",
      "SAMPLE PERSON",
      "08/27/2026",
      "12:00 AM",
      "2000",
    ],
  ]),
);
store.resolveAccount(store.enqueue([file]).ids[0], account, false);
store.close();
const env = { ...process.env, URBANOMICS_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({ args: [repo], cwd: repo, env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Snapshots", exact: true }).waitFor();
  await aliases();
}
async function aliases() {
  await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
  await page
    .getByRole("navigation", { name: "Organize sections" })
    .getByRole("button", { name: "Aliases", exact: true })
    .click();
}
const state = () => page.evaluate(() => window.urbanomics.reviewState());
const shot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
async function newRule(name, pattern) {
  await page
    .getByRole("button", { name: "+ New transaction alias", exact: true })
    .click();
  const d = page.getByRole("dialog", {
    name: "New transaction alias",
    exact: true,
  });
  await d.getByLabel("Readable name", { exact: true }).fill(name);
  await d.getByLabel("Description regex", { exact: true }).fill(pattern);
  return d;
}
(async () => {
  try {
    await launch();
    let d = await newRule("Walmart", "^WALMART\\s+#\\d+");
    assert.equal(await d.locator(".al-unaliased-list > button").count(), 3);
    assert.ok(
      await d
        .getByRole("button", { name: "Save alias", exact: true })
        .isDisabled(),
    );
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("2 matches", { exact: true }).waitFor();
    await d.getByText(/3 checked/).waitFor();
    await shot("alias-preview");
    await d.getByRole("button", { name: "Save alias", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    let s = await state();
    const original = s.records.find(
      (t) => t.originalDescription === "WALMART #1234 EDMONTON",
    );
    assert.equal(original.description, "Walmart");
    assert.ok(s.records.every((t) => !t.review.reviewed));
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await page
      .getByRole("textbox", { name: "Search review transactions" })
      .fill("#1234");
    await page
      .locator(".os-transaction h3")
      .getByText("Walmart", { exact: true })
      .waitFor();
    await page.locator(".os-transaction").click();
    await page
      .getByText("Bank description: WALMART #1234 EDMONTON", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.locator(".nav-item").filter({ hasText: "Transactions" }).click();
    await page
      .locator(".transaction-name")
      .getByText("Walmart", { exact: true })
      .waitFor();
    await aliases();
    d = await newRule("Shopping", "#");
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("2 conflicting transactions", { exact: true }).waitFor();
    assert.ok(
      await d
        .getByRole("button", { name: "Save alias", exact: true })
        .isDisabled(),
    );
    await shot("alias-conflicts");
    await d.getByLabel("Description regex", { exact: true }).fill("[");
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByRole("alert").filter({ hasText: "Invalid regex" }).waitFor();
    await d.getByLabel("Description regex", { exact: true }).fill("^PAYROLL");
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("1 match", { exact: true }).waitFor();
    await d.getByLabel("Readable name", { exact: true }).fill("Payday");
    assert.ok(
      await d
        .getByRole("button", { name: "Save alias", exact: true })
        .isDisabled(),
      "edits invalidate preview",
    );
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("1 match", { exact: true }).waitFor();
    // Saving rechecks current rules, including changes made after the preview.
    await page.evaluate(() =>
      window.urbanomics.saveAlias({ name: "Salary", pattern: "^PAYROLL" }),
    );
    await d.getByRole("button", { name: "Save alias", exact: true }).click();
    await d.getByRole("alert").filter({ hasText: "competes" }).waitFor();
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit alias Walmart", exact: true })
      .click();
    d = page.getByRole("dialog", {
      name: "Edit transaction alias",
      exact: true,
    });
    await d.getByLabel("Readable name", { exact: true }).fill("Walmart Canada");
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("0 conflicting transactions", { exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await d.getByLabel("Description regex", { exact: true }).focus();
    await shot("alias-narrow-editor");
    assert.ok(
      await d
        .getByRole("button", { name: "Save alias", exact: true })
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
    await d.getByRole("button", { name: "Save alias", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    await shot("alias-list");
    assert.ok(
      await page
        .locator(".al-rule-list .og-item")
        .first()
        .evaluate((el) => el.getBoundingClientRect().height <= 78),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1360, 900),
    );
    await shot("alias-list-wide");
    s = await state();
    const rules = await page.evaluate(() => window.urbanomics.aliases());
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(await state(), s);
    assert.deepEqual(
      await page.evaluate(() => window.urbanomics.aliases()),
      rules,
    );
    await page
      .getByRole("button", { name: "Edit alias Walmart Canada", exact: true })
      .click();
    d = page.getByRole("dialog", {
      name: "Edit transaction alias",
      exact: true,
    });
    await d.getByRole("button", { name: "Delete alias", exact: true }).click();
    await d
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    assert.equal(
      (await state()).records.find((t) => t.id === original.id).description,
      original.originalDescription,
    );
    await page
      .getByRole("button", { name: "Manage account aliases", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit Synthetic chequing", exact: true })
      .waitFor();
    // A future row can reveal an overlap absent from both original previews.
    await app.close();
    app = null;
    const futureStore = new ImportStore(dataDir);
    futureStore.aliases.save({ name: "Acme", pattern: "^ACME" });
    futureStore.aliases.save({ name: "Store", pattern: "STORE$" });
    const futureFile = path.join(root, "synthetic_future.csv");
    fs.writeFileSync(
      futureFile,
      csv([
        ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
        [
          "ACME STORE",
          "SYNTHETIC",
          "SAMPLE PERSON",
          "08/29/2026",
          "12:00 AM",
          "-10",
        ],
        [
          "ACME [SUPPLIES] (A+B) $2.00",
          "SYNTHETIC",
          "SAMPLE PERSON",
          "08/30/2026",
          "12:00 AM",
          "-2",
        ],
      ]),
    );
    futureStore.resolveAccount(
      futureStore.enqueue([futureFile]).ids[0],
      account,
      false,
    );
    futureStore.close();
    await launch();
    await page
      .getByText("1 transaction has competing aliases", { exact: true })
      .waitFor();
    await shot("future-conflict");
    await page.getByRole("button", { name: "Edit Acme", exact: true }).click();
    d = page.getByRole("dialog", {
      name: "Edit transaction alias",
      exact: true,
    });
    await d
      .getByLabel("Description regex", { exact: true })
      .fill("^ACME ONLY$");
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("0 matches", { exact: true }).waitFor();
    await d.getByRole("button", { name: "Save alias", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    assert.equal(await page.locator(".al-conflict-panel").count(), 0);
    assert.equal(
      (await state()).records.find(
        (t) => t.originalDescription === "ACME STORE",
      ).description,
      "Store",
    );
    d = await newRule("", "");
    const pending = d.getByRole("complementary", {
      name: "Transactions without aliases",
    });
    assert.equal(
      await pending.locator(".al-unaliased-list > button").count(),
      3,
    );
    await pending.getByRole("textbox").fill("SUPPLIES");
    await pending.locator(".al-unaliased-list > button").click();
    assert.equal(
      await d.getByLabel("Description regex", { exact: true }).inputValue(),
      "^ACME \\[SUPPLIES\\] \\(A\\+B\\) \\$2\\.00",
    );
    await d.getByLabel("Readable name", { exact: true }).fill("Acme supplies");
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("1 match", { exact: true }).waitFor();
    await shot("unaliased-picker");
    await d
      .getByRole("button", { name: "Save & create another", exact: true })
      .click();
    await d
      .getByText("Alias saved. Choose another transaction.", { exact: true })
      .waitFor();
    assert.equal(
      await d.getByLabel("Readable name", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await d.getByLabel("Description regex", { exact: true }).inputValue(),
      "",
    );
    await pending.getByRole("textbox").fill("");
    assert.equal(
      await pending.locator(".al-unaliased-list > button").count(),
      2,
    );
    await pending.locator(".al-unaliased-list > button").first().click();
    await d.getByLabel("Readable name", { exact: true }).fill("Walmart");
    await d.getByLabel("Description regex", { exact: true }).fill("^WALMART");
    await d
      .getByRole("button", { name: "Test against transactions", exact: true })
      .click();
    await d.getByText("2 matches", { exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await shot("unaliased-narrow");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(await d.evaluate((el) => el.scrollWidth <= el.clientWidth));
    await d
      .getByRole("button", { name: "Save & create another", exact: true })
      .click();
    await pending
      .getByText("No transactions without aliases in this scope.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      (await page.evaluate(() => window.urbanomics.aliases())).unaliased.length,
      0,
    );
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "aliases preview, conflict validation, raw preservation, current-rule recheck, rename/delete, account shortcut, narrow layout, persistence",
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
