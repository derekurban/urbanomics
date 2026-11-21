// Dashboard, Transactions, Accounts and Events presentation models: Unsorted, likely moves, ordering,
// ledger hand-off filters, card accounts and event payment suggestions. Invented data only.
const test = require("node:test"),
  assert = require("node:assert/strict");
const row = (id, amountCents, date, review = {}, extra = {}) => ({
  id, amountCents, date, currency: "CAD", account: extra.accountId || "Chequing", accountId: "chq", description: id, deleted: false,
  review: { kind: "unreviewed", tags: [], groups: [], shares: null, allocations: [], transferId: "", ...review }, ...extra,
});
const entities = [
  { id: "home", kind: "bucket", name: "Home", color: "#888888" },
  { id: "rent", kind: "category", flowType: "expense", parentId: "home", name: "Rent", color: "#777777" },
  { id: "food", kind: "category", flowType: "expense", parentId: "", name: "Food", color: "#666666" },
  { id: "other", kind: "category", flowType: "expense", parentId: "", name: "Other", systemRole: "other-expense", color: "#929292" },
];

test("untagged rows are Unsorted, last, and the Unsorted filter selects exactly them", async () => {
  const { dashboard, UNCATEGORIZED } = await import("../../src/dashboard-model.js");
  const records = [
    // The ledger projects the grey Other default onto untagged rows; tagsAutomatic marks that projection.
    row("auto", -5000, "2026-09-02", { tags: [{ id: "other", cents: 5000 }] }, { tagsAutomatic: true }),
    row("chosen", -1000, "2026-09-03", { kind: "expense", tags: [{ id: "other", cents: 1000 }] }),
    row("rent", -150000, "2026-09-01", { kind: "expense", tags: [{ id: "rent", cents: 150000 }] }),
    row("food", -2000, "2026-09-04", { kind: "expense", tags: [{ id: "food", cents: 2000 }] }),
  ];
  const range = { from: "2026-09-01", through: "2026-09-30" };
  const tags = dashboard(records, entities, { ...range, layer: "tags" }).categories;
  assert.deepEqual(tags.map((c) => c.id), ["rent", "food", "other", UNCATEGORIZED]);
  assert.equal(tags.find((c) => c.id === "other").net, 1000, "only the Other saved on purpose counts under Other");
  assert.equal(tags.at(-1).net, 5000);
  assert.equal(tags.at(-1).name, "Unsorted");
  const filtered = dashboard(records, entities, { ...range, categories: [UNCATEGORIZED] });
  assert.equal(filtered.gross, 5000);
  assert.deepEqual(filtered.expenses.map((e) => e.row.id), ["auto"]);
  const categories = dashboard(records, entities, { ...range, layer: "categories" }).categories;
  assert.deepEqual(categories.map((c) => c.id), ["home", "dashboard:ungrouped", UNCATEGORIZED]);
  // Totals are unchanged by the presentation: every cent is still counted once.
  assert.equal(dashboard(records, entities, range).gross, 158000);
});

test("income without a saved tag is Unsorted too", async () => {
  const { dashboard, UNCATEGORIZED } = await import("../../src/dashboard-model.js");
  const records = [row("pay", 30000, "2026-09-05", { tags: [{ id: "system:other-income", cents: 30000 }] }, { tagsAutomatic: true })];
  const model = dashboard(records, entities, { from: "2026-09-01", through: "2026-09-30", incomeTags: [UNCATEGORIZED] });
  assert.deepEqual(model.incomeBreakdown.map((g) => [g.id, g.cents]), [[UNCATEGORIZED, 30000]]);
});

test("likely moves use the saved matcher and only disclose", async () => {
  const { likelyMoves } = await import("../../src/dashboard-model.js");
  const records = [
    row("out", -50000, "2026-09-16", {}, { accountId: "chq" }),
    row("in", 50000, "2026-09-17", {}, { accountId: "sav" }),
    row("far", 70000, "2026-09-25", {}, { accountId: "sav" }),
    row("far-out", -70000, "2026-09-20", {}, { accountId: "chq" }),
    row("same-account", 20000, "2026-09-10", {}, { accountId: "chq" }),
    row("same-out", -20000, "2026-09-10", {}, { accountId: "chq" }),
    row("linked-out", -9000, "2026-09-12", { kind: "transfer", transferId: "linked-in" }, { accountId: "chq" }),
    row("linked-in", 9000, "2026-09-12", { kind: "transfer", transferId: "linked-out" }, { accountId: "sav" }),
  ];
  const moves = likelyMoves(records, { basisPoints: 0, maxDays: 1 }, { from: "2026-09-01", through: "2026-09-30" });
  assert.deepEqual([...moves.outIds], ["out"]);
  assert.deepEqual([...moves.inIds], ["in"]);
  assert.equal(moves.out, 50000);
  const wider = likelyMoves(records, { basisPoints: 0, maxDays: 7 }, { from: "2026-09-01", through: "2026-09-30" });
  assert.deepEqual([...wider.outIds].sort(), ["far-out", "out"]);
  const october = likelyMoves(records, { basisPoints: 0, maxDays: 1 }, { from: "2026-10-01", through: "2026-10-31" });
  assert.equal(october.outIds.size, 0);
  assert.equal(records.find((r) => r.id === "out").review.kind, "unreviewed", "nothing is linked");
});

