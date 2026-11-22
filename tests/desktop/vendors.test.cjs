// Vendors (schema 23): several matchers per vendor, one readable name, a tag and person for new imports,
// fill-only applies with undo, and the one-time conversion of aliases and transaction rules.
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
const { configurationSQL, seedConfiguration } = require("../../electron/configuration.cjs");
const { compileMatcher, decompilePattern, normalizeMatchers, describeMatchers } = require("../../electron/review/vendor-model.mjs");

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-vendors-"));
  let store = new ImportStore(root);
  const account = store.addAccount("Synthetic bank", "pc", "chequing");
  const coffee = store.review.entity("category", { name: "Coffee", color: "#78976A" }),
    pay = store.review.entity("category", { name: "Pay", color: "#8FA6CB", flowType: "income" }),
    person = store.review.entity("person", { name: "Sam", color: "#AF8EB5" });
  let seq = 0;
  function importRows(rows) {
    const file = path.join(root, `${seq++}.csv`);
    fs.writeFileSync(file, csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ...rows.map(([name, amount, date = "08/20/2026"]) => [name, "SYNTHETIC", "SAMPLE", date, "12:00 AM", String(amount)]),
    ]));
    store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  }
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return {
    root, account, coffee, pay, person, importRows,
    get store() { return store; },
    reopen() { store.close(); store = new ImportStore(root); return store; },
    rows() { return store.review.records(); },
  };
}
const row = (f, text) => f.rows().find((r) => (r.originalDescription ?? r.description) === text);

test("matchers compile to the stored patterns and back", () => {
  for (const m of [{ mode: "starts", text: "SQ *BEAN" }, { mode: "contains", text: "BEAN" }, { mode: "ends", text: "1042" }, { mode: "exact", text: "BEAN (2)" }])
    assert.deepEqual(decompilePattern(compileMatcher(m)), m);
  assert.deepEqual(decompilePattern("^AMZN|^AMAZON"), { mode: "custom", text: "^AMZN|^AMAZON" });
  assert.deepEqual(normalizeMatchers([{ mode: "starts", text: " A " }, { mode: "starts", text: "a" }, { mode: "contains", text: "" }]), [{ mode: "starts", text: "A" }]);
  assert.throws(() => normalizeMatchers([{ mode: "starts", text: " " }]), /Say which/);
  assert.equal(describeMatchers([{ mode: "starts", text: "A" }, { mode: "contains", text: "B" }]), "starts with “A” or contains “B”");
});

test("several matchers unify descriptions under one name; clashes block saving and keep bank text", (t) => {
  const f = setup(t), { store } = f;
  f.importRows([["SQ *BEAN COUNTER 1042", -5], ["BEAN COUNTER ONLINE", -7], ["CITY HYDRO", -80]]);
  const before = store.db.prepare("SELECT id,fingerprint,payload FROM transactions ORDER BY id").all();
  const values = { name: "Bean Counter", matchers: [{ mode: "starts", text: "SQ *BEAN COUNTER" }, { mode: "starts", text: "BEAN COUNTER" }] };
  const preview = store.vendors.preview(values);
  assert.equal(preview.matches.length, 2);
  assert.deepEqual(preview.matches.map((m) => m.matchers).sort(), [[0], [1]]);
  const { id } = store.vendors.save(values);
  const bean = f.rows().filter((r) => r.vendorId === id);
  assert.equal(bean.length, 2);
  assert.ok(bean.every((r) => r.description === "Bean Counter"));
  assert.deepEqual(store.db.prepare("SELECT id,fingerprint,payload FROM transactions ORDER BY id").all(), before, "source rows are never rewritten");
  // Another vendor that would also catch a Bean Counter row cannot be saved.
  assert.throws(() => store.vendors.save({ name: "Online", matchers: [{ mode: "contains", text: "ONLINE" }] }), /also match Bean Counter/);
  assert.throws(() => store.vendors.save({ name: "bean counter", matchers: [{ mode: "starts", text: "CITY" }] }), /already called/);
  // A clash that arrives later (written directly, as an older seed might) keeps the bank text and is listed.
  store.db.prepare("INSERT INTO vendors (id,name,matchers,tagId,personId,version) VALUES ('x','Online','[{\"mode\":\"contains\",\"text\":\"ONLINE\"}]','','',1)").run();
  const clash = row(f, "BEAN COUNTER ONLINE");
  assert.equal(clash.description, "BEAN COUNTER ONLINE");
  assert.equal(clash.vendorId, "");
  assert.equal(store.vendors.state().conflicts.length, 1);
  assert.equal(store.vendors.state().unmatched.length, 1);
  // Stale edits and deletes are refused.
  assert.throws(() => store.vendors.save({ ...values, id, version: 7 }), /changed/);
  assert.throws(() => store.vendors.remove(id, 7), /changed/);
  store.vendors.remove(id, 1);
  assert.equal(row(f, "SQ *BEAN COUNTER 1042").description, "SQ *BEAN COUNTER 1042");
});

