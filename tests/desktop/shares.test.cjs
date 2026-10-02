// Shares: one event per transaction, repayments only against a declared share, event participants
// applied to member expenses, and the schema-22 migration that records shares for older repayments.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
const { splitShares, repaidByPerson } = require("../../electron/review/share-model.mjs");
const { recordSharesForRepayments } = require("../../electron/review/shares-migration.cjs");

function workspace(rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shares-")), store = new ImportStore(root);
  const account = store.addAccount("Chequing", "pc", "chequing", { color: "#658e83" });
  const file = path.join(root, "rows.csv");
  fs.writeFileSync(file, csv([["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"], ...rows.map(([d, date, a]) => [d, "SAMPLE", "SAMPLE", date, "12:00 AM", String(a)])]));
  store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  const row = name => store.review.records().find(r => r.description === name);
  return { root, store, row };
}

test("splitShares splits evenly, keeps repayers whole and totals the expense", () => {
  assert.deepEqual(splitShares(10000, ["a", "b"]), [{ id: "me", cents: 3334 }, { id: "a", cents: 3333 }, { id: "b", cents: 3333 }]);
  assert.deepEqual(splitShares(10000, ["a"], { a: 7000 }), [{ id: "me", cents: 3000 }, { id: "a", cents: 7000 }]);
  assert.throws(() => splitShares(10000, ["a", "b"], { a: 6000, b: 5000 }), /exceed/);
  assert.throws(() => splitShares(10000, []), /at least one/);
});

test("a transaction belongs to one event and a repayment needs a share", () => {
  const { store, row } = workspace([["Cabin", "09/18/2026", -100], ["From Sam", "09/22/2026", 60]]);
  const a = store.review.entity("group", { name: "A", color: "#aaaaaa", startDate: "2026-09-18", endDate: "2026-09-19" });
  const b = store.review.entity("group", { name: "B", color: "#bbbbbb", startDate: "2026-09-18", endDate: "2026-09-19" });
  const sam = store.review.entity("person", { name: "Sam", color: "#cc8888" });
  assert.throws(() => store.review.organize([{ id: row("Cabin").id, version: row("Cabin").version, groups: [a, b] }]), /one event/);
  assert.throws(() => store.review.allocation(row("From Sam").id, row("From Sam").version, { tags: [], allocations: [{ id: row("Cabin").id, cents: 6000 }], personId: sam, groups: [] }), /Share Cabin with Sam/);
  store.review.financial(row("Cabin").id, row("Cabin").version, { kind: "expense", reviewed: true, shares: [{ id: "me", cents: 5000 }, { id: sam, cents: 5000 }], personId: "", allocations: [], remainder: 0, transferId: "" });
  assert.equal(row("Cabin").review.sharesSource, "manual");
  assert.throws(() => store.review.allocation(row("From Sam").id, row("From Sam").version, { tags: [], allocations: [{ id: row("Cabin").id, cents: 6000 }], personId: sam, groups: [] }), /agreed share/);
  store.review.allocation(row("From Sam").id, row("From Sam").version, { tags: [], allocations: [{ id: row("Cabin").id, cents: 4000 }], personId: sam, groups: [] });
  assert.equal(row("From Sam").review.kind, "repayment");
  assert.deepEqual(repaidByPerson(store.review.records(), row("Cabin").id), { [sam]: 4000 });
  // The payer cannot be dropped below what they repaid.
  assert.throws(() => store.review.financial(row("Cabin").id, row("Cabin").version, { kind: "expense", reviewed: true, shares: [{ id: "me", cents: 9000 }, { id: sam, cents: 1000 }], personId: "", allocations: [], remainder: 0, transferId: "" }), /agreed share/);
});

