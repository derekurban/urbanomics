const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs"),
  { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "dashboard-" + randomUUID()),
  dataDir = path.join(root, "data");
const store = new ImportStore(dataDir),
  account = store.addAccount("Synthetic chequing", "pc", "chequing"),
  savings = store.addAccount("Synthetic savings", "eq", "savings");
function upload(name, acct, rows) {
  const file = path.join(root, name + ".csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ...rows.map(([n, a, d]) => [
        n,
        "SYNTHETIC",
        "SAMPLE",
        d || "08/15/2026",
        "12:00 AM",
        a,
      ]),
    ]),
  );
  store.resolveAccount(store.enqueue([file]).ids[0], acct, false);
}
upload("bank", account, [
  ["Household shopping", "-300", "08/15/2026"],
  ["Dinner", "-100", "08/16/2026"],
  ["Paycheck", "1000"],
  ["Alex payment", "100.01", "08/20/2026"],
  ["Alex later", "49.99", "09/01/2026"],
  ["To savings", "-100", "08/10/2026"],
  ["July dinner", "-40", "07/30/2026"],
  ["Older repayment", "20", "08/24/2026"],
  ["Older interest", "5", "01/01/2024"],
]);
const eqFile = path.join(root, "eq.csv");
fs.writeFileSync(
  eqFile,
  csv([
    ["Transfer date", "Description", "Amount", "Balance"],
    ["2026-08-10", "From chequing", "99", "250"],
  ]),
);
store.resolveAccount(store.enqueue([eqFile]).ids[0], savings, false);
const food = store.review.entity("category", {
    name: "Groceries",
    color: "#8FA6CB",
  }),
  home = store.review.entity("category", { name: "Home", color: "#AF8EB5" }),
  income = store.review.entity("category", {
    name: "Income",
    flowType: "income",
    color: "#78976A",
  }),
  person = store.review.entity("person", { name: "Alex", color: "#70A8A5" }),
  trip = store.review.entity("group", {
    name: "Mountain weekend",
    color: "#AF8EB5",
    startDate: "2026-08-14",
    endDate: "2026-08-18",
  }),
  dates = store.review.entity("group", {
    name: "Time together",
    color: "#C8A06D",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  });
