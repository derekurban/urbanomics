// Codex features without calling Codex: what each feature accepts back from the model, the tag merge it
// can lead to, settings and consent, organize caching and how the CLI is found. Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { seedCodexDemo } = require("../../scripts/codex-demo-data.cjs");
const { createAssistant } = require("../../electron/ai/assistant.cjs");
const { locate } = require("../../electron/ai/codex.cjs");
const prompts = require("../../electron/ai/prompts.mjs");

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-codex-"));
  const store = new ImportStore(path.join(root, "workspace"), { now: () => new Date("2026-10-01T12:00:00Z") });
  const seeded = seedCodexDemo(store, root);
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { store, root, ...seeded };
}
const fakeCodex = (answers) => {
  const calls = [];
  return { calls, setConcurrency: () => {}, status: async () => ({ installed: true, signedIn: true }), listModels: async () => [], exec: async (request) => { calls.push(request); return { value: typeof answers === "function" ? answers(request) : answers, usage: { input_tokens: 10, output_tokens: 5 }, ms: 12 }; } };
};
const name = (store, id) => store.review.entities().find((e) => e.id === id)?.name;
const recordsOf = (store, re) => store.review.records().filter((r) => re.test(r.description));

test("missing tags keep only new names, real categories and vendors that fit the direction", (t) => {
  const { store, tags } = workspace(t);
  const entities = store.review.entities(), records = store.review.records();
  const food = entities.find((e) => e.kind === "bucket" && e.name === "Food").id;
  const result = prompts.validateMissingTags({ suggestions: [
    { name: "Coffee shops", flowType: "expense", categoryId: food, newCategory: "", reason: "Coffee.", vendors: ["MAPLE LEAF COFFEE #17", "PAYROLL NORTHWIND LTD", "NOT A VENDOR"] },
    { name: "groceries", flowType: "expense", categoryId: "", newCategory: "", reason: "Duplicate.", vendors: [] },
    { name: "Coffee Shops", flowType: "expense", categoryId: "", newCategory: "", reason: "Repeat.", vendors: [] },
    { name: "Pets", flowType: "expense", categoryId: "made-up", newCategory: "home", reason: "Existing category by name.", vendors: ["PETPAL SUPPLIES 38"] },
    { name: "Interest", flowType: "income", categoryId: food, newCategory: "Banking", reason: "Income has no category.", vendors: ["INTEREST PAID", "GREEN MARKET #0021"] },
  ] }, entities, records);
  assert.deepEqual(result.suggestions.map((s) => s.name), ["Coffee shops", "Pets", "Interest"]);
  const [coffee, pets, interest] = result.suggestions;
  assert.deepEqual(coffee.vendors.map((v) => v.name), ["MAPLE LEAF COFFEE #17"], "money-in and unknown names are dropped");
  assert.equal(coffee.categoryId, food);
  assert.equal(pets.categoryId, entities.find((e) => e.name === "Home").id, "a new category named like an existing one uses it");
  assert.equal(pets.newCategory, "");
  assert.equal(interest.categoryId, ""); assert.equal(interest.newCategory, "");
  assert.deepEqual(interest.vendors.map((v) => v.name), ["INTEREST PAID"]);
  assert.equal(interest.unsorted.length, 3);
  assert.ok(tags.groceries);
});

test("a restructure keeps one change per tag, safe merges and only categories the plan empties", (t) => {
  const { store, tags } = workspace(t);
  const entities = store.review.entities(), records = store.review.records(), food = entities.find((e) => e.name === "Food").id, transport = entities.find((e) => e.name === "Transport").id;
  const result = prompts.validateRestructure({ summary: "Plan.", changes: [
    { type: "create-category", id: "", into: "", category: "", name: "Treats", reason: "New." },
    { type: "create-category", id: "", into: "", category: "", name: "food", reason: "Exists." },
    { type: "move", id: tags.gas, into: "", category: transport, name: "", reason: "Move a tag that is merged away." },
    { type: "merge", id: tags.gas, into: tags.fuel, category: "", name: "", reason: "Same thing." },
    { type: "merge", id: tags.salary, into: tags.groceries, category: "", name: "", reason: "Different kinds." },
    { type: "move", id: tags.takeout, into: "", category: "Treats", name: "", reason: "Into the new category." },
    { type: "move", id: tags.paycheck, into: "", category: food, name: "", reason: "Income can't move." },
    { type: "rename", id: tags.hydro, into: "", category: "", name: "Rent", reason: "Clashes." },
    { type: "rename", id: food, into: "", category: "", name: "Food and dining", reason: "Clearer." },
    { type: "delete", id: transport, into: "", category: "", name: "", reason: "Still has Fuel." },
    { type: "delete", id: tags.fuel, into: "", category: "", name: "", reason: "It is a merge target." },
    { type: "delete", id: tags.groceries, into: "", category: "", name: "", reason: "Used." },
    { type: "delete", id: "system:other-expense", into: "", category: "", name: "", reason: "System." },
  ] }, entities, records);
  const summary = result.changes.map((c) => `${c.type}:${c.name}${c.newCategory ? "→" + c.newCategory : ""}`);
  assert.deepEqual(summary, ["create-category:Treats", "merge:Gas", "move:Takeout→Treats", "rename:Food and dining"]);
  assert.deepEqual(result.changes.find((c) => c.type === "move").needs, [result.changes[0].key], "a move into a new category needs it");
});

