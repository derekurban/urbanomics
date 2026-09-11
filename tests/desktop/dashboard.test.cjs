const test = require("node:test"),
  assert = require("node:assert/strict");
function fixture() {
  const r = (id, amount, date = "2026-08-15", review = {}, extra = {}) => ({
    id,
    amountCents: amount,
    date,
    currency: "CAD",
    account: "Bank",
    accountId: "a",
    description: id,
    deleted: false,
    review: {
      kind: "unreviewed",
      tags: [],
      groups: [],
      shares: null,
      allocations: [],
      transferId: "",
      ...review,
    },
    ...extra,
  });
  const records = [
    r("expense", -30000, undefined, {
      kind: "expense",
      tags: [
        { id: "food", cents: 18000 },
        { id: "home", cents: 12000 },
      ],
      groups: ["trip", "dates"],
      shares: [
        { id: "me", cents: 15000 },
        { id: "alex", cents: 15000 },
      ],
    }),
    r("other", -10000, undefined, { groups: ["trip"] }),
    r("pay", 10001, "2026-08-20", {
      kind: "repayment",
      personId: "alex",
      allocations: [{ id: "expense", cents: 10001 }],
    }),
    r(
      "cash",
      1000,
      "2026-08-21",
      {
        kind: "repayment",
        personId: "maya",
        allocations: [{ id: "other", cents: 1000 }],
      },
      { manual: true },
    ),
    r("late", 4999, "2026-09-01", {
      kind: "repayment",
      personId: "alex",
      allocations: [{ id: "expense", cents: 4999 }],
    }),
    r("july", -4000, "2026-07-30"),
    r("old-pay", 2000, "2026-08-24", {
      kind: "repayment",
      personId: "alex",
      allocations: [{ id: "july", cents: 2000 }],
    }),
    r("salary", 100000, undefined, {
      kind: "income",
      tags: [{ id: "income", cents: 100000 }],
    }),
    r("out", -10000, undefined, {
      kind: "transfer",
      transferId: "in",
      transferFeeCents: 100,
    }),
    r(
      "in",
      9900,
      undefined,
      { kind: "transfer", transferId: "out" },
      { accountId: "b" },
    ),
    r("usd", -500000, undefined, {}, { currency: "USD" }),
    r("hidden", -800000, undefined, {}, { deleted: true }),
  ];
  return {
    records,
    entities: [
      { id: "trip", kind: "group", name: "Trip" },
      { id: "dates", kind: "group", name: "Dates" },
    ],
  };
}
test("monthly trends preserve missing months and reconcile category filters and receipt cutoffs", async () => {
  const { monthlyDashboard, availableMonths } = await import(
    "../../src/dashboard-model.js"
  );
  const { records, entities } = fixture();
  assert.deepEqual(availableMonths(records), ["2026-07", "2026-08", "2026-09"]);
  const series = monthlyDashboard(records, entities, { year: "2026" });
  assert.equal(series.length, 12);
  assert.equal(series[0].model, null);
  assert.equal(series[6].model.net, 4000);
  assert.equal(series[7].model.net, 29099);
  assert.equal(series[7].model.cashIn, 121901);
  assert.equal(series[8].model.gross, 0); // Observed month with no expenses is zero, not missing.
  const later = monthlyDashboard(records, entities, {
    year: "2026",
    later: true,
  });
  assert.equal(later[6].model.net, 2000);
  assert.equal(later[7].model.net, 24100);
  const food = monthlyDashboard(records, entities, {
    year: "2026",
    categories: ["food"],
  });
  assert.equal(food[7].model.net, 11999);
  assert.equal(food[7].model.cashIn, 0);
  assert.equal(food[7].model.cashOut, 18000);
  assert.equal(food[6].available, true);
  assert.equal(food[6].model.net, 0);
  assert.deepEqual(availableMonths(records, "USD"), ["2026-08"]);
});
test("vendor groups merge aliases across raw descriptions, preserve cents, and retain dated payments", async () => {
  const { vendorGroups } = await import("../../src/dashboard-model.js");
  const rows = [
    {
      row: {
        id: "a",
        description: "Superstore",
        originalDescription: "STORE 123",
        aliasId: "alias",
        date: "2026-08-01",
      },
      gross: 1234,
      repaid: 234,
      net: 1000,
    },
    {
      row: {
        id: "b",
        description: "Superstore",
        originalDescription: "STORE 456",
        aliasId: "alias",
        date: "2026-08-20",
      },
      gross: 2001,
      repaid: 0,
      net: 2001,
    },
    {
      row: { id: "c", description: "Dining", date: "2026-08-20" },
      gross: 101,
      repaid: 0,
      net: 101,
    },
  ];
  const before = JSON.stringify(rows),
    groups = vendorGroups(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    [groups[0].gross, groups[0].repaid, groups[0].net],
    [3235, 234, 3001],
  );
  assert.deepEqual(
    groups[0].rows.map((e) => e.row.id),
    ["b", "a"],
  );
  assert.equal(JSON.stringify(rows), before);
});
test("account standing uses source observations and transfer arrows count once by debit month", async () => {
  const { accountOverview } = await import("../../src/dashboard-model.js");
  const { records } = fixture();
  records.find((t) => t.id === "in").date = "2026-09-01";
  records.find((t) => t.id === "in").balanceCents = 9900;
  const opts = { from: "2026-08-01", through: "2026-08-31" };
  let view = accountOverview(records, opts);
  assert.equal(view.accounts.length, 2); // No hidden, manual cash or USD accounts.
  assert.equal(view.accounts.find((a) => a.id === "a").balance.value, null);
  assert.equal(view.accounts.find((a) => a.id === "b").balance.value, 9900);
  assert.equal(
    view.accounts.find((a) => a.id === "b").balance.date,
    "2026-09-01",
  );
  assert.equal(view.accounts.find((a) => a.id === "b").cashIn, 0);
  assert.deepEqual(
    [view.routes[0].debit, view.routes[0].credit, view.routes[0].fees],
    [10000, 9900, 100],
  );
  assert.equal(view.routes[0].pairs.length, 1);
  assert.equal(
    accountOverview(records, { from: "2026-09-01", through: "2026-09-30" })
      .routes.length,
    0,
  );
  records.push({
    ...records.find((t) => t.id === "in"),
    id: "balance2",
    amountCents: 1,
    balanceCents: 9901,
    review: { kind: "unreviewed", tags: [], groups: [], allocations: [] },
  });
  view = accountOverview(records, opts);
  assert.equal(view.accounts.find((a) => a.id === "b").balance.value, null);
  assert.equal(view.accounts.find((a) => a.id === "b").balance.ambiguous, true);
  assert.equal(
    view.accounts.find((a) => a.id === "b").balance.observations.length,
    2,
  );
});
test("dashboard reconciles cash, deductions, cross-month receipts, overlapping events and exact category cents", async () => {
  const { dashboard, TRANSFER_FEES, UNCATEGORIZED } = await import(
    "../../src/dashboard-model.js"
  );
  const f = fixture(),
    before = JSON.stringify(f),
    opts = { from: "2026-08-01", through: "2026-08-31" };
  const m = dashboard(f.records, f.entities, opts);
  assert.equal(m.gross, 40100);
  assert.equal(m.repaid, 11001);
  assert.equal(m.net, 29099);
  assert.equal(m.owed, 4999);
  assert.equal(m.cashIn, 121901);
  assert.equal(m.cashOut, 50000);
  assert.equal(m.cashReceived, 1000);
  assert.equal(m.events[0].gross, 40000);
  assert.equal(m.events[1].gross, 30000);
  assert.equal(m.provisional.length, 1);
  const food = dashboard(f.records, f.entities, {
    ...opts,
    categories: ["food"],
  });
  assert.equal(food.gross, 18000);
  assert.equal(food.repaid, 6001);
  assert.equal(food.net, 11999);
  assert.equal(food.cashIn, 0);
  const home = dashboard(f.records, f.entities, {
    ...opts,
    categories: ["home"],
  });
  assert.equal(home.net, 8000);
  const unc = dashboard(f.records, f.entities, {
    ...opts,
    categories: [UNCATEGORIZED],
  });
  assert.equal(unc.gross, 10000);
  const fee = dashboard(f.records, f.entities, {
    ...opts,
    categories: [TRANSFER_FEES],
  });
  assert.equal(fee.net, 100);
  assert.equal(fee.cashOut, 0);
  const later = dashboard(f.records, f.entities, { ...opts, later: true });
  assert.equal(later.net, 24100);
  assert.equal(later.owed, 0);
  assert.equal(later.cashIn, m.cashIn);
  assert.equal(JSON.stringify(f), before, "dashboard is read-only");
});
test("tiny reimbursements cannot overdraw a category, and hidden-account payments still reduce active costs", async () => {
  const { dashboard } = await import("../../src/dashboard-model.js"),
    f = fixture();
  const expense = f.records[0];
  expense.amountCents = -3;
  expense.review.tags = [
    { id: "food", cents: 1 },
    { id: "home", cents: 2 },
  ];
  expense.review.shares = null;
  const base = f.records.find((r) => r.id === "pay");
  const payments = [0, 1, 2].map((i) => ({
    ...base,
    id: "p" + i,
    deleted: i === 0,
    amountCents: 1,
    review: { ...base.review, allocations: [{ id: expense.id, cents: 1 }] },
  }));
  const m = dashboard([expense, ...payments], [], {
    from: "2026-08-01",
    through: "2026-08-31",
  });
  assert.equal(m.net, 0);
  assert.equal(m.repaid, 3);
  assert.ok(m.categories.every((c) => c.net === 0));
  assert.equal(m.cashIn, 2);
  assert.equal(
    m.expenses[0].payments.reduce((n, p) => n + p.selected, 0),
    3,
  );
});
test("date boundaries, later repayments, empty selections and currencies remain independent", async () => {
  const { dashboard } = await import("../../src/dashboard-model.js"),
    f = fixture();
  const july = dashboard(f.records, f.entities, {
    from: "2026-07-01",
    through: "2026-07-31",
  });
  assert.equal(july.net, 4000);
  assert.equal(
    dashboard(f.records, f.entities, {
      from: "2026-07-01",
      through: "2026-07-31",
      later: true,
    }).net,
    2000,
  );
  assert.equal(
    dashboard(f.records, f.entities, {
      from: "2026-08-01",
      through: "2026-08-31",
      currency: "USD",
    }).gross,
    500000,
  );
  assert.equal(
    dashboard(f.records, f.entities, {
      from: "2027-01-01",
      through: "2027-01-31",
    }).gross,
    0,
  );
  assert.equal(
    dashboard(f.records, f.entities, {
      from: "2026-08-01",
      through: "2026-08-31",
      categories: ["income"],
    }).gross,
    0,
  );
  const out = f.records.find((t) => t.id === "out");
  out.date = "2026-07-31";
  const aug = dashboard(f.records, f.entities, {
    from: "2026-08-01",
    through: "2026-08-31",
  });
  assert.equal(aug.gross, 40000);
  assert.equal(aug.transfers.length, 1);
});
