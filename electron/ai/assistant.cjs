// Claude features over the workspace: the API key, settings (consent, smart organizing, a model and
// reasoning level per feature, kept privately in the workspace's settings table) and the four suggestion
// runs. Runs only read the workspace; nothing is written until the person approves a suggestion in the app,
// which then saves it through the usual versioned APIs.
const { createHash } = require("node:crypto");
const prompts = require("./prompts.mjs");
const { createClaude, EFFORTS, MAX_AT_ONCE, validModel } = require("./claude.cjs");

const FEATURES = ["tags", "restructure", "aliases", "organize"];
// Organize runs once per transaction, so it takes the fast model that held up in the benchmark
// (docs/assistant.md); the three one-off reviews take the most capable everyday model.
const DEFAULT_CHOICE = {
  tags: { model: "claude-opus-5-5", effort: "" },
  restructure: { model: "claude-opus-5-5", effort: "" },
  aliases: { model: "claude-opus-5-5", effort: "" },
  organize: { model: "claude-haiku-5-5", effort: "medium" },
};
const DEFAULT_SLOTS = 16, DEFAULT_BATCH = 1;

/**
 * secrets: { encrypt(text) -> string, decrypt(string) -> text } when the host can keep the key encrypted
 * (the desktop app, through the operating system). Without it a key lasts only until the app closes.
 */