const foodBucket = store.review.entity("bucket", {
  name: "Food",
  color: "#7baa73",
  gradientStart: "#427651",
  gradientEnd: "#b5d394",
});
store.review.entity("category", {
  ...store.review.entities().find((e) => e.id === food),
  parentId: foodBucket,
});
const row = (n) => store.review.records().find((t) => t.description === n);
const organize = (n, values) => {
  const t = row(n);
  store.review.organize([{ id: t.id, version: t.version, ...values }]);
};
const save = (n, values) => {
  const t = row(n);
  store.review.financial(t.id, t.version, { reviewed: true, ...values });
};
organize("Household shopping", {
  tags: [
    { id: food, cents: 18000 },
    { id: home, cents: 12000 },
  ],
  groups: [trip, dates],
});
organize("Dinner", { groups: [trip] });
organize("Paycheck", { tags: [{ id: income, cents: 100000 }] });
save("Household shopping", {
  kind: "expense",
  shares: [
    { id: "me", cents: 15000 },
    { id: person, cents: 15000 },
  ],
});
save("Paycheck", { kind: "income", incomeType: "paycheck" });
save("Alex payment", {
  kind: "repayment",
  personId: person,
  allocations: [{ id: row("Household shopping").id, cents: 10001 }],
  remainder: 0,
});
save("Alex later", {
  kind: "repayment",
  personId: person,
  allocations: [{ id: row("Household shopping").id, cents: 4999 }],
  remainder: 0,
});
save("Older repayment", {
  kind: "repayment",
  personId: person,
  allocations: [{ id: row("July dinner").id, cents: 2000 }],
  remainder: 0,
});
store.review.linkTransfer(
  row("To savings").id,
  row("To savings").version,
  row("From chequing").id,
  row("From chequing").version,
  200,
);
store.aliases.save({ name: "Juniper", pattern: "^(July dinner|Dinner)" });
store.close();
const env = { ...process.env, URBANOMICS_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
const button = (name) => page.getByRole("button", { name, exact: true });
const shot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
const stat = (label) =>
  page
    .locator(".dash-stat")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("strong");
(async () => {
  try {
    app = await _electron.launch({
      ...(process.env.URBANOMICS_TEST_EXECUTABLE
        ? { executablePath: process.env.URBANOMICS_TEST_EXECUTABLE }
        : { args: [repo] }),
      cwd: repo,
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page
      .getByRole("heading", { name: "Snapshots", exact: true })
      .waitFor();
    const before = await page.evaluate(() => window.urbanomics.reviewState());
    await page.locator(".nav-item").filter({ hasText: "Dashboard" }).click();
    await button("August 2026").click();
    assert.equal(await stat("Paid for expenses").textContent(), "$401.00");
    assert.equal(await stat("Still paid by you").textContent(), "$300.99");
    assert.deepEqual(
      await page
        .getByLabel("Dashboard year", { exact: true })
        .locator("option")
        .allTextContents(),
      ["2026", "2024"],
    );
    await page
      .getByLabel("Dashboard year", { exact: true })
      .selectOption("2024");
    assert.equal(
      await button("January 2024").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await button("February 2024").isDisabled(), true);
    await page
      .getByLabel("Dashboard year", { exact: true })
      .selectOption("2026");
    await button("August 2026").click();
    assert.equal(await button("January 2026").isDisabled(), true);
    assert.equal(await page.locator(".dash-month-bar").count(), 24);
    await page
      .getByRole("button", {
        name: "July 2026: after repayments $40.00",
        exact: true,
      })
      .click();
    assert.equal(await stat("Paid for expenses").textContent(), "$40.00");
    await button("August 2026").click();
    await shot("spending");
    assert.equal(
      await page
        .locator(".dash-filters")
        .getByRole("button", { name: "Groceries", exact: true })
        .count(),
      0,
    );
    const groceryChip = page.getByLabel("Tags in Food", { exact: true }).getByRole("button", { name: /Groceries/ });
    const spendTooltip = page.getByRole("tooltip");
    await page.evaluate(() => window.scrollTo(0, 0));
    await groceryChip.focus();
    await spendTooltip.waitFor();
    const tooltipBounds = await spendTooltip.boundingBox();
    assert.ok(tooltipBounds.x >= 0 && tooltipBounds.y >= 0);
    await page.keyboard.press("Escape");
    await groceryChip.hover();
    await spendTooltip.waitFor();
    assert.match(await spendTooltip.textContent(), /Groceries.*119\.99.*180\.00 paid.*60\.01 repaid.*Household shopping.*119\.99/s);
    await shot("nested-tag-hover");
    await page.keyboard.press("Escape");
    await spendTooltip.waitFor({ state: "hidden" });
    await page.keyboard.press("Tab");
    await groceryChip.focus();
    await spendTooltip.waitFor();
    await groceryChip.click();
    await page.getByRole("dialog", { name: "Groceries", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".dash-bar").filter({ hasText: "Food" }).click();
    let hierarchyDialog = page.getByRole("dialog", {
      name: "Food",
      exact: true,
    });
    await hierarchyDialog
      .getByRole("region", { name: "Tags in this category" })
      .getByRole("button", { name: /Groceries/ })
      .click();
    hierarchyDialog = page.getByRole("dialog", {
      name: "Groceries",
      exact: true,
    });
    assert.match(await hierarchyDialog.textContent(), /119.99/);
    await hierarchyDialog
      .getByRole("button", { name: "← Back to Food", exact: true })
      .click();
    await shot("hierarchy-drilldown");
    await page.keyboard.press("Escape");
    await page
      .getByLabel("Spending breakdown layer", { exact: true })
      .getByRole("button", { name: "Tags", exact: true })
      .click();
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "Groceries", exact: true })
      .click();
    assert.equal(await stat("Still paid by you").textContent(), "$119.99");
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "Home", exact: true })
      .click();
    assert.equal(await stat("Still paid by you").textContent(), "$199.99");
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "Home", exact: true })
      .click();
    await page.locator(".dash-bar").first().click();
    let modal = page.getByRole("dialog", { name: "Groceries", exact: true });
    await modal.waitFor();
    await modal.locator(".dash-vendor > summary").click();
    await modal.locator(".dash-detail-row > summary").click();
    await modal.getByRole("button", { name: "Full list", exact: true }).click();
    assert.equal(await modal.locator(".dash-vendor").count(), 0);
    await modal.locator(".dash-detail-row > summary").click();
    await shot("category-detail");
    assert.match(await modal.textContent(), /60\.01/);
    await modal.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "All tags", exact: true })
      .click();
    assert.equal(await stat("Paid for expenses").textContent(), "$401.00");
    await button("All dates").click();
    await page.locator(".dash-bar").filter({ hasText: "Untagged" }).click();
    modal = page.getByRole("dialog", { name: "Untagged", exact: true });
    assert.equal(await modal.locator(".dash-vendor").count(), 1);
    assert.match(
      await modal.locator(".dash-vendor > summary").textContent(),
      /Juniper.*2 payments/s,
    );
    await modal.locator(".dash-vendor > summary").click();
    assert.equal(await modal.locator(".dash-detail-row").count(), 2);
    assert.match(await modal.textContent(), /2026-07-30/);
    await shot("vendors");
    await page.keyboard.press("Escape");
    await button("August 2026").click();
    await page.getByRole("checkbox", { name: /Include repayments/ }).check();
    assert.equal(await stat("Still paid by you").textContent(), "$251.00");
    await page
      .getByRole("navigation", { name: "Dashboard views" })
      .getByRole("button", { name: "Income", exact: true })
      .click();
    assert.equal(await stat("Income received").textContent(), "$1,000.00");
    assert.equal(await stat("Repayment receipts").textContent(), "$120.01");
    assert.equal(
      await page
        .getByLabel("Monthly income tag chart", { exact: true })
        .locator(".dash-month-bar")
        .count(),
      12,
    );
    assert.equal(
      await page
        .locator(".dash-filters")
        .getByRole("button", { name: "Groceries", exact: true })
        .count(),
      0,
    );
    await shot("income-view");
    await page
      .getByRole("button", {
        name: "September 2026: external receipts $49.99",
        exact: true,
      })
      .click();
    assert.equal(await stat("Repayment receipts").textContent(), "$49.99");
    await button("August 2026").click();
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "Untagged", exact: true })
      .click();
    assert.equal(await stat("Income received").textContent(), "$0.00");
    assert.equal(await stat("Repayment receipts").textContent(), "$120.01");
    await page.locator(".dash-bar").filter({ hasText: "Untagged" }).click();
    await page.getByRole("dialog", { name: "Untagged", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("dialog").locator(".dash-detail-row").count(),
      2,
    );
    await page.keyboard.press("Escape");
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "All income tags", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Dashboard views" })
      .getByRole("button", { name: "Cash flow", exact: true })
      .click();
    assert.equal(
      await stat("Money in from outside").textContent(),
      "$1,120.01",
    );
    assert.equal(await stat("Money out to outside").textContent(), "$401.00");
    await page
      .getByRole("group", { name: "Cash flow tag lens" })
      .getByRole("button", { name: "Income tags", exact: true })
      .click();
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "Income", exact: true })
      .click();
    assert.equal(
      await stat("Money in from outside").textContent(),
      "$1,000.00",
    );
    assert.equal(await stat("Money out to outside").textContent(), "$401.00");
    assert.equal(
      await page
        .locator(".dash-filters")
        .getByRole("button", { name: "Food", exact: true })
        .count(),
      0,
    );
    await shot("income-filter");
    await page
      .locator(".dash-filters")
      .getByRole("button", { name: "All income tags", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Cash flow tag lens" })
      .getByRole("button", { name: "Expense categories & tags", exact: true })
      .click();

    assert.match(
      await page.locator(".dash-account-grid").textContent(),
      /\$250.00/,
    );
    assert.match(
      await page.locator(".dash-account-grid").textContent(),
      /Balance unavailable/,
    );
    assert.equal(await page.locator(".dash-network-label").count(), 1);
    await page
      .locator(".dash-account-card")
      .filter({ hasText: "Synthetic savings" })
      .locator(".dash-balance")
      .click();
    modal = page.getByRole("dialog");
    assert.match(await modal.locator("summary").textContent(), /\$250.00/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".dash-network-node").count(), 2);
    await page.locator(".dash-network-node").first().click();
    assert.equal(
      await page
        .locator(".dash-network-node")
        .first()
        .getAttribute("aria-pressed"),
      "true",
    );
    await page
      .getByRole("button", { name: "Show all connections", exact: true })
      .click();
    await page.locator(".dash-network-label").focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    assert.match(await page.getByRole("dialog").textContent(), /Fee \$1.00/);
    await page.keyboard.press("Escape");
    await shot("cash-flow");
    await page
      .getByRole("navigation", { name: "Dashboard views" })
      .getByRole("button", { name: "Events", exact: true })
      .click();
    assert.equal(await page.locator(".dash-event").count(), 2);
    await shot("events");
    await page.locator(".dash-event").first().click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await button("July 2026").click();
    assert.match(
      await page.locator(".dash-workspace").textContent(),
      /No event expenses/,
    );
    await button("Custom dates").click();
    await page.getByLabel("Dashboard from", { exact: true }).fill("2027-01-01");
    await page.getByRole("alert").waitFor();
    await page
      .getByLabel("Dashboard through", { exact: true })
      .fill("2027-01-31");
    await page
      .getByRole("navigation", { name: "Dashboard views" })
      .getByRole("button", { name: "Expenses", exact: true })
      .click();
    assert.equal(await stat("Paid for expenses").textContent(), "$0.00");
    assert.match(
      await page.locator(".dash-workspace").textContent(),
      /No expense records/,
    );
    await button("August 2026").click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await shot("narrow");
    await page.getByLabel("Spending breakdown layer", { exact: true }).getByRole("button", { name: "Categories", exact: true }).click();
    await groceryChip.focus();
    await spendTooltip.waitFor();
    await page.screenshot({ path: path.join(root, "nested-tag-narrow.png"), animations: "disabled" });
    const narrowTooltip = await spendTooltip.boundingBox();
    assert.ok(narrowTooltip.x >= 0 && narrowTooltip.x + narrowTooltip.width <= 900);
    await page.keyboard.press("Escape");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("navigation", { name: "Dashboard views" })
      .getByRole("button", { name: "Income", exact: true })
      .click();
    await shot("income-narrow");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await button("Cash flow").click();
    await shot("cash-narrow");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await button("Expenses").click();
    await button("About these numbers").click();
    await shot("methods-narrow");
    await page.keyboard.press("Escape");
    assert.deepEqual(
      await page.evaluate(() => window.urbanomics.reviewState()),
      before,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "separate income/expense lenses, category-to-tag drilldown, income tag trends and receipt purposes, date/category/currency-aware totals, source drilldown, later repayments, cash flow, events, empty/invalid dates, narrow layout, no data mutations",
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