test("organize answers point only at offered candidates, and cents add up", () => {
  const ctx = prompts.cleanOrganizeContext({
    transaction: { id: "r1", name: "Shop", amountCents: -10000, currency: "CAD", date: "2026-09-01", account: "Card", unsortedCents: 10000, parts: [] },
    candidates: { tags: [{ id: "t1", name: "Groceries" }, { id: "t2", name: "Household" }], people: [{ id: "p1", name: "Sam", owesCents: 0 }], events: [{ id: "e1", name: "Trip", start: "2026-08-30", end: "2026-09-02" }], twins: [{ id: "x1", account: "Savings", date: "2026-09-01", amountCents: 10000, name: "TFR" }], categories: [{ id: "b1", name: "Home" }] },
    history: [],
  });
  const split = prompts.validateOrganize({ summary: "Split.", suggestions: [
    { kind: "tag", id: "t1", name: "", categoryId: "", cents: 6000, reason: "", confidence: "high" },
    { kind: "tag", id: "t2", name: "", categoryId: "", cents: 6000, reason: "", confidence: "medium" },
    { kind: "tag", id: "nope", name: "", categoryId: "", cents: 100, reason: "", confidence: "high" },
    { kind: "settle", id: "p1", name: "", categoryId: "", cents: 100, reason: "Money out can't settle.", confidence: "high" },
    { kind: "share", id: "p1", name: "", categoryId: "", cents: 0, reason: "", confidence: "low" },
    { kind: "event", id: "e1", name: "", categoryId: "", cents: 0, reason: "", confidence: "medium" },
    { kind: "event", id: "e1", name: "", categoryId: "", cents: 0, reason: "", confidence: "medium" },
    { kind: "new-tag", id: "", name: "Pets", categoryId: "b1", cents: 0, reason: "Dropped: a tag fits.", confidence: "low" },
  ] }, ctx);
  assert.deepEqual(split.suggestions.map((s) => [s.kind, s.id, s.cents]), [["tag", "t1", 5000], ["tag", "t2", 5000], ["share", "p1", 0], ["event", "e1", 0]]);
  const move = prompts.validateOrganize({ summary: "", suggestions: [{ kind: "tag", id: "t1", name: "", categoryId: "", cents: 1, reason: "", confidence: "high" }, { kind: "twin", id: "x1", name: "", categoryId: "", cents: 0, reason: "", confidence: "high" }, { kind: "event", id: "e1", name: "", categoryId: "", cents: 0, reason: "", confidence: "high" }] }, ctx);
  assert.deepEqual(move.suggestions.map((s) => s.kind), ["twin", "event"], "a move replaces tags");
  const fresh = prompts.validateOrganize({ summary: "", suggestions: [{ kind: "new-tag", id: "", name: "Pets", categoryId: "b1", cents: 0, reason: "", confidence: "high" }] }, ctx);
  assert.deepEqual(fresh.suggestions, [{ kind: "new-tag", id: "", name: "Pets", categoryId: "b1", cents: 10000, reason: "", confidence: "high" }]);
  const known = prompts.validateOrganize({ summary: "", suggestions: [{ kind: "new-tag", id: "", name: "groceries", categoryId: "", cents: 0, reason: "", confidence: "high" }] }, ctx);
  assert.deepEqual(known.suggestions.map((s) => [s.kind, s.id]), [["tag", "t1"]], "a new tag named like an existing one is that tag");
  const receipt = prompts.cleanOrganizeContext({ ...ctx, transaction: { ...ctx.transaction, amountCents: 5000, unsortedCents: 5000 }, candidates: { ...ctx.candidates, people: [{ id: "p1", name: "Sam", owesCents: 3000 }] } });
  const settled = prompts.validateOrganize({ summary: "", suggestions: [{ kind: "settle", id: "p1", name: "", categoryId: "", cents: 9000, reason: "", confidence: "high" }, { kind: "tag", id: "t1", name: "", categoryId: "", cents: 9000, reason: "", confidence: "high" }] }, receipt);
  assert.deepEqual(settled.suggestions.map((s) => [s.kind, s.cents]), [["settle", 3000], ["tag", 2000]], "settling is capped by the balance; tags take the rest");
  assert.throws(() => prompts.cleanOrganizeContext(null), /Choose a transaction/);
});

