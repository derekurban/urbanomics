// The Claude bridge. One structured answer per request through the Anthropic API, with the person's own
// API key. Requests carry only the prompt and the JSON schema the answer must match: no tools, no files.
// The key is handed in by the caller for each request and is never logged or returned.
const Anthropic = require("@anthropic-ai/sdk");

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const validModel = (m) => typeof m === "string" && /^claude-[a-z0-9][a-z0-9.-]{0,60}$/.test(m);
const MAX_AT_ONCE = 32;
// Models that can hand a declined request to another model on Anthropic's side.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const hasFallback = (model) => /^claude-(fable-5|opus-5|sonnet-5-5)/.test(model);

/** What went wrong, in words the person can act on. The wording is matched by the Organize batch. */
function friendly(error) {
  if (error instanceof Anthropic.AuthenticationError) return "The Anthropic API key isn't valid. Check it under Settings, Assistant.";
  if (error instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model. Choose another under Settings, Assistant.";
  if (error instanceof Anthropic.NotFoundError) return "That model isn't available to this API key. Choose another under Settings, Assistant.";
  if (error instanceof Anthropic.RateLimitError) return "Claude is rate limited (429). It usually passes after a short wait.";
  if (error instanceof Anthropic.BadRequestError && /credit balance|billing/i.test(error.message)) return "Your Anthropic credit balance is too low. Add credits in the Anthropic Console, then try again.";
  if (error instanceof Anthropic.InternalServerError) return `Claude's service is busy (${error.status}). It usually passes after a short wait.`;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "Claude took too long to answer. Try a faster model or a lower reasoning level.";
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check the network connection, then try again.";
  if (error instanceof Anthropic.APIError) {
    const text = String(error.error?.error?.message || error.message || "").replace(/\s+/g, " ").trim();
    return text.length > 300 ? text.slice(0, 300) + "…" : text || "Claude couldn't answer.";
  }
  return error?.message || "Claude couldn't answer.";
}

function createClaude({ key = () => "", log = () => {}, client: makeClient = (apiKey) => new Anthropic({ apiKey, maxRetries: 2 }) } = {}) {
  let client = null, clientKey = "", models = null, modelsAt = 0, checked = null;
  let active = 0, limit = 16;
  const waiting = [];

  function connect() {
    const apiKey = key();
    if (!apiKey) throw new Error("Add your Anthropic API key first (Settings, Assistant).");
    if (apiKey !== clientKey) { client = makeClient(apiKey); clientKey = apiKey; models = null; checked = null; }
    return client;
  }
  /** Forget what was learned with the previous key. */
  function reset() { client = null; clientKey = ""; models = null; checked = null; }

  /** Whether the key works, checked by listing models (cached until the key changes or a refresh). */
  async function check(refresh = false) {
    if (!key()) return { ok: false, error: "" };
    if (checked && !refresh && key() === clientKey) return checked;
    try { await listModels(true); checked = { ok: true, error: "" }; }
    catch (error) { checked = { ok: false, error: error.message }; }
    return checked;
  }
  async function listModels(refresh = false) {
    const api = connect();
    if (models && !refresh && Date.now() - modelsAt < 10 * 60 * 1000) return models;
    const found = [];
    try {
      for await (const m of api.models.list({ limit: 100 })) {
        if (!validModel(m.id) || m.capabilities?.structured_outputs?.supported === false) continue;
        const effort = m.capabilities?.effort;
        found.push({ id: m.id, name: m.display_name || m.id, efforts: effort?.supported ? EFFORTS.filter((e) => effort[e]?.supported) : [] });
      }
    } catch (error) { throw new Error(friendly(error)); }
    models = found; modelsAt = Date.now();
    return models;
  }

  /* One structured answer. Requests beyond the limit (Organize's requests at once) wait their turn. */
  async function exec({ prompt, schema, model, effort, timeout = 4 * 60 * 1000 }) {
    if (!validModel(model)) throw new Error("Choose a model from the list.");
    if (effort && !EFFORTS.includes(effort)) throw new Error("Choose a reasoning level from the list.");
    const api = connect();
    while (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    active++;
    const started = Date.now();
    try {
      const request = {
        model, max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: { type: "json_schema", schema }, ...(effort ? { effort } : {}) },
      };
      let response;
      try {
        response = hasFallback(model)
          ? await api.beta.messages.create({ ...request, betas: [FALLBACK_BETA], fallbacks: "default" }, { timeout })
          : await api.messages.create(request, { timeout });
      } catch (error) {
        const detail = friendly(error);
        log("request-failed", { model, effort: effort || "", status: error?.status || null, detail });
        throw new Error(detail);
      }
      const ms = Date.now() - started, usage = response.usage || null;
      log("request", { model: response.model || model, effort: effort || "", ms, input: usage?.input_tokens ?? null, output: usage?.output_tokens ?? null });
      if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
      if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut short. Try fewer transactions per request.");
      const text = (response.content || []).filter((block) => block.type === "text").map((block) => block.text).join("");
      let value;
      try { value = JSON.parse(text); } catch { throw new Error("Claude answered in a form the app couldn't read. Try again."); }
      return { value, usage, ms, model, effort: effort || null };
    } finally {
      active--;
      waiting.shift()?.();
    }
  }
  const setConcurrency = (n) => { limit = Math.max(1, Math.min(MAX_AT_ONCE, Math.round(Number(n) || 16))); while (active < limit && waiting.length) { waiting.shift()(); } };
  return { setConcurrency, check, listModels, exec, reset, dispose: reset };
}
module.exports = { createClaude, friendly, EFFORTS, MAX_AT_ONCE, validModel };