test("event participants give member expenses their split; custom splits and repayers are protected", () => {
  const { store, row } = workspace([["Cabin", "09/18/2026", -90], ["Fuel", "09/19/2026", -30], ["From Jo", "09/22/2026", 10]]);
  const jo = store.review.entity("person", { name: "Jo", color: "#aa88cc" }), sam = store.review.entity("person", { name: "Sam", color: "#cc8888" });
  const trip = store.review.entity("group", { name: "Trip", color: "#aaaaaa", startDate: "2026-09-18", endDate: "2026-09-19", participants: [jo, sam] });
  assert.deepEqual(store.review.entities().find(e => e.id === trip).participants, [jo, sam]);
  store.review.organize([{ id: row("Cabin").id, version: row("Cabin").version, groups: [trip] }]);
  assert.deepEqual(row("Cabin").review.shares, [{ id: "me", cents: 3000 }, { id: jo, cents: 3000 }, { id: sam, cents: 3000 }]);
  assert.equal(row("Cabin").review.sharesSource, "event:" + trip);
  assert.equal(row("Cabin").review.kind, "expense");
  // A custom split on a member expense is left alone when the event changes.
  store.review.allocation(row("Fuel").id, row("Fuel").version, { tags: [], allocations: [], personId: "", groups: [trip] });
  store.review.financial(row("Fuel").id, row("Fuel").version, { kind: "expense", reviewed: true, shares: [{ id: "me", cents: 2000 }, { id: jo, cents: 1000 }], personId: "", allocations: [], remainder: 0, transferId: "" });
  store.review.allocation(row("From Jo").id, row("From Jo").version, { tags: [], allocations: [{ id: row("Cabin").id, cents: 1000 }], personId: jo, groups: [] });
  store.review.entity("group", { id: trip, name: "Trip", color: "#aaaaaa", startDate: "2026-09-18", endDate: "2026-09-19", participants: [jo] });
  assert.deepEqual(row("Cabin").review.shares, [{ id: "me", cents: 4500 }, { id: jo, cents: 4500 }], "following expenses take the new split");
  assert.deepEqual(row("Fuel").review.shares, [{ id: "me", cents: 2000 }, { id: jo, cents: 1000 }], "custom split untouched");
  assert.throws(() => store.review.entity("group", { id: trip, name: "Trip", color: "#aaaaaa", startDate: "2026-09-18", endDate: "2026-09-19", participants: [sam] }), /Jo has repaid part of Cabin/);
  assert.throws(() => store.review.removeEntity(jo), /events first/);
  // Follow the event again from a custom split.
  store.review.followEventSplit(row("Fuel").id, row("Fuel").version);
  assert.deepEqual(row("Fuel").review.shares, [{ id: "me", cents: 1500 }, { id: jo, cents: 1500 }]);
  assert.equal(row("Fuel").review.sharesSource, "event:" + trip);
  // Leaving the event releases a split nobody has repaid; a repaid one becomes manual.
  store.review.organize([{ id: row("Fuel").id, version: row("Fuel").version, groups: [] }]);
  assert.equal(row("Fuel").review.shares, null);
  store.review.organize([{ id: row("Cabin").id, version: row("Cabin").version, groups: [] }]);
  assert.equal(row("Cabin").review.sharesSource, "manual");
  assert.deepEqual(row("Cabin").review.shares, [{ id: "me", cents: 4500 }, { id: jo, cents: 4500 }]);
});