test("new imports get the vendor's tag and person, fill-only; repeats and manual choices are left alone", (t) => {
  const f = setup(t), { store } = f;
  f.importRows([["BEAN COUNTER 1", -5]]);
  store.vendors.save({ name: "Bean Counter", matchers: [{ mode: "starts", text: "BEAN COUNTER" }], tagId: f.coffee, personId: f.person });
  assert.equal(row(f, "BEAN COUNTER 1").review.tags.length, 0, "saving alone changes nothing");
  f.importRows([["BEAN COUNTER 2", -6], ["BEAN COUNTER REFUND", 6]]);
  const two = row(f, "BEAN COUNTER 2");
  assert.deepEqual(two.review.tags, [{ id: f.coffee, cents: 600 }]);
  assert.equal(two.review.assignedPersonId, f.person);
  const refund = row(f, "BEAN COUNTER REFUND");
  assert.equal(refund.review.tags.length, 0, "an expense tag does not go on money in");
  assert.equal(refund.review.assignedPersonId, "", "Paid <person> is for money out only");
  // A hand edit survives a repeat import of the same file contents.
  store.review.write(two.id, { ...two.review, tags: [] }, two.version);
  f.importRows([["BEAN COUNTER 2", -6]]);
  assert.equal(row(f, "BEAN COUNTER 2").review.tags.length, 0);
});

test("applying to transactions you already have fills gaps only, and Undo restores them", (t) => {
  const f = setup(t), { store } = f;
  f.importRows([["NORTHWIND PAYROLL", 2000], ["NORTHWIND PAYROLL", 2000, "07/20/2026"], ["NORTHWIND STORE", -10]]);
  const tagged = f.rows().find((r) => r.amountCents === -1000);
  store.review.write(tagged.id, { ...tagged.review, tags: [{ id: f.coffee, cents: 1000 }] }, tagged.version);
  const values = { name: "Northwind", matchers: [{ mode: "starts", text: "NORTHWIND" }], tagId: f.pay };
  assert.equal(store.vendors.preview(values).ready, 2);
  const saved = store.vendors.save(values, { applyExisting: true });
  assert.equal(saved.applied, 2);
  assert.ok(f.rows().filter((r) => r.amountCents > 0).every((r) => r.review.tags[0]?.id === f.pay));
  assert.deepEqual(f.rows().find((r) => r.amountCents < 0).review.tags, [{ id: f.coffee, cents: 1000 }]);
  assert.equal(store.vendors.state().vendors[0].waiting, 0);
  // A row edited after the apply keeps its newer edit.
  const edited = f.rows().find((r) => r.amountCents > 0);
  store.review.write(edited.id, { ...edited.review, note: "kept" }, edited.version);
  assert.deepEqual(store.vendors.undoApply(saved.batch), { restored: 1, kept: 1 });
  assert.equal(f.rows().filter((r) => r.amountCents > 0 && !r.review.tags.length).length, 1);
  assert.throws(() => store.vendors.undoApply(saved.batch), /no longer be undone/);
  // Apply all is checked against the state it was shown.
  const { token } = store.vendors.state();
  f.importRows([["SOMETHING ELSE", -1]]);
  assert.throws(() => store.vendors.applyAll(token), /changed/);
  assert.equal(store.vendors.applyAll(store.vendors.state().token).applied, 1);
});

