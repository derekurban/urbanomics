const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const {
  configurationSQL,
  exportConfiguration,
  seedConfiguration,
} = require("../../electron/configuration.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");

test("configuration SQL round-trips definitions but excludes all transaction and snapshot data", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-config-"));
  const store = new ImportStore(path.join(root, "source")),
    restored = new ImportStore(path.join(root, "restored"));
  t.after(() => {
    store.close();
    restored.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const account = store.addAccount("Sample O'Brien", "pc", "chequing", {
    prefixRegex: "synthetic",
    color: "#427A64",
  });
  for (const [kind, name] of [
    ["category", "Groceries"],
    ["group", "Weekend"],
    ["person", "Sample person"],
  ])
    store.review.entity(kind, {
      name,
      color: "#427A64",
      ...(kind === "group"
        ? { startDate: "2026-08-15", endDate: "2026-08-17" }
        : {}),
    });
  store.aliases.save({ name: "Sample merchant", pattern: "^MERCHANT's" });
  const file = path.join(root, "synthetic.csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      [
        "PRIVATE_DESCRIPTION_SENTINEL",
        "PURCHASE",
        "PRIVATE_HOLDER_SENTINEL",
        "08/10/2026",
        "12:00 AM",
        "-123.45",
      ],
    ]),
  );
  const job = store.enqueue([file], { process: false }).ids[0];
  store.resolveAccount(job, account, true);
  const row = store.review.records()[0];
  store.review.financial(row.id, row.version, {
    ...row.review,
    kind: "expense",
    reviewed: true,
  });
  const directory = path.join(root, "configuration");
  const output = exportConfiguration(store.db, directory),
    sql = fs.readFileSync(output, "utf8");
  assert.ok(!sql.includes("PRIVATE_") && !sql.includes(row.id));
  assert.ok(
    !sql.includes('INSERT INTO "transactions"') &&
      !sql.includes('INSERT INTO "snapshots"'),
  );
  const before = fs.statSync(output).mtimeMs;
  exportConfiguration(store.db, directory);
  assert.equal(fs.statSync(output).mtimeMs, before);
  seedConfiguration(restored.db, output);
  assert.equal(configurationSQL(restored.db), sql);
  for (const table of [
    "transactions",
    "snapshots",
    "sources",
    "observations",
    "imports",
    "jobs",
    "review_items",
  ])
    assert.equal(
      restored.db.prepare(`SELECT count(*) n FROM ${table}`).get().n,
      0,
    );
  assert.throws(
    () => seedConfiguration(restored.db, output),
    /empty workspace/,
  );
  assert.throws(() =>
    exportConfiguration(store.db, path.join(output, "invalid")),
  );
  assert.equal(fs.readFileSync(output, "utf8"), sql);
});

test("schema 8 globalizes legacy aliases without changing financial records and exposes new overlaps", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-global-"));
  let store = new ImportStore(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const a = store.addAccount("Sample A", "pc", "chequing"),
    b = store.addAccount("Sample B", "pc", "savings");
  store.db
    .prepare("INSERT INTO transaction_aliases VALUES (?,?,?,?,?)")
    .run("one", "Merchant A", "^MERCHANT", a, 3);
  store.db
    .prepare("INSERT INTO transaction_aliases VALUES (?,?,?,?,?)")
    .run("two", "Merchant B", "^MERCHANT", b, 4);
  store.db.exec("PRAGMA user_version=7");
  const accounts = store.db.prepare("SELECT * FROM accounts").all();
  store.close();
  store = new ImportStore(root);
  assert.deepEqual(
    store.aliases.rules().map((r) => [r.accountId, r.version]),
    [
      ["", 4],
      ["", 5],
    ],
  );
  const row = { accountId: a, description: "MERCHANT 123" };
  assert.equal(store.aliases.decorate([row])[0].description, row.description);
  assert.equal(store.aliases.decorate([row])[0].aliasConflicts.length, 2);
  assert.deepEqual(store.db.prepare("SELECT * FROM accounts").all(), accounts);
  assert.equal(store.db.prepare("PRAGMA user_version").get().user_version, 15);
  store.close();
  store = new ImportStore(root);
  assert.deepEqual(
    store.aliases.rules().map((r) => r.version),
    [4, 5],
  );
});
