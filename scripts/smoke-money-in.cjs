const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs"),
  { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "money-in-" + randomUUID()),
  dataDir = path.join(root, "data");
const store = new ImportStore(dataDir),
  account = store.addAccount("Synthetic bank", "pc", "chequing");
const file = path.join(root, "sample.csv");
fs.writeFileSync(
  file,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    ...[
      ["Dinner", "-100"],
      ["Household items", "-200"],
      ["Partner transfer", "90"],
      ["Paycheck deposit", "2000"],
    ].map(([name, amount]) => [
      name,
      "SYNTHETIC",
      "SAMPLE",
      "08/15/2026",
      "12:00 AM",
      amount,
    ]),
  ]),
);
store.resolveAccount(store.enqueue([file]).ids[0], account, false);
store.review.entity("person", { name: "Partner", color: "#78976A" });
store.close();
const env = {
  ...process.env,
  URBANOMICS_DATA_DIR: dataDir,
  URBANOMICS_CONFIG_DIR: path.join(root, "configuration"),
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
const button = (name) => page.getByRole("button", { name, exact: true });
const state = () => page.evaluate(() => window.urbanomics.reviewState());
const stage = (name) =>
  page
    .getByRole("navigation", { name: "Review stages" })
    .getByRole("button", { name, exact: true })
    .click();
const task = (name) =>
  page
    .locator(".rv-task-list")
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
const shot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
async function launch() {
  app = await _electron.launch({ args: [repo], cwd: repo, env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Snapshots", exact: true }).waitFor();
  await page.locator(".nav-item").filter({ hasText: "Review" }).click();
}
(async () => {
  try {
    await launch();
    await stage("Money in");
    assert.equal(await page.locator(".rv-task-list > button").count(), 2);
    await task("Paycheck deposit");
    await button("Income").click();
    assert.ok(await button("Save review").isDisabled());
    await button("Paycheck").click();
    await shot("income-source");
    await button("Save review").click();
    await page
      .locator(".rv-task-list")
      .getByText("Paycheck deposit", { exact: true })
      .waitFor({ state: "hidden" });
    await stage("3 · Review");
    await task("Dinner");
    await button("Apply incoming money to this expense").click();
    await page.getByText("Choose a payment for", { exact: false }).waitFor();
    await button("+ Add cash received").click();
    let modal = page.getByRole("dialog", {
      name: "Add cash received",
      exact: true,
    });
    await modal
      .getByLabel("Description", { exact: true })
      .fill("Cash for our dates");
    await modal.getByLabel("Received on", { exact: true }).fill("2026-09-01");
    await modal.getByLabel("Amount (CAD)", { exact: true }).fill("80");
    await shot("cash-receipt");
    await modal
      .getByRole("button", { name: "Continue to allocation", exact: true })
      .click();
    await modal.waitFor({ state: "hidden" });
    await page
      .locator(".rv-people")
      .getByRole("button", { name: "Pa Partner", exact: true })
      .click();
    assert.equal(
      await page.locator(".rv-targets input:checked").count(),
      1,
      "expense shortcut preselects dinner",
    );
    await page
      .locator(".rv-targets label")
      .filter({ hasText: "Household items" })
      .getByRole("checkbox")
      .check();
    assert.equal(await page.locator(".rv-targets input:checked").count(), 2);
    await page
      .getByLabel("Allocation to Dinner", { exact: true })
      .fill("30.01");
    await shot("cash-allocation");
    await button("Save allocation").click();
    await page
      .locator(".rv-task-list")
      .getByText("Cash for our dates", { exact: true })
      .waitFor({ state: "hidden" });
    let s = await state(),
      cash = s.records.find((t) => t.manual);
    assert.equal(cash.review.remainder, 999);
    assert.equal(cash.review.allocations.length, 2);
    assert.ok(
      s.records
        .filter((t) => t.amountCents < 0)
        .every((t) => !t.review.groups.length && !t.review.reviewed),
    );
    await task("Partner transfer");
    await button("Deduct expenses").click();
    await page
      .locator(".rv-people")
      .getByRole("button", { name: "Pa Partner", exact: true })
      .click();
    await page
      .locator(".rv-targets label")
      .filter({ hasText: "Household items" })
      .getByRole("checkbox")
      .check();
    await button("Save allocation").click();
    await page
      .locator(".rv-task-list")
      .getByText("Partner transfer", { exact: true })
      .waitFor({ state: "hidden" });
    await page
      .getByRole("checkbox", { name: "Show reviewed", exact: true })
      .check();
    await task("Cash for our dates");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await shot("money-in-narrow");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await button("Edit cash receipt").click();
    modal = page.getByRole("dialog", {
      name: "Edit cash receipt",
      exact: true,
    });
    await modal.getByLabel("Amount (CAD)", { exact: true }).fill("60");
    await modal
      .getByRole("button", { name: "Save receipt", exact: true })
      .click();
    await modal.getByRole("alert").waitFor();
    assert.equal(
      (await state()).records.find((t) => t.id === cash.id).amountCents,
      8000,
    );
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    const saved = await state();
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(await state(), saved);
    await stage("Money in");
    await page
      .getByRole("checkbox", { name: "Show reviewed", exact: true })
      .check();
    await task("Cash for our dates");
    await button("Edit cash receipt").click();
    modal = page.getByRole("dialog", {
      name: "Edit cash receipt",
      exact: true,
    });
    await modal
      .getByRole("button", { name: "Remove receipt", exact: true })
      .click();
    await modal
      .getByRole("button", { name: "Confirm removal", exact: true })
      .click();
    await modal.waitFor({ state: "hidden" });
    assert.ok(!(await state()).records.some((t) => t.id === cash.id));
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "visible money-in, income type, expense shortcut, cash and transfer multi-expense deductions without events, cent remainder, edit validation, restart, removal, narrow layout",
      }),
    );
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  console.error(root);
  process.exitCode = 1;
});
