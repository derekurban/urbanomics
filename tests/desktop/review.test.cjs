const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
const header = [
  "Description",
  "Type",
  "Card Holder Name",
  "Date",
  "Time",
  "Amount",
];
const bankRow = (name, amount, date = "08/15/2026") => [
  name,
  "SYNTHETIC",
  "SAMPLE PERSON",
  date,
  "12:00 AM",
  amount,
];
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-review-"));
  const data = path.join(root, "workspace"),
    options = { now: () => new Date("2026-09-10T12:00:00Z") };
  let store = new ImportStore(data, options);
  const account = store.addAccount("Synthetic card", "pc", "credit");
  function ingest(name, rows, accountId = account) {
    const file = path.join(root, name + ".csv");
    fs.writeFileSync(file, csv([header, ...rows]));
    const id = store.enqueue([file]).ids[0];
    if (store.job(id).status === "routing")
      store.resolveAccount(id, accountId, false);
    return id;
  }
  ingest("initial", [
    bankRow("Dinner", "-120"),
    bankRow("Cabin", "-300", "07/20/2026"),
    bankRow("Alex payment", "240"),
    bankRow("Other payment", "100"),
    bankRow("Salary", "2000"),
    bankRow("Transfer out", "-50"),
  ]);
  const row = (name) =>
    store.review.records().find((r) => r.description === name);
  const entity = (kind, name, tags = []) =>
    store.review.entity(kind, {
      name,
      color: "#78976A",
      tags,
      ...(kind === "group"
        ? { startDate: "2026-08-14", endDate: "2026-08-17" }
        : {}),
    });
  const save = (name, draft) => {
    const r = row(name);
    return store.review.financial(r.id, r.version, { ...r.review, ...draft });
  };
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    account,
    ingest,
    row,
    entity,
    save,
    reopen() {
      store.close();
      store = new ImportStore(data, options);
    },
  };
}
test("categories conserve cents, bulk changes roll back and stale versions cannot overwrite a review", (t) => {
  const c = setup(t),
    food = c.entity("category", "Food"),
    home = c.entity("category", "Home"),
    dinner = c.row("Dinner"),
    cabin = c.row("Cabin");
  c.store.review.organize([
    {
      id: dinner.id,
      version: 0,
      tags: [
        { id: food, cents: 7001 },
        { id: home, cents: 4999 },
      ],
    },
  ]);
  assert.throws(
    () => c.store.review.organize([{ id: dinner.id, version: 0, tags: [] }]),
    /changed/,
  );
  assert.throws(
    () =>
      c.store.review.organize([
        { id: dinner.id, version: 1, tags: [] },
        { id: cabin.id, version: 0, tags: [{ id: home, cents: 1 }] },
      ]),
    /total/,
  );
  assert.equal(c.row("Dinner").review.tags[0].cents, 7001);
  for (const cents of [-1, 0.1, NaN, Infinity])
    assert.throws(
      () =>
        c.store.review.organize([
          { id: cabin.id, version: 0, tags: [{ id: food, cents }] },
        ]),
      /whole-cent/,
    );
  assert.throws(() => c.store.review.removeEntity(food), /transactions/);
  const before = c.row("Dinner"),
    category = c.entity("category", "Essentials", [food, home]);
  c.store.review.entity("category", {
    id: category,
    name: "Daily",
    color: "#123456",
    tags: [food],
  });
  c.store.review.removeEntity(category);
  assert.deepEqual(c.row("Dinner"), before);
  const group = c.entity("group", "Mountain weekend");
  c.store.review.organize([{ id: dinner.id, version: 1, groups: [group] }]);
  c.store.review.removeEntity(group);
  assert.deepEqual(c.row("Dinner").review.groups, []);
  assert.deepEqual(c.row("Dinner").review.tags, before.review.tags);
});
test("version 5 tags become direct categories without rewriting reviews or archived imports", (t) => {
  const c = setup(t),
    food = c.entity("category", "Food"),
    home = c.entity("category", "Home"),
    person = c.entity("person", "Alex"),
    event = c.entity("group", "Weekend");
  const row = c.row("Dinner");
  c.store.review.organize([
    {
      id: row.id,
      version: row.version,
      tags: [
        { id: food, cents: 7001 },
        { id: home, cents: 4999 },
      ],
      groups: [event],
    },
  ]);
  c.save("Dinner", { kind: "expense", reviewed: true });
  c.save("Alex payment", {
    kind: "repayment",
    reviewed: true,
    personId: person,
    allocations: [{ id: row.id, cents: 6000 }],
    remainder: 18000,
  });
  const db = c.store.db;
  db.prepare("UPDATE review_entities SET kind='tag' WHERE id IN (?,?)").run(
    food,
    home,
  );
  const view = c.entity("category", "Food");
  db.prepare("UPDATE review_entities SET tags=? WHERE id=?").run(
    JSON.stringify([food, home]),
    view,
  );
  db.exec("DROP TABLE review_entity_history; PRAGMA user_version=5");
  c.store.deleteAccount(c.account);
  const records = c.store.review.records();
  const entities = c.store.review.entities();
  const originalTables = [
    "transactions",
    "review_items",
    "snapshots",
    "sources",
    "observations",
  ];
  const before = originalTables.map((table) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  );
  c.reopen();
  assert.deepEqual(c.store.review.records(), records);
  assert.equal(
    c.store.db.prepare("PRAGMA user_version").get().user_version,
    17,
  );
  assert.equal(
    c.store.review.entities().filter((e) => e.kind === "tag").length,
    0,
  );
  assert.equal(
    c.store.review.entities().find((e) => e.id === food).name,
    "Food (converted 1)",
  );
  assert.equal(
    c.store.review.entities().find((e) => e.id === home).name,
    "Home",
  );
  assert.deepEqual(
    c.store.db
      .prepare("SELECT * FROM review_entity_history ORDER BY rowid")
      .all()
      .map((e) => ({ ...e, tags: JSON.parse(e.tags) })),
    entities,
  );
  assert.throws(() => c.store.review.removeEntity(food), /transactions/);
  assert.throws(() => c.entity("tag", "New tag"), /Unknown/);
  const migrated = c.store.review.state();
  c.reopen();
  assert.deepEqual(c.store.review.state(), migrated);
  assert.deepEqual(
    originalTables.map((table) =>
      c.store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ),
    before,
  );
});