test("alias suggestions compile to the editor's patterns and keep only ones that match", () => {
  const seen = [];
  const preview = ({ name, pattern }) => { seen.push(pattern); return pattern === "^GREEN MARKET" ? { matches: [{ description: "GREEN MARKET #0021" }, { description: "GREEN MARKET #0021", deleted: true }], conflicts: [], duplicates: [] } : { matches: [], conflicts: [], duplicates: [] }; };
  const result = prompts.validateAliases({ suggestions: [
    { name: "Green Market", mode: "starts", text: "GREEN MARKET", reason: "Store numbers vary." },
    { name: "Nothing", mode: "contains", text: "ZZZ", reason: "Matches nothing." },
    { name: "Green market", mode: "exact", text: "GREEN MARKET #0021", reason: "Same name twice." },
  ] }, preview);
  assert.deepEqual(seen, ["^GREEN MARKET", "ZZZ"]);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].matches, 1, "archived rows don't count");
  assert.equal(prompts.compileAliasRule({ mode: "ends", text: "a.b" }), "a\\.b$");
});

test("merging tags moves portions and rules, deletes the source and keeps a recovery copy", (t) => {
  const { store, tags, root } = workspace(t);
  const bean = recordsOf(store, /BEAN COUNTER/).filter((r) => r.review.tags.some((p) => p.id === tags.diningOut));
  assert.ok(bean.length > 0);
  // A row with both tags sums into one portion.
  const both = recordsOf(store, /JUNIPER BISTRO/).find((r) => r.date.startsWith("2026-08"));
  store.review.organize([{ id: both.id, version: both.version, tags: [{ id: tags.restaurants, cents: 5000 }, { id: tags.diningOut, cents: Math.abs(both.amountCents) - 5000 }] }]);
  const rule = store.transactionRules.save({ name: "Coffee", matchType: "regex", pattern: "^SQ \\*BEAN", aliasIds: [], direction: "out", categoryId: tags.diningOut, personId: "", enabled: true });
  assert.throws(() => store.review.mergeTags(tags.diningOut, tags.paycheck), /expense tags into expense tags/);
  assert.throws(() => store.review.mergeTags(tags.diningOut, tags.diningOut), /two different tags/);
  const result = store.review.mergeTags(tags.diningOut, tags.restaurants);
  assert.equal(result.moved, bean.length + 1); assert.equal(result.rules, 1);
  assert.ok(fs.existsSync(result.backup) && result.backup.startsWith(path.join(root, "workspace", "backups", "admin")));
  assert.equal(name(store, tags.diningOut), undefined, "the source tag is gone");
  const after = store.review.records().find((r) => r.id === both.id);
  assert.deepEqual(after.review.tags, [{ id: tags.restaurants, cents: Math.abs(both.amountCents) }]);
  assert.equal(after.version, both.version + 2, "each rewrite is a new version");
  for (const r of bean) assert.deepEqual(store.review.records().find((x) => x.id === r.id).review.tags.map((p) => p.id), [tags.restaurants]);
  assert.equal(store.transactionRules.rules().find((r) => r.id === rule).categoryId, tags.restaurants);
});

