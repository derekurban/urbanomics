// Calendar + shared-cost integration with synthetic bank exports only.
const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs");
const { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "events-" + randomUUID());
const dataDir = path.join(root, "workspace"),
  configDir = path.join(root, "configuration");
const store = new ImportStore(dataDir);
const account = store.addAccount("Synthetic spending", "pc", "chequing");
const source = path.join(root, "synthetic.csv");
fs.writeFileSync(
  source,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    ...[
      ["Cabin", "08/14/2026", "-360"],
      ["Fuel", "08/15/2026", "-90"],
      ["Groceries", "08/16/2026", "-90"],
      ["Alex payment", "08/18/2026", "190"],
      ["Sam payment", "09/01/2026", "180"],
      ["Everyday coffee", "08/20/2026", "-5"],
    ].map(([name, date, amount]) => [
      name,
      "SYNTHETIC",
      "SAMPLE",
      date,
      "11:59 PM",
      amount,
    ]),
  ]),
);
store.resolveAccount(store.enqueue([source]).ids[0], account, false);
const alex = store.review.entity("person", { name: "Alex", color: "#78976A" }),
  sam = store.review.entity("person", { name: "Sam", color: "#8FA6CB" });
const cat = store.review.entity("category", {
  name: "Travel",
  color: "#78976A",
});
for (const row of store.review
  .records()
  .filter((t) => ["Cabin", "Fuel", "Groceries"].includes(t.description))) {
  const share = -row.amountCents / 3;
  store.review.organize([
    {
      id: row.id,
      version: row.version,
      tags: [{ id: cat, cents: -row.amountCents }],
    },
  ]);
  store.review.financial(row.id, row.version + 1, {
    kind: "expense",
    reviewed: true,
    shares: [
      { id: "me", cents: share },
      { id: alex, cents: share },
      { id: sam, cents: share },
    ],
  });
}
const immutable = () =>
  Object.fromEntries(
    fs
      .readdirSync(path.join(dataDir, "archive"), {
        recursive: true,
        withFileTypes: true,
      })
      .filter((f) => f.isFile())
      .map((f) => {
        const file = path.join(f.parentPath, f.name);
        return [
          path.relative(dataDir, file),
          createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        ];
      }),
  );
const otherEvent = store.review.entity("group", {
  name: "Other occasion",
  startDate: "2026-08-14",
  endDate: "2026-08-17",
  color: "#78976A",
});
const alexIncoming = store.review
  .records()
  .find((t) => t.description === "Alex payment");
