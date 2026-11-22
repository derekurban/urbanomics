// Claude features without calling Claude: what each feature accepts back from the model, the tag merge it
// can lead to, settings and consent, the API key, organize caching and how a request is built. Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { seedAssistantDemo } = require("../../scripts/assistant-demo-data.cjs");
const { createAssistant } = require("../../electron/ai/assistant.cjs");
const { createClaude } = require("../../electron/ai/claude.cjs");
const prompts = require("../../electron/ai/prompts.mjs");

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-assistant-"));
  const store = new ImportStore(path.join(root, "workspace"), { now: () => new Date("2026-10-01T12:00:00Z") });
  const seeded = seedAssistantDemo(store, root);
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { store, root, ...seeded };
}
const fakeClaude = (answers) => {
  const calls = [];
  return { calls, setConcurrency: () => {}, reset: () => {}, check: async () => ({ ok: true, error: "" }), listModels: async () => [], exec: async (request) => { calls.push(request); return { value: typeof answers === "function" ? answers(request) : answers, usage: { input_tokens: 10, output_tokens: 5 }, ms: 12 }; } };
};
const savedKey = (store) => { const row = store.db.prepare("SELECT value FROM settings WHERE key='assistantKey'").get(); return row ? JSON.parse(row.value) : null; };
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

test("vendor suggestions keep matchers that match something and drop repeats", () => {
  const seen = [];
  const preview = ({ matchers }) => { seen.push(matchers.map((m) => m.mode + ":" + m.text).join("|")); return matchers.some((m) => m.text === "GREEN MARKET") ? { matches: [{ description: "GREEN MARKET #0021" }, { description: "GREEN MARKET #0021", deleted: true }], conflicts: [], duplicates: [] } : { matches: [], conflicts: [], duplicates: [] }; };
  const result = prompts.validateVendors({ suggestions: [
    { name: "Green Market", matchers: [{ mode: "starts", text: "GREEN MARKET" }, { mode: "contains", text: "GRN MKT" }], reason: "Store numbers vary." },
    { name: "Nothing", matchers: [{ mode: "contains", text: "ZZZ" }], reason: "Matches nothing." },
    { name: "Green market", matchers: [{ mode: "exact", text: "GREEN MARKET #0021" }], reason: "Same name twice." },
    { name: "Empty", matchers: [{ mode: "starts", text: " " }], reason: "No text." },
  ] }, preview);
  assert.deepEqual(seen, ["starts:GREEN MARKET|contains:GRN MKT", "contains:ZZZ"]);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].matchers.length, 2);
  assert.equal(result.suggestions[0].matches, 1, "archived rows don't count");
  assert.equal(prompts.compileAliasRule({ mode: "ends", text: "a.b" }), "a\\.b$");
});

test("merging tags moves portions and vendors, deletes the source and keeps a recovery copy", (t) => {
  const { store, tags, root } = workspace(t);
  const bean = recordsOf(store, /BEAN COUNTER/).filter((r) => r.review.tags.some((p) => p.id === tags.diningOut));
  assert.ok(bean.length > 0);
  // A row with both tags sums into one portion.
  const both = recordsOf(store, /JUNIPER BISTRO/).find((r) => r.date.startsWith("2026-08"));
  store.review.organize([{ id: both.id, version: both.version, tags: [{ id: tags.restaurants, cents: 5000 }, { id: tags.diningOut, cents: Math.abs(both.amountCents) - 5000 }] }]);
  const { id: vendor } = store.vendors.save({ name: "Bean Counter", matchers: [{ mode: "starts", text: "SQ *BEAN" }], tagId: tags.diningOut });
  assert.throws(() => store.review.mergeTags(tags.diningOut, tags.paycheck), /expense tags into expense tags/);
  assert.throws(() => store.review.mergeTags(tags.diningOut, tags.diningOut), /two different tags/);
  const result = store.review.mergeTags(tags.diningOut, tags.restaurants);
  assert.equal(result.moved, bean.length + 1); assert.equal(result.vendors, 1);
  assert.ok(fs.existsSync(result.backup) && result.backup.startsWith(path.join(root, "workspace", "backups", "admin")));
  assert.equal(name(store, tags.diningOut), undefined, "the source tag is gone");
  const after = store.review.records().find((r) => r.id === both.id);
  assert.deepEqual(after.review.tags, [{ id: tags.restaurants, cents: Math.abs(both.amountCents) }]);
  assert.equal(after.version, both.version + 2, "each rewrite is a new version");
  for (const r of bean) assert.deepEqual(store.review.records().find((x) => x.id === r.id).review.tags.map((p) => p.id), [tags.restaurants]);
  assert.equal(store.vendors.list().find((v) => v.id === vendor).tagId, tags.restaurants);
});