test("settings, consent and the chosen model reach Codex; organize answers are reused", async (t) => {
  const { store, tags } = workspace(t);
  const codex = fakeCodex((request) => request.prompt.includes("Task: suggest how to organize") ? { summary: "Groceries.", suggestions: [{ kind: "tag", id: tags.groceries, name: "", categoryId: "", cents: 0, reason: "History.", confidence: "high" }] } : { suggestions: [] });
  const assistant = createAssistant({ store, codex });
  assert.deepEqual(assistant.settings(), { consent: false, smartOrganize: false, autoApply: false, organizeSlots: 4, organizeBatch: 5, features: { tags: { model: "", effort: "" }, restructure: { model: "", effort: "" }, aliases: { model: "", effort: "" }, organize: { model: "", effort: "" } } });
  await assert.rejects(assistant.suggestTags("missing"), /Allow Codex to read your transactions/);
  assert.throws(() => assistant.saveSettings({ features: { tags: { model: "bad model!", effort: "" } } }), /Choose a model/);
  assert.throws(() => assistant.saveSettings({ features: { tags: { model: "", effort: "extreme" } } }), /reasoning level/);
  assert.throws(() => assistant.saveSettings({ features: { other: { model: "", effort: "" } } }), /Unknown Codex feature/);
  assistant.saveSettings({ consent: true, features: { tags: { model: "gpt-6-luna", effort: "low" }, organize: { model: "gpt-6-luna", effort: "medium" } } });
  const missing = await assistant.suggestTags("missing");
  assert.deepEqual(missing.suggestions, []);
  assert.equal(codex.calls[0].model, "gpt-6-luna"); assert.equal(codex.calls[0].effort, "low");
  assert.ok(!codex.calls[0].prompt.includes("system:other"), "the Other fallback is not offered as a tag");
  const context = { transaction: { id: "r", name: "GREEN MARKET #0021", amountCents: -100, currency: "CAD", date: "2026-09-22", account: "Card", unsortedCents: 100, parts: [] }, candidates: { tags: [{ id: tags.groceries, name: "Groceries" }], people: [], events: [], twins: [], categories: [] }, history: [] };
  const first = await assistant.suggestOrganize(context), second = await assistant.suggestOrganize(context);
  assert.deepEqual(first.suggestions, [{ kind: "tag", id: tags.groceries, cents: 100, reason: "History.", confidence: "high" }]);
  assert.equal(second.cached, true); assert.equal(codex.calls.length, 2, "the same question is asked once");
  assert.equal(codex.calls[1].effort, "medium");
});

test("the CLI is found only where an explicit prefix says, through npm's layout", (t) => {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-codex-prefix-"));
  t.after(() => fs.rmSync(prefix, { recursive: true, force: true }));
  const env = { URBANOMICS_CODEX_PREFIX: prefix, PATH: process.env.PATH };
  assert.equal(locate(env), null, "an empty prefix has no Codex, even when PATH has one");
  const win = process.platform === "win32";
  const bin = win ? prefix : path.join(prefix, "bin"), pkg = win ? path.join(prefix, "node_modules", "@openai", "codex") : path.join(prefix, "lib", "node_modules", "@openai", "codex");
  const triple = { "win32-x64": "x86_64-pc-windows-msvc", "win32-arm64": "aarch64-pc-windows-msvc", "darwin-x64": "x86_64-apple-darwin", "darwin-arm64": "aarch64-apple-darwin", "linux-x64": "x86_64-unknown-linux-musl", "linux-arm64": "aarch64-unknown-linux-musl" }[`${process.platform}-${process.arch}`];
  const exe = path.join(pkg, "node_modules", "@openai", `codex-${process.platform}-${process.arch}`, "vendor", triple, "bin", win ? "codex.exe" : "codex");
  fs.mkdirSync(path.dirname(exe), { recursive: true }); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(exe, ""); fs.writeFileSync(path.join(bin, win ? "codex.cmd" : "codex"), "");
  const found = locate(env);
  assert.equal(found.path, exe, "the native binary, not the Node shim");
  assert.equal(found.packageRoot, fs.realpathSync(pkg));
});

