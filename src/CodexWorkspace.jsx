// Settings → Codex: connect the Codex CLI (install it, sign in with ChatGPT), allow it to read the
// workspace when a feature runs, and choose the model and reasoning level for each feature.
import React, { useEffect, useState } from "react";
import { Icon, Switch } from "@derekurban/design-system";
import { Alert } from "./ui.jsx";
import { notify } from "./toast.jsx";
import { useCodex, saveCodexSettings, featureLabels, effortLabels, seconds } from "./codex.js";
import "./codex.css";

const api = window.urbanomics;

export function CodexWorkspace() {
  const { state, error: loadError, reload } = useCodex();
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [models, setModels] = useState(null), [modelError, setModelError] = useState("");
  const codex = state?.codex, settings = state?.settings;
  useEffect(() => { reload(true).catch(() => {}); }, []);
  // While a sign-in or an install is under way, follow it.
  useEffect(() => {
    if (!codex?.login.pending && !codex?.install.running && busy !== "install") return;
    const timer = setInterval(() => reload().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [codex?.login.pending, codex?.install.running, busy]);
  useEffect(() => {
    if (!codex?.signedIn) { setModels(null); return; }
    let live = true;
    api.codexModels().then((m) => { if (live) { setModels(m); setModelError(""); } }).catch((e) => { if (live) setModelError(e.message); });
    return () => { live = false; };
  }, [codex?.signedIn, codex?.account?.email]);

  async function act(name, fn) {
    setBusy(name); setError("");
    try { return await fn(); }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(""); await reload().catch(() => {}); }
  }
  const install = () => act("install", async () => { notify({ title: "Installing Codex", description: "npm is downloading it. This can take a minute.", tone: "info" }); await api.installCodex(); notify({ title: "Codex installed", tone: "success" }); });
  const signIn = () => act("login", async () => {
    const { authUrl, opened } = await api.signInCodex();
    if (!opened) window.open(authUrl, "_blank", "noopener");
  });
  const save = (values) => act("settings", () => saveCodexSettings(values));
  const choose = (feature, change) => save({ features: { [feature]: { ...settings.features[feature], ...change } } });
  const test = () => act("test", async () => { const r = await api.testCodex(); notify({ title: `Codex answered in ${seconds(r.ms)}`, tone: "success" }); });

  if (!state) return <section className="codex-workspace"><p role="status">{loadError || "Checking for Codex…"}</p></section>;
  const defaultModel = models?.find((m) => m.isDefault);
  return (
    <section className="codex-workspace">
      <div className="cx-block">
        <h2>Codex CLI</h2>
        {codex.installed ? (
          <div className="cx-status is-ok">
            <Icon name="circle-check" size={18} />
            <div><b>Codex {codex.version || ""} is installed.</b><small title={codex.path}>{codex.path}</small></div>
            <button className="sm" disabled={!!busy} onClick={() => act("check", () => reload(true))}>Check again</button>
          </div>
        ) : codex.install.running || busy === "install" ? (
          <div className="cx-status" role="status">
            <Icon name="loader-circle" size={18} className="cx-spin" />
            <div><b>Installing Codex…</b><small>{codex.install.log.at(-1) || "Starting npm"}</small></div>
          </div>
        ) : (
          <>
            <p>Urbanomics reaches your ChatGPT subscription through the Codex command-line tool. It isn't on this computer yet.</p>
            {codex.canInstall
              ? <button className="primary" disabled={!!busy} onClick={install}><Icon name="download" size={16} />Install Codex</button>
              : <Alert tone="info" title="Installing Codex needs Node.js.">Install Node.js from nodejs.org, then choose Check again. Codex installs with npm.</Alert>}
            {codex.canInstall && <p className="cx-note">Runs <code>npm install --global @openai/codex</code>. You can also install it yourself and choose Check again.</p>}
            {!codex.canInstall && <button className="sm" disabled={!!busy} onClick={() => act("check", () => reload(true))}>Check again</button>}
          </>
        )}
        {codex.install.error && <Alert title="Codex didn't install.">{codex.install.error}</Alert>}
      </div>

      {codex.installed && (
        <div className="cx-block">
          <h2>Account</h2>
          {codex.signedIn ? (
            <div className="cx-status is-ok">
              <Icon name="circle-check" size={18} />
              <div><b>Signed in with {codex.account.type === "chatgpt" ? "ChatGPT" : "an API key"}{codex.account.email ? ` as ${codex.account.email}` : ""}.</b>{codex.account.plan && <small>{codex.account.plan[0].toUpperCase() + codex.account.plan.slice(1)} plan. Suggestions use your subscription's Codex limits.</small>}</div>
              <button className="sm" disabled={!!busy} onClick={() => act("logout", () => api.signOutCodex())}><Icon name="log-out" size={16} />Sign out</button>
            </div>
          ) : codex.login.pending ? (
            <div className="cx-status" role="status">
              <Icon name="loader-circle" size={18} className="cx-spin" />
              <div><b>Finish signing in with ChatGPT in your browser.</b><small>This page updates when ChatGPT sends you back.</small></div>
              <button className="sm" onClick={() => window.open(codex.login.authUrl, "_blank", "noopener")}>Open the sign-in page</button>
              <button className="sm ghost" onClick={() => act("cancel", () => api.cancelCodexSignIn())}>Cancel</button>
            </div>
          ) : (
            <>
              <p>Sign in with the ChatGPT account whose subscription you want to use. Codex keeps the sign-in; Urbanomics never sees your password.</p>
              <button className="primary" disabled={!!busy} onClick={signIn}><Icon name="log-in" size={16} />Sign in with ChatGPT</button>
            </>
          )}
          {codex.login.error && !codex.login.pending && <Alert title="Sign-in didn't finish.">{codex.login.error}</Alert>}
          {codex.error && <Alert tone="warning" title="Codex didn't answer.">{codex.error}</Alert>}
        </div>
      )}

      <div className="cx-block">
        <h2>What Codex can read</h2>
        <label className="cx-consent">
          <input type="checkbox" checked={settings.consent} disabled={!!busy} onChange={(e) => save({ consent: e.target.checked })} />
          <span><b>Let Codex read my transactions when I ask for a suggestion</b>
            <small>Descriptions, amounts, dates, account names, tags, people and events go to OpenAI under your ChatGPT account, only while a feature runs. Codex can't change anything: each suggestion waits for you to approve it.</small></span>
        </label>
      </div>

      <div className="cx-block">
        <div className="cx-block-head"><h2>Features</h2>{codex.signedIn && settings.consent && <button className="sm" disabled={!!busy} onClick={test}>{busy === "test" ? "Asking Codex…" : "Try the connection"}</button>}</div>
        {modelError && <Alert tone="warning" title="Models couldn't be listed.">{modelError}</Alert>}
        <div className="cx-features">
          {Object.entries(featureLabels).map(([feature, [title, description]]) => {
            const choice = settings.features[feature], model = models?.find((m) => m.id === choice.model) || defaultModel;
            return (
              <article key={feature} className="cx-feature">
                <div className="cx-feature-text">
                  <h3>{title}</h3><small>{description}</small>
                  {feature === "organize" && (
                    <span className="du-host cx-switch">
                      <Switch label="Suggest when I open a transaction" checked={settings.smartOrganize} disabled={!!busy} onChange={(on) => save({ smartOrganize: on })} />
                      <span className="cx-slots">
                        <label className="cx-select"><span>Codex runs at once</span>
                          <select aria-label="Codex runs at once" value={settings.organizeSlots} disabled={!!busy} onChange={(e) => save({ organizeSlots: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                        </label>
                        <label className="cx-select"><span>Transactions per run</span>
                          <select aria-label="Transactions per run" value={settings.organizeBatch} disabled={!!busy} onChange={(e) => save({ organizeBatch: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                        </label>
                      </span>
                      <small>Organize all unsorted keeps this many Codex runs going, each with this many transactions; a run that finishes takes the next ones right away. More runs finish sooner but use your Codex limits faster.</small>
                      <Switch label="Apply suggestions automatically" description="Applies what Codex is sure about as soon as it arrives, for the row you open and for Organize all unsorted. Suggestions it is unsure about still wait for you, and every change can be undone." checked={settings.autoApply} disabled={!!busy} onChange={(on) => save({ autoApply: on })} />
                    </span>
                  )}
                </div>
                <label className="cx-select"><span>Model</span>
                  <select value={choice.model} disabled={!models || !!busy} aria-label={`Model for ${title}`} onChange={(e) => { const next = models.find((m) => m.id === e.target.value) || defaultModel; choose(feature, { model: e.target.value, effort: next?.efforts.some((x) => x.id === choice.effort) ? choice.effort : "" }); }}>
                    <option value="">{defaultModel ? `Default · ${defaultModel.name}` : "Codex default"}</option>
                    {(models || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    {choice.model && models && !models.some((m) => m.id === choice.model) && <option value={choice.model}>{choice.model} (unavailable)</option>}
                  </select>
                </label>
                <label className="cx-select"><span>Reasoning</span>
                  <select value={choice.effort} disabled={!models || !!busy} aria-label={`Reasoning for ${title}`} onChange={(e) => choose(feature, { effort: e.target.value })}>
                    <option value="">{model?.defaultEffort ? `Default · ${effortLabels[model.defaultEffort] || model.defaultEffort}` : "Model default"}</option>
                    {(model?.efforts || []).map((x) => <option key={x.id} value={x.id} title={x.description}>{effortLabels[x.id] || x.id}</option>)}
                  </select>
                </label>
              </article>
            );
          })}
        </div>
        <p className="cx-note">Faster models with less reasoning answer in seconds and suit Smart organizing; the restructure benefits from more reasoning. Choices are saved with this workspace.</p>
      </div>
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
    </section>
  );
}