test("settings, consent and the chosen model reach Claude; organize answers are reused", async (t) => {
  const { store, tags } = workspace(t);
  const claude = fakeClaude((request) => request.prompt.includes("Task: suggest how to organize") ? { summary: "Groceries.", suggestions: [{ kind: "tag", id: tags.groceries, name: "", categoryId: "", cents: 0, reason: "History.", confidence: "high" }] } : { suggestions: [] });
  const assistant = createAssistant({ store, provider: claude, env: {} });
  assert.deepEqual(assistant.settings(), { consent: false, smartOrganize: false, autoApply: false, organizeSlots: 16, organizeBatch: 1, features: { tags: { model: "claude-opus-5-5", effort: "" }, restructure: { model: "claude-opus-5-5", effort: "" }, aliases: { model: "claude-opus-5-5", effort: "" }, organize: { model: "claude-haiku-5-5", effort: "medium" } } });
  await assert.rejects(assistant.suggestTags("missing"), /Allow Claude to read your transactions/);
  assert.throws(() => assistant.saveSettings({ features: { tags: { model: "bad model!", effort: "" } } }), /Choose a model/);
  assert.throws(() => assistant.saveSettings({ features: { tags: { model: "claude-opus-5-5", effort: "extreme" } } }), /reasoning level/);
  assert.throws(() => assistant.saveSettings({ features: { other: { model: "", effort: "" } } }), /Unknown assistant feature/);
  assistant.saveSettings({ consent: true, features: { tags: { model: "claude-sonnet-5-5", effort: "low" } } });
  const missing = await assistant.suggestTags("missing");
  assert.deepEqual(missing.suggestions, []);
  assert.equal(claude.calls[0].model, "claude-sonnet-5-5"); assert.equal(claude.calls[0].effort, "low");
  assert.ok(!claude.calls[0].prompt.includes("system:other"), "the Other fallback is not offered as a tag");
  const context = { transaction: { id: "r", name: "GREEN MARKET #0021", amountCents: -100, currency: "CAD", date: "2026-09-22", account: "Card", unsortedCents: 100, parts: [] }, candidates: { tags: [{ id: tags.groceries, name: "Groceries" }], people: [], events: [], twins: [], categories: [] }, history: [] };
  const first = await assistant.suggestOrganize(context), second = await assistant.suggestOrganize(context);
  assert.deepEqual(first.suggestions, [{ kind: "tag", id: tags.groceries, cents: 100, reason: "History.", confidence: "high" }]);
  assert.equal(second.cached, true); assert.equal(claude.calls.length, 2, "the same question is asked once");
  assert.equal(claude.calls[1].model, "claude-haiku-5-5"); assert.equal(claude.calls[1].effort, "medium");
  // A choice saved for another provider's model falls back to the default; other settings are kept.
  store.db.prepare("UPDATE settings SET value=? WHERE key='assistant'").run(JSON.stringify({ consent: true, organizeSlots: 4, features: { organize: { model: "gpt-6-luna", effort: "minimal" } } }));
  assert.deepEqual(assistant.settings().features.organize, { model: "claude-haiku-5-5", effort: "medium" });
  assert.equal(assistant.settings().organizeSlots, 4);
});

