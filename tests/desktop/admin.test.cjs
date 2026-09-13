const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
const { configurationSQL } = require("../../electron/configuration.cjs");
test("bulk untag previews all accounts and cash, rejects stale confirmations, rolls back failures and preserves relationships and originals", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-admin-")),
    s = new ImportStore(path.join(root, "data"));
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const a = s.addAccount("Archived synthetic", "pc", "chequing"),
    tag = s.review.entity("category", { name: "Food", color: "#78976A" });
  const file = path.join(root, "test.csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ...Array.from({ length: 501 }, (_, i) => [
        "Expense " + i,
        "TEST",
        "TEST",
        "08/01/2026",
        "12:00 AM",
        "-1",
      ]),
    ]),
  );
  s.resolveAccount(s.enqueue([file]).ids[0], a, false);
  for (const row of s.review.records())
    s.review.write(
      row.id,
      {
        ...row.review,
        tags: [{ id: tag, cents: 100 }],
        kind: "expense",
        groups: ["synthetic-event"],
        shares: [
          { id: "me", cents: 50 },
          { id: "friend", cents: 50 },
        ],
      },
      row.version,
    );
  const cash = s.review.saveCash({
    description: "Synthetic cash",
    date: "2026-08-02",
    amountCents: 100,
    currency: "CAD",
  });
  const cr = s.review.records().find((r) => r.id === cash);
  s.review.write(
    cr.id,
    {
      ...cr.review,
      tags: [{ id: tag, cents: 100 }],
      kind: "repayment",
      personId: "friend",
      allocations: [
        { id: s.review.records().find((r) => !r.manual).id, cents: 100 },
      ],
    },
    cr.version,
  );
  s.deleteAccount(a);
  const initial = s.admin.preview();
  assert.equal(initial.count, 502);
  assert.equal(initial.archived, 501);
  assert.equal(initial.cash, 1);
  const changed = s.review.records()[0];
  s.review.write(
    changed.id,
    { ...changed.review, assignedPersonId: "person" },
    changed.version,
  );
  assert.throws(() => s.admin.untagAll(initial.token), /Transactions changed/);
  assert.equal(
    fs.existsSync(path.join(s.root, "backups/admin")),
    false,
    "preview and stale apply create no backup or mutation",
  );
  const before = s.review.records(),
    config = configurationSQL(s.db);
  const tables = Object.fromEntries(
    ["transactions", "sources", "snapshots"].map((table) => [
      table,
      s.db.prepare("SELECT * FROM " + table).all(),
    ]),
  );
  const originalWrite = s.review.write.bind(s.review);
  let writes = 0;
  s.review.write = (...args) => {
    if (++writes === 2) throw new Error("Injected failure");
    return originalWrite(...args);
  };
  assert.throws(
    () => s.admin.untagAll(s.admin.preview().token),
    /Injected failure/,
  );
  assert.deepEqual(
    s.review.records(),
    before,
    "all-or-nothing across more than 500 records",
  );
  s.review.write = originalWrite;
  const result = s.admin.untagAll(s.admin.preview().token);
  assert.equal(result.count, 502);
  const recovery = JSON.parse(fs.readFileSync(result.backup, "utf8"));
  assert.equal(recovery.records.length, 502);
  assert.deepEqual(recovery.records[0].review, before[0].review);
  for (const row of s.review.records()) {
    const old = before.find((r) => r.id === row.id);
    assert.deepEqual(row.review, { ...old.review, tags: [] });
    assert.equal(row.version, old.version + 1);
  }
  assert.equal(configurationSQL(s.db), config);
  for (const [table, rows] of Object.entries(tables))
    assert.deepEqual(s.db.prepare("SELECT * FROM " + table).all(), rows);
  const files = fs.readdirSync(path.join(s.root, "backups/admin"));
  assert.deepEqual(s.admin.untagAll(s.admin.preview().token), {
    count: 0,
    backup: null,
  });
  assert.deepEqual(fs.readdirSync(path.join(s.root, "backups/admin")), files);
});