function createAssistant({ store, provider, secrets = null, env = process.env, log = () => {} }) {
  const read = (key) => { try { return JSON.parse(store.db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value || "null"); } catch { return null; } };
  const write = (key, value) => store.db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));

  /* The API key: saved encrypted when the host can, otherwise held for the session; the environment's
     ANTHROPIC_API_KEY is the fallback. It never leaves this module except to the provider. */
  let held = "", heldFrom = "", loaded = false;
  function currentKey() {
    if (!loaded) {
      loaded = true;
      const saved = read("assistantKey");
      if (saved?.cipher && secrets) { try { held = secrets.decrypt(saved.cipher); heldFrom = "saved"; } catch { held = ""; } }
    }
    if (held) return held;
    return typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
  }
  // provider: a ready bridge, or a function that builds one around the key (tests); the real one by default.
  const claude = typeof provider === "function" ? provider({ key: currentKey, log }) : provider || createClaude({ key: currentKey, log });
  function keyInfo() {
    const key = currentKey();
    return { present: !!key, source: !key ? "" : held ? heldFrom : "environment", hint: key ? key.slice(-4) : "", canSave: !!secrets };
  }
  async function saveKey(value) {
    const key = typeof value === "string" ? value.trim() : "";
    if (!key || key.length > 400 || !/^[\x21-\x7e]+$/.test(key)) throw new Error("Paste the API key exactly as the Anthropic Console shows it.");
    currentKey();
    const before = [held, heldFrom];
    held = key; heldFrom = secrets ? "saved" : "session";
    claude.reset?.();
    const result = await claude.check(true);
    if (!result.ok) { [held, heldFrom] = before; claude.reset?.(); throw new Error(result.error || "Anthropic didn't accept that key."); }
    if (secrets) write("assistantKey", { cipher: secrets.encrypt(key) });
    return keyInfo();
  }
  function clearKey() {
    store.db.prepare("DELETE FROM settings WHERE key='assistantKey'").run();
    held = ""; heldFrom = ""; loaded = true;
    claude.reset?.();
    return keyInfo();
  }

  function settings() {
    const saved = read("assistant") || {};
    const slots = saved.organizeSlots, batch = saved.organizeBatch;
    return {
      consent: saved.consent === true,
      smartOrganize: saved.smartOrganize === true,
      autoApply: saved.autoApply === true,
      organizeSlots: Number.isInteger(slots) && slots >= 1 && slots <= MAX_AT_ONCE ? slots : DEFAULT_SLOTS,
      organizeBatch: Number.isInteger(batch) && batch >= 1 && batch <= prompts.BATCH_SIZE ? batch : DEFAULT_BATCH,
      // A choice saved for another provider's model falls back to the default.
      features: Object.fromEntries(FEATURES.map((f) => {
        const choice = saved.features?.[f], model = validModel(choice?.model) ? choice.model : DEFAULT_CHOICE[f].model;
        const effort = validModel(choice?.model) ? (EFFORTS.includes(choice.effort) ? choice.effort : "") : DEFAULT_CHOICE[f].effort;
        return [f, { model, effort }];
      })),
    };
  }
  function saveSettings(values) {
    if (!values || typeof values !== "object") throw new Error("Choose settings to save.");
    const current = settings(), next = { ...current };
    if (values.consent !== undefined) next.consent = values.consent === true;
    if (values.smartOrganize !== undefined) next.smartOrganize = values.smartOrganize === true;
    if (values.autoApply !== undefined) next.autoApply = values.autoApply === true;
    for (const [key, max] of [["organizeSlots", MAX_AT_ONCE], ["organizeBatch", prompts.BATCH_SIZE]]) {
      if (values[key] === undefined) continue;
      if (!Number.isInteger(values[key]) || values[key] < 1 || values[key] > max) throw new Error(key === "organizeSlots" ? `Choose 1 to ${MAX_AT_ONCE} requests at once.` : `Choose 1 to ${max} transactions per request.`);
      next[key] = values[key];
    }
    if (values.features !== undefined) {
      next.features = { ...current.features };
      for (const [feature, choice] of Object.entries(values.features || {})) {
        if (!FEATURES.includes(feature) || !choice || typeof choice !== "object") throw new Error("Unknown assistant feature.");
        const model = typeof choice.model === "string" && choice.model ? choice.model : DEFAULT_CHOICE[feature].model, effort = typeof choice.effort === "string" ? choice.effort : "";
        if (!validModel(model)) throw new Error("Choose a model from the list.");
        if (effort && !EFFORTS.includes(effort)) throw new Error("Choose a reasoning level from the list.");
        next.features[feature] = { model, effort };
      }
    }
    write("assistant", next);
    claude.setConcurrency?.(next.organizeSlots);
    return next;
  }
  claude.setConcurrency?.(settings().organizeSlots);
  async function state(refresh = false) {
    const key = keyInfo(), checked = key.present ? await claude.check(refresh === true) : { ok: false, error: "" };
    return { settings: settings(), claude: { key, ok: key.present && checked.ok, error: key.present && !checked.ok ? checked.error : "" }, defaults: DEFAULT_CHOICE };
  }
  function ready() {
    const s = settings();
    if (!s.consent) throw new Error("Allow Claude to read your transactions first, under Settings, Assistant.");
    return s;
  }
  /* The workspace as the prompts see it: active rows with only real tags (the Other fallback is not a choice). */
  function workspace() {
    const entities = store.review.entities(), known = new Set(entities.filter((e) => e.kind === "category" && !e.systemRole).map((e) => e.id));
    const records = store.review.records().filter((r) => !r.deleted).map((r) => ({ ...r, review: { ...r.review, tags: (r.review.tags || []).filter((p) => known.has(p.id)) } }));
    const ruleRefs = new Map();
    for (const rule of store.transactionRules?.rules() || [])
      for (const id of new Set([rule.categoryId, ...(rule.template?.tags || []).map((p) => p.id)].filter(Boolean))) ruleRefs.set(id, (ruleRefs.get(id) || 0) + 1);
    return { entities, records, ruleRefs };
  }
  async function ask(feature, prompt, schema) {
    const choice = ready().features[feature];
    const result = await claude.exec({ prompt, schema, model: choice.model, effort: choice.effort || undefined });
    return { value: result.value, run: { model: choice.model, effort: choice.effort || "", ms: result.ms, tokens: result.usage ? (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0) : null } };
  }

  async function suggestTags(mode) {
    const { entities, records, ruleRefs } = workspace();
    if (mode === "restructure") {
      const { value, run } = await ask("restructure", prompts.restructurePrompt(entities, records, ruleRefs), prompts.restructureSchema);
      return { ...prompts.validateRestructure(value, entities, workspace().records, ruleRefs), run };
    }
    if (!records.length) throw new Error("Import some transactions first, so there is something to learn from.");
    const { value, run } = await ask("tags", prompts.missingTagsPrompt(entities, records), prompts.missingTagsSchema);
    // Validate against the workspace as it is now, in case it changed while Claude was thinking.
    const now = workspace();
    return { ...prompts.validateMissingTags(value, now.entities, now.records), run };
  }
  async function suggestAliases() {
    const current = store.aliases.state();
    if (!current.unaliased.filter((r) => !r.deleted).length) throw new Error("Every transaction already has an alias.");
    const { value, run } = await ask("aliases", prompts.aliasPrompt(current.unaliased, current.rules), prompts.aliasSchema);
    return { ...prompts.validateAliases(value, (values) => store.aliases.preview(values)), run };
  }
  // Smart organizing answers are remembered for the session by what was asked, so reopening a row is instant.
  const cache = new Map(), inflight = new Map();
  const keyOf = (ctx, choice) => createHash("sha256").update(JSON.stringify([ctx, choice])).digest("hex");
  const remember = (key, result) => { cache.set(key, result); if (cache.size > 2000) cache.delete(cache.keys().next().value); };
  async function organizeOne(ctx, choice) {
    const key = keyOf(ctx, choice);
    if (cache.has(key)) return { ...cache.get(key), cached: true };
    if (!inflight.has(key)) inflight.set(key, (async () => {
      try {
        const { value, run } = await ask("organize", prompts.organizePrompt(ctx), prompts.organizeSchema);
        const result = { ...prompts.validateOrganize(value, ctx), run, transactionId: ctx.transaction.id };
        remember(key, result);
        return result;
      } finally { inflight.delete(key); }
    })());
    return inflight.get(key);
  }
  async function suggestOrganize(context) {
    return organizeOne(prompts.cleanOrganizeContext(context), ready().features.organize);
  }
  /* Up to ten rows in one request; one row alone is asked on its own, with its full history. Rows already
     answered this session come from the cache; a row the model skipped comes back as missing so it can be
     asked again. */
  async function suggestOrganizeBatch(contexts) {
    const choice = ready().features.organize;
    if (Array.isArray(contexts) && contexts.length === 1) return [await organizeOne(prompts.cleanOrganizeContext(contexts[0]), choice)];
    const ctxs = prompts.cleanOrganizeBatch(contexts);
    const fresh = ctxs.filter((ctx) => !cache.has(keyOf(ctx, choice)));
    if (fresh.length) {
      const { value, run } = await ask("organize", prompts.organizeBatchPrompt(fresh), prompts.organizeBatchSchema);
      for (const ctx of fresh) {
        const answer = (value?.results || []).find((r) => r.transactionId === ctx.transaction.id);
        if (!answer) continue;
        remember(keyOf(ctx, choice), { ...prompts.validateOrganize(answer, ctx), run: { ...run, batch: fresh.length }, transactionId: ctx.transaction.id });
      }
    }
    return ctxs.map((ctx) => cache.get(keyOf(ctx, choice)) ? { ...cache.get(keyOf(ctx, choice)), cached: !fresh.includes(ctx) } : { transactionId: ctx.transaction.id, missing: true });
  }
  async function test() {
    const choice = ready().features.organize;
    const result = await claude.exec({ prompt: "Reply with the word ready.", schema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false }, model: choice.model, effort: choice.effort || undefined, timeout: 90000 });
    return { reply: result.value.reply, ms: result.ms, model: choice.model };
  }
  return { settings, saveSettings, saveKey, clearKey, state, suggestTags, suggestAliases, suggestOrganize, suggestOrganizeBatch, test, models: () => claude.listModels(), dispose: () => claude.dispose?.() };
}
module.exports = { createAssistant, FEATURES, DEFAULT_CHOICE };
