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
  const { monthlyDashboard, availableMonths } =
    await import("../../src/dashboard-model.js");
  const { records, entities } = fixture();
  assert.deepEqual(availableMonths(records), ["2026-07", "2026-08", "2026-09"]);
  const series = monthlyDashboard(records, entities, { year: "2026" });
  assert.equal(series.length, 12);
  assert.equal(series[0].model, null);
  assert.equal(series[6].model.net, 4000);
  assert.equal(series[7].model.net, 29099);
  assert.equal(series[7].model.cashIn, 112001);
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
  const { dashboard, TRANSFER_FEES, UNCATEGORIZED } =
    await import("../../src/dashboard-model.js");
  const f = fixture(),
    before = JSON.stringify(f),
    opts = { from: "2026-08-01", through: "2026-08-31" };
  const m = dashboard(f.records, f.entities, opts);
  assert.equal(m.gross, 40100);
  assert.equal(m.repaid, 11001);
  assert.equal(m.net, 29099);
  assert.equal(m.owed, 4999);
  assert.equal(m.cashIn, 112001);
  assert.equal(m.cashOut, 40100);
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
  assert.equal(fee.cashOut, 100);
  const later = dashboard(f.records, f.entities, { ...opts, later: true });
  assert.equal(later.net, 24100);
  assert.equal(later.owed, 0);
  assert.equal(later.cashIn, m.cashIn);
  assert.equal(JSON.stringify(f), before, "dashboard is read-only");
});
test("boundary cash flow excludes linked principal across dates and hidden accounts, keeping fee and excess once", async () => {
  const { dashboard, accountOverview, TRANSFER_FEES, TRANSFER_EXCESS } =
    await import("../../src/dashboard-model.js");
  const r = (id, amount, date, review = {}, extra = {}) => ({
    id,
    amountCents: amount,
    date,
    currency: "CAD",
    description: id,
    accountId: id,
    account: id,
    review: {
      kind: "unreviewed",
      tags: [],
      groups: [],
      shares: null,
      allocations: [],
      ...review,
    },
    ...extra,
  });
  const rows = [
    r("debit", -10100, "2026-08-31", {
      kind: "transfer",
      transferId: "credit",
      transferFeeCents: 100,
    }),
    r(
      "credit",
      10000,
      "2026-09-01",
      { kind: "transfer", transferId: "debit" },
      { deleted: true },
    ),
    r("out2", -20000, "2026-08-20", { kind: "transfer", transferId: "in2" }),
    r("in2", 20500, "2026-08-20", {
      kind: "transfer",
      transferId: "out2",
      transferExcessCents: 500,
    }),
    r("unlinked", -700, "2026-08-20", {
      tags: [{ id: "named-transfer", cents: 700 }],
    }),
    r("salary", 100000, "2026-08-20", { kind: "income" }),
  ];
  const opts = { from: "2026-08-01", through: "2026-08-31" };
  const view = dashboard(rows, [], opts);
  assert.deepEqual([view.cashIn, view.cashOut], [100500, 800]);
  assert.equal(
    view.cashGroups.find((g) => g.id === "transfer-extra").rows[0].cents,
    500,
  );
  assert.equal(
    view.cashGroups.find((g) => g.id === "income").rows[0].cents,
    100000,
  );
  assert.equal(
    view.cashGroups.flatMap((g) => g.rows).reduce((n, t) => n + t.cents, 0),
    view.cashIn + view.cashOut,
  );
  assert.equal(
    dashboard(rows, [], { ...opts, categories: [TRANSFER_FEES] }).cashOut,
    100,
  );
  assert.equal(
    dashboard(rows, [], { ...opts, categories: [TRANSFER_EXCESS] }).cashIn,
    500,
  );
  assert.equal(
    dashboard(rows, [], { ...opts, categories: ["named-transfer"] }).cashOut,
    700,
  );
  const accounts = accountOverview(rows, opts).accounts;
  assert.equal(
    accounts.reduce((n, a) => n + a.cashIn, 0),
    view.cashIn,
  );
  assert.equal(
    accounts.reduce((n, a) => n + a.cashOut, 0),
    view.cashOut,
  );
  rows[1].deleted = false;
  const september = dashboard(rows, [], {
    from: "2026-09-01",
    through: "2026-09-30",
  });
  assert.deepEqual([september.cashIn, september.cashOut], [0, 0]);
  // An unlinked debit becomes external again; category names never establish a transfer.
  rows[0].review.kind = "unreviewed";
  assert.equal(dashboard(rows, [], opts).cashOut, 10800);
});
test("account network reuses nodes and separates reciprocal directions", async () => {
  const { accountNetwork } = await import("../../src/account-network.js");
  const accounts = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];
  const routes = [
    { key: "a:b", fromId: "a", toId: "b" },
    { key: "b:a", fromId: "b", toId: "a" },
    { key: "b:d", fromId: "b", toId: "d", to: "Hidden D" },
  ];
  const g = accountNetwork(accounts, routes);
  assert.equal(g.nodes.length, 4);
  assert.equal(g.edges.length, 3);
  assert.notDeepEqual(g.edges[0].label, g.edges[1].label);
  assert.ok(
    g.nodes.every(
      (n) =>
        n.x >= 90 && n.x <= g.width - 90 && n.y >= 37 && n.y <= g.height - 37,
    ),
  );
  assert.ok(g.edges.every((e) => !e.path.includes("NaN")));
  assert.deepEqual(accountNetwork(accounts, routes), g);
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

test("income tags filter receipts independently of expense tags without reclassifying repayments", async () => {
  const { dashboard } = await import("../../src/dashboard-model.js");
  const { records, entities } = fixture();
  const period = { from: "2026-08-01", through: "2026-08-31", incomeTags: [] };
  const all = dashboard(records, entities, period);
  const food = dashboard(records, entities, {
    ...period,
    categories: ["food"],
  });
  assert.equal(food.cashIn, all.cashIn);
  assert.ok(food.cashOut < all.cashOut);
  const income = dashboard(records, entities, {
    ...period,
    incomeTags: ["income"],
  });
  assert.equal(income.cashIn, 100000);
  assert.equal(income.cashOut, all.cashOut);
  assert.equal(income.net, all.net);
  assert.equal(all.cashGroups.find((g) => g.id === "repayment").rows.length, 2);
  assert.equal(all.cashGroups.find((g) => g.id === "income").rows.length, 1);
});
