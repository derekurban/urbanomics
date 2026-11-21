// The Organize desk's pure rules: what the describe box offers first and what Enter takes, what Claude
// may apply without review, and which row comes next.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../../src/organize-rules.mjs");

const tag = (id, extra = {}) => ({ kind: "tag", id, label: id, ...extra });
const person = (id, extra = {}) => ({ kind: "person", id, label: `${id} settles up`, ...extra });

test("on interest with a friend who owes money, nothing is the Enter default", async () => {
  const { orderDescribe } = await load();
  const { list, cursor } = orderDescribe([person("sam"), tag("gift"), tag("paycheck"), { kind: "event", id: "lake" }]);
  assert.equal(cursor, -1);
  assert.deepEqual(list.map((o) => o.id), ["gift", "paycheck", "sam", "lake"], "people who owe follow the tags");
  assert.equal(list.find((o) => o.id === "sam").group, "person", "they keep their heading");
});

test("a twin leads, then history, then a person the description names", async () => {
  const { orderDescribe } = await load();
  const options = [person("sam"), person("priya", { guess: true }), tag("gift"), tag("salary", { history: true }), { kind: "twin", id: "t1" }];
  const { list, cursor } = orderDescribe(options);
  assert.deepEqual(list.map((o) => o.id), ["t1", "salary", "priya", "gift", "sam"]);
  assert.equal(cursor, 0);
  assert.equal(list[1].group, "history");
  const noTwin = orderDescribe(options.filter((o) => o.kind !== "twin"));
  assert.equal(noTwin.list[noTwin.cursor].id, "salary");
  const onlyGuess = orderDescribe([person("sam"), person("priya", { guess: true }), tag("gift")]);
  assert.equal(onlyGuess.list[onlyGuess.cursor].id, "priya");
});

test("money out to a named person leads with Paid and Shared with", async () => {
  const { orderDescribe } = await load();
  const { list, cursor } = orderDescribe([tag("dining"), tag("gas"), { kind: "share", id: "priya", guess: true }, { kind: "payee", id: "priya", guess: true }]);
  assert.deepEqual(list.map((o) => o.kind), ["payee", "share", "tag", "tag"]);
  assert.equal(cursor, 0);
});

test("a disabled guess is never the default; same as last leads", async () => {
  const { orderDescribe } = await load();
  assert.equal(orderDescribe([person("sam", { guess: true, disabled: true }), tag("gift")]).cursor, -1);
  const { list, cursor } = orderDescribe([tag("groceries", { history: true }), tag("dining", { same: true })]);
  assert.equal(list[cursor].id, "dining"); assert.equal(list[cursor].group, "same");
});

test("typed text keeps the grouping and takes the first match that can be used", async () => {
  const { orderDescribe, describeSections } = await load();
  const { list, cursor } = orderDescribe([tag("sauna"), person("sam", { disabled: true }), { kind: "create", id: "s" }], "sa");
  assert.deepEqual(list.map((o) => o.kind), ["person", "tag", "create"]);
  assert.equal(cursor, 1);
  assert.deepEqual(describeSections(list).map((s) => s.title), ["Settles up", "Tags", "New tag"]);
});

test("Apply automatically adds tags, clear transfers and events without a split, and holds the rest", async () => {
  const { splitForAutoApply, canApplyUnreviewed } = await load();
  const context = { twinIsUnique: (id) => id === "only", eventHasParticipants: (id) => id === "lake" };
  const s = [
    { kind: "tag", id: "groceries", confidence: "high" },
    { kind: "tag", id: "dining", confidence: "low" },
    { kind: "new-tag", name: "Interest income", confidence: "high" },
    { kind: "share", id: "sam", confidence: "high" },
    { kind: "settle", id: "sam", confidence: "high" },
    { kind: "payee", id: "priya", confidence: "high" },
    { kind: "event", id: "lake", confidence: "high" },
    { kind: "event", id: "book", confidence: "medium" },
  ];
  const { apply, hold } = splitForAutoApply(s, context);
  assert.deepEqual(apply.map((x) => x.kind + ":" + (x.id || x.name)), ["tag:groceries", "event:book"]);
  assert.equal(hold.length, 6);
  assert.equal(canApplyUnreviewed({ kind: "twin", id: "only", confidence: "high" }, context), true);
  assert.equal(canApplyUnreviewed({ kind: "twin", id: "only", confidence: "medium" }, context), false);
  assert.equal(canApplyUnreviewed({ kind: "twin", id: "other", confidence: "high" }, context), false);
  assert.equal(canApplyUnreviewed({ kind: "event", id: "book", confidence: "high" }), false, "without the context an event is assumed to carry a split");
  const move = splitForAutoApply([{ kind: "twin", id: "only", confidence: "high" }, { kind: "tag", id: "x", confidence: "high" }], context);
  assert.deepEqual(move.apply.map((x) => x.kind), ["twin"]);
});

test("a transfer twin is unique only when both sides have exactly one candidate", async () => {
  const { mutuallyUnique } = await load();
  const graph = { a: ["b"], b: ["a"], c: ["d"], d: ["c", "e"], e: ["d"], f: [] };
  const of = (id) => graph[id] || [];
  assert.equal(mutuallyUnique("a", of), true);
  assert.equal(mutuallyUnique("c", of), false);
  assert.equal(mutuallyUnique("d", of), false);
  assert.equal(mutuallyUnique("f", of), false);
});

test("the next row starts after the last one, even when it has left the list, and wraps", async () => {
  const { nextRow } = await load();
  const rows = [{ id: "r1", d: 9 }, { id: "r2", d: 7 }, { id: "r3", d: 5 }, { id: "r4", d: 3 }];
  const before = (a, b) => a.d > b.d;
  const all = () => true;
  assert.equal(nextRow(rows, { id: "r2", d: 7 }, all, before).id, "r3");
  assert.equal(nextRow(rows, { id: "gone", d: 6 }, all, before).id, "r3", "a row that left the list keeps its place");
  assert.equal(nextRow(rows, { id: "r4", d: 3 }, all, before).id, "r1", "wraps");
  assert.equal(nextRow(rows, { id: "gone", d: 1 }, all, before).id, "r1");
  assert.equal(nextRow(rows, null, (r) => r.id !== "r1", before).id, "r2");
  assert.equal(nextRow(rows, { id: "r2", d: 7 }, (r) => r.id === "r2", before), null, "never the row itself");
});

test("same again finds untouched rows with the same name and direction", async () => {
  const { sameUntouched } = await load();
  const rows = [{ id: 1, name: "GREEN", amount: -100, t: true }, { id: 2, name: "GREEN", amount: -90, t: true }, { id: 3, name: "GREEN", amount: 90, t: true }, { id: 4, name: "GREEN", amount: -80, t: false }, { id: 5, name: "OTHER", amount: -10, t: true }];
  assert.deepEqual(sameUntouched(rows, rows[0], { untouched: (r) => r.t }).map((r) => r.id), [2]);
});
