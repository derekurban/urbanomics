const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const {
  validDate,
  eventDates,
  nearEvent,
  shiftDate,
  costBreakdown,
} = require("../../electron/review/event-model.mjs");

test("event date suggestions preserve calendar days across leap years, timezone boundaries and optional endpoints", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-08-15T23:00:00-07:00"), false);
  assert.throws(
    () => eventDates({ startDate: "2026-08-17", endDate: "2026-08-15" }),
    /end date/,
  );
  assert.throws(() => eventDates({ startDate: 42 }), /valid event dates/);
  assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
  const event = { startDate: "2025-12-31", endDate: "2026-01-01" };
  assert.equal(nearEvent("2025-12-30", event), true);
  assert.equal(nearEvent("2026-01-02", event), true);
  assert.equal(nearEvent("2026-01-03", event), false);
  assert.equal(nearEvent("2026-01-02", event, 0), false);
  assert.equal(nearEvent("2026-01-01", {}), false);
  assert.equal(nearEvent("2026-01-02", { endDate: "2026-01-01" }), true);
  assert.equal(nearEvent("2025-01-01", { endDate: "2026-01-01" }), false);
});

test("schema 9 adds optional event dates without rewriting financial tables and preserves edits on restart", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-events-"));
  let store = new ImportStore(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const id = store.review.entity("group", {
    name: "Old event",
    startDate: "2026-08-14",
    endDate: "2026-08-17",
    color: "#78976A",
  });
  store.db.exec(
    "ALTER TABLE review_entities DROP COLUMN startDate; ALTER TABLE review_entities DROP COLUMN endDate; PRAGMA user_version=8;",
  );
  store.close();
  store = new ImportStore(root);
  assert.equal(store.db.prepare("PRAGMA user_version").get().user_version, 16);
  const event = store.review.entities().find((e) => e.id === id);
  assert.equal(event.startDate, "");
  assert.equal(event.endDate, "");
  store.review.entity("group", {
    ...event,
    startDate: "2026-08-14",
    endDate: "2026-08-17",
  });
  assert.throws(
    () => store.review.entity("group", { ...event, startDate: "2026-02-30" }),
    /valid event dates/,
  );
  store.close();
  store = new ImportStore(root);
  assert.equal(store.review.entities()[0].startDate, "2026-08-14");
  // Renaming from an older client omitting optional fields retains the dates.
  store.review.entity("group", { id, name: "Renamed", color: event.color });
  assert.equal(store.review.entities()[0].endDate, "2026-08-17");
  assert.throws(
    () =>
      store.review.entity("group", {
        id,
        name: "Renamed",
        color: event.color,
        startDate: "",
        endDate: "",
      }),
    /both a start date/,
  );
  assert.equal(store.review.entities()[0].startDate, "2026-08-14");
});

test("cost breakdown separates fronted cash, agreed shares and payer debts without counting overlapping events twice", () => {
  const expense = (id, amount, shares, currency = "CAD") => ({
    id,
    amountCents: -amount,
    currency,
    review: { kind: "expense", shares },
  });
  const cabin = expense("cabin", 36000, [
    { id: "me", cents: 12000 },
    { id: "alex", cents: 12000 },
    { id: "sam", cents: 12000 },
  ]);
  const fuel = expense("fuel", 9000, [
    { id: "me", cents: 3000 },
    { id: "alex", cents: 3000 },
    { id: "sam", cents: 3000 },
  ]);
  const food = { ...fuel, id: "food" };
  const alex = {
    id: "alexpay",
    amountCents: 19000,
    currency: "CAD",
    review: {
      kind: "repayment",
      personId: "alex",
      remainder: 1000,
      allocations: [
        { id: "cabin", cents: 12000 },
        { id: "fuel", cents: 3000 },
        { id: "food", cents: 3000 },
      ],
    },
  };
  const sam = {
    ...alex,
    id: "sampay",
    review: { ...alex.review, personId: "sam" },
  };
  let result = costBreakdown([cabin, fuel, food, cabin], [alex])[0];
  assert.deepEqual(
    [result.gross, result.repaid, result.fronted, result.own, result.owed],
    [54000, 18000, 36000, 18000, 18000],
  );
  result = costBreakdown([cabin, fuel, food], [alex, sam])[0];
  assert.deepEqual(
    [result.repaid, result.fronted, result.owed],
    [36000, 18000, 0],
  );
  const all = costBreakdown(
    [
      cabin,
      expense("unknown", 2000, null),
      expense("usd", 1000, null, "USD"),
      { ...fuel, id: "transfer", review: { kind: "transfer" } },
    ],
    [alex],
  );
  assert.equal(all.length, 2);
  assert.equal(all[0].unknown, 1);
  assert.equal(all[0].gross, 38000);
  assert.equal(all[1].repaid, 0);
  assert.equal(all[0].rows.find((r) => r.id === "unknown").own, null);
});