test("repayments span months, preserve expense review, respect agreed shares and retain excess income", (t) => {
  const c = setup(t),
    alex = c.entity("person", "Alex");
  c.save("Dinner", {
    kind: "expense",
    reviewed: true,
    shares: [
      { id: "me", cents: 6000 },
      { id: alex, cents: 6000 },
    ],
  });
  const dinner = c.row("Dinner"),
    cabin = c.row("Cabin");
  c.save("Alex payment", {
    kind: "repayment",
    reviewed: true,
    personId: alex,
    allocations: [
      { id: dinner.id, cents: 6000 },
      { id: cabin.id, cents: 15000 },
    ],
    remainder: 3000,
  });
  assert.deepEqual(c.row("Dinner"), dinner);
  assert.deepEqual(c.row("Cabin"), cabin);
  assert.equal(c.row("Alex payment").review.remainder, 3000);
  assert.throws(
    () =>
      c.save("Other payment", {
        kind: "repayment",
        reviewed: true,
        personId: alex,
        allocations: [{ id: dinner.id, cents: 1 }],
        remainder: 9999,
      }),
    /agreed share/,
  );
  assert.throws(
    () =>
      c.save("Dinner", {
        shares: [
          { id: "me", cents: 10000 },
          { id: alex, cents: 2000 },
        ],
      }),
    /agreed share/,
  );
  assert.throws(
    () =>
      c.save("Other payment", {
        kind: "repayment",
        reviewed: true,
        personId: alex,
        allocations: [{ id: c.row("Salary").id, cents: 10000 }],
        remainder: 0,
      }),
    /expenses/,
  );
  assert.throws(
    () =>
      c.save("Other payment", {
        kind: "repayment",
        personId: alex,
        allocations: [
          { id: cabin.id, cents: 1 },
          { id: cabin.id, cents: 9999 },
        ],
        remainder: 0,
      }),
    /unique/,
  );
  assert.throws(
    () =>
      c.save("Other payment", {
        kind: "repayment",
        personId: alex,
        allocations: [],
        remainder: 99,
      }),
    /full payment/,
  );
  assert.throws(() => c.store.review.removeEntity(alex), /used/);
  c.save("Alex payment", { reviewed: false });
  assert.equal(c.row("Alex payment").review.reviewed, false);
  c.save("Alex payment", {
    kind: "income",
    incomeType: "paycheck",
    reviewed: true,
  });
  assert.deepEqual(c.row("Alex payment").review.allocations, []);
  assert.equal(c.row("Alex payment").review.remainder, 0);
});
test("transfers pair both accounts atomically, exclude used expenses, and unlink when changed", (t) => {
  const c = setup(t),
    savings = c.store.addAccount("Synthetic savings", "pc", "savings");
  c.ingest(
    "savings",
    [bankRow("Transfer in", "50"), bankRow("Dinner opposite", "120")],
    savings,
  );
  const incoming = c.row("Transfer in");
  c.save("Transfer out", {
    kind: "transfer",
    reviewed: true,
    transferId: incoming.id,
  });
  assert.equal(
    c.row("Transfer in").review.transferId,
    c.row("Transfer out").id,
  );
  assert.equal(c.row("Transfer in").review.reviewed, true);
  c.save("Transfer out", { kind: "expense", reviewed: true });
  assert.equal(c.row("Transfer in").review.kind, "unreviewed");
  assert.equal(c.row("Transfer in").review.reviewed, false);
  const alex = c.entity("person", "Alex");
  c.save("Alex payment", {
    kind: "repayment",
    personId: alex,
    allocations: [{ id: c.row("Dinner").id, cents: 6000 }],
    remainder: 18000,
  });
  const before = c.row("Dinner opposite");
  assert.throws(
    () =>
      c.save("Dinner", {
        kind: "transfer",
        reviewed: true,
        transferId: before.id,
      }),
    /expenses/,
  );
  assert.deepEqual(
    c.row("Dinner opposite"),
    before,
    "counterpart write rolled back",
  );
  assert.throws(
    () => c.save("Salary", { kind: "expense", reviewed: true }),
    /direction/,
  );
});
test("restart, repeat and amendment imports retain review IDs; new rows enter the inbox; account restore recovers decisions", (t) => {
  const c = setup(t),
    tag = c.entity("category", "Dining"),
    dinner = c.row("Dinner");
  c.store.review.organize([
    { id: dinner.id, version: 0, tags: [{ id: tag, cents: 12000 }] },
  ]);
  c.save("Dinner", { kind: "expense", reviewed: true });
  const before = c.row("Dinner");
  const job = c.ingest("amendment", [
    bankRow("Dinner", "-120"),
    bankRow("New cafe", "-15"),
  ]);
  assert.equal(c.store.job(job).status, "complete");
  assert.deepEqual(c.row("Dinner"), before);
  assert.equal(c.row("New cafe").review.reviewed, false);
  c.ingest("repeat", [bankRow("Dinner", "-120"), bankRow("New cafe", "-15")]);
  assert.equal(c.store.review.records().length, 7);
  c.reopen();
  assert.deepEqual(c.row("Dinner"), before);
  c.store.deleteAccount(c.account);
  assert.equal(c.store.review.pending(), 0);
  assert.deepEqual(c.row("Dinner").review, before.review);
  c.store.restoreAccount(c.account);
  assert.deepEqual(c.row("Dinner"), before);
  assert.equal(c.store.review.pending(), 6);
});
test("explicit no-event decisions persist independently of categories and financial review", (t) => {
  const c = setup(t),
    tag = c.entity("category", "Dining"),
    event = c.entity("group", "Weekend");
  let row = c.row("Dinner");
  c.store.review.organize([
    { id: row.id, version: row.version, tags: [{ id: tag, cents: 12000 }] },
  ]);
  c.save("Dinner", { kind: "expense", reviewed: true });
  row = c.row("Dinner");
  c.store.review.organize([
    { id: row.id, version: row.version, groups: [], groupsReviewed: true },
  ]);
  c.reopen();
  assert.equal(c.row("Dinner").review.groupsReviewed, true);
  assert.equal(c.row("Dinner").review.reviewed, true);
  assert.deepEqual(c.row("Dinner").review.tags, row.review.tags);
  row = c.row("Dinner");
  assert.throws(
    () =>
      c.store.review.organize([
        {
          id: row.id,
          version: row.version,
          groups: [event],
          groupsReviewed: "yes",
        },
      ]),
    /true or false/,
  );
  assert.deepEqual(c.row("Dinner"), row);
  c.store.review.organize([
    { id: row.id, version: row.version, groups: [event] },
  ]);
  assert.equal(c.row("Dinner").review.groupsReviewed, true);
  c.store.review.removeEntity(event);
  assert.equal(c.row("Dinner").review.groupsReviewed, false);
  assert.deepEqual(c.row("Dinner").review.groups, []);
  assert.equal(c.row("Dinner").review.reviewed, true);
});
test("divider precision, retagging, capped distribution and overlapping category union", async () => {
  const m = await import("../../src/review-model.js");
  assert.deepEqual(m.equal(["a", "b", "c"], 100), [
    { id: "a", cents: 34 },
    { id: "b", cents: 33 },
    { id: "c", cents: 33 },
  ]);
  const split = [
    { id: "a", cents: 20000 },
    { id: "b", cents: 10000 },
    { id: "c", cents: 15000 },
  ];
  assert.deepEqual(m.divider(split, 1, 32001, 1), [
    { id: "a", cents: 20000 },
    { id: "b", cents: 12001 },
    { id: "c", cents: 12999 },
  ]);
  assert.equal(m.divider(split, 1, 32001, 100)[1].cents, 12000);
  assert.deepEqual(m.retag(split, ["a", "b", "c", "d"], 45000), [
    ...split,
    { id: "d", cents: 0 },
  ]);
  assert.deepEqual(m.distribute(24000, ["a", "b"], { a: 6000, b: 15000 }), [
    { id: "a", cents: 6000 },
    { id: "b", cents: 15000 },
    { id: "remainder", cents: 3000 },
  ]);
  const records = [
    {
      id: "tx",
      amountCents: -24000,
      review: {
        kind: "expense",
        reviewed: true,
        tags: [
          { id: "food", cents: 14000 },
          { id: "home", cents: 10000 },
        ],
      },
    },
  ];
  assert.equal(m.flowSummary(records, ["food", "food"]).totals.out, 14000);
  assert.equal(m.flowSummary(records, ["food", "home"]).totals.out, 24000);
  assert.equal(
    m.flowSummary(
      [{ ...records[0], review: { ...records[0].review, kind: "transfer" } }],
      ["food"],
    ).totals.transferOut,
    14000,
  );
});