store.review.organize([
  { id: alexIncoming.id, version: alexIncoming.version, groups: [otherEvent] },
]);
const archives = immutable();
const beforeMigration = store.review.records();
store.db.exec(
  "ALTER TABLE review_entities DROP COLUMN startDate; ALTER TABLE review_entities DROP COLUMN endDate; PRAGMA user_version=8;",
);
store.close();
const env = {
  ...process.env,
  URBANOMICS_DATA_DIR: dataDir,
  URBANOMICS_CONFIG_DIR: configDir,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
const state = () => page.evaluate(() => window.urbanomics.reviewState());
const button = (name) => page.getByRole("button", { name, exact: true });
const stage = (name) =>
  page
    .getByRole("navigation", { name: "Review stages" })
    .getByRole("button", { name })
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
  await stage("2 · Events");
}
async function day(date) {
  await page
    .getByLabel("Event calendar month", { exact: true })
    .fill(date.slice(0, 7));
  await button(`Transactions on ${date}`).click();
}
async function link(name, date) {
  await day(date);
  await button(`Link ${name}`).click();
  await button(`Unlink ${name}`).waitFor();
}
(async () => {
  try {
    await launch();
    assert.deepEqual(
      (await state()).records,
      beforeMigration,
      "migration preserves every transaction and financial decision",
    );
    await button("+ New event").click();
    const modal = page.getByRole("dialog", { name: "New event", exact: true });
    await modal.getByLabel("Name", { exact: true }).fill("Mountain weekend");
    await modal.getByLabel("Start date").fill("2026-08-15");
    await modal.getByLabel("End date").fill("2026-08-17");
    await shot("event-dates");
    await modal
      .getByRole("button", { name: "Save event", exact: true })
      .click();
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      (await state()).records.every(
        (t) =>
          JSON.stringify(t.review.groups) ===
          JSON.stringify(
            beforeMigration.find((r) => r.id === t.id).review.groups,
          ),
      ),
      true,
      "dates suggest without assigning",
    );
    await button("Manage event Mountain weekend").click();
    await day("2026-08-14");
    assert.match(
      await button("Transactions on 2026-08-14").getAttribute("class"),
      /near-event/,
    );
    await page
      .getByRole("checkbox", { name: "Include one day before and after" })
      .uncheck();
    assert.equal(
      await button("Transactions on 2026-08-14").getAttribute("class"),
      "",
    );
    await page
      .getByRole("checkbox", { name: "Include one day before and after" })
      .check();
    await link("Cabin", "2026-08-14");
    await link("Fuel", "2026-08-15");
    await link("Groceries", "2026-08-16");
    await link("Alex payment", "2026-08-18");
    await day("2026-08-15");
    await shot("calendar");
    await button("Costs & repayments").click();
    await shot("event-costs-before");
    const expensesBefore = (await state()).records.filter(
      (t) => t.amountCents < 0,
    );
    await button("Allocate payment").click();
    await page
      .locator(".rv-people")
      .getByRole("button", { name: "Al Alex", exact: true })
      .click();
    assert.equal(
      await page.locator(".rv-targets input:checked").count(),
      4,
      "event shortcut selects three unique expenses",
    );
    assert.match(
      await page.locator(".allocation-summary").textContent(),
      /180\.00.*10\.00/,
    );
    await page
      .getByLabel("Allocation to Cabin", { exact: true })
      .fill("110.01");
    assert.match(
      await page.locator(".allocation-summary").textContent(),
      /170\.01.*19\.99/,
    );
    await page
      .getByRole("button", { name: "Split evenly", exact: true })
      .click();
    await shot("allocation-preview");
    await button("Save allocation").click();
    await page
      .locator(".rv-task-list")
      .getByRole("button")
      .filter({ hasText: "Alex payment" })
      .waitFor({ state: "hidden" });
    let s = await state(),
      payment = s.records.find((t) => t.description === "Alex payment");
    assert.equal(payment.review.remainder, 1000);
    assert.equal(payment.review.allocations.length, 3);
    assert.deepEqual(
      s.records.filter((t) => t.amountCents < 0),
      expensesBefore,
      "saving repayment preserves expense reviews",
    );
    await stage("2 · Events");
    await button("Costs & repayments").click();
    assert.match(
      await page.locator(".cost-metrics").textContent(),
      /540\.00.*180\.00.*360\.00/,
    );
    assert.match(
      await page.locator(".cost-agreement").textContent(),
      /180\.00.*180\.00/,
    );
    await button("Calendar").click();
    await link("Sam payment", "2026-09-01");
    await button("Costs & repayments").click();
    await button("Allocate payment").click();
    await page
      .locator(".rv-people")
      .getByRole("button", { name: "Sa Sam", exact: true })
      .click();
    await button("Save allocation").click();
    await page
      .locator(".rv-task-list")
      .getByRole("button")
      .filter({ hasText: "Sam payment" })
      .waitFor({ state: "hidden" });
    await stage("2 · Events");
    await button("Costs & repayments").click();
    assert.match(
      await page.locator(".cost-metrics").textContent(),
      /540\.00.*360\.00.*180\.00/,
    );
    assert.match(
      await page.locator(".cost-agreement").textContent(),
      /180\.00.*0\.00/,
    );
    await page
      .locator(".cost-expenses summary")
      .filter({ hasText: "Cabin" })
      .click();
    await shot("event-costs-repaid");
    // Group edits cannot rewrite an already allocated repayment.
    await button("Calendar").click();
    await day("2026-08-14");
    await button("Unlink Cabin").click();
    await button("Link Cabin").waitFor();
    assert.deepEqual(
      (await state()).records.find((t) => t.id === payment.id),
      payment,
    );
    await button("Link Cabin").click();
    await button("Unlink Cabin").waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await shot("calendar-narrow");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await button("Edit event").click();
    await shot("event-dates-narrow");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    const saved = await state();
    assert.equal(
      saved.records.find((t) => t.description === "Everyday coffee").review
        .groups.length,
      0,
    );
    assert.ok(
      fs
        .readFileSync(path.join(configDir, "workspace.sql"), "utf8")
        .includes("2026-08-17"),
    );
    assert.deepEqual(immutable(), archives);
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(await state(), saved);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "date buffer, optional membership, cross-month payments, exact allocations, caps, cost breakdown, archive preservation, restart, narrow layout",
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
