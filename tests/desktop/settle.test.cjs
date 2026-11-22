// Settle against expenses: money in reduces the expenses you pick, as a refund (no one) or as a person's
// repayment that grows their share out of yours when it must.
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-settle-")), store = new ImportStore(root);
  const account = store.addAccount("Synthetic bank", "pc", "chequing");
  const file = path.join(root, "rows.csv");
  fs.writeFileSync(file, csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    ["HARDWARE STORE", "S", "S", "08/02/2026", "12:00 AM", "-100"],
    ["CONCERT TICKETS", "S", "S", "08/03/2026", "12:00 AM", "-80"],
    ["HARDWARE STORE REFUND", "S", "S", "08/09/2026", "12:00 AM", "30"],
    ["E-TRANSFER SAM", "S", "S", "08/10/2026", "12:00 AM", "90"],
  ]));
  store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  const sam = store.review.entity("person", { name: "Sam", color: "#8899AA" });
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const row = (d) => store.review.records().find((r) => r.description === d);
  return { store, sam, row };
}

test("a refund reduces the expense without settling anyone's share", (t) => {
  const { store, row } = setup(t);
  const refund = row("HARDWARE STORE REFUND"), tools = row("HARDWARE STORE");
  assert.throws(() => store.review.settle(refund.id, refund.version, { lines: [{ id: tools.id, cents: 3001 }] }), /more than this money has left/);
  assert.deepEqual(store.review.settle(refund.id, refund.version, { lines: [{ id: tools.id, cents: 3000 }] }), { applied: 3000, expenses: 1 });
  const saved = row("HARDWARE STORE REFUND");
  assert.equal(saved.review.kind, "repayment");
  assert.equal(saved.review.personId, "");
  assert.deepEqual(saved.review.allocations, [{ id: tools.id, cents: 3000 }]);
  assert.equal(row("HARDWARE STORE").review.shares, null, "a refund leaves the expense unshared");
  assert.throws(() => store.review.settle(saved.id, saved.version, { lines: [{ id: tools.id, cents: 1 }] }), /more than this money has left/);
});

test("a person's money settles several expenses and their share grows out of yours", async (t) => {
  const { store, sam, row } = setup(t);
  const pay = row("E-TRANSFER SAM"), tools = row("HARDWARE STORE"), tickets = row("CONCERT TICKETS");
  store.review.settle(pay.id, pay.version, { personId: sam, lines: [{ id: tools.id, cents: 5000 }, { id: tickets.id, cents: 4000 }] });
  assert.deepEqual(row("HARDWARE STORE").review.shares, [{ id: "me", cents: 5000 }, { id: sam, cents: 5000 }]);
  assert.deepEqual(row("CONCERT TICKETS").review.shares, [{ id: "me", cents: 4000 }, { id: sam, cents: 4000 }]);
  const saved = row("E-TRANSFER SAM");
  assert.equal(saved.review.personId, sam);
  assert.equal(saved.review.remainder, 0);
  // Once it is all used, nothing more fits; a refund can't join a person's settlement either.
  assert.throws(() => store.review.settle(saved.id, saved.version, { personId: sam, lines: [{ id: tools.id, cents: 1 }] }), /more than this money has left/);
  const refund = row("HARDWARE STORE REFUND");
  store.review.settle(refund.id, refund.version, { lines: [{ id: tools.id, cents: 3000 }] });
  // The expense is $100: $50 from Sam and $30 refunded leaves room for $20, no more.
  const { dashboard } = await import("../../src/dashboard-model.js");
  const { records, entities } = store.review.state();
  const view = dashboard(records, entities, { from: "2026-08-01", through: "2026-08-31", currency: "CAD", later: true });
  assert.equal(view.expenses.find((e) => e.row.id === tools.id).net, 2000);
  assert.throws(() => { const again = row("HARDWARE STORE REFUND"); store.review.settle(again.id, again.version, { lines: [{ id: tools.id, cents: 1 }] }); }, /more than this money has left/);
});

test("settling refuses mismatches and leaves everything as it was", (t) => {
  const { store, sam, row } = setup(t);
  const pay = row("E-TRANSFER SAM"), tools = row("HARDWARE STORE"), refund = row("HARDWARE STORE REFUND");
  const before = JSON.stringify(store.review.records());
  assert.throws(() => store.review.settle(pay.id, pay.version, { personId: sam, lines: [] }), /at least one expense/);
  assert.throws(() => store.review.settle(pay.id, pay.version, { personId: sam, lines: [{ id: tools.id, cents: 0 }] }), /above zero/);
  assert.throws(() => store.review.settle(pay.id, pay.version, { personId: sam, lines: [{ id: refund.id, cents: 100 }] }), /same currency/);
  assert.throws(() => store.review.settle(tools.id, tools.version, { lines: [{ id: tools.id, cents: 100 }] }), /money coming in/);
  assert.throws(() => store.review.settle(pay.id, pay.version, { personId: "nobody", lines: [{ id: tools.id, cents: 100 }] }), /existing person/);
  assert.throws(() => store.review.settle(pay.id, pay.version + 1, { personId: sam, lines: [{ id: tools.id, cents: 100 }] }), /changed/);
  // The second line fails after the first would have shared the expense: nothing is kept.
  assert.throws(() => store.review.settle(pay.id, pay.version, { personId: sam, lines: [{ id: tools.id, cents: 1000 }, { id: refund.id, cents: 100 }] }), /same currency/);
  assert.equal(JSON.stringify(store.review.records()), before);
  store.review.settle(refund.id, refund.version, { lines: [{ id: tools.id, cents: 1000 }] });
  const r = row("HARDWARE STORE REFUND");
  assert.throws(() => store.review.settle(r.id, r.version, { personId: sam, lines: [{ id: tools.id, cents: 1000 }] }), /already a refund/);
});
