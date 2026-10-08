// Codex features over the workspace: settings (consent, smart organizing, a model and reasoning level per
// feature, kept privately in the workspace's settings table) and the four suggestion runs. Runs only read
// the workspace; nothing is written until the person approves a suggestion in the app, which then saves it
// through the usual versioned APIs.
const { createHash } = require("node:crypto");
const prompts = require("./prompts.mjs");
const { EFFORTS } = require("./codex.cjs");

const FEATURES = ["tags", "restructure", "aliases", "organize"];
const DEFAULTS = { consent: false, smartOrganize: false, autoApply: false, organizeSlots: 4, organizeBatch: 5, features: Object.fromEntries(FEATURES.map((f) => [f, { model: "", effort: "" }])) };

function createAssistant({ store, codex }) {
  function settings() {
    let saved = {};
    try { saved = JSON.parse(store.db.prepare("SELECT value FROM settings WHERE key='assistant'").get()?.value || "{}"); } catch {}
    return {
      consent: saved.consent === true,
      smartOrganize: saved.smartOrganize === true,
      autoApply: saved.autoApply === true,
      organizeSlots: Number.isInteger(saved.organizeSlots) ? saved.organizeSlots : 4,
      organizeBatch: Number.isInteger(saved.organizeBatch) ? saved.organizeBatch : 5,
      features: Object.fromEntries(FEATURES.map((f) => [f, { model: saved.features?.[f]?.model || "", effort: saved.features?.[f]?.effort || "" }])),
    };
  }
  function saveSettings(values) {
    if (!values || typeof values !== "object") throw new Error("Choose settings to save.");
    const current = settings(), next = { ...current };
    if (values.consent !== undefined) next.consent = values.consent === true;
    if (values.smartOrganize !== undefined) next.smartOrganize = values.smartOrganize === true;
    if (values.autoApply !== undefined) next.autoApply = values.autoApply === true;
    for (const [key, max] of [["organizeSlots", 8], ["organizeBatch", prompts.BATCH_SIZE]]) {
      if (values[key] === undefined) continue;
      if (!Number.isInteger(values[key]) || values[key] < 1 || values[key] > max) throw new Error(key === "organizeSlots" ? "Choose 1 to 8 runs at once." : `Choose 1 to ${max} transactions per run.`);
      next[key] = values[key];
    }
    if (values.features !== undefined) {
      next.features = { ...current.features };
      for (const [feature, choice] of Object.entries(values.features || {})) {
        if (!FEATURES.includes(feature) || !choice || typeof choice !== "object") throw new Error("Unknown Codex feature.");
        const model = typeof choice.model === "string" ? choice.model : "", effort = typeof choice.effort === "string" ? choice.effort : "";
        if (model && !/^[A-Za-z0-9][\w.:-]{0,79}$/.test(model)) throw new Error("Choose a model from the list.");
        if (effort && !EFFORTS.includes(effort)) throw new Error("Choose a reasoning level from the list.");
        next.features[feature] = { model, effort };
      }
    }
    store.db.prepare("INSERT INTO settings (key,value) VALUES ('assistant',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(next));
    codex.setConcurrency?.(next.organizeSlots);
    return next;
  }
  codex.setConcurrency?.(settings().organizeSlots);
  async function state(refresh = false) {
    return { settings: settings(), codex: await codex.status({ refresh: refresh === true }) };
  }
  function ready() {
    const s = settings();
    if (!s.consent) throw new Error("Allow Codex to read your transactions first, under Settings, Codex.");
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
    const result = await codex.exec({ prompt, schema, model: choice.model || undefined, effort: choice.effort || undefined });
    return { value: result.value, run: { model: choice.model || "", effort: choice.effort || "", ms: result.ms, tokens: result.usage ? (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0) : null } };
  }

  async function suggestTags(mode) {
    const { entities, records, ruleRefs } = workspace();
    if (mode === "restructure") {
      const { value, run } = await ask("restructure", prompts.restructurePrompt(entities, records, ruleRefs), prompts.restructureSchema);
      return { ...prompts.validateRestructure(value, entities, workspace().records, ruleRefs), run };
    }
    if (!records.length) throw new Error("Import some transactions first, so there is something to learn from.");
    const { value, run } = await ask("tags", prompts.missingTagsPrompt(entities, records), prompts.missingTagsSchema);
    // Validate against the workspace as it is now, in case it changed while Codex was thinking.
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
  async function suggestOrganize(context) {
    const ctx = prompts.cleanOrganizeContext(context), choice = ready().features.organize;
    const key = createHash("sha256").update(JSON.stringify([ctx, choice])).digest("hex");
    if (cache.has(key)) return { ...cache.get(key), cached: true };
    if (!inflight.has(key)) inflight.set(key, (async () => {
      try {
        const { value, run } = await ask("organize", prompts.organizePrompt(ctx), prompts.organizeSchema);
        const result = { ...prompts.validateOrganize(value, ctx), run, transactionId: ctx.transaction.id };
        cache.set(key, result);
        if (cache.size > 300) cache.delete(cache.keys().next().value);
        return result;
      } finally { inflight.delete(key); }
    })());
    return inflight.get(key);
  }
  /* Up to ten rows in one run. Rows already answered this session come from the cache; a row the model
     skipped comes back as missing so it can be asked again. */
  async function suggestOrganizeBatch(contexts) {
    const ctxs = prompts.cleanOrganizeBatch(contexts), choice = ready().features.organize;
    const keyOf = (ctx) => createHash("sha256").update(JSON.stringify([ctx, choice])).digest("hex");
    const fresh = ctxs.filter((ctx) => !cache.has(keyOf(ctx)));
    if (fresh.length) {
      const { value, run } = await ask("organize", prompts.organizeBatchPrompt(fresh), prompts.organizeBatchSchema);
      for (const ctx of fresh) {
        const answer = (value?.results || []).find((r) => r.transactionId === ctx.transaction.id);
        if (!answer) continue;
        cache.set(keyOf(ctx), { ...prompts.validateOrganize(answer, ctx), run: { ...run, batch: fresh.length }, transactionId: ctx.transaction.id });
        if (cache.size > 300) cache.delete(cache.keys().next().value);
      }
    }
    return ctxs.map((ctx) => cache.get(keyOf(ctx)) ? { ...cache.get(keyOf(ctx)), cached: !fresh.includes(ctx) } : { transactionId: ctx.transaction.id, missing: true });
  }
  async function test() {
    const choice = ready().features.organize;
    const result = await codex.exec({ prompt: "Reply with the word ready.", schema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false }, model: choice.model || undefined, effort: choice.effort || undefined, timeout: 90000 });
    return { reply: result.value.reply, ms: result.ms };
  }
  return { settings, saveSettings, state, suggestTags, suggestAliases, suggestOrganize, suggestOrganizeBatch, test, models: () => codex.listModels() };
}
module.exports = { createAssistant, FEATURES };