test("vendors guard their tag and person, follow tag merges, and travel in configuration", (t) => {
  const f = setup(t), { store } = f;
  const { id } = store.vendors.save({ name: "Bean Counter", matchers: [{ mode: "starts", text: "BEAN" }, { mode: "contains", text: "COUNTER" }], tagId: f.coffee, personId: f.person });
  assert.throws(() => store.review.removeEntity(f.person), /Bean Counter/);
  const cafe = store.review.entity("category", { name: "Cafés", color: "#78976A" });
  store.review.mergeTags(f.coffee, cafe);
  assert.equal(store.vendors.list()[0].tagId, cafe);
  assert.throws(() => store.vendors.save({ name: "Bad", matchers: [{ mode: "starts", text: "Z" }], tagId: "missing" }), /no longer available/);
  const sql = configurationSQL(store.db);
  assert.match(sql, /INSERT INTO "vendors"/);
  assert.doesNotMatch(sql, /transaction_aliases|transaction_rules/);
  const file = path.join(f.root, "workspace.sql");
  fs.writeFileSync(file, sql);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-vendors-seed-"));
  const fresh = new ImportStore(other);
  try {
    seedConfiguration(fresh.db, file);
    const [v] = fresh.vendors.list();
    assert.equal(v.id, id);
    assert.equal(v.matchers.length, 2);
  } finally { fresh.close(); fs.rmSync(other, { recursive: true, force: true }); }
});

test("aliases and transaction rules become vendors once, with a recovery copy", (t) => {
  const f = setup(t), { store } = f;
  f.importRows([["SQ *BEAN 1", -5], ["MARKET 12", -20], ["MARKET 13", -20], ["CORNER SHOP", -3]]);
  const db = store.db;
  db.prepare("INSERT INTO transaction_aliases (id,name,pattern,accountId,version) VALUES ('a1','Bean Counter','^SQ \\*BEAN','',1)").run();
  db.prepare("INSERT INTO transaction_aliases (id,name,pattern,accountId,version) VALUES ('a2','Market','^MARKET','',1)").run();
  const rule = db.prepare("INSERT INTO transaction_rules (id,name,pattern,categoryId,personId,direction,enabled,version,matchType,aliasIds,template) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  rule.run("r1", "Coffee", "", f.coffee, "", "out", 1, 1, "aliases", '["a1"]', null);
  rule.run("r2", "Market people", "^MARKET 1", "", f.person, "out", 1, 1, "regex", "[]", null);
  rule.run("r3", "Corner", "^CORNER", f.coffee, "", "any", 1, 1, "regex", "[]", null);
  rule.run("r4", "Off", "^OFF", f.coffee, "", "any", 0, 1, "regex", "[]", null);
  const result = store.vendors.convertLegacy();
  assert.equal(result.vendors, 3);
  assert.ok(fs.existsSync(result.recovery));
  assert.equal(JSON.parse(fs.readFileSync(result.recovery, "utf8")).rules.length, 4);
  const vendors = Object.fromEntries(store.vendors.list().map((v) => [v.name, v]));
  assert.deepEqual(vendors["Bean Counter"].matchers, [{ mode: "starts", text: "SQ *BEAN" }]);
  assert.equal(vendors["Bean Counter"].tagId, f.coffee);
  assert.equal(vendors.Market.personId, f.person, "a regex rule inside one alias gives that vendor its person");
  assert.equal(vendors.Corner.tagId, f.coffee, "a regex rule outside every alias becomes its own vendor");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM transaction_rules").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM transaction_aliases").get().n, 0);
  assert.equal(store.vendors.convertLegacy(), null, "runs once");
  assert.equal(row(f, "MARKET 12").description, "Market");
  f.reopen();
  assert.equal(f.store.vendors.list().length, 3);
});
