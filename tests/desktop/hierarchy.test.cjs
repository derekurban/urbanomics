const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const {
  configurationSQL,
  seedConfiguration,
} = require("../../electron/configuration.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
test("hierarchy preserves legacy assignments, validates parents, guards deletion and round-trips definitions only", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-hierarchy-"));
  let s = new ImportStore(path.join(root, "data"));
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const a = s.addAccount("Test", "pc", "chequing"),
    file = path.join(root, "sample.csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      [
        "Synthetic expense",
        "SYNTHETIC",
        "TEST",
        "08/01/2026",
        "12:00 AM",
        "-123.45",
      ],
    ]),
  );
  s.resolveAccount(s.enqueue([file]).ids[0], a, false);
  const tag = s.review.entity("category", {
      name: "Groceries",
      color: "#88AA88",
    }),
    row = s.review.records()[0];
  s.review.organize([
    { id: row.id, version: row.version, tags: [{ id: tag, cents: 12345 }] },
  ]);
  const before = s.review.records(),
    snapshots = s.db.prepare("SELECT * FROM snapshots").all();
  s.db.exec(
    "ALTER TABLE review_entities DROP COLUMN parentId; PRAGMA user_version=12",
  );
  s.close();
  s = new ImportStore(path.join(root, "data"));
  assert.equal(s.db.prepare("PRAGMA user_version").get().user_version, 17);
  assert.deepEqual(s.review.records(), before);
  s.review.starterHierarchy();
  const first = s.review.entities();
  s.review.starterHierarchy();
  assert.deepEqual(s.review.entities(), first, "starter is idempotent");
  const food = first.find((e) => e.kind === "bucket" && e.name === "Food"),
    personal = first.find((e) => e.kind === "bucket" && e.name === "Personal"),
    groceries = first.find((e) => e.id === tag);
  assert.equal(groceries.parentId, food.id);
  assert.throws(() => s.review.removeEntity(food.id), /Move/);
  assert.throws(() => s.review.removeEntity(tag), /transactions/);
  assert.throws(
    () => s.review.entity("category", { ...groceries, parentId: tag }),
    /existing category/,
  );
  assert.throws(
    () =>
      s.review.organize([
        {
          id: row.id,
          version: before[0].version,
          tags: [{ id: food.id, cents: 12345 }],
        },
      ]),
    /category|categor/i,
  );
  s.review.entity("category", { ...groceries, parentId: personal.id });
  assert.deepEqual(s.review.records(), before);
  assert.deepEqual(s.db.prepare("SELECT * FROM snapshots").all(), snapshots);
  const sql = configurationSQL(s.db),
    seed = path.join(root, "seed.sql");
  assert.ok(sql.includes("parentId"));
  assert.ok(!sql.includes("Synthetic expense"));
  fs.writeFileSync(seed, sql);
  const fresh = new ImportStore(path.join(root, "fresh"));
  try {
    seedConfiguration(fresh.db, seed);
    assert.deepEqual(
      fresh.review.entities().sort((a, b) => a.id.localeCompare(b.id)),
      s.review.entities().sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.equal(fresh.review.records().length, 0);
  } finally {
    fresh.close();
  }
});
test("category rollups conserve tag-level repayment rounding and deduplicate filtered transactions", async () => {
  const { dashboard } = await import("../../src/dashboard-model.js");
  const base = {
    currency: "CAD",
    accountId: "a",
    account: "Test",
    date: "2026-08-01",
    deleted: false,
  };
  const review = {
    kind: "expense",
    groups: [],
    tags: [],
    allocations: [],
    shares: null,
  };
  const records = [
    {
      ...base,
      id: "e",
      amountCents: -101,
      review: {
        ...review,
        tags: [
          { id: "g", cents: 51 },
          { id: "c", cents: 50 },
        ],
      },
    },
    {
      ...base,
      id: "p",
      amountCents: 33,
      review: {
        ...review,
        kind: "repayment",
        tags: [],
        personId: "friend",
        allocations: [{ id: "e", cents: 33 }],
      },
    },
  ];
  const entities = [
      { id: "food", kind: "bucket", name: "Food" },
      { id: "g", kind: "category", parentId: "food", name: "Groceries" },
      { id: "c", kind: "category", parentId: "food", name: "Coffee" },
    ],
    options = { from: "2026-08-01", through: "2026-08-31" };
  const tags = dashboard(records, entities, options),
    buckets = dashboard(records, entities, { ...options, layer: "categories" });
  assert.equal(
    buckets.categories[0].net,
    tags.categories.reduce((n, t) => n + t.net, 0),
  );
  assert.equal(buckets.categories[0].rows.length, 1);
  assert.equal(buckets.categories[0].gross, 101);
  assert.equal(buckets.categories[0].repaid, 33);
  const filtered = dashboard(records, entities, {
    ...options,
    categories: ["food", "g"],
    layer: "categories",
  });
  assert.equal(filtered.gross, 101);
  assert.equal(filtered.expenses.length, 1);
  assert.equal(
    dashboard(
      records,
      entities.concat({ id: "empty", kind: "bucket", name: "Empty" }),
      { ...options, categories: ["empty"] },
    ).gross,
    0,
  );
});