test("schema 22 records shares for repayments that predate any split, keeping a recovery copy", () => {
  const { root, store, row } = workspace([["Dinner", "09/18/2026", -80], ["From Sam", "09/22/2026", 30], ["From Jo", "09/23/2026", 20]]);
  const sam = store.review.entity("person", { name: "Sam", color: "#cc8888" }), jo = store.review.entity("person", { name: "Jo", color: "#aa88cc" });
  // Write the old shape directly: repayments against an expense with no shares.
  const put = (id, review) => store.db.prepare("INSERT INTO review_items VALUES (?,?,?,?) ON CONFLICT(transaction_id) DO UPDATE SET payload=excluded.payload,version=excluded.version").run(id, JSON.stringify(review), 3, "2026-09-20T00:00:00Z");
  const base = { tags: [], groups: [], groupsReviewed: false, reviewed: false, shares: null, personId: "", assignedPersonId: "", incomeType: "", incomeSource: "", allocations: [], remainder: 0, transferId: "" };
  put(row("From Sam").id, { ...base, kind: "repayment", personId: sam, allocations: [{ id: row("Dinner").id, cents: 3000 }] });
  put(row("From Jo").id, { ...base, kind: "repayment", personId: jo, allocations: [{ id: row("Dinner").id, cents: 2000 }] });
  put(row("Dinner").id, { ...base, kind: "unreviewed" });
  const result = recordSharesForRepayments(store.db, root, new Date("2026-10-02T15:00:00Z"));
  assert.equal(result.updated, 1);
  const dinner = row("Dinner");
  assert.deepEqual(dinner.review.shares, [{ id: "me", cents: 3000 }, { id: sam, cents: 3000 }, { id: jo, cents: 2000 }]);
  assert.equal(dinner.review.sharesSource, "recorded");
  assert.equal(dinner.review.kind, "expense");
  assert.equal(dinner.version, 4);
  const copies = fs.readdirSync(path.join(root, "backups", "admin")).filter(f => f.startsWith("before-shares-migration-"));
  assert.equal(copies.length, 1);
  const copy = JSON.parse(fs.readFileSync(path.join(root, "backups", "admin", copies[0]), "utf8"));
  assert.equal(copy.records[0].review.shares, null);
  // Running again changes nothing.
  assert.equal(recordSharesForRepayments(store.db, root).updated, 0);
  // The recorded split satisfies the strict rule on later saves of the receipt.
  store.review.allocation(row("From Sam").id, row("From Sam").version, { tags: [], allocations: [{ id: dinner.id, cents: 3000 }], personId: sam, groups: [] });
});

test("admin clears every split, repayment and deduction behind a token and a recovery copy", () => {
  const { root, store, row } = workspace([["Cabin", "09/18/2026", -100], ["From Sam", "09/22/2026", 60], ["Lone", "09/19/2026", -20]]);
  const sam = store.review.entity("person", { name: "Sam", color: "#cc8888" }), gift = store.review.entity("category", { name: "Gift", flowType: "income", color: "#8888cc" });
  const trip = store.review.entity("group", { name: "Trip", color: "#aaaaaa", startDate: "2026-09-18", endDate: "2026-09-19", participants: [sam] });
  store.review.organize([{ id: row("Cabin").id, version: row("Cabin").version, groups: [trip] }]);
  store.review.allocation(row("From Sam").id, row("From Sam").version, { tags: [{ id: gift, cents: 1000 }], allocations: [{ id: row("Cabin").id, cents: 5000 }], personId: sam, groups: [] });
  const stale = store.admin.previewShares();
  assert.deepEqual([stale.count, stale.shared, stale.repayments, stale.cash], [2, 1, 1, 0]);
  store.review.allocation(row("Lone").id, row("Lone").version, { tags: [], allocations: [], personId: "", groups: [trip] });
  assert.throws(() => store.admin.clearShares(stale.token), /changed/);
  const result = store.admin.clearShares(store.admin.previewShares().token);
  assert.deepEqual([result.count, result.shared, result.repayments], [3, 2, 1]);
  assert.equal(row("Cabin").review.shares, null); assert.equal(row("Cabin").review.sharesSource, undefined); assert.deepEqual(row("Cabin").review.groups, [trip], "event membership stays");
  assert.deepEqual(row("From Sam").review.allocations, []); assert.equal(row("From Sam").review.kind, "income"); assert.equal(row("From Sam").review.personId, ""); assert.deepEqual(row("From Sam").review.tags, [{ id: gift, cents: 1000 }]);
  assert.deepEqual(store.review.entities().find(e => e.id === trip).participants, [sam], "events keep their participants");
  assert.ok(fs.readdirSync(path.join(root, "backups", "admin")).some(f => f.startsWith("before-clear-shares-")));
  assert.equal(store.admin.previewShares().count, 0);
});
