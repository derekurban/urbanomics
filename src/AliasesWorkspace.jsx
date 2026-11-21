import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Recognize } from "./recognize.jsx";
import { compileTextRule, decompileTextRule, describeRule, textMatches } from "./import-analysis.mjs";
import { Alert, ConfirmDialog } from "./ui.jsx";
import { notify } from "./toast.jsx";
import { money, dayLabel, plural } from "./format.js";
import "./aliases-workspace.css";
const api = window.urbanomics;

// "BEAN COUNTER #1042" → the part that stays the same from visit to visit, and a readable name for it.
const stableStart = (text) => text.replace(/[\s#*\d./-]+$/u, "").trim() || text.trim();
const readable = (text) => stableStart(text).toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
export const describeText = (pattern) => {
  const r = decompileTextRule(pattern);
  return r.mode === "custom" ? `match the pattern ${r.text}` : describeRule(r).replace(/^starts with/, "start with").replace(/^contains/, "contain").replace(/^ends with/, "end with").replace(/^is exactly/, "are exactly");
};

/** Identical descriptions are one choice, with how many transactions share it; most frequent first. */
function groupDescriptions(unaliased) {
  const map = new Map();
  for (const r of unaliased) {
    const key = r.description.trim().toLowerCase();
    const g = map.get(key) || { id: r.id, description: r.description, rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || a.description.localeCompare(b.description));
}
const seedRule = (group) => ({ mode: "starts", text: stableStart(group.description) });

// seed: a description chosen on the page; the editor opens with its name and sentence filled in.
function AliasEditor({ rule, seed, unaliased, act, onClose }) {
  const [draft, setDraft] = useState(() => seed ? { name: readable(seed.description), pattern: compileTextRule(seedRule(seed)) } : { name: "", pattern: "", ...rule });
  const [sentence, setSentence] = useState(() => seed ? seedRule(seed) : decompileTextRule(rule.pattern || ""));
  const [preview, setPreview] = useState(null), [tested, setTested] = useState(""), [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [pendingQuery, setPendingQuery] = useState(""), [pendingPage, setPendingPage] = useState(0), [picked, setPicked] = useState(seed?.id || "");
  const [page, setPage] = useState(0), [confirm, setConfirm] = useState(false);
  const nameInput = useRef(null), saving = useRef(false);
  const signature = JSON.stringify(draft), fresh = tested === signature && preview;
  const blocked = !fresh || preview.conflicts.length > 0 || preview.duplicates.length > 0;
  const setRule = (r) => { setSentence(r); setDraft((d) => ({ ...d, pattern: compileTextRule(r) })); setError(""); };
  // Matches are checked against every transaction as you type; nothing is saved until Save.
  useEffect(() => {
    if (!draft.name.trim() || !draft.pattern.trim()) { setPreview(null); return; }
    let live = true;
    setChecking(true);
    const timer = setTimeout(() => {
      api.previewAlias(draft)
        .then((result) => { if (live) { setPreview(result); setTested(signature); setPage(0); setError(""); } })
        .catch((e) => { if (live) { setPreview(null); setError(e.message); } })
        .finally(() => live && setChecking(false));
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [signature]);
  async function mutate(fn, keepOpen = false, message = "") {
    if (saving.current) return;
    saving.current = true;
    setWorking(true);
    setError("");
    try {
      if ((await act(fn)) !== false) {
        if (!keepOpen) { onClose(); if (message) notify({ title: message, tone: "success" }); }
        else {
          setDraft({ name: "", pattern: "" }); setSentence({ mode: "starts", text: "" });
          setPreview(null); setTested(""); setPicked(""); setConfirm(false);
          setNotice(`Saved “${draft.name}”. Choose the next description.`);
          nameInput.current?.focus();
        }
      }
    } catch (e) {
      setError(e.message);
      setTested("");
      setConfirm(false);
    } finally {
      saving.current = false;
      setWorking(false);
    }
  }
  // Identical descriptions are one choice, with how many transactions share it.
  const groups = useMemo(() => groupDescriptions(unaliased), [unaliased]);
  const q = pendingQuery.trim().toLowerCase();
  const pending = groups.filter((g) => g.description.toLowerCase().includes(q) || g.rows.some((r) => (r.account || "").toLowerCase().includes(q)));
  const pendingPages = Math.max(1, Math.ceil(pending.length / 10)), pendingCurrent = Math.min(pendingPage, pendingPages - 1);
  const pages = fresh ? Math.max(1, Math.ceil(preview.matches.length / 25)) : 1, current = Math.min(page, pages - 1);
  function choose(group) {
    const r = { mode: "starts", text: stableStart(group.description) };
    setSentence(r);
    setDraft((d) => ({ ...d, pattern: compileTextRule(r), name: d.name.trim() ? d.name : readable(group.description) }));
    setPicked(group.id);
    setNotice("");
    setError("");
    nameInput.current?.focus();
  }
  const samples = fresh ? preview.matches.slice(0, 6).map((r) => ({ id: r.id, filename: r.description })) : picked ? [{ id: picked, filename: groups.find((g) => g.id === picked)?.description || "" }] : [];
  return (
    <WorkspaceModal
      className="al-editor-dialog"
      size="wide"
      title={rule.id ? `Edit “${rule.name}”` : "New alias"}
      onClose={() => { if (!saving.current) onClose(); }}
      footer={
        <>
          {rule.id && <span className="footer-start"><button disabled={working} className="danger" onClick={() => setConfirm(true)}>Delete alias</button></span>}
          <button disabled={working} onClick={onClose}>Cancel</button>
          {!rule.id && <button disabled={working || blocked} onClick={() => mutate(() => api.saveAlias(draft), true)}>Save and add another</button>}
          <button className="primary" disabled={working || blocked} onClick={() => mutate(() => api.saveAlias(draft), false, rule.id ? (rule.name !== draft.name ? `Renamed alias “${rule.name}” to “${draft.name}”` : `Saved alias “${draft.name}”`) : `Added alias “${draft.name}”`)}>Save alias</button>
        </>
      }
    >
      <div className="al-editor-layout">
        <aside className="al-unaliased" aria-label="Bank descriptions without an alias">
          <h3>Without an alias</h3>
          <p className="form-help">{plural(groups.length, "description")} across every month and account. Choose one to start from it.</p>
          {groups.length > 10 && <input type="search" aria-label="Search descriptions without aliases" placeholder="Find a description or account" value={pendingQuery} onChange={(e) => { setPendingQuery(e.target.value); setPendingPage(0); }} />}
          <div className="al-unaliased-list">
            {pending.slice(pendingCurrent * 10, pendingCurrent * 10 + 10).map((g) => (
              <button key={g.id} disabled={working} aria-pressed={picked === g.id} onClick={() => choose(g)}>
                <strong title={g.description}>{g.description}</strong>
                <small>{g.rows.length > 1 ? `${plural(g.rows.length, "transaction")}, latest ${dayLabel(g.rows[0].date)}` : `${g.rows[0].account}${g.rows[0].deleted ? " (deleted)" : ""}, ${dayLabel(g.rows[0].date)}`}</small>
                <span className="tabular">{g.rows.length > 1 ? "" : money(g.rows[0].amountCents, g.rows[0].currency)}</span>
              </button>
            ))}
            {!pending.length && <p className="form-help">{q ? "Nothing matches that search." : "Every transaction has a readable name."}</p>}
          </div>
          {pendingPages > 1 && (
            <div className="al-pages">
              <button className="icon ghost sm" aria-label="Previous descriptions" disabled={pendingCurrent === 0} onClick={() => setPendingPage(pendingCurrent - 1)}><Icon name="chevron-left" size={16} /></button>
              <span>{pendingCurrent + 1} of {pendingPages}</span>
              <button className="icon ghost sm" aria-label="Next descriptions" disabled={pendingCurrent === pendingPages - 1} onClick={() => setPendingPage(pendingCurrent + 1)}><Icon name="chevron-right" size={16} /></button>
            </div>
          )}
        </aside>
        <div className="al-editor-main">
          {notice && <Alert tone="success">{notice}</Alert>}
          <label className="al-name">Show it as<input ref={nameInput} data-autofocus="" maxLength={80} placeholder="Juniper Café" value={draft.name} disabled={working} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setError(""); }} /></label>
          <div className="al-field">
            <span>Which transactions</span>
            <Recognize lead="Bank descriptions that" rule={sentence} onChange={setRule} candidates={samples} test={textMatches} patternFor={compileTextRule} noun={["transaction", "transactions"]} what="a name" label="Description text to match" showChips={false} emptyMessage="Say which descriptions this name is for." />
          </div>
          {error && <Alert>{error}</Alert>}
          {!draft.name.trim() || !draft.pattern.trim() ? (
            draft.pattern.trim() ? <p className="form-help">Add the name to see which transactions it renames.</p> : null
          ) : !fresh ? (
            <p className="form-help" role="status">{checking ? "Checking every transaction…" : ""}</p>
          ) : (
            <section className="al-preview" aria-label="Alias preview">
              <p className="al-summary" role="status">
                <strong>{preview.matches.length ? `Renames ${plural(preview.matches.length, "transaction")}` : "No transactions match yet"}</strong>
                <small>{preview.matches.length ? "Across every month, including deleted accounts." : "It will still name matching transactions you import later."}</small>
              </p>
              {!!preview.duplicates.length && <Alert>Another alias already uses this name or text: {preview.duplicates.map((r) => r.name).join(", ")}.</Alert>}
              {preview.conflicts.length > 0 && <Alert tone="warning">{plural(preview.conflicts.length, "transaction")} would also match another alias. Make the text more specific so each transaction has one name.</Alert>}
              {!!preview.matches.length && (
                <div className="al-results">
                  {preview.matches.slice(current * 25, current * 25 + 25).map((r) => (
                    <article key={r.id} className={r.conflicts.length ? "al-conflict" : ""}>
                      <div>
                        <span className="al-rename"><s>{r.description}</s><Icon name="arrow-right" size={16} /><strong>{draft.name}</strong></span>
                        <small>{r.account}{r.deleted ? " (deleted)" : ""}, {dayLabel(r.date)}{r.conflicts.length ? ` · also matches ${r.conflicts.map((c) => c.name).join(", ")}` : ""}</small>
                      </div>
                      <span className="tabular">{money(r.amountCents, r.currency)}</span>
                    </article>
                  ))}
                </div>
              )}
              {pages > 1 && (
                <div className="al-pages">
                  <button className="icon ghost sm" aria-label="Previous matches" disabled={!current} onClick={() => setPage(current - 1)}><Icon name="chevron-left" size={16} /></button>
                  <span>{current + 1} of {pages}</span>
                  <button className="icon ghost sm" aria-label="Next matches" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><Icon name="chevron-right" size={16} /></button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog title={`Delete “${rule.name}”?`} confirmLabel="Delete alias" cancelLabel="Keep alias" busy={working} onClose={() => setConfirm(false)} onConfirm={() => mutate(() => api.removeAlias(rule.id, rule.version), false, `Deleted alias “${rule.name}”`)}>
          <p>Its transactions go back to their bank descriptions, or to another alias that matches them. Tags, splits and links stay as they are.</p>
        </ConfirmDialog>
      )}
    </WorkspaceModal>
  );
}

/* On the page: descriptions that have no alias yet. Choosing one opens the editor with it filled in. */
function Unaliased({ id, unaliased, disabled, onChoose }) {
  const groups = useMemo(() => groupDescriptions(unaliased), [unaliased]);
  const [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const q = query.trim().toLowerCase();
  const shown = groups.filter((g) => g.description.toLowerCase().includes(q) || g.rows.some((r) => (r.account || "").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(shown.length / 10)), current = Math.min(page, pages - 1);
  return (
    <section className="al-page-unaliased" aria-labelledby={id + "-title"} id={id} tabIndex={-1}>
      <div className="al-page-unaliased-head">
        <h2 id={id + "-title"}>Without an alias</h2>
        {groups.length > 10 && <input type="search" aria-label="Search descriptions without aliases" placeholder="Find a description or account" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />}
      </div>
      <p className="form-help">{plural(groups.length, "description")}, most frequent first. Choose one to give it a name; you see every transaction it renames before saving.</p>
      <div className="al-unaliased-list">
        {shown.slice(current * 10, current * 10 + 10).map((g) => (
          <button key={g.id} disabled={disabled} aria-label={`Name ${g.description}`} onClick={() => onChoose(g)}>
            <strong title={g.description}>{g.description}</strong>
            <small>{g.rows.length > 1 ? `${plural(g.rows.length, "transaction")}, latest ${dayLabel(g.rows[0].date)}` : `${g.rows[0].account}${g.rows[0].deleted ? " (deleted)" : ""}, ${dayLabel(g.rows[0].date)}`}</small>
            <span className="tabular">{g.rows.length > 1 ? "" : money(g.rows[0].amountCents, g.rows[0].currency)}</span>
          </button>
        ))}
        {!shown.length && <p className="form-help">Nothing matches that search.</p>}
      </div>
      {pages > 1 && (
        <div className="al-pages">
          <button className="icon ghost sm" aria-label="Previous descriptions" disabled={current === 0} onClick={() => setPage(current - 1)}><Icon name="chevron-left" size={16} /></button>
          <span>{current + 1} of {pages}</span>
          <button className="icon ghost sm" aria-label="Next descriptions" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><Icon name="chevron-right" size={16} /></button>
        </div>
      )}
    </section>
  );
}

export function AliasesWorkspace({ data, run, busy, onSuggest }) {
  const listId = "aliases-without";
  const [state, setState] = useState(null), [editing, setEditing] = useState(null), [error, setError] = useState(""), [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    api.aliases().then((s) => { if (live) setState(s); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data]);
  async function act(fn) {
    let failure;
    const result = await run(async () => {
      try {
        const result = await fn();
        setState(await api.aliases());
        return result;
      } catch (e) {
        failure = e;
        throw e;
      }
    });
    if (failure) throw failure;
    return result;
  }
  const all = state?.rules || [];
  const rules = all.filter((r) => `${r.name} ${r.pattern}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <section className="aliases-workspace" aria-label="Aliases">
      <div className="og-toolbar">
        {all.length > 6 && <input type="search" aria-label="Search aliases" placeholder="Find an alias" value={query} onChange={(e) => setQuery(e.target.value)} />}
        {state && (state.unaliased?.length ? <button type="button" className="link og-stat" onClick={() => { const list = document.getElementById(listId); list?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); list?.focus({ preventScroll: true }); }}>{plural(state.unaliased.length, "transaction")} without one</button> : <span className="og-stat">Every transaction has one</span>)}
        {onSuggest && <button disabled={busy || !state} onClick={onSuggest}><Icon name="sparkles" size={16} />Suggest aliases</button>}
        <button className="primary" disabled={busy || !state} onClick={() => setEditing({})}><Icon name="plus" size={16} />New alias</button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!!state?.conflicts.length && (
        <Alert tone="warning" title={`${plural(state.conflicts.length, "transaction has", "transactions have")} two aliases`}>
          <p>They keep their bank descriptions until one alias is made more specific.</p>
          <ul className="al-conflict-list">
            {state.conflicts.map((r) => (
              <li key={r.id}>
                <span>{r.description} <small>{r.account}, {dayLabel(r.date)}</small></span>
                <span>{r.aliasConflicts.map((c) => <button key={c.id} className="link" onClick={() => setEditing(state.rules.find((rule) => rule.id === c.id))}>Edit {c.name}</button>)}</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {!state ? (
        <p role="status">{error ? "Aliases couldn't be loaded." : "Loading aliases…"}</p>
      ) : !rules.length && !query && state.unaliased?.length ? (
        <p className="al-lede">No aliases yet. Bank descriptions like “SQ *BEAN COUNTER 1042” can show as Bean Counter everywhere: choose one below to name it.</p>
      ) : !rules.length ? (
        <div className="empty-state">
          <Icon name="tags" size={24} />
          <h2>{query ? "No aliases match." : "A familiar name for every transaction."}</h2>
          <p>{query ? "Try another name." : "Bank descriptions like “SQ *BEAN COUNTER 1042” can show as Bean Counter everywhere. Choose a description below to start, or use New alias."}</p>
        </div>
      ) : (
        <div className="og-rows">
          {rules.map((r) => (
            <article className="og-row" key={r.id}>
              <div className="og-row-body">
                <h3 title={r.name}>{r.name}</h3>
                <small>Descriptions that {describeText(r.pattern)} · {plural(r.matched, "transaction")}{r.conflicts ? ` · ${plural(r.conflicts, "clash", "clashes")} with another alias` : ""}</small>
              </div>
              <button className="sm" disabled={busy} aria-label={`Edit alias ${r.name}`} onClick={() => setEditing(r)}>Edit</button>
            </article>
          ))}
        </div>
      )}
      {state?.unaliased?.length > 0 && <Unaliased id={listId} unaliased={state.unaliased} disabled={busy} onChoose={(group) => setEditing({ seed: group })} />}
      {editing && <AliasEditor key={editing.id || "new"} rule={editing.seed ? {} : editing} seed={editing.seed} unaliased={state?.unaliased || []} act={act} onClose={() => setEditing(null)} />}
    </section>
  );
}
