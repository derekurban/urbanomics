const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
const {
  configurationSQL,
  seedConfiguration,
} = require("../../electron/configuration.cjs");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-rules-")),
    store = new ImportStore(root);
  const account = store.addAccount("Synthetic bank", "pc", "chequing");
  const category = store.review.entity("category", {
      name: "Groceries",
      color: "#78976A",
    }),
    other = store.review.entity("category", { name: "Home", color: "#8FA6CB" }),
    person = store.review.entity("person", { name: "Alex", color: "#AF8EB5" });
  let seq = 0;
  function importRows(rows) {
    const file = path.join(root, `${seq++}.csv`);
    fs.writeFileSync(
      file,
      csv([
        ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
        ...rows.map(([name, amount]) => [
          name,
          "SYNTHETIC",
          "SAMPLE",
          "08/20/2026",
          "12:00 AM",
          String(amount),
        ]),
      ]),
    );
    store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  }
  const values = (extra = {}) => ({
    name: "Market purchases",
    pattern: "^MARKET",
    categoryId: category,
    personId: "",
    direction: "out",
    enabled: true,
    ...extra,
  });
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, store, account, category, other, person, importRows, values };
}
test("rules save only configuration; previews, explicit apply and new imports preserve source and manual choices", (t) => {
  const f = setup(t),
    { store } = f;
  f.importRows([
    ["MARKET 100", -25],
    ["MARKET CREDIT", 40],
  ]);
  const before = store.db.prepare("SELECT * FROM transactions").all();
  const id = store.transactionRules.save(f.values({ personId: f.person }));
  assert.equal(store.review.records()[0].review.tags.length, 0);
  const preview = store.transactionRules.preview(
    f.values({ id, version: 1, personId: f.person }),
  );
  assert.equal(preview.matches.length, 1);
  assert.equal(preview.matches[0].status, "ready");
  let state = store.transactionRules.state();
  assert.deepEqual(store.transactionRules.apply(state.token), {
    applied: 1,
    conflicts: 0,
    protected: 0,
    unchanged: 0,
  });
  let row = store.review.records().find((r) => r.amountCents < 0);
  assert.deepEqual(row.review.tags, [{ id: f.category, cents: 2500 }]);
  assert.equal(row.review.assignedPersonId, f.person);
  assert.equal(row.review.personId, "");
  assert.equal(row.review.kind, "unreviewed");
  assert.deepEqual(
    store.db.prepare("SELECT * FROM transactions").all(),
    before,
  );
  store.review.organize([
    { id: row.id, version: row.version, tags: [{ id: f.other, cents: 2500 }] },
  ]);
  f.importRows([
    ["MARKET 100", -25],
    ["MARKET CREDIT", 40],
    ["MARKET 200", -17],
  ]);
  const records = store.review.records();
  assert.equal(records.length, 3);
  assert.equal(
    records.find((r) => r.description === "MARKET 100").review.tags[0].id,
    f.other,
  );
  assert.deepEqual(
    records.find((r) => r.description === "MARKET 200").review.tags,
    [{ id: f.category, cents: 1700 }],
  );
  assert.equal(
    store.transactionRules
      .state()
      .candidates.find((c) => c.description === "MARKET 100").status,
    "protected",
  );
  assert.equal(
    store.db
      .prepare("SELECT count(*) n FROM transaction_rule_applications")
      .get().n,
    2,
  );
});
test("conflicting mappings are quarantined while compatible field mappings combine; disabled rules do not run", (t) => {
  const f = setup(t),
    { store } = f;
  store.transactionRules.save(f.values());
  const second = store.transactionRules.save(
    f.values({ name: "Competing", categoryId: f.other }),
  );
  f.importRows([["MARKET 100", -25]]);
  assert.equal(store.review.records()[0].review.tags.length, 0);
  let s = store.transactionRules.state();
  assert.equal(s.candidates[0].status, "conflict");
  assert.equal(store.transactionRules.apply(s.token).conflicts, 1);
  store.transactionRules.save({
    ...s.rules.find((r) => r.id === second),
    enabled: false,
  });
  store.transactionRules.save(
    f.values({ name: "Known person", categoryId: "", personId: f.person }),
  );
  s = store.transactionRules.state();
  assert.deepEqual(s.candidates[0].changes, {
    categoryId: f.category,
    personId: f.person,
  });
  assert.equal(store.transactionRules.apply(s.token).applied, 1);
  assert.equal(
    store.transactionRules.state().candidates[0].status,
    "unchanged",
  );
});
test("preview tokens and rule versions reject stale writes; invalid regexes and mapped entity deletion are blocked", (t) => {
  const f = setup(t),
    { store } = f;
  f.importRows([["MARKET 100", -25]]);
  const id = store.transactionRules.save(f.values());
  const stale = store.transactionRules.state().token;
  store.transactionRules.save({
    ...store.transactionRules.rules()[0],
    name: "Renamed",
  });
  assert.throws(() => store.transactionRules.apply(stale), /changed/);
  assert.throws(
    () => store.transactionRules.save(f.values({ id, version: 1 })),
    /changed/,
  );
  assert.throws(() => store.transactionRules.remove(id, 1), /changed/);
  assert.throws(
    () => store.transactionRules.save(f.values({ pattern: "(?=MARKET)" })),
    /regex/,
  );
  assert.throws(() => store.review.removeEntity(f.category), /mapped/);
  const state = store.transactionRules.state(),
    row = state.records[0];
  store.review.organize([
    { id: row.id, version: row.version, tags: [{ id: f.other, cents: 2500 }] },
  ]);
  assert.throws(() => store.transactionRules.apply(state.token), /changed/);
});
test("raw descriptions drive rules independently of aliases, with hidden/manual rows excluded and financial fields preserved", (t) => {
  const f = setup(t),
    { store } = f;
  f.importRows([["MARKET 100", -25]]);
  store.aliases.save({ name: "Friendly shop", pattern: "^MARKET" });
  store.transactionRules.save(f.values({ personId: f.person }));
  const row = store.review.records()[0];
  store.review.financial(row.id, row.version, {
    kind: "expense",
    shares: [{ id: "me", cents: 2500 }],
    allocations: [],
    remainder: 0,
  });
  const before = store.review.records()[0].review;
  assert.equal(
    store.transactionRules.state().candidates[0].description,
    "Friendly shop",
  );
  store.transactionRules.apply(store.transactionRules.state().token);
  const after = store.review.records()[0].review;
  assert.equal(after.kind, before.kind);
  assert.deepEqual(after.shares, before.shares);
  store.review.saveCash({
    description: "MARKET cash",
    date: "2026-08-20",
    amountCents: 500,
    currency: "CAD",
  });
  store.db
    .prepare("UPDATE accounts SET deletedAt=? WHERE id=?")
    .run("2026-09-01", f.account);
  assert.equal(store.transactionRules.state().candidates.length, 0);
});
test("rule definitions round-trip through configuration while financial applications remain private", (t) => {
  const f = setup(t),
    { store } = f;
  store.transactionRules.save(f.values({ personId: f.person }));
  f.importRows([["MARKET PRIVATE TRANSACTION", -25]]);
  const sql = configurationSQL(store.db);
  assert.match(sql, /INSERT INTO "transaction_rules"/);
  assert.doesNotMatch(
    sql,
    /MARKET PRIVATE TRANSACTION|transaction_rule_applications|assignedPersonId/,
  );
  const seed = path.join(f.root, "config.sql");
  fs.writeFileSync(seed, sql);
  const fresh = new ImportStore(path.join(f.root, "fresh"));
  try {
    seedConfiguration(fresh.db, seed);
    assert.deepEqual(
      fresh.transactionRules.rules(),
      store.transactionRules.rules(),
    );
    assert.equal(fresh.review.records().length, 0);
  } finally {
    fresh.close();
  }
});
test("person association remains separate from financial purpose and can be changed or cleared explicitly", (t) => {
  const f = setup(t),
    { store } = f;
  f.importRows([["MARKET 100", -25]]);
  let row = store.review.records()[0];
  store.review.organize([
    { id: row.id, version: row.version, assignedPersonId: f.person },
  ]);
  row = store.review.records()[0];
  assert.equal(row.review.kind, "unreviewed");
  assert.deepEqual(row.review.tags, []);
  assert.throws(() => store.review.removeEntity(f.person), /used/);
  store.review.financial(row.id, row.version, {
    kind: "expense",
    shares: null,
  });
  row = store.review.records()[0];
  assert.equal(row.review.assignedPersonId, f.person);
  assert.equal(row.review.personId, "");
  store.transactionRules.assignPerson(row.id, row.version, "");
  assert.equal(store.review.records()[0].review.assignedPersonId, "");
  assert.throws(
    () => store.transactionRules.assignPerson(row.id, row.version, f.person),
    /changed/,
  );
});
test("schema 11 adds empty rule tables without rewriting existing ledger or review records", (t) => {
  const f = setup(t),
    root = path.join(f.root, "legacy");
  let s = new ImportStore(root);
  const account = s.addAccount("Legacy synthetic", "pc", "credit"),
    file = path.join(root, "legacy.csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      [
        "Legacy purchase",
        "SYNTHETIC",
        "SAMPLE",
        "08/20/2026",
        "12:00 AM",
        "-25",
      ],
    ]),
  );
  s.resolveAccount(s.enqueue([file]).ids[0], account, false);
  const row = s.review.records()[0];
  s.review.financial(row.id, row.version, {
    kind: "expense",
    shares: [{ id: "me", cents: 2500 }],
  });
  s.db.exec(
    "DROP TABLE transaction_rule_applications; DROP TABLE transaction_rules; PRAGMA user_version=10;",
  );
  const tables = s.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => t.name);
  const before = Object.fromEntries(
    tables.map((name) => [
      name,
      s.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );
  s.close();
  s = new ImportStore(root);
  try {
    assert.equal(s.db.prepare("PRAGMA user_version").get().user_version, 21);
    for (const [name, rows] of Object.entries(before))
      assert.deepEqual(
        s.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
        rows,
        name,
      );
    assert.equal(s.transactionRules.rules().length, 0);
    assert.equal(s.review.records().length, 1);
  } finally {
    s.close();
  }
});