test("the API key is checked before it is kept, stored only encrypted, and never returned", async (t) => {
  const { store } = workspace(t);
  const valid = { ok: true, error: "" }, invalid = { ok: false, error: "The Anthropic API key isn't valid. Check it under Settings, Assistant." };
  const provider = ({ key }) => ({ ...fakeClaude({}), check: async () => (["good-key-1234", "env-key-9876"].includes(key()) ? valid : invalid) });
  const secrets = { encrypt: (text) => Buffer.from("sealed:" + text).toString("base64"), decrypt: (cipher) => Buffer.from(cipher, "base64").toString().replace(/^sealed:/, "") };
  const assistant = createAssistant({ store, provider, secrets, env: {} });
  assert.deepEqual((await assistant.state()).claude, { key: { present: false, source: "", hint: "", canSave: true }, ok: false, error: "" });
  await assert.rejects(assistant.saveKey("bad-key"), /isn't valid/);
  assert.equal(savedKey(store), null, "a refused key is not stored");
  assert.equal((await assistant.state()).claude.key.present, false, "and is not kept for the session either");
  await assert.rejects(assistant.saveKey("  "), /Paste the API key/);
  assert.deepEqual(await assistant.saveKey(" good-key-1234 "), { present: true, source: "saved", hint: "1234", canSave: true });
  assert.ok(!JSON.stringify(savedKey(store)).includes("good-key-1234"), "the settings row holds only the encrypted key");
  const state = await assistant.state();
  assert.ok(!JSON.stringify(state).includes("good-key"), "state carries a hint, never the key");
  assert.equal(state.claude.ok, true);
  // A new session reads it back. A host that can't decrypt ignores the row and falls back to the environment.
  assert.equal((await createAssistant({ store, provider, secrets, env: {} }).state()).claude.key.source, "saved");
  assert.deepEqual((await createAssistant({ store, provider, env: { ANTHROPIC_API_KEY: "env-key-9876" } }).state()).claude, { key: { present: true, source: "environment", hint: "9876", canSave: false }, ok: true, error: "" });
  // Without encryption a key lasts for the session and is never written.
  const session = createAssistant({ store: workspace(t).store, provider, env: {} });
  assert.deepEqual(await session.saveKey("good-key-1234"), { present: true, source: "session", hint: "1234", canSave: false });
  assert.deepEqual(assistant.clearKey(), { present: false, source: "", hint: "", canSave: true });
  assert.equal(savedKey(store), null);
});

test("a request asks for the schema's JSON, reads the answer, and words failures plainly", async () => {
  const Anthropic = require("@anthropic-ai/sdk");
  const sent = [];
  const reply = (text, extra = {}) => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text }], usage: { input_tokens: 40, output_tokens: 9 }, ...extra });
  let next = () => reply('{"reply":"ready"}');
  const listed = [
    { id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5", capabilities: { structured_outputs: { supported: true }, effort: { supported: true, low: { supported: true }, medium: { supported: true }, ultra: { supported: true } } } },
    { id: "claude-old-1", display_name: "Old", capabilities: { structured_outputs: { supported: false } } },
  ];
  const api = {
    messages: { create: async (request, options) => { sent.push({ request, options, beta: false }); return next(); } },
    beta: { messages: { create: async (request, options) => { sent.push({ request, options, beta: true }); return next(); } } },
    models: { list: () => ({ async *[Symbol.asyncIterator]() { yield* listed; } }) },
  };
  let key = "";
  const logged = [], claude = createClaude({ key: () => key, client: () => api, log: (status, details) => logged.push([status, details]) });
  const schema = { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false };
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5" }), /Add your Anthropic API key/);
  key = "test-key";
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "gpt-6-luna" }), /Choose a model/);
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5", effort: "ultra" }), /reasoning level/);
  const result = await claude.exec({ prompt: "Reply with the word ready.", schema, model: "claude-haiku-5-5", effort: "medium" });
  assert.deepEqual(result.value, { reply: "ready" });
  assert.deepEqual(sent[0].request, { model: "claude-haiku-5-5", max_tokens: 16000, messages: [{ role: "user", content: "Reply with the word ready." }], output_config: { format: { type: "json_schema", schema }, effort: "medium" } });
  assert.equal(sent[0].beta, false);
  await claude.exec({ prompt: "p", schema, model: "claude-opus-5-5" });
  assert.equal(sent[1].beta, true, "models that support it hand a declined request to a fallback");
  assert.equal(sent[1].request.fallbacks, "default"); assert.equal(sent[1].request.output_config.effort, undefined);
  assert.deepEqual(await claude.listModels(), [{ id: "claude-haiku-5-5", name: "Claude Haiku 5.5", efforts: ["low", "medium"] }]);
  assert.deepEqual(await claude.check(), { ok: true, error: "" });
  next = () => reply("", { stop_reason: "refusal" });
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5" }), /declined/);
  next = () => reply("not json");
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5" }), /couldn't read/);
  const failure = (Type, status, message) => () => { throw new Type(status, { type: "error", error: { type: "x", message } }, message, new Headers()); };
  next = failure(Anthropic.AuthenticationError, 401, "invalid x-api-key");
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5" }), /API key isn't valid/);
  next = failure(Anthropic.RateLimitError, 429, "slow down");
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5" }), /rate limited \(429\)/);
  next = failure(Anthropic.InternalServerError, 529, "overloaded");
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5" }), /service is busy \(529\)/);
  next = failure(Anthropic.BadRequestError, 400, "Your credit balance is too low to access the Anthropic API.");
  await assert.rejects(claude.exec({ prompt: "p", schema, model: "claude-haiku-5-5" }), /credit balance is too low/);
  assert.ok(!JSON.stringify(logged).includes("test-key") && !JSON.stringify(logged).includes("Reply with the word"), "the log never holds the key or the prompt");
  assert.ok(logged.some(([status]) => status === "request") && logged.some(([status]) => status === "request-failed"));
});