test("the year chart keeps five series, groups the rest, and puts Unsorted last", async () => {
  const { chartSeries, REST } = await import("../../src/dashboard-model.js");
  const groups = (m) => m.groups;
  const months = [{ groups: ["a", "b", "c", "d", "e", "f", "g", "dashboard:uncategorized"].map((id, i) => ({ id, name: id, net: 100 - i })) }];
  const series = chartSeries(months, groups, (c) => c.net);
  assert.deepEqual(series.map((s) => s.id), ["a", "b", "c", "d", "e", REST, "dashboard:uncategorized"]);
});

test("the ledger hand-off filters by dates, a whole category and ungrouped tags", async () => {
  const { ledgerView, UNGROUPED_TAGS } = await import("../../src/transactions-model.js");
  const records = [
    row("rent", -150000, "2026-09-01", { kind: "expense", tags: [{ id: "rent", cents: 150000 }] }),
    row("food", -2000, "2026-09-14", { kind: "expense", tags: [{ id: "food", cents: 2000 }] }),
    row("auto", -5000, "2026-09-20", { tags: [{ id: "other", cents: 5000 }] }, { tagsAutomatic: true }),
    row("out", -10100, "2026-09-16", { kind: "transfer", transferId: "in", transferFeeCents: 100 }, { accountId: "chq", account: "Chequing" }),
    row("in", 10000, "2026-09-16", { kind: "transfer", transferId: "out" }, { accountId: "sav", account: "Savings" }),
  ];
  const base = { query: "", sort: "date", order: "desc" };
  assert.deepEqual(ledgerView(records, entities, { ...base, tag: "home" }).rows.map((r) => r.row.id), ["rent"]);
  assert.deepEqual(ledgerView(records, entities, { ...base, tag: UNGROUPED_TAGS }).rows.map((r) => r.row.id), ["food"], "the grey default is not a saved tag");
  assert.deepEqual(ledgerView(records, entities, { ...base, from: "2026-09-10", through: "2026-09-15" }).rows.map((r) => r.row.id), ["food"]);
  const transfers = ledgerView(records, entities, { ...base, flow: "transfer" });
  assert.equal(transfers.moved, 10000);
  assert.equal(transfers.fees, 100);
  assert.equal(transfers.rows.find((r) => r.row.id === "out").counterpart.account, "Savings");
  const oneSide = ledgerView(records, entities, { ...base, flow: "transfer", account: "sav" });
  assert.equal(oneSide.moved, 10000, "a pair counts once even when only its incoming half is shown");
});

test("card accounts and their latest month", async () => {
  const { isCardAccount, latestMonth } = await import("../../src/accounts-model.js");
  assert.equal(isCardAccount({ kind: "Credit card" }), true);
  assert.equal(isCardAccount({ kind: "credit line" }), true);
  assert.equal(isCardAccount({ kind: "chequing" }), false);
  assert.equal(isCardAccount({ kind: "" }), false);
  assert.equal(latestMonth({ months: [{ month: "2026-08", count: 3 }, { month: "2026-09", count: 2 }, { month: "2026-10", count: 0 }] }).month, "2026-09");
  assert.equal(latestMonth({ months: [] }), null);
});

test("event payment suggestions come from its people, after it starts, and are not applied", async () => {
  const { eventPaymentSuggestions } = await import("../../src/events-model.js");
  const event = { id: "trip", startDate: "2026-08-14", endDate: "2026-08-17", participants: ["sam"] };
  const people = [{ id: "sam", name: "Sam Rivera" }, { id: "kai", name: "Kai Moreno" }];
  const records = [
    row("cabin", -48000, "2026-08-15", { kind: "expense", groups: ["trip"] }),
    row("sam", 24000, "2026-08-20", {}, { description: "E-TRANSFER RECEIVED SAM RIVERA" }),
    row("early", 24000, "2026-08-01", {}, { description: "E-TRANSFER RECEIVED SAM RIVERA" }),
    row("kai", 5000, "2026-08-21", {}, { description: "E-TRANSFER RECEIVED KAI MORENO" }),
    row("samuel", 5000, "2026-08-22", {}, { description: "SAMUEL RIVERAS" }),
    row("applied", 1000, "2026-08-23", { kind: "repayment", personId: "sam", allocations: [{ id: "cabin", cents: 1000 }] }),
    row("tagged", 3000, "2026-08-24", { assignedPersonId: "sam" }),
  ];
  const list = eventPaymentSuggestions(event, records, people);
  assert.deepEqual(list.map((s) => [s.row.id, s.person.id]), [["sam", "sam"], ["tagged", "sam"]]);
  assert.deepEqual(eventPaymentSuggestions({ ...event, participants: [] }, records, people), []);
});