test("linked transfer metadata and source rows are protected from automatic mappings", (t) => {
  const f = setup(t),
    { store } = f;
  f.importRows([["MARKET OUT", -101]]);
  const second = store.addAccount("Other synthetic account", "pc", "savings"),
    file = path.join(f.root, "transfer-in.csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ["MARKET IN", "SYNTHETIC", "SAMPLE", "08/20/2026", "12:00 AM", "100"],
    ]),
  );
  store.resolveAccount(store.enqueue([file]).ids[0], second, false);
  const rows = store.review.records(),
    out = rows.find((r) => r.amountCents < 0),
    incoming = rows.find((r) => r.amountCents > 0);
  store.review.linkTransfer(
    out.id,
    out.version,
    incoming.id,
    incoming.version,
    200,
  );
  const before = store.review.records();
  store.transactionRules.save(
    f.values({ direction: "any", personId: f.person }),
  );
  const state = store.transactionRules.state();
  assert.equal(state.candidates.length, 2);
  assert.ok(state.candidates.every((c) => c.status === "protected"));
  assert.equal(store.transactionRules.apply(state.token).applied, 0);
  assert.deepEqual(store.review.records(), before);
});

test("alias-set rules reuse live definitions, preserve decisions, reject stale alias previews and round-trip configuration", (t) => {
  const f = setup(t),
    { store } = f;
  const market = store.aliases.save({
    name: "Friendly market",
    pattern: "^MARKET",
  });
  const cafe = store.aliases.save({ name: "Cafe", pattern: "^CAFE" });
  f.importRows([
    ["MARKET private purchase", -25],
    ["CAFE private purchase", -12],
    ["OTHER", -10],
  ]);
  const raw = store.db.prepare("SELECT * FROM transactions ORDER BY id").all();
  const id = store.transactionRules.save(
    f.values({
      matchType: "aliases",
      aliasIds: [market, cafe, market],
      pattern: "[invalid unused",
      personId: f.person,
    }),
  );
  let r = store.transactionRules.rules()[0];
  assert.equal(r.pattern, "");
  assert.equal(r.matchType, "aliases");
  assert.deepEqual(r.aliasIds, [market, cafe].sort());
  assert.ok(store.review.records().every((r) => !r.review.tags.length));
  let state = store.transactionRules.state();
  assert.equal(state.candidates.length, 2);
  assert.ok(state.candidates.every((c) => c.status === "ready"));
  const oldToken = state.token;
  store.aliases.save({
    ...store.aliases.rules().find((a) => a.id === market),
    name: "Renamed vendor",
  });
  assert.throws(() => store.transactionRules.apply(oldToken), /changed/);
  state = store.transactionRules.state();
  assert.equal(store.transactionRules.apply(state.token).applied, 2);
  assert.equal(
    store.review.records().find((r) => r.aliasId === market).review
      .assignedPersonId,
    f.person,
  );
  const tagged = store.review.records().find((r) => r.aliasId === market);
  store.review.organize([
    {
      id: tagged.id,
      version: tagged.version,
      tags: [{ id: f.other, cents: 2500 }],
    },
  ]);
  const versions = store.review.records().map((r) => [r.id, r.version]);
  store.aliases.save({
    ...store.aliases.rules().find((a) => a.id === cafe),
    pattern: "^COFFEE",
  });
  assert.deepEqual(
    store.review.records().map((r) => [r.id, r.version]),
    versions,
  );
  f.importRows([
    ["MARKET private purchase", -25],
    ["CAFE private purchase", -12],
    ["OTHER", -10],
    ["COFFEE new", -5],
    ["CAFE no longer matches", -3],
  ]);
  const rows = store.review.records();
  assert.equal(rows.find((r) => r.id === tagged.id).review.tags[0].id, f.other);
  assert.deepEqual(
    rows.find((r) => r.originalDescription === "COFFEE new").review.tags,
    [{ id: f.category, cents: 500 }],
  );
  assert.equal(
    rows.find((r) => r.description === "CAFE no longer matches").review.tags
      .length,
    0,
  );
  for (const original of raw)
    assert.deepEqual(
      store.db
        .prepare("SELECT * FROM transactions WHERE id=?")
        .get(original.id),
      original,
    );
  assert.throws(() => store.aliases.remove(market, 2), /used by rules/);
  store.transactionRules.save({ ...r, enabled: false });
  assert.throws(() => store.aliases.remove(market, 2), /used by rules/);
  const sql = configurationSQL(store.db);
  assert.match(sql, /"aliasIds"/);
  assert.doesNotMatch(sql, /private purchase|transaction_rule_applications/);
  const file = path.join(f.root, "alias-config.sql");
  fs.writeFileSync(file, sql);
  const fresh = new ImportStore(path.join(f.root, "alias-seeded"));
  try {
    seedConfiguration(fresh.db, file);
    assert.deepEqual(
      fresh.transactionRules.rules(),
      store.transactionRules.rules(),
    );
  } finally {
    fresh.close();
  }
  r = store.transactionRules.rules()[0];
  store.transactionRules.save({ ...r, matchType: "regex", pattern: "^MARKET" });
  assert.deepEqual(store.transactionRules.rules()[0].aliasIds, []);
  store.aliases.remove(market, 2);
  assert.equal(store.transactionRules.rules()[0].id, id);
});

