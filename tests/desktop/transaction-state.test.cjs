const test = require("node:test"),
  assert = require("node:assert/strict");
test("transaction facts are independent, exact and ignore the legacy reviewed flag", async () => {
  const { transactionState } = await import("../../src/transaction-state.js");
  const { flowSummary } = await import("../../src/review-model.js");
  const base = {
    tags: [],
    groups: [],
    allocations: [],
    shares: null,
    reviewed: false,
    kind: "unreviewed",
  };
  const expense = {
    id: "expense",
    amountCents: -10000,
    review: { ...base, tags: [{ id: "food", cents: 10000 }], groups: ["trip"] },
  };
  const payment = {
    id: "payment",
    amountCents: 6000,
    review: {
      ...base,
      kind: "repayment",
      allocations: [{ id: "expense", cents: 4500 }],
      remainder: 1500,
    },
  };
  const income = {
    id: "income",
    amountCents: 3000,
    review: {
      ...base,
      kind: "income",
      incomeType: "interest",
      tags: [{ id: "food", cents: 3000 }],
    },
  };
  const rows = [expense, payment, income],
    f = transactionState(expense, rows),
    p = transactionState(payment, rows);
  assert.equal(f.categorized, true);
  assert.equal(f.events, true);
  assert.equal(f.deductedCents, 4500);
  assert.equal(f.transfer, false);
  assert.equal(p.allocatedCents, 4500);
  assert.equal(p.unassignedCents, 1500);
  assert.equal(p.uncategorized, true);
  assert.equal(transactionState(income, rows).income, true);
  assert.equal(flowSummary(rows, ["food"]).totals.income, 3000);
  assert.deepEqual(
    transactionState(
      { ...expense, review: { ...expense.review, reviewed: true } },
      rows,
    ),
    f,
  );
  assert.equal(transactionState(expense, [expense, income]).deducted, false);
});
