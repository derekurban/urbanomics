const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { ImportStore } = require("../../electron/imports/store.cjs"),
  { csv } = require("../../electron/imports/parsers.cjs"),
  {
    configurationSQL,
    seedConfiguration,
  } = require("../../electron/configuration.cjs");
const {
  transferLabCandidates,
  transferLabBacktest,
  suggestedRoutes,
} = require("../../electron/review/transfer-lab-model.mjs");
const row = (id, accountId, amountCents, date = "2026-08-31", extra = {}) => ({
  id,
  accountId,
  amountCents,
  date,
  currency: "CAD",
  description: id,
  review: {
    kind: "unreviewed",
    tags: [],
    groups: [],
    shares: null,
    allocations: [],
    transferId: "",
  },
  ...extra,
});
const settings = {
  maxDays: 3,
  basisPoints: 200,
  routes: [{ from: "a", to: "b" }],
};
test("directed routes, symmetric calendar window, exact-cent tolerances and currencies bound candidates", () => {
  const records = [
    row("out", "a", -10000),
    row("in", "b", 9900, "2026-09-03"),
    row("tooLate", "b", 10000, "2026-09-04"),
    row("currency", "b", 10000, "2026-08-31", { currency: "USD" }),
    row("reverseOut", "b", -20000),
    row("reverseIn", "a", 20000),
    row("tooFar", "b", 9700),
  ];
  const result = transferLabCandidates(records, settings);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].days, 3);
  assert.equal(result.edges[0].differenceCents, 100);
  assert.ok(result.edges[0].unique);
  assert.equal(
    transferLabCandidates(records, { ...settings, basisPoints: 0 }).edges
      .length,
    0,
  );
  assert.equal(
    transferLabCandidates([row("x", "a", -100), row("y", "b", 101)], {
      ...settings,
      basisPoints: 100,
    }).edges[0].differenceCents,
    -1,
  );
  assert.equal(
    transferLabCandidates([row("x", "a", -100), row("y", "b", 101)], {
      ...settings,
      basisPoints: 99,
    }).edges.length,
    0,
  );
  assert.equal(
    transferLabCandidates(
      [row("x", "a", -100, "2026-03-09"), row("y", "b", 100, "2026-03-08")],
      { ...settings, maxDays: 1 },
    ).edges[0].days,
    1,
  );
});
test("full graph retains competing candidates without greedy pairing or reuse, and protects assigned records", () => {
  const records = [
    row("a1", "a", -10000),
    row("a2", "a", -10001),
    row("b1", "b", 10000),
    row("b2", "b", 10001),
    row("manual", "b", 10000, undefined, { manual: true }),
    row("deleted", "b", 10000, undefined, { deleted: true }),
    row("income", "b", 10000, undefined, { review: { kind: "income" } }),
  ];
  const result = transferLabCandidates(records, settings);
  assert.equal(result.edges.length, 4);
  assert.ok(result.edges.every((e) => !e.unique));
  assert.equal(result.eligible, 4);
  const copy = JSON.stringify(records);
  transferLabCandidates(records, settings);
  assert.equal(JSON.stringify(records), copy);
});
test("existing linked pairs are tested in copies with pending competitors and never rewritten", () => {
  const out = row("out", "a", -10000),
    input = row("in", "b", 10000);
  out.review.kind = input.review.kind = "transfer";
  out.review.transferId = input.id;
  input.review.transferId = out.id;
  const records = [out, input],
    before = JSON.stringify(records);
  assert.equal(transferLabCandidates(records, settings).edges.length, 0);
  assert.equal(transferLabBacktest(records, settings).recovered, 1);
  assert.equal(
    transferLabBacktest([...records, row("competing", "b", 10000)], settings)
      .ambiguous,
    1,
  );
  assert.equal(
    transferLabBacktest(records, { ...settings, routes: [] }).excluded,
    1,
  );
  assert.equal(JSON.stringify(records), before);
});
test("no transfer routes are suggested; the user draws their own", () => {
  const accounts = [
    { id: "a", schema: "custom:1", kind: "savings" },
    { id: "b", schema: "custom:2", kind: "chequing" },
    { id: "c", schema: "custom:2", kind: "credit" },
  ];
  assert.deepEqual(suggestedRoutes(accounts), []);
  assert.deepEqual(suggestedRoutes([]), []);
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-lab-")),
    store = new ImportStore(root),
    a = store.addAccount("Synthetic spending", "pc", "chequing"),
    b = store.addAccount("Synthetic card", "pc", "credit");
  let seq = 0;
  function ingest(account, entries) {
    const file = path.join(root, `${seq++}.csv`);
    fs.writeFileSync(
      file,
      csv([
        ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
        ...entries.map(([name, amount]) => [
          name,
          "SYNTHETIC",
          "SAMPLE",
          "08/31/2026",
          "12:00 AM",
          amount,
        ]),
      ]),
    );
    store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  }
  ingest(a, [
    ["Send one", -100],
    ["Send fee", -200],
  ]);
  ingest(b, [
    ["Receive one", 100],
    ["Receive competing", 100],
    ["Receive fee", 199],
  ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    store,
    root,
    a,
    b,
    ingest,
    config: { maxDays: 3, basisPoints: 200, routes: [{ from: a, to: b }] },
  };
}
test("preview is read-only; selected pairs link atomically, reject reuse/staleness and preserve raw/category data", (t) => {
  const f = fixture(t),
    { store } = f;
  const category = store.review.entity("category", {
      name: "Synthetic category",
      color: "#78976A",
    }),
    out = store.review.records().find((r) => r.description === "Send fee");
  store.review.organize([
    {
      id: out.id,
      version: out.version,
      tags: [{ id: category, cents: 20000 }],
    },
  ]);
  const raw = store.db.prepare("SELECT * FROM transactions ORDER BY id").all(),
    before = store.review.records();
  const p = store.transferLab.preview(f.config);
  assert.equal(p.edges.length, 3);
  assert.deepEqual(store.review.records(), before);
  const competing = p.edges.filter((e) => !e.unique);
  assert.throws(
    () =>
      store.transferLab.apply(
        f.config,
        p.token,
        competing.map((e) => e.key),
      ),
    /one selected pair/,
  );
  assert.deepEqual(store.review.records(), before);
  const chosen = p.edges.filter((e) => e.unique);
  assert.equal(
    store.transferLab.apply(f.config, p.token, [chosen[0].key]).linked,
    1,
  );
  const after = store.review.records().find((r) => r.id === out.id);
  assert.equal(after.review.transferFeeCents, 100);
  assert.deepEqual(after.review.tags, [{ id: category, cents: 20000 }]);
  assert.deepEqual(
    store.db.prepare("SELECT * FROM transactions ORDER BY id").all(),
    raw,
  );
  assert.throws(
    () => store.transferLab.apply(f.config, p.token, [competing[0].key]),
    /changed/,
  );
  const next = store.transferLab.preview(f.config);
  store.transferLab.save(f.config, 0);
  assert.throws(
    () => store.transferLab.apply(f.config, next.token, [next.edges[0].key]),
    /changed/,
  );
  const again = store.transferLab.preview(f.config);
  assert.equal(
    store.transferLab.apply(f.config, again.token, [again.edges[0].key]).linked,
    1,
    "ambiguous pair can be selected explicitly",
  );
});
test("setup validates versions and active routes, round-trips configuration only; no auto-link on repeat or new import", (t) => {
  const f = fixture(t),
    { store } = f;
  store.transferLab.save(f.config, 0);
  assert.throws(() => store.transferLab.save(f.config, 0), /changed/);
  assert.throws(
    () => store.transferLab.preview({ ...f.config, maxDays: 1.5 }),
    /calendar days/,
  );
  assert.throws(
    () => store.transferLab.preview({ ...f.config, basisPoints: 1001 }),
    /tolerance/,
  );
  assert.throws(
    () =>
      store.transferLab.preview({
        ...f.config,
        routes: [{ from: f.a, to: f.a }],
      }),
    /different/,
  );
  f.ingest(f.a, [
    ["Send one", -100],
    ["New send", -300],
  ]);
  assert.ok(store.review.records().every((r) => r.review.kind !== "transfer"));
  const sql = configurationSQL(store.db);
  assert.ok(sql.includes("transfer_lab_config"));
  assert.ok(!sql.includes("Receive competing"));
  const seed = path.join(f.root, "seed.sql");
  fs.writeFileSync(seed, sql);
  const fresh = new ImportStore(path.join(f.root, "fresh"));
  try {
    seedConfiguration(fresh.db, seed);
    assert.deepEqual(fresh.transferLab.config(), store.transferLab.config());
    assert.equal(fresh.review.records().length, 0);
  } finally {
    fresh.close();
  }
  store.db
    .prepare("UPDATE accounts SET deletedAt=? WHERE id=?")
    .run("2026-09-12", f.b);
  assert.deepEqual(store.transferLab.config().routes, []);
  assert.throws(() => store.transferLab.preview(f.config), /active accounts/);
});
test("schema 12 upgrade adds empty configuration without changing populated tables", (t) => {
  const f = fixture(t),
    { store } = f;
  store.db.exec("DROP TABLE transfer_lab_config; PRAGMA user_version=11;");
  const tables = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => t.name),
    before = Object.fromEntries(
      tables.map((name) => [
        name,
        store.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      ]),
    );
  // Reopen through a second connection after closing this fixture's handle.
  store.close();
  const next = new ImportStore(f.root);
  store.db = next.db;
  store.review = next.review;
  assert.equal(next.db.prepare("PRAGMA user_version").get().user_version, 22);
  for (const [name, rows] of Object.entries(before))
    assert.deepEqual(
      next.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      rows,
      name,
    );
  assert.equal(
    next.db.prepare("SELECT count(*) n FROM transfer_lab_config").get().n,
    0,
  );
});

test("unlinked sandbox includes saved pairs in main candidates, validates without writes, and cannot feed live apply", (t) => {
  const f = fixture(t),
    { store } = f;
  const initial = store.transferLab.preview(f.config),
    pair = initial.edges.find((e) => e.unique);
  store.transferLab.apply(f.config, initial.token, [pair.key]);
  const before = store.review.records();
  const simulated = store.transferLab.preview(f.config, true),
    live = store.transferLab.preview(f.config, false);
  assert.ok(simulated.edges.some((e) => e.key === pair.key));
  assert.ok(!live.edges.some((e) => e.key === pair.key));
  const copy = simulated.edges.find((e) => e.key === pair.key);
  assert.equal(copy.outgoing.review.transferId, "");
  assert.equal(copy.outgoing.review.transferFeeCents, 0);
  assert.deepEqual(
    store.transferLab.validate(f.config, simulated.token, [pair.key]),
    { validated: 1, simulation: true },
  );
  assert.throws(
    () => store.transferLab.apply(f.config, simulated.token, [pair.key]),
    /changed/,
  );
  assert.deepEqual(store.review.records(), before);
  assert.throws(
    () => store.transferLab.validate(f.config, live.token, [live.edges[0].key]),
    /changed/,
  );
});