test("alias matching skips ambiguous vendors, validates references and combines with regex rules conservatively", (t) => {
  const f = setup(t),
    { store } = f;
  const market = store.aliases.save({ name: "Market", pattern: "^MARKET" });
  store.aliases.save({ name: "Corner", pattern: "CORNER" });
  const values = f.values({ matchType: "aliases", aliasIds: [market] });
  for (const ids of [[], ["missing"], "bad", [12]])
    assert.throws(
      () => store.transactionRules.save({ ...values, aliasIds: ids }),
      /alias/,
    );
  assert.throws(
    () => store.transactionRules.save({ ...values, matchType: "unknown" }),
    /regex/,
  );
  store.transactionRules.save(values);
  store.transactionRules.save(
    f.values({ name: "Person", categoryId: "", personId: f.person }),
  );
  f.importRows([
    ["MARKET CORNER", -5],
    ["MARKET UNIQUE", -10],
  ]);
  const ambiguous = store.review
    .records()
    .find((r) => r.description === "MARKET CORNER");
  assert.equal(ambiguous.aliasConflicts.length, 2);
  assert.equal(ambiguous.review.tags.length, 0);
  const unique = store.review.records().find((r) => r.aliasId === market);
  assert.deepEqual(unique.review.tags, [{ id: f.category, cents: 1000 }]);
  assert.equal(unique.review.assignedPersonId, f.person);
  store.transactionRules.save(
    f.values({ name: "Competing tag", categoryId: f.other }),
  );
  assert.equal(
    store.transactionRules.state().candidates.find((c) => c.id === unique.id)
      .status,
    "conflict",
  );
});

