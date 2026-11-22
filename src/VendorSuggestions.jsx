// Claude vendor suggestions: a readable name and one or more plain matchers for bank descriptions that are
// the same merchant. Each one is previewed with the vendor editor's own check (what it would cover, whether
// it clashes with a vendor you have) and saved only when approved. Tags and people are set afterwards.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Alert } from "./ui.jsx";
import { notify } from "./toast.jsx";
import { SelectAll } from "./TagSuggestions.jsx";
import { plural } from "./format.js";
import { MATCH_MODES } from "../electron/review/vendor-model.mjs";
import { Thinking, RunNote } from "./TagSuggestions.jsx";
import "./assistant.css";

const api = window.urbanomics;

export function VendorSuggestions({ onClose, onApplied }) {
  const [result, setResult] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState([]), [applying, setApplying] = useState(false), [applied, setApplied] = useState(false);
  useEffect(() => {
    let live = true;
    setResult(null); setError(""); setApplied(false);
    api.suggestVendors().then((r) => {
      if (!live) return;
      setResult(r);
      setItems(r.suggestions.map((s) => ({ ...s, on: !s.conflicts && !s.duplicates.length, check: { matches: s.matches, conflicts: s.conflicts, duplicates: s.duplicates, examples: s.examples }, outcome: null })));
    }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [attempt]);
  const update = (key, change) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...change } : x)));
  const chosen = items.filter((x) => x.on && !x.outcome?.ok && x.name.trim() && x.matchers.some((m) => m.text.trim()));

  async function apply() {
    setApplying(true);
    let done = 0, failed = 0, renamed = 0;
    for (const item of chosen) {
      try { await api.saveVendor({ name: item.name.trim(), matchers: item.matchers.filter((m) => m.text.trim()) }); update(item.key, { outcome: { ok: true, message: "Saved" } }); done++; renamed += Number(item.check?.matches) || 0; }
      catch (e) { update(item.key, { outcome: { ok: false, message: e.message } }); failed++; }
    }
    setApplying(false); setApplied(true);
    notify({ title: [failed ? `${plural(done, "vendor")} saved, ${failed} didn't` : `${plural(done, "vendor")} saved`, renamed ? `${plural(renamed, "transaction")} named` : ""].filter(Boolean).join(" · "), tone: failed ? "warning" : "success" });
    onApplied?.();
  }
  return (
    <WorkspaceModal size="wide" title="Suggested vendors" onClose={applying ? () => {} : onClose}
      footer={<>
        {result && <RunNote run={result.run} />}
        {result && !applied && <button type="button" disabled={applying} onClick={() => setAttempt((n) => n + 1)}><Icon name="refresh-cw" size={16} />Ask again</button>}
        <button type="button" disabled={applying} onClick={onClose}>{applied ? "Close" : "Cancel"}</button>
        {result && chosen.length > 0 && <button type="button" className="primary" disabled={applying} onClick={apply}>{applying ? "Saving…" : `Save ${plural(chosen.length, "vendor")}`}</button>}
      </>}>
      {error ? <Alert title="Claude couldn't make suggestions.">{error}</Alert>
        : !result ? <Thinking title="Claude is reading your bank descriptions…" detail="It groups descriptions that are the same merchant and proposes a vendor for each. Nothing changes until you approve it." />
        : !items.length ? <div className="empty-state"><Icon name="circle-check" size={24} /><h2>No vendors to suggest.</h2><p>Claude didn't find descriptions that belong together under one name.</p></div>
        : <>
            <p className="cx-summary">Each vendor names every description one of its matchers catches, in every account. Edit the name or the matchers before saving; the count updates as you type. Add a tag for new transactions afterwards, on the Vendors page.</p>
            {items.length > 6 && !applied && <SelectAll onAll={() => setItems((list) => list.map((x) => (x.outcome?.ok ? x : { ...x, on: true })))} onNone={() => setItems((list) => list.map((x) => (x.outcome?.ok ? x : { ...x, on: false })))} />}
            <div className="cx-list">{items.map((item) => <VendorItem key={item.key} item={item} onChange={(change) => update(item.key, change)} locked={applying || item.outcome?.ok} />)}</div>
          </>}
    </WorkspaceModal>
  );
}

function VendorItem({ item, onChange, locked }) {
  const first = useRef(true);
  // Re-check the matchers with the server's own preview after an edit.
  const signature = JSON.stringify([item.name, item.matchers]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const matchers = item.matchers.filter((m) => m.text.trim());
    if (!matchers.length || !item.name.trim()) return;
    const timer = setTimeout(() => {
      api.previewVendor({ name: item.name.trim(), matchers })
        .then((p) => { const matches = p.matches.filter((m) => !m.deleted); onChange({ check: { matches: matches.length, conflicts: p.conflicts.length, duplicates: p.duplicates.map((d) => d.name), examples: [...new Set(matches.map((m) => m.description))].slice(0, 4) } }); })
        .catch((e) => onChange({ check: { ...item.check, error: e.message } }));
    }, 300);
    return () => clearTimeout(timer);
  }, [signature]);
  const setMatcher = (i, change) => onChange({ matchers: item.matchers.map((m, j) => (j === i ? { ...m, ...change } : m)) });
  const c = item.check, trouble = c.conflicts > 0 || c.duplicates.length > 0 || !c.matches;
  return (
    <article className={"cx-item" + (item.on ? "" : " is-off") + (item.outcome?.ok ? " is-done" : "")}>
      <input type="checkbox" aria-label={`Save vendor ${item.name}`} checked={item.on} disabled={locked} onChange={(e) => onChange({ on: e.target.checked })} />
      <div className="cx-item-body">
        <div className="cx-item-head">
          <input type="text" aria-label="Vendor name" value={item.name} disabled={locked} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        {item.matchers.map((m, i) => (
          <div className="cx-item-head" key={i}>
            <span>{i === 0 ? "Descriptions that" : "or"}</span>
            <select aria-label={`How ${item.name} matches${i ? ` (${i + 1})` : ""}`} value={m.mode} disabled={locked} onChange={(e) => setMatcher(i, { mode: e.target.value })}>
              {MATCH_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
            <input type="text" aria-label={`Text for ${item.name}${i ? ` (${i + 1})` : ""}`} value={m.text} disabled={locked} onChange={(e) => setMatcher(i, { text: e.target.value })} />
          </div>
        ))}
        <p className="cx-reason">{item.reason}</p>
        {c.examples.length > 0 && <div className="cx-chips">{c.examples.map((x) => <span key={x} className="cx-chip" title={x}>{x}</span>)}</div>}
        <div className="cx-meta">
          <span>{c.matches ? `Covers ${plural(c.matches, "transaction")}` : "Matches nothing yet"}</span>
          {c.conflicts > 0 && <span className="cx-outcome is-error"><Icon name="triangle-alert" size={16} />{plural(c.conflicts, "transaction")} already {c.conflicts === 1 ? "has" : "have"} another vendor. Make a matcher more specific.</span>}
          {c.duplicates.length > 0 && <span className="cx-outcome is-error"><Icon name="triangle-alert" size={16} />Same name as {c.duplicates.join(", ")}</span>}
          {c.error && <span className="cx-outcome is-error">{c.error}</span>}
          {item.outcome && <span className={"cx-outcome " + (item.outcome.ok ? "is-ok" : "is-error")}><Icon name={item.outcome.ok ? "check" : "circle-alert"} size={16} />{item.outcome.message}</span>}
          {!item.outcome && trouble && item.on && <span>Saving will be refused until this is fixed.</span>}
        </div>
      </div>
    </article>
  );
}
