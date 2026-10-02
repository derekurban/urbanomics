const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-aliases-")),
    workspace = path.join(root, "workspace");
  const options = { now: () => new Date("2026-09-10T12:00:00Z") };
  let store = new ImportStore(workspace, options),
    sequence = 0;
  const a = store.addAccount("Synthetic spending", "pc", "chequing"),
    b = store.addAccount("Synthetic savings", "pc", "savings");
  function ingest(rows, account = a) {
    const file = path.join(root, `synthetic-${sequence++}.csv`);
    fs.writeFileSync(
      file,
      csv([
        ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
        ...rows.map(([name, date = "08/12/2026"]) => [
          name,
          "SYNTHETIC",
          "SAMPLE PERSON",
          date,
          "12:00 AM",
          "-100",
        ]),
      ]),
    );
    store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  }
  ingest([
    ["WALMART #1234 EDMONTON", "01/12/2026"],
    ["WALMART #5678 EDMONTON"],
    ["ACME 12"],
    ["OTHER STORE"],
  ]);
  ingest([["WALMART #9999 EDMONTON"]], b);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    a,
    b,
    ingest,
    reopen() {
      store.close();
      store = new ImportStore(workspace, options);
    },
  };
}
const rule = (name, pattern, accountId = "") => ({ name, pattern, accountId });