test("schema 16 keeps legacy regex rules and every financial table unchanged", (t) => {
  const f = setup(t),
    { store } = f;
  f.importRows([["MARKET existing", -25]]);
  store.transactionRules.save(f.values());
  const legacyRules = store.db
    .prepare(
      "SELECT id,name,pattern,categoryId,personId,direction,enabled,version FROM transaction_rules",
    )
    .all();
  const tables = store.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name != 'transaction_rules'",
    )
    .all()
    .map((r) => r.name);
  const before = Object.fromEntries(
    tables.map((name) => [
      name,
      store.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );
  store.db.exec(
    "ALTER TABLE transaction_rules DROP COLUMN matchType; ALTER TABLE transaction_rules DROP COLUMN aliasIds; PRAGMA user_version=15;",
  );
  // A second connection performs the same startup upgrade as the desktop app.
  const upgraded = new ImportStore(f.root);
  try {
    assert.equal(
      upgraded.db.prepare("PRAGMA user_version").get().user_version,
      21,
    );
    assert.deepEqual(
      upgraded.db
        .prepare(
          "SELECT id,name,pattern,categoryId,personId,direction,enabled,version FROM transaction_rules",
        )
        .all(),
      legacyRules,
    );
    assert.equal(upgraded.transactionRules.rules()[0].matchType, "regex");
    assert.deepEqual(upgraded.transactionRules.rules()[0].aliasIds, []);
    for (const [name, rows] of Object.entries(before))
      assert.deepEqual(
        upgraded.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
        rows,
        name,
      );
  } finally {
    upgraded.close();
  }
});
