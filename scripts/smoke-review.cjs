// Synthetic financial workflow through the actual Electron renderer and IPC.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs");
const { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "review-" + randomUUID()),
  dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const store = new ImportStore(dataDir, {
  now: () => new Date("2026-09-10T12:00:00Z"),
});
const account = store.addAccount("Synthetic spending", "pc", "chequing");
const file = path.join(root, "synthetic_review.csv");
fs.writeFileSync(
  file,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    ...[
      ["Walmart", "-240"],
      ["Juniper dinner", "-120"],
      ["Cabin", "-300"],
      ["Alex e-transfer", "240"],
      ["Salary", "2000"],
      ["Transfer out", "-50"],
      ["Zero record", "0"],
    ].map(([name, amount], i) => [
      name,
      "SYNTHETIC",
      "SAMPLE PERSON",
      `08/${15 + i}/2026`,
      "12:00 AM",
      amount,
    ]),
  ]),
);
store.resolveAccount(store.enqueue([file]).ids[0], account, false);
const savings = store.addAccount("Synthetic savings", "pc", "savings"),
  second = path.join(root, "synthetic_savings.csv");
fs.writeFileSync(
  second,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    [
      "Transfer in",
      "SYNTHETIC",
      "SAMPLE PERSON",
      "08/20/2026",
      "12:00 AM",
      "50",
    ],
  ]),
);
store.resolveAccount(store.enqueue([second]).ids[0], savings, false);
store.close();
const env = { ...process.env, URBANOMICS_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ args: [repo], cwd: repo, env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Snapshots", exact: true }).waitFor();
  await page.locator(".nav-item").filter({ hasText: "Review" }).click();
  await page.getByRole("heading", { name: "A little order." }).waitFor();
}
const state = () => page.evaluate(() => window.urbanomics.reviewState());
const snap = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
async function create(kind, name, tags = []) {
  const label = kind === "group" ? "event" : kind;
  await page
    .getByRole("button", {
      name: kind === "person" ? "+ Person" : `+ New ${label}`,
      exact: true,
    })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: `New ${label}`,
    exact: true,
  });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  if (kind === "group") {
    await dialog.getByLabel("Start date", { exact: true }).fill("2026-08-14");
    await dialog.getByLabel("End date", { exact: true }).fill("2026-08-20");
  }
  for (const tag of tags)
    await dialog.getByRole("button", { name: tag, exact: true }).click();
  await dialog
    .getByRole("button", { name: `Save ${label}`, exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
}
async function stage(name) {
  await page
    .getByRole("navigation", { name: "Review stages" })
    .getByRole("button", { name })
    .click();
}
async function selectTask(name) {
  await page
    .locator(".rv-task-list")
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
}
async function saveReview() {
  await page
    .getByRole("button", { name: /^Save (review|allocation)$/, exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector("footer")?.textContent.includes("Saving…"),
  );
}
(async () => {
  try {
    await launch();
    await create("category", "Groceries");
    await create("category", "Home");
    await create("category", "Dining");
    await page
      .getByRole("textbox", { name: "Search review transactions" })
      .fill("Walmart");
    await page.locator(".os-transaction").click();
    let modal = page.getByRole("dialog", {
      name: "Transaction settings",
      exact: true,
    });
    await modal
      .getByRole("checkbox", { name: "Groceries", exact: true })
      .check();
    await modal.getByRole("checkbox", { name: "Home", exact: true }).check();
    const slider = modal.getByRole("slider", {
      name: "Divider after Groceries",
      exact: true,
    });
    const track = await slider.boundingBox();
    await page.mouse.move(
      track.x + track.width / 2,
      track.y + track.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      track.x + track.width / 2 + 40,
      track.y + track.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
    const moved = Number(await slider.inputValue());
    assert.ok(moved > 12000, "dragging a divider moves its boundary");
    await slider.focus();
    await slider.press("ArrowRight");
    assert.equal(Number(await slider.inputValue()), moved + 100);
    await modal.getByRole("button", { name: "$0.01", exact: true }).click();
    await modal
      .getByRole("spinbutton", {
        name: "Exact divider after Groceries",
        exact: true,
      })
      .fill("140.01");
    await snap("tag-split");
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
    let s = await state();
    assert.deepEqual(
      s.records
        .find((t) => t.description === "Walmart")
        .review.tags.map((p) => p.cents),
      [14001, 9999],
    );
    await page
      .getByRole("textbox", { name: "Search review transactions" })
      .fill("Juniper dinner");
    await page
      .getByRole("button", { name: "Category Dining", exact: true })
      .click();
    await page.getByText("1 of 1 categorized", { exact: true }).waitFor();
    await stage("2 · Events");
    await create("group", "Mountain weekend");
    for (const name of ["Juniper dinner", "Cabin", "Alex e-transfer"]) {
      await page
        .getByRole("textbox", { name: "Search review transactions" })
        .fill(name);
      await page
        .getByRole("button", { name: `Link ${name}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: `Unlink ${name}`, exact: true })
        .waitFor();
    }
    await page
      .getByRole("textbox", { name: "Search review transactions" })
      .fill("");
    await snap("groups");
    await stage("3 · Review");
    await create("person", "Alex");
    await selectTask("Juniper dinner");
    await page.getByRole("button", { name: "Expense", exact: true }).click();
    await page
      .locator(".rv-people")
      .getByRole("button", { name: "Al Alex", exact: true })
      .click();
    await snap("expense-shares");
    await saveReview();
    await page
      .locator(".rv-task-list")
      .getByRole("button")
      .filter({ hasText: "Juniper dinner" })
      .waitFor({ state: "hidden" });
    const beforeCabin = (await state()).records.find(
      (t) => t.description === "Cabin",
    );
    await selectTask("Alex e-transfer");
    await page
      .getByRole("button", { name: "Deduct expenses", exact: true })
      .click();
    await page
      .locator(".rv-people")
      .getByRole("button", { name: "Al Alex", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "Mountain weekend Event · 2 expenses",
        exact: true,
      })
      .check();
    assert.equal(
      await page.locator(".rv-targets input:checked").count(),
      3,
      "group and its two canonical expenses selected",
    );
    await page
      .getByRole("spinbutton", {
        name: "Exact divider after Juniper dinner",
        exact: true,
      })
      .fill("210");
    await page
      .getByRole("spinbutton", {
        name: "Exact divider after Cabin",
        exact: true,
      })
      .fill("150");
    await snap("repayment");
    await saveReview();
    await page
      .locator(".rv-task-list")
      .getByRole("button")
      .filter({ hasText: "Alex e-transfer" })
      .waitFor({ state: "hidden" });
    s = await state();
    const payment = s.records.find((t) => t.description === "Alex e-transfer");
    assert.equal(payment.review.remainder, 3000);
    assert.equal(payment.review.allocations.length, 2);
    assert.deepEqual(
      s.records.find((t) => t.description === "Cabin"),
      beforeCabin,
    );
    await selectTask("Salary");
    await page.getByRole("button", { name: "Income", exact: true }).click();
    await page.getByRole("button", { name: "Paycheck", exact: true }).click();
    await saveReview();
    await selectTask("Transfer out");
    await page
      .getByRole("button", { name: "Own-account transfer", exact: true })
      .click();
    await page.getByRole("radio").check();
    await saveReview();
    await selectTask("Zero record");
    await page
      .getByRole("button", { name: "No cash movement", exact: true })
      .click();
    await saveReview();
    await page
      .getByRole("checkbox", { name: "Show reviewed", exact: true })
      .check();
    await selectTask("Juniper dinner");
    await page
      .getByRole("button", { name: "Reopen review", exact: true })
      .click();
    await page
      .locator(".rv-task-list")
      .getByRole("button")
      .filter({ hasText: "Juniper dinner" })
      .waitFor({ state: "hidden" });
    await stage("4 · Overview");
    await page.getByRole("button", { name: "Groceries", exact: true }).click();
    await page.getByRole("button", { name: "Dining", exact: true }).click();
    assert.equal(await page.locator(".rv-insight-rows > button").count(), 2);
    assert.match(
      await page.locator(".rv-flow-summary").textContent(),
      /260.01/,
    );
    await snap("category-views");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 700),
    );
    await stage("1 · Categories");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "no horizontal overflow at minimum width",
    );
    await snap("narrow-cards");
    await stage("3 · Review");
    await page
      .getByRole("checkbox", { name: "Show reviewed", exact: true })
      .uncheck();
    await selectTask("Juniper dinner");
    await snap("narrow-review");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    const saved = await state();
    await app.close();
    app = null;
    await launch();
    const restored = await state();
    assert.deepEqual(restored, saved);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        records: restored.records.length,
        entities: restored.entities.length,
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
