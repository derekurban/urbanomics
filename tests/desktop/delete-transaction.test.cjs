// Duplicates: a later export that spaces or capitalizes a row differently still matches the row you have,
// and a transaction deleted by hand stays deleted when a file holding it is imported again, until Undo.
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");

const header = ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"];
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-delete-")), store = new ImportStore(root);
  const account = store.addAccount("Synthetic bank", "pc", "chequing");
  let n = 0;
  const load = (rows) => {
    const file = path.join(root, `export-${++n}.csv`);
    fs.writeFileSync(file, csv([header, ...rows.map(([d, date, a]) => [d, "S", "S", date, "12:00 AM", String(a)])]));
    store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  };
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const rows = (d) => store.review.records().filter((r) => r.description.replace(/\s+/g, " ").toLowerCase() === d.toLowerCase());
  return { store, load, rows };
}

test("a later export with different spacing or capitals matches the rows you already have", (t) => {
  const { store, load, rows } = setup(t);
  load([["Interac e-Transfer received from  SAM LEE", "09/03/2026", 405], ["CORNER CAFE", "09/04/2026", -6]]);
  load([["Interac e-Transfer received from SAM LEE", "09/03/2026", 405], ["Corner  Cafe", "09/04/2026", -6], ["BOOK SHOP", "09/05/2026", -20]]);
  assert.equal(rows("Interac e-Transfer received from SAM LEE").length, 1);
  assert.equal(rows("Corner Cafe").length, 1);
  assert.equal(store.review.records().length, 3);
  // The row keeps the text it first came with.
  assert.equal(rows("Interac e-Transfer received from SAM LEE")[0].description, "Interac e-Transfer received from  SAM LEE");
  // Two identical charges in one file are still two.
  load([["BUS FARE", "09/06/2026", -4], ["BUS FARE", "09/06/2026", -4]]);
  load([["BUS FARE", "09/06/2026", -4], ["Bus  Fare", "09/06/2026", -4]]);
  assert.equal(rows("Bus Fare").length, 2);
});

test("deleting a transaction keeps it out of later imports, and Undo brings it back whole", (t) => {
  const { store, load, rows } = setup(t);
  load([["CORNER CAFE", "09/04/2026", -6], ["BOOK SHOP", "09/05/2026", -20]]);
  load([["CORNER CAFE", "09/04/2026", -6], ["CORNER  CAFE", "09/04/2026", -6]]); // the bank's own duplicate
  assert.equal(rows("Corner Cafe").length, 2);
  const coffee = store.review.entity("category", { name: "Coffee", color: "#8899AA", flowType: "expense" });
  const [keep, extra] = rows("Corner Cafe");
  store.review.allocation(extra.id, extra.version, { tags: [{ id: coffee, cents: 600 }] });
  const snapshots = () => store.db.prepare("SELECT COUNT(*) n FROM snapshots WHERE month='2026-09'").get().n;
  const before = snapshots(), fresh = rows("Corner Cafe").find((r) => r.id === extra.id);
  const seen = store.db.prepare("SELECT COUNT(*) n FROM observations WHERE transaction_id=?").get(extra.id).n;
  assert.throws(() => store.review.deleteTransaction(extra.id, fresh.version - 1), /changed/);
  store.review.deleteTransaction(extra.id, fresh.version);
  assert.deepEqual(rows("Corner Cafe").map((r) => r.id), [keep.id]);
  assert.equal(snapshots(), before + 1, "the month gets a snapshot without it");
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM observations WHERE reason='deleted'").get().n, seen, "its source records stay, pointing nowhere");

  // Importing a file that holds both again adds nothing.
  load([["CORNER CAFE", "09/04/2026", -6], ["Corner Cafe", "09/04/2026", -6], ["BOOK SHOP", "09/05/2026", -20]]);
  assert.equal(rows("Corner Cafe").length, 1);
  assert.equal(store.review.records().length, 2);

  store.review.restoreTransaction(extra.id);
  const back = rows("Corner Cafe").find((r) => r.id === extra.id);
  assert.ok(back, "restored with its id");
  assert.deepEqual(back.review.tags, [{ id: coffee, cents: 600 }]);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM deleted_transactions").get().n, 0);
  assert.ok(store.db.prepare("SELECT COUNT(*) n FROM observations WHERE transaction_id=?").get(extra.id).n >= 1);
  assert.throws(() => store.review.restoreTransaction(extra.id), /no longer in the deleted list/);
});

test("a transaction tied to a settlement can't be deleted until that is removed", (t) => {
  const { store, load, rows } = setup(t);
  load([["HARDWARE STORE", "08/02/2026", -100], ["STORE REFUND", "08/09/2026", 30]]);
  const [expense] = rows("HARDWARE STORE"), [refund] = rows("STORE REFUND");
  store.review.settle(refund.id, refund.version, { personId: "", lines: [{ id: expense.id, cents: 3000 }] });
  const now = (d) => rows(d)[0];
  assert.throws(() => store.review.deleteTransaction(expense.id, now("HARDWARE STORE").version), /settles part of this expense/);
  assert.throws(() => store.review.deleteTransaction(refund.id, now("STORE REFUND").version), /settles expenses/);
  assert.equal(store.review.records().length, 2);
});