test("aliases preview all months and archived accounts, preserve raw data, and apply across restart", (t) => {
  const c = setup(t),
    value = rule("Walmart", "^walmart\\s+#\\d+"),
    db = c.store.db;
  const row = c.store.review.records()[0];
  c.store.review.financial(row.id, row.version, {
    ...row.review,
    kind: "expense",
    reviewed: true,
  });
  const tables = [
    "transactions",
    "review_items",
    "snapshots",
    "sources",
    "observations",
  ];
  const raw = () =>
    tables.map((table) =>
      c.store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
  const before = raw();
  c.store.deleteAccount(c.b);
  assert.equal(c.store.aliases.state().unaliased.length, 5);
  assert.ok(c.store.aliases.state().unaliased.some((r) => r.deleted));
  const preview = c.store.aliases.preview(value);
  assert.equal(preview.checked, 5);
  assert.equal(preview.matches.length, 3);
  assert.equal(preview.conflicts.length, 0);
  assert.ok(preview.matches.some((r) => r.deleted));
  assert.ok(preview.matches.some((r) => r.date.startsWith("2026-01")));
  const id = c.store.aliases.save(value);
  assert.equal(c.store.aliases.state().unaliased.length, 2);
  const shown = c.store.review.records().filter((r) => r.aliasId === id);
  assert.equal(shown.length, 3);
  assert.ok(
    shown.every(
      (r) =>
        r.description === "Walmart" &&
        r.originalDescription.startsWith("WALMART #"),
    ),
  );
  assert.deepEqual(raw(), before);
  assert.ok(
    c.store.transactions("2026-08").every((r) => r.description !== "Walmart"),
    "snapshot input remains raw",
  );
  assert.notEqual(c.store.detail(shown[0].id).description, "Walmart");
  c.reopen();
  assert.equal(c.store.aliases.state().rules[0].matched, 3);
  assert.deepEqual(raw(), before);
  const saved = c.store.aliases.rules()[0];
  c.store.aliases.save({ ...saved, name: "Walmart Canada" });
  assert.throws(
    () => c.store.aliases.save({ ...saved, name: "Stale" }),
    /changed/,
  );
  assert.throws(
    () => c.store.aliases.remove(saved.id, saved.version),
    /changed/,
  );
  c.store.aliases.remove(saved.id, saved.version + 1);
  assert.ok(c.store.review.records().every((r) => !r.aliasId));
  assert.deepEqual(raw(), before);
});

test("overlaps, duplicate rules/names, and unsupported patterns cannot create competing aliases", (t) => {
  const c = setup(t),
    first = rule("Walmart", "^WALMART");
  c.store.aliases.save(first);
  const overlap = c.store.aliases.preview(rule("Shopping", "EDMONTON$"));
  assert.equal(overlap.conflicts.length, 3);
  assert.ok(overlap.conflicts.every((r) => r.conflicts[0].name === "Walmart"));
  assert.throws(
    () => c.store.aliases.save(rule("Shopping", "EDMONTON$")),
    /competes/,
  );
  assert.throws(
    () => c.store.aliases.save(rule("WALMART", "NEVER-MATCH")),
    /competes/,
  );
  c.store.aliases.save(rule("Future", "^FUTURE$"));
  assert.throws(
    () => c.store.aliases.save(rule("Another", "^FUTURE$")),
    /competes/,
  );
  for (const pattern of ["", "[", "(?=WALMART)", "(.)\\1", "a".repeat(257)])
    assert.throws(
      () => c.store.aliases.preview(rule("Bad", pattern)),
      /regex|RE2/,
    );
  const existing = c.store.aliases.rules()[0];
  assert.equal(
    c.store.aliases.preview(existing).conflicts.length,
    0,
    "editing excludes its own rule",
  );
  assert.equal(c.store.aliases.rules().length, 2);
});

test("aliases apply globally and later imports expose ambiguity without guessing", (t) => {
  const c = setup(t);
  c.store.aliases.save(rule("Walmart", "^WALMART", c.a));
  assert.equal(c.store.aliases.state().rules[0].matched, 3);
  assert.throws(
    () => c.store.aliases.save(rule("Walmart", "^WALMART", c.b)),
    /competes/,
  );
  assert.throws(
    () => c.store.aliases.save(rule("All Walmart", "^WALMART")),
    /competes/,
  );
  c.store.aliases.save(rule("Acme", "^ACME"));
  c.store.aliases.save(rule("Store", "STORE$"));
  c.ingest([["ACME STORE"]]);
  const conflict = c.store.aliases.state().conflicts[0];
  assert.equal(conflict.description, "ACME STORE");
  assert.equal(conflict.aliasId, "");
  assert.equal(conflict.aliasConflicts.length, 2);
  assert.ok(
    !c.store.aliases.state().unaliased.some((r) => r.id === conflict.id),
    "competing aliases are not unassigned",
  );
  assert.equal(
    c.store.review.records().find((r) => r.id === conflict.id).review.reviewed,
    false,
  );
  const snapshot = c.store.db
    .prepare("SELECT json FROM snapshots ORDER BY rowid DESC LIMIT 1")
    .get();
  assert.ok(
    JSON.parse(snapshot.json).transactions.every(
      (r) => !r.aliasId && !r.originalDescription,
    ),
  );
  const storeRule = c.store.aliases.rules().find((r) => r.name === "Store");
  c.store.aliases.save({ ...storeRule, pattern: "^OTHER STORE$" });
  assert.equal(c.store.aliases.state().conflicts.length, 0);
  assert.equal(
    c.store.review.records().find((r) => r.id === conflict.id).description,
    "Acme",
  );
  c.reopen();
  assert.equal(c.store.aliases.state().conflicts.length, 0);
});

test("aliases reuse RE2 expressions across repeated previews and state checks", (t) => {
  const c = setup(t);
  const rows = Array.from({ length: 100 }, (_, i) => [
    `MERCHANT ${String(i).padStart(3, "0")}`,
  ]);
  c.ingest(rows);
  const rules = rows.map(([description], i) =>
    rule(`Merchant ${i}`, `^${description}$`),
  );
  for (const value of rules) c.store.aliases.save(value);
  const saved = c.store.aliases.rules();
  assert.equal(saved.length, 100);
  assert.equal(c.store.aliases.regexCache.size, 100);
  for (let pass = 0; pass < 20; pass++) {
    const preview = c.store.aliases.preview(saved[pass % saved.length]);
    assert.equal(preview.matches.length, 1);
    assert.equal(preview.conflicts.length, 0);
    assert.equal(c.store.aliases.state().conflicts.length, 0);
  }
  assert.equal(c.store.aliases.regexCache.size, 100);
});
