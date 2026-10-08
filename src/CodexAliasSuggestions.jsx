// Codex alias suggestions: a readable name and a plain recognition sentence for bank descriptions that
// are the same merchant. Each one is previewed with the alias editor's own check (what it would rename,
// whether it clashes with an alias you have) and saved only when approved.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Alert } from "./ui.jsx";
import { notify } from "./toast.jsx";
import { plural } from "./format.js";
import { compileTextRule, ruleModes } from "./import-analysis.mjs";
import { Thinking, RunNote } from "./CodexTagSuggestions.jsx";
import "./codex.css";

const api = window.urbanomics;

export function AliasSuggestions({ onClose, onApplied }) {
  const [result, setResult] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState([]), [applying, setApplying] = useState(false), [applied, setApplied] = useState(false);
  useEffect(() => {
    let live = true;
    setResult(null); setError(""); setApplied(false);
    api.suggestAliases().then((r) => {
      if (!live) return;
      setResult(r);
      setItems(r.suggestions.map((s) => ({ ...s, on: !s.conflicts && !s.duplicates.length, check: { matches: s.matches, conflicts: s.conflicts, duplicates: s.duplicates, examples: s.examples }, outcome: null })));
    }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [attempt]);
  const update = (key, change) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...change } : x)));
  const chosen = items.filter((x) => x.on && !x.outcome?.ok && x.name.trim() && x.text.trim());

  async function apply() {
    setApplying(true);
    let done = 0, failed = 0;
    for (const item of chosen) {
      try { await api.saveAlias({ name: item.name.trim(), pattern: compileTextRule({ mode: item.mode, text: item.text }) }); update(item.key, { outcome: { ok: true, message: "Saved" } }); done++; }
      catch (e) { update(item.key, { outcome: { ok: false, message: e.message } }); failed++; }
    }
    setApplying(false); setApplied(true);
    notify({ title: failed ? `${plural(done, "alias", "aliases")} saved, ${failed} didn't` : `${plural(done, "alias", "aliases")} saved`, tone: failed ? "warning" : "success" });
    onApplied?.();
  }
  return (
    <WorkspaceModal size="wide" title="Suggested aliases" onClose={applying ? () => {} : onClose}
      footer={<>
        {result && <RunNote run={result.run} />}
        {result && !applied && <button type="button" disabled={applying} onClick={() => setAttempt((n) => n + 1)}><Icon name="refresh-cw" size={16} />Ask again</button>}
        <button type="button" disabled={applying} onClick={onClose}>{applied ? "Close" : "Cancel"}</button>
        {result && chosen.length > 0 && <button type="button" className="primary" disabled={applying} onClick={apply}>{applying ? "Saving…" : `Save ${plural(chosen.length, "alias", "aliases")}`}</button>}
      </>}>
      {error ? <Alert title="Codex couldn't make suggestions.">{error}</Alert>
        : !result ? <Thinking title="Codex is reading your bank descriptions…" detail="It groups descriptions that are the same merchant and proposes a readable name for each. Nothing changes until you approve it." />
        : !items.length ? <div className="empty-state"><Icon name="circle-check" size={24} /><h2>No aliases to suggest.</h2><p>Codex didn't find descriptions that would read better under another name.</p></div>
        : <>
            <p className="cx-summary">Each alias renames every description its sentence matches, in every account. Edit the name or the sentence before saving; the count updates as you type.</p>
            <div className="cx-list">{items.map((item) => <AliasItem key={item.key} item={item} onChange={(change) => update(item.key, change)} locked={applying || item.outcome?.ok} />)}</div>
          </>}
    </WorkspaceModal>
  );
}

function AliasItem({ item, onChange, locked }) {
  const first = useRef(true);
  // Re-check the sentence with the server's own preview after an edit.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const pattern = compileTextRule({ mode: item.mode, text: item.text });
    if (!pattern || !item.name.trim()) return;
    const timer = setTimeout(() => {
      api.previewAlias({ name: item.name.trim(), pattern })
        .then((p) => { const matches = p.matches.filter((m) => !m.deleted); onChange({ check: { matches: matches.length, conflicts: p.conflicts.length, duplicates: p.duplicates.map((d) => d.name), examples: [...new Set(matches.map((m) => m.description))].slice(0, 4) } }); })
        .catch((e) => onChange({ check: { ...item.check, error: e.message } }));
    }, 300);
    return () => clearTimeout(timer);
  }, [item.mode, item.text, item.name]);
  const c = item.check, trouble = c.conflicts > 0 || c.duplicates.length > 0 || !c.matches;
  return (
    <article className={"cx-item" + (item.on ? "" : " is-off") + (item.outcome?.ok ? " is-done" : "")}>
      <input type="checkbox" aria-label={`Save alias ${item.name}`} checked={item.on} disabled={locked} onChange={(e) => onChange({ on: e.target.checked })} />
      <div className="cx-item-body">
        <div className="cx-item-head">
          <input type="text" aria-label="Alias name" value={item.name} disabled={locked} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="cx-item-head">
          <span>Descriptions that</span>
          <select aria-label={`How ${item.name} matches`} value={item.mode} disabled={locked} onChange={(e) => onChange({ mode: e.target.value })}>
            {ruleModes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <input type="text" aria-label={`Text for ${item.name}`} value={item.text} disabled={locked} onChange={(e) => onChange({ text: e.target.value })} />
        </div>
        <p className="cx-reason">{item.reason}</p>
        {c.examples.length > 0 && <div className="cx-chips">{c.examples.map((x) => <span key={x} className="cx-chip" title={x}>{x}</span>)}</div>}
        <div className="cx-meta">
          <span>{c.matches ? `Renames ${plural(c.matches, "transaction")}` : "Matches nothing yet"}</span>
          {c.conflicts > 0 && <span className="cx-outcome is-error"><Icon name="triangle-alert" size={16} />{plural(c.conflicts, "transaction")} already {c.conflicts === 1 ? "has" : "have"} another alias. Make the text more specific.</span>}
          {c.duplicates.length > 0 && <span className="cx-outcome is-error"><Icon name="triangle-alert" size={16} />Same name or sentence as {c.duplicates.join(", ")}</span>}
          {c.error && <span className="cx-outcome is-error">{c.error}</span>}
          {item.outcome && <span className={"cx-outcome " + (item.outcome.ok ? "is-ok" : "is-error")}><Icon name={item.outcome.ok ? "check" : "circle-alert"} size={16} />{item.outcome.message}</span>}
          {!item.outcome && trouble && item.on && <span>Saving will be refused until this is fixed.</span>}
        </div>
      </div>
    </article>
  );
}
