// Settings → Assistant: the Anthropic API key, consent to read the workspace when a feature runs, and the
// model and reasoning level for each feature.
import React, { useEffect, useState } from "react";
import { Icon, Switch } from "@derekurban/design-system";
import { Alert } from "./ui.jsx";
import { notify } from "./toast.jsx";
import { useAssistant, saveAssistantSettings, featureLabels, effortLabels, seconds, modelLabel } from "./assistant.js";
import "./assistant.css";

const api = window.urbanomics;
const AT_ONCE = [1, 2, 4, 8, 12, 16, 24, 32];

export function AssistantWorkspace() {
  const { state, error: loadError, reload } = useAssistant();
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [models, setModels] = useState(null), [modelError, setModelError] = useState("");
  const [entering, setEntering] = useState(false), [draft, setDraft] = useState("");
  const claude = state?.claude, settings = state?.settings, key = claude?.key;
  useEffect(() => { reload(true).catch(() => {}); }, []);
  useEffect(() => {
    if (!claude?.ok) { setModels(null); return; }
    let live = true;
    api.assistantModels().then((m) => { if (live) { setModels(m); setModelError(""); } }).catch((e) => { if (live) setModelError(e.message); });
    return () => { live = false; };
  }, [claude?.ok, key?.hint]);

  async function act(name, fn) {
    setBusy(name); setError("");
    try { return await fn(); }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(""); await reload().catch(() => {}); }
  }
  const saveKey = (event) => {
    event.preventDefault();
    return act("key", async () => { await api.saveAssistantKey(draft); setDraft(""); setEntering(false); notify({ title: "API key saved", tone: "success" }); });
  };
  const removeKey = () => act("remove", async () => { await api.clearAssistantKey(); notify({ title: "API key removed", tone: "success" }); });
  const save = (values) => act("settings", () => saveAssistantSettings(values));
  const choose = (feature, change) => save({ features: { [feature]: { ...settings.features[feature], ...change } } });
  const test = () => act("test", async () => { const r = await api.testAssistant(); notify({ title: `${modelLabel(r.model)} answered in ${seconds(r.ms)}`, tone: "success" }); });

  if (!state) return <section className="assistant-workspace"><p role="status">{loadError || "Checking the assistant…"}</p></section>;
  const showForm = !key.present || entering;
  const kept = key.source === "saved" ? "Kept encrypted on this computer." : key.source === "environment" ? "Read from ANTHROPIC_API_KEY on this computer." : "Kept until this app closes.";
  return (
    <section className="assistant-workspace">
      <div className="cx-block">
        <h2>Anthropic API key</h2>
        {key.present && claude.ok && (
          <div className="cx-status is-ok">
            <Icon name="circle-check" size={18} />
            <div><b>Connected to Claude.</b><small>Key ending in {key.hint}. {kept}</small></div>
            <button className="sm" disabled={!!busy} onClick={() => act("check", () => reload(true))}>Check again</button>
            {!entering && <button className="sm" disabled={!!busy} onClick={() => setEntering(true)}>Replace</button>}
            {key.source !== "environment" && <button className="sm" disabled={!!busy} onClick={removeKey}><Icon name="trash-2" size={16} />Remove</button>}
          </div>
        )}
        {key.present && !claude.ok && (
          <Alert tone="warning" title="Claude couldn't be reached with this key.">{claude.error || "Check the key, then try again."} <button className="sm" disabled={!!busy} onClick={() => act("check", () => reload(true))}>Check again</button></Alert>
        )}
        {!key.present && <p>Urbanomics reaches Claude with your own Anthropic API key. Create one at console.anthropic.com under API keys; suggestions are billed to that account, a fraction of a cent per transaction.</p>}
        {showForm && (
          <form className="cx-key" onSubmit={saveKey}>
            <label><span>{key.present ? "New API key" : "API key"}</span>
              <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={draft} disabled={busy === "key"} onChange={(e) => setDraft(e.target.value)} aria-label="Anthropic API key" />
            </label>
            <button className="primary" type="submit" disabled={!draft.trim() || !!busy}>{busy === "key" ? "Checking the key…" : "Save key"}</button>
            {entering && <button type="button" className="sm ghost" disabled={!!busy} onClick={() => { setEntering(false); setDraft(""); }}>Cancel</button>}
          </form>
        )}
        {showForm && <p className="cx-note">The key is checked with Anthropic before it is saved{key.canSave ? ", then kept encrypted by this computer's operating system" : ""}. It is never shown again, exported or sent anywhere else.</p>}
      </div>

      <div className="cx-block">
        <h2>What Claude can read</h2>
        <label className="cx-consent">
          <input type="checkbox" checked={settings.consent} disabled={!!busy} onChange={(e) => save({ consent: e.target.checked })} />
          <span><b>Let Claude read my transactions when I ask for a suggestion</b>
            <small>Descriptions, amounts, dates, account names, tags, people and events go to Anthropic under your API key, only while a feature runs. Claude can't change anything itself: the app applies a suggestion after you approve it, or as it arrives when Apply automatically is on.</small></span>
        </label>
      </div>

      <div className="cx-block">
        <div className="cx-block-head"><h2>Features</h2>{claude.ok && settings.consent && <button className="sm" disabled={!!busy} onClick={test}>{busy === "test" ? "Asking Claude…" : "Try the connection"}</button>}</div>
        {modelError && <Alert tone="warning" title="Models couldn't be listed.">{modelError}</Alert>}
        <div className="cx-features">
          {Object.entries(featureLabels).map(([feature, [title, description]]) => {
            const choice = settings.features[feature], model = models?.find((m) => m.id === choice.model);
            return (
              <article key={feature} className="cx-feature">
                <div className="cx-feature-text">
                  <h3>{title}</h3><small>{description}</small>
                  {feature === "organize" && (
                    <div className="cx-switch">
                      {/* Only the package Switches sit in a host; the native selects keep the app's control styles. */}
                      <span className="du-host"><Switch label="Suggest when I open a transaction" checked={settings.smartOrganize} disabled={!!busy} onChange={(on) => save({ smartOrganize: on })} /></span>
                      <span className="cx-slots">
                        <label className="cx-select"><span>Requests at once</span>
                          <select aria-label="Requests at once" value={settings.organizeSlots} disabled={!!busy} onChange={(e) => save({ organizeSlots: Number(e.target.value) })}>{[...new Set([...AT_ONCE, settings.organizeSlots])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}</select>
                        </label>
                        <label className="cx-select"><span>Transactions per request</span>
                          <select aria-label="Transactions per request" value={settings.organizeBatch} disabled={!!busy} onChange={(e) => save({ organizeBatch: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                        </label>
                      </span>
                      <small>Organize all unsorted keeps this many requests going and starts the next as each one answers. One transaction per request finds events and shared expenses most reliably; more per request costs a little less. If Anthropic limits your account's rate, the run slows itself down and carries on.</small>
                      <span className="du-host"><Switch label="Apply suggestions automatically" description="Adds tags you already have, links a transfer with one clear match and adds events without a split as soon as answers arrive, for the row you open and for Organize all unsorted. Shares, settlements, payments to people, new tags and anything Claude is unsure about wait for you, and every change can be undone." checked={settings.autoApply} disabled={!!busy} onChange={(on) => save({ autoApply: on })} /></span>
                    </div>
                  )}
                </div>
                <label className="cx-select"><span>Model</span>
                  <select value={choice.model} disabled={!models || !!busy} aria-label={`Model for ${title}`} onChange={(e) => { const next = models.find((m) => m.id === e.target.value); choose(feature, { model: e.target.value, effort: next?.efforts.includes(choice.effort) ? choice.effort : "" }); }}>
                    {!model && <option value={choice.model}>{modelLabel(choice.model)}{models ? " (unavailable)" : ""}</option>}
                    {(models || []).map((m) => <option key={m.id} value={m.id}>{m.name.replace(/^Claude /, "")}</option>)}
                  </select>
                </label>
                <label className="cx-select"><span>Reasoning</span>
                  <select value={choice.effort} disabled={!models || !!busy} aria-label={`Reasoning for ${title}`} onChange={(e) => choose(feature, { effort: e.target.value })}>
                    <option value="">Model default</option>
                    {(model?.efforts || (choice.effort ? [choice.effort] : [])).map((id) => <option key={id} value={id}>{effortLabels[id] || id}</option>)}
                  </select>
                </label>
              </article>
            );
          })}
        </div>
        <p className="cx-note">Smart organizing starts on Haiku 5.5 at medium reasoning: in testing it answered in about two seconds a transaction, made no confident mistakes, and cost well under a cent per ten transactions. Sonnet 5.5 at low reasoning is a little more accurate at roughly ten times the price. The one-off reviews use Opus 5.5.</p>
      </div>
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
    </section>
  );
}
