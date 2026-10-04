const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { configurationSQL } = require("../../electron/configuration.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");

test("typed tags migrate configuration without rewriting records and enforce separate lenses", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-lenses-"));
  let s = new ImportStore(path.join(root, "data"));
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const account = s.addAccount("Synthetic", "pc", "chequing");
  const file = path.join(root, "sample.csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ["Synthetic debit", "TEST", "TEST", "08/01/2026", "12:00 AM", "-100"],
      ["Synthetic credit", "TEST", "TEST", "08/02/2026", "12:00 AM", "100"],
    ]),
  );
  s.resolveAccount(s.enqueue([file]).ids[0], account, false);
  const expense = s.review.entity("category", {
    name: "Groceries",
    color: "#88AA88",
  });
  const income = s.review.entity("category", {
    name: "Income",
    color: "#88AAAA",
  });
  // Simulate a schema-13 assignment, including a legacy cross-lens tag.
  const credit = s.review.records().find((r) => r.amountCents > 0);
  s.review.write(
    credit.id,
    { ...credit.review, tags: [{ id: expense, cents: 10000 }] },
    credit.version,
  );
  const before = s.review.records();
  const snapshots = s.db.prepare("SELECT * FROM snapshots").all();
  s.db.exec(
    "ALTER TABLE review_entities DROP COLUMN flowType; PRAGMA user_version=13",
  );
  s.close();
  s = new ImportStore(path.join(root, "data"));
  assert.equal(s.db.prepare("PRAGMA user_version").get().user_version, 22);
  assert.deepEqual(s.review.records(), before);
  assert.deepEqual(s.db.prepare("SELECT * FROM snapshots").all(), snapshots);
  assert.equal(
    s.review.entities().find((e) => e.id === income).flowType,
    "income",
  );
  assert.equal(
    s.review.entities().find((e) => e.id === expense).flowType,
    "expense",
  );
  assert.ok(configurationSQL(s.db).includes("flowType"));
  const sameName = s.review.entity("category", {
    name: "Groceries",
    color: "#88AAAA",
    flowType: "income",
  });
  assert.notEqual(sameName, expense);
  assert.throws(
    () =>
      s.review.entity("category", {
        name: "groceries",
        color: "#88AAAA",
        flowType: "income",
      }),
    /already exists/,
  );
  const bucket = s.review.entity("bucket", { name: "Food", color: "#88AA88" });
  assert.throws(
    () =>
      s.review.entity("category", {
        name: "Pay",
        color: "#88AAAA",
        flowType: "income",
        parentId: bucket,
      }),
    /expense categories/,
  );
  const save = (id, tags) => {
    const r = s.review.records().find((r) => r.id === id);
    return s.review.organize([{ id, version: r.version, tags }]);
  };
  const debit = s.review.records().find((r) => r.amountCents < 0);
  assert.throws(
    () => save(debit.id, [{ id: income, cents: 10000 }]),
    /expense/i,
  );
  // Unrelated edits can preserve legacy portions; explicitly replacing them must fit.
  save(
    credit.id,
    credit.review.tags.length
      ? credit.review.tags
      : [{ id: expense, cents: 10000 }],
  );
  save(credit.id, []);
  assert.throws(
    () => save(credit.id, [{ id: expense, cents: 10000 }]),
    /income/i,
  );
  save(credit.id, [{ id: income, cents: 10000 }]);
  save(debit.id, [{ id: expense, cents: 10000 }]);
  assert.throws(
    () =>
      s.review.entity("category", {
        ...s.review.entities().find((e) => e.id === expense),
        flowType: "income",
        name: "Expense changed",
      }),
    /conflicts with saved transactions/,
  );
  assert.equal(
    s.review.records().find((r) => r.id === credit.id).review.kind,
    "unreviewed",
    "tagging does not infer income purpose",
  );
  assert.throws(
    () =>
      s.transactionRules.normalize({
        name: "Wrong direction",
        pattern: "Synthetic",
        categoryId: income,
        direction: "out",
      }),
    /direction conflicts/,
  );
  save(credit.id, []);
  save(debit.id, []);
  s.transactionRules.save({
    name: "Expense mapping",
    pattern: "^Synthetic",
    categoryId: expense,
  });
  s.transactionRules.save({
    name: "Income mapping",
    pattern: "^Synthetic",
    categoryId: income,
  });
  const preview = s.transactionRules.state();
  assert.equal(preview.candidates.length, 2);
  assert.equal(s.transactionRules.apply(preview.token).applied, 2);
  assert.equal(
    s.review.records().find((r) => r.id === credit.id).review.tags[0].id,
    income,
  );
  assert.equal(
    s.review.records().find((r) => r.id === debit.id).review.tags[0].id,
    expense,
  );
});