test("a restructure from nothing creates categories and tags with the transactions they fit", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-assistant-bare-"));
  const store = new ImportStore(path.join(root, "workspace"), { now: () => new Date("2026-10-01T12:00:00Z") });
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  seedAssistantDemo(store, root, { bare: true });
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

test("ten rows go to Claude in one request; answers are checked per row and cached; skipped rows come back missing", async (t) => {
  const { store, tags } = workspace(t);
  const claude = fakeClaude((request) => {
    assert.match(request.prompt, /each of these 3 bank transactions/);
    return { results: [
      { transactionId: "a", summary: "Groceries.", suggestions: [{ kind: "tag", id: tags.groceries, name: "", categoryId: "", cents: 0, reason: "", confidence: "high" }] },
      { transactionId: "b", summary: "Wrong direction.", suggestions: [{ kind: "tag", id: tags.groceries, name: "", categoryId: "", cents: 0, reason: "", confidence: "high" }, { kind: "settle", id: "p", name: "", categoryId: "", cents: 900, reason: "", confidence: "high" }] },
    ] };
  });
  const assistant = createAssistant({ store, provider: claude, env: {} });
  assistant.saveSettings({ consent: true });
  const row = (id, amountCents, extra = {}) => ({ transaction: { id, name: id, amountCents, currency: "CAD", date: "2026-09-01", account: "Card", unsortedCents: Math.abs(amountCents), parts: [] }, candidates: { tags: amountCents < 0 ? [{ id: tags.groceries, name: "Groceries" }] : [{ id: tags.paycheck, name: "Paycheck" }], people: [{ id: "p", name: "Sam", owesCents: 500 }], events: [], twins: [], categories: [], ...extra }, history: [] });
  const answers = await assistant.suggestOrganizeBatch([row("a", -1000), row("b", 1000), row("c", -500)]);
  assert.deepEqual(answers[0].suggestions.map((s) => [s.kind, s.cents]), [["tag", 1000]]);
  assert.deepEqual(answers[1].suggestions.map((s) => [s.kind, s.cents]), [["settle", 500]], "an expense tag on money in is dropped; settling is capped at what is owed");
  assert.deepEqual(answers[2], { transactionId: "c", missing: true });
  const again = await assistant.suggestOrganizeBatch([row("a", -1000)]);
  assert.equal(again[0].cached, true); assert.equal(claude.calls.length, 1, "answered rows are not asked again");
  await assert.rejects(assistant.suggestOrganizeBatch(Array.from({ length: 11 }, (_, i) => row("r" + i, -100))), /between 1 and 10/);
  await assert.rejects(assistant.suggestOrganizeBatch([row("a", -1), row("a", -2)]), /its own id/);
  assert.deepEqual(assistant.saveSettings({ autoApply: true }).autoApply, true);
  assert.throws(() => assistant.saveSettings({ organizeSlots: 33 }), /1 to 32 requests/);
  assert.throws(() => assistant.saveSettings({ organizeBatch: 0 }), /1 to 10 transactions/);
  assert.equal(assistant.saveSettings({ organizeSlots: 24, organizeBatch: 3 }).organizeSlots, 24);
  // One row alone is asked on its own, with the single-transaction prompt.
  const single = fakeClaude((request) => { assert.match(request.prompt, /organize one bank transaction/); return { summary: "", suggestions: [] }; });
  const alone = createAssistant({ store, provider: single, env: {} });
  assert.deepEqual((await alone.suggestOrganizeBatch([row("z", -700)])).map((a) => [a.transactionId, a.suggestions.length]), [["z", 0]]);
});

test("requests run up to the chosen number at once, never more than 32", async () => {
  let running = 0, peak = 0;
  const api = { messages: { create: async () => { running++; peak = Math.max(peak, running); await new Promise((resolve) => setTimeout(resolve, 15)); running--; return { stop_reason: "end_turn", content: [{ type: "text", text: "{}" }], usage: { input_tokens: 1, output_tokens: 1 } }; } } };
  const claude = createClaude({ key: () => "test-key", client: () => api });
  const burst = () => Promise.all(Array.from({ length: 80 }, () => claude.exec({ prompt: "p", schema: { type: "object" }, model: "claude-haiku-5-5" })));
  await burst(); assert.equal(peak, 16, "sixteen at once by default");
  peak = 0; claude.setConcurrency(4); await burst(); assert.equal(peak, 4);
  peak = 0; claude.setConcurrency(100); await burst(); assert.equal(peak, 32, "the setting is capped");
});