test("a restructure from nothing creates categories and tags with the transactions they fit", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-codex-bare-"));
  const store = new ImportStore(path.join(root, "workspace"), { now: () => new Date("2026-10-01T12:00:00Z") });
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  seedCodexDemo(store, root, { bare: true });
  const entities = store.review.entities(), records = store.review.records();
  assert.match(prompts.restructurePrompt(entities, records), /little or no structure yet[\s\S]*GREEN MARKET #0021/, "the prompt asks for a starting structure and lists the transactions");
  const result = prompts.validateRestructure({ summary: "Start.", changes: [
    { type: "create-category", id: "", into: "", category: "", name: "Food", flowType: "", vendors: [], reason: "" },
    { type: "create-tag", id: "", into: "", category: "Food", name: "Groceries", flowType: "expense", vendors: ["GREEN MARKET #0021", "PAYROLL NORTHWIND LTD"], reason: "" },
    { type: "create-tag", id: "", into: "", category: "Nowhere", name: "Coffee", flowType: "expense", vendors: ["MAPLE LEAF COFFEE #17"], reason: "Unknown category: ungrouped." },
    { type: "create-tag", id: "", into: "", category: "Food", name: "Paycheck", flowType: "income", vendors: ["PAYROLL NORTHWIND LTD"], reason: "Income has no category." },
    { type: "create-tag", id: "", into: "", category: "", name: "groceries", flowType: "expense", vendors: [], reason: "Same name twice." },
  ] }, entities, records);
  assert.deepEqual(result.changes.map((c) => [c.type, c.name, c.newCategory || "", c.toCategory || ""]), [["create-category", "Food", "", ""], ["create-tag", "Groceries", "Food", "Food"], ["create-tag", "Coffee", "", ""], ["create-tag", "Paycheck", "", ""]]);
  const groceries = result.changes[1];
  assert.deepEqual(groceries.vendors.map((v) => v.name), ["GREEN MARKET #0021"], "money in is not an expense vendor");
  assert.equal(groceries.unsorted.length, 6); assert.deepEqual(groceries.needs, [result.changes[0].key]);
  assert.equal(result.changes[3].unsorted.length, 6);
});

test("ten rows go to Codex in one run; answers are checked per row and cached; skipped rows come back missing", async (t) => {
  const { store, tags } = workspace(t);
  const codex = fakeCodex((request) => {
    assert.match(request.prompt, /each of these 3 bank transactions/);
    return { results: [
      { transactionId: "a", summary: "Groceries.", suggestions: [{ kind: "tag", id: tags.groceries, name: "", categoryId: "", cents: 0, reason: "", confidence: "high" }] },
      { transactionId: "b", summary: "Wrong direction.", suggestions: [{ kind: "tag", id: tags.groceries, name: "", categoryId: "", cents: 0, reason: "", confidence: "high" }, { kind: "settle", id: "p", name: "", categoryId: "", cents: 900, reason: "", confidence: "high" }] },
    ] };
  });
  const assistant = createAssistant({ store, codex });
  assistant.saveSettings({ consent: true });
  const row = (id, amountCents, extra = {}) => ({ transaction: { id, name: id, amountCents, currency: "CAD", date: "2026-09-01", account: "Card", unsortedCents: Math.abs(amountCents), parts: [] }, candidates: { tags: amountCents < 0 ? [{ id: tags.groceries, name: "Groceries" }] : [{ id: tags.paycheck, name: "Paycheck" }], people: [{ id: "p", name: "Sam", owesCents: 500 }], events: [], twins: [], categories: [], ...extra }, history: [] });
  const answers = await assistant.suggestOrganizeBatch([row("a", -1000), row("b", 1000), row("c", -500)]);
  assert.deepEqual(answers[0].suggestions.map((s) => [s.kind, s.cents]), [["tag", 1000]]);
  assert.deepEqual(answers[1].suggestions.map((s) => [s.kind, s.cents]), [["settle", 500]], "an expense tag on money in is dropped; settling is capped at what is owed");
  assert.deepEqual(answers[2], { transactionId: "c", missing: true });
  const again = await assistant.suggestOrganizeBatch([row("a", -1000)]);
  assert.equal(again[0].cached, true); assert.equal(codex.calls.length, 1, "answered rows are not asked again");
  await assert.rejects(assistant.suggestOrganizeBatch(Array.from({ length: 11 }, (_, i) => row("r" + i, -100))), /between 1 and 10/);
  await assert.rejects(assistant.suggestOrganizeBatch([row("a", -1), row("a", -2)]), /its own id/);
  assert.deepEqual(assistant.saveSettings({ autoApply: true }).autoApply, true);
  assert.throws(() => assistant.saveSettings({ organizeSlots: 9 }), /1 to 8 runs/);
  assert.throws(() => assistant.saveSettings({ organizeBatch: 0 }), /1 to 10 transactions/);
  assert.equal(assistant.saveSettings({ organizeSlots: 6, organizeBatch: 3 }).organizeSlots, 6);
});
