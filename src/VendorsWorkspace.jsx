// Vendors: one readable name for every bank description that is really the same place, with one or more
// matchers ("starts with SQ *BEAN COUNTER", "contains BEAN COUNTER ONLINE"), and the tag and person its new
// transactions get. Replaces Settings → Aliases and Settings → Rules. Every matcher is checked against every
// transaction as you type; nothing is saved until Save, and transactions you already have change only when
// the box under the preview is ticked (Undo in the toast puts them back).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Alert, ConfirmDialog } from "./ui.jsx";
import { notify } from "./toast.jsx";
import { money, dayLabel, plural } from "./format.js";
import { categoryColors } from "./category-colors.js";
import { tagType } from "../electron/review/tag-model.mjs";
import { MATCH_MODES, describeMatcher, describeMatchers, readableName, stableStart } from "../electron/review/vendor-model.mjs";
import { useAssistant, readiness } from "./assistant.js";
import { VendorSuggestions } from "./VendorSuggestions.jsx";
import "./organize-workspace.css";
import "./vendors.css";

const api = window.urbanomics;
const blank = () => ({ mode: "starts", text: "" });

/** Identical descriptions are one choice, with how many transactions share it; most frequent first. */
export function groupDescriptions(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.description.trim().toLowerCase();
    const g = map.get(key) || { id: r.id, description: r.description, rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || a.description.localeCompare(b.description));
}

/** What a vendor gives new transactions, in words: "Coffee · Paid Sam". */
export function givesLabel(vendor, entities) {
  const tag = vendor.tagId && entities.find((e) => e.id === vendor.tagId), person = vendor.personId && entities.find((e) => e.id === vendor.personId);
  return [tag ? tag.name : "", person ? `Paid ${person.name}` : ""].filter(Boolean).join(" · ");
}

/* Tags in the order Settings shows them: expense tags under their categories, then ungrouped, then income. */
function TagSelect({ value, entities, onChange, disabled }) {
  const tags = entities.filter((e) => e.kind === "category");
  const buckets = entities.filter((e) => e.kind === "bucket");
  const expense = tags.filter((t) => tagType(t) === "expense"), income = tags.filter((t) => tagType(t) === "income");
  const groups = [
    ...buckets.map((b) => [b.name, expense.filter((t) => t.parentId === b.id)]),
    ["Ungrouped", expense.filter((t) => !t.parentId || !buckets.some((b) => b.id === t.parentId))],
    ["Income", income],
  ].filter(([, list]) => list.length);
  return (
    <select aria-label="Tag for new transactions" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">No tag</option>
      {groups.map(([label, list]) => <optgroup key={label} label={label}>{list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
    </select>
  );
}

function Matchers({ matchers, counts, fresh, onChange, disabled }) {
  const set = (i, change) => onChange(matchers.map((m, j) => (j === i ? { ...m, ...change } : m)));
  return (
    <div className="vd-matchers">
      {matchers.map((m, i) => (
        <div className="vd-matcher" key={i}>
          <span className="vd-matcher-lead">{i === 0 ? "" : "or"}</span>
          {m.mode === "custom" ? <span className="vd-matcher-custom">match the pattern</span> : (
            <select aria-label={`How matcher ${i + 1} matches`} value={m.mode} disabled={disabled} onChange={(e) => set(i, { mode: e.target.value })}>
              {MATCH_MODES.map((mode) => <option key={mode.id} value={mode.id}>{describeMatcher({ mode: mode.id, text: "" }, { plural: true }).replace(/ “”$/, "")}</option>)}
            </select>
          )}
          <input aria-label={`Text for matcher ${i + 1}`} className={m.mode === "custom" ? "is-pattern" : ""} value={m.text} spellCheck={false} maxLength={200} disabled={disabled} data-autofocus={i === 0 && !m.text ? "" : undefined} onChange={(e) => set(i, { text: e.target.value })} />
          <small className="vd-matcher-count tabular" aria-label={`Matcher ${i + 1} matches`}>{fresh && m.text.trim() ? (counts[i] ? plural(counts[i], "match", "matches") : "No matches") : ""}</small>
          {matchers.length > 1 ? <button type="button" className="icon ghost sm" aria-label={`Remove matcher ${i + 1}`} disabled={disabled} onClick={() => onChange(matchers.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button> : <span />}
          {m.mode === "custom" && <button type="button" className="link vd-plain" onClick={() => set(i, { mode: "starts", text: "" })}>Use plain words</button>}
        </div>
      ))}
      {matchers.length < 20 && <button type="button" className="link vd-add" disabled={disabled} onClick={() => onChange([...matchers, blank()])}><Icon name="plus" size={16} />Add another matcher</button>}
    </div>
  );
}

/**
 * vendor: the saved vendor to edit, or null for a new one. seed: { description, tagId, personId } from a
 * transaction (the Organize desk, the list of descriptions without a vendor) to start a new vendor from.
 */
export function VendorEditor({ vendor, seed, entities, onClose, onSaved }) {
  const start = () => {
    if (vendor) return { id: vendor.id, version: vendor.version, name: vendor.name, matchers: vendor.matchers.map((m) => ({ ...m })), tagId: seed?.tagId ?? vendor.tagId ?? "", personId: seed?.personId ?? vendor.personId ?? "" };
    return { name: seed ? readableName(seed.description) : "", matchers: [seed ? { mode: "starts", text: stableStart(seed.description) } : blank()], tagId: seed?.tagId || "", personId: seed?.personId || "" };
  };
  const [draft, setDraft] = useState(start);
  const [state, setState] = useState(null), [preview, setPreview] = useState(null), [tested, setTested] = useState(""), [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [applyExisting, setApplyExisting] = useState(true);
  const [query, setQuery] = useState(""), [listPage, setListPage] = useState(0), [page, setPage] = useState(0), [confirm, setConfirm] = useState(false);
  const nameInput = useRef(null), saving = useRef(false);
  const usable = { ...draft, matchers: draft.matchers.filter((m) => m.text.trim()) };
  const signature = JSON.stringify(usable), fresh = tested === signature && preview;
  const blocked = !fresh || preview.conflicts.length > 0 || preview.duplicates.length > 0;
  const people = entities.filter((e) => e.kind === "person");
  useEffect(() => {
    let live = true;
    api.vendors().then((s) => { if (live) setState(s); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  // Matches are checked against every transaction as you type; nothing is saved until Save.
  useEffect(() => {
    if (!usable.name.trim() || !usable.matchers.length) { setPreview(null); return; }
    let live = true;
    setChecking(true);
    const timer = setTimeout(() => {
      api.previewVendor(usable)
        .then((result) => { if (live) { setPreview(result); setTested(signature); setPage(0); setError(""); } })
        .catch((e) => { if (live) { setPreview(null); setTested(""); setError(e.message); } })
        .finally(() => live && setChecking(false));
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [signature]);
  const update = (change) => { setDraft((d) => ({ ...d, ...change })); setError(""); setNotice(""); };

  // Descriptions without a vendor; choosing one adds it as a matcher (or fills the empty one).
  const groups = useMemo(() => groupDescriptions((state?.unmatched || []).filter((r) => !r.deleted)), [state]);
  const covered = new Set(fresh ? preview.matches.map((m) => m.description.trim().toLowerCase()) : []);
  const q = query.trim().toLowerCase();
  const pending = groups.filter((g) => !covered.has(g.description.trim().toLowerCase()) && (g.description.toLowerCase().includes(q) || g.rows.some((r) => (r.account || "").toLowerCase().includes(q))));
  const listPages = Math.max(1, Math.ceil(pending.length / 10)), listCurrent = Math.min(listPage, listPages - 1);
  function choose(group) {
    const matcher = { mode: "starts", text: stableStart(group.description) };
    setDraft((d) => {
      const empty = d.matchers.findIndex((m) => !m.text.trim());
      const matchers = empty >= 0 ? d.matchers.map((m, i) => (i === empty ? matcher : m)) : [...d.matchers, matcher];
      return { ...d, matchers, name: d.name.trim() ? d.name : readableName(group.description) };
    });
    setError(""); setNotice("");
    if (!draft.name.trim()) nameInput.current?.focus();
  }

  const counts = useMemo(() => {
    const c = [];
    for (const m of fresh ? preview.matches : []) for (const i of m.matchers) c[i] = (c[i] || 0) + 1;
    return c;
  }, [fresh, preview]);
  // Indexes in the preview refer to the usable (non-empty) matchers; map them back to the rows on screen.
  const shownCounts = (() => { const out = []; let k = 0; draft.matchers.forEach((m, i) => { if (m.text.trim()) out[i] = counts[k++] || 0; }); return out; })();
  const gives = givesLabel(draft, entities);
  const ready = fresh ? preview.ready : 0;

  async function save(keepOpen) {
    if (saving.current) return;
    saving.current = true;
    setWorking(true); setError("");
    try {
      const result = await api.saveVendor(usable, { applyExisting: applyExisting && ready > 0 });
      const verb = vendor ? (vendor.name !== usable.name ? `Renamed “${vendor.name}” to “${usable.name}”` : `Saved ${usable.name}`) : `Added ${usable.name}`;
      notify({
        title: verb,
        description: result.applied ? `${plural(result.applied, "transaction")} got ${gives}` : gives ? `New ones get ${gives}` : "",
        tone: "success",
        action: result.batch ? { label: "Undo", onClick: () => api.undoVendorApply(result.batch).then((u) => { notify({ title: `Put back ${plural(u.restored, "transaction")}`, description: u.kept ? `${plural(u.kept, "transaction")} changed since and kept ${u.kept === 1 ? "its" : "their"} edits` : "" }); onSaved?.(); }).catch((e) => notify({ title: e.message, tone: "danger" })) } : undefined,
      });
      await onSaved?.(result);
      if (!keepOpen) onClose();
      else {
        setDraft({ name: "", matchers: [blank()], tagId: "", personId: "" });
        setPreview(null); setTested(""); setNotice(`Saved ${usable.name}. Choose the next description.`);
        setState(await api.vendors());
        nameInput.current?.focus();
      }
    } catch (e) {
      setError(e.message); setTested("");
    } finally {
      saving.current = false; setWorking(false);
    }
  }
  async function remove() {
    setWorking(true);
    try {
      await api.removeVendor(vendor.id, vendor.version);
      notify({ title: `Deleted ${vendor.name}`, description: "Its transactions show their bank descriptions again. Tags stay as they are.", tone: "success" });
      await onSaved?.();
      onClose();
    } catch (e) { setError(e.message); setConfirm(false); setWorking(false); }
  }
  const pages = fresh ? Math.max(1, Math.ceil(preview.matches.length / 25)) : 1, current = Math.min(page, pages - 1);
  const sorted = fresh ? [...preview.matches].sort((a, b) => b.conflicts.length - a.conflicts.length) : [];
  return (
    <WorkspaceModal className="vd-editor-dialog" size="wide" title={vendor ? `Edit ${vendor.name}` : "New vendor"} onClose={() => { if (!saving.current) onClose(); }}
      footer={<>
        {vendor && <span className="footer-start"><button disabled={working} className="danger" onClick={() => setConfirm(true)}>Delete vendor</button></span>}
        <button disabled={working} onClick={onClose}>Cancel</button>
        {!vendor && <button disabled={working || blocked} onClick={() => save(true)}>Save and add another</button>}
        <button className="primary" disabled={working || blocked} onClick={() => save(false)}>Save vendor</button>
      </>}>
      <div className="vd-editor-layout">
        <aside className="vd-unaliased" aria-label="Bank descriptions without a vendor">
          <h3>Without a vendor</h3>
          <p className="form-help">{state ? `${plural(groups.length, "description")}. Choose one to add it to this vendor.` : "Loading descriptions…"}</p>
          {groups.length > 10 && <input type="search" aria-label="Search descriptions without a vendor" placeholder="Find a description or account" value={query} onChange={(e) => { setQuery(e.target.value); setListPage(0); }} />}
          <div className="vd-unaliased-list">
            {pending.slice(listCurrent * 10, listCurrent * 10 + 10).map((g) => (
              <button key={g.id} disabled={working} onClick={() => choose(g)} aria-label={`Add ${g.description}`}>
                <strong title={g.description}>{g.description}</strong>
                <small>{g.rows.length > 1 ? `${plural(g.rows.length, "transaction")}, latest ${dayLabel(g.rows[0].date)}` : `${g.rows[0].account}, ${dayLabel(g.rows[0].date)}`}</small>
                <span className="tabular">{g.rows.length > 1 ? "" : money(g.rows[0].amountCents, g.rows[0].currency)}</span>
              </button>
            ))}
            {state && !pending.length && <p className="form-help">{q ? "Nothing matches that search." : "Every description has a vendor."}</p>}
          </div>
          {listPages > 1 && (
            <div className="vd-pages">
              <button className="icon ghost sm" aria-label="Previous descriptions" disabled={listCurrent === 0} onClick={() => setListPage(listCurrent - 1)}><Icon name="chevron-left" size={16} /></button>
              <span>{listCurrent + 1} of {listPages}</span>
              <button className="icon ghost sm" aria-label="Next descriptions" disabled={listCurrent === listPages - 1} onClick={() => setListPage(listCurrent + 1)}><Icon name="chevron-right" size={16} /></button>
            </div>
          )}
        </aside>
        <div className="vd-editor-main">
          {notice && <Alert tone="success">{notice}</Alert>}
          <label className="vd-name">Name<input ref={nameInput} data-autofocus={draft.matchers[0]?.text ? "" : undefined} maxLength={80} placeholder="Juniper Café" value={draft.name} disabled={working} onChange={(e) => update({ name: e.target.value })} /></label>
          <div className="vd-field">
            <span>Which transactions</span>
            <small className="form-help">Bank descriptions that match any of these, in every account.</small>
            <Matchers matchers={draft.matchers} counts={shownCounts} fresh={!!fresh} disabled={working} onChange={(matchers) => update({ matchers })} />
          </div>
          <div className="vd-field">
            <span>New transactions get</span>
            <div className="vd-gives">
              <TagSelect value={draft.tagId} entities={entities} disabled={working} onChange={(tagId) => update({ tagId })} />
              <select aria-label="Person for new transactions" value={draft.personId} disabled={working} onChange={(e) => update({ personId: e.target.value })}>
                <option value="">No person</option>
                {people.map((p) => <option key={p.id} value={p.id}>Paid {p.name}</option>)}
              </select>
            </div>
            <small className="form-help">{draft.tagId || draft.personId ? "Only when they have nothing on them yet. An expense tag goes on money out and an income tag on money in; Paid a person is for money out." : "Optional. Without a tag or person, the vendor only names its transactions."}</small>
          </div>
          {error && <Alert>{error}</Alert>}
          {!usable.name.trim() || !usable.matchers.length ? (
            usable.matchers.length ? <p className="form-help">Add a name to see which transactions it covers.</p> : null
          ) : !fresh ? (
            <p className="form-help" role="status">{checking ? "Checking every transaction…" : ""}</p>
          ) : (
            <section className="vd-preview" aria-label="Vendor preview">
              <p className="vd-summary" role="status">
                <strong>{preview.matches.length ? `Covers ${plural(preview.matches.length, "transaction")}` : "No transactions match yet"}</strong>
                <small>{preview.matches.length ? "Across every month and account, including deleted accounts." : "It will still name matching transactions you import later."}</small>
              </p>
              {!!preview.duplicates.length && <Alert>Another vendor is already called {preview.duplicates.map((r) => r.name).join(", ")}.</Alert>}
              {preview.conflicts.length > 0 && <Alert tone="warning">{plural(preview.conflicts.length, "transaction")} would also match {[...new Set(preview.conflicts.flatMap((m) => m.conflicts.map((c) => c.name)))].join(", ")}. Make a matcher more specific so each transaction has one vendor.</Alert>}
              {ready > 0 && (
                <label className="vd-apply">
                  <input type="checkbox" checked={applyExisting} disabled={working} onChange={(e) => setApplyExisting(e.target.checked)} />
                  <span>Also give {plural(ready, "transaction")} you already have {gives}<small>Only ones with nothing on them yet. You can undo it from the message after saving.</small></span>
                </label>
              )}
              {!!preview.matches.length && (
                <div className="vd-results">
                  {sorted.slice(current * 25, current * 25 + 25).map((r) => (
                    <article key={r.id} className={r.conflicts.length ? "vd-conflict" : ""}>
                      <div>
                        <span className="vd-rename"><s>{r.description}</s><Icon name="arrow-right" size={16} /><strong>{usable.name}</strong></span>
                        <small>{r.account}{r.deleted ? " (deleted)" : ""}, {dayLabel(r.date)}{r.conflicts.length ? ` · also matches ${r.conflicts.map((c) => c.name).join(", ")}` : Object.keys(r.changes).length ? ` · gets ${givesLabel(r.changes, entities)}` : ""}</small>
                      </div>
                      <span className="tabular">{money(r.amountCents, r.currency)}</span>
                    </article>
                  ))}
                </div>
              )}
              {pages > 1 && (
                <div className="vd-pages">
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
        <ConfirmDialog title={`Delete ${vendor.name}?`} confirmLabel="Delete vendor" cancelLabel="Keep vendor" busy={working} onClose={() => setConfirm(false)} onConfirm={remove}>
          <p>Its transactions go back to their bank descriptions, and new ones won't be tagged by it. Tags it already gave stay as they are.</p>
        </ConfirmDialog>
      )}
    </WorkspaceModal>
  );
}

/* On the page: descriptions that have no vendor yet. Choosing one opens the editor with it filled in. */
function Unmatched({ id, rows, disabled, onChoose }) {
  const groups = useMemo(() => groupDescriptions(rows), [rows]);
  const [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const q = query.trim().toLowerCase();
  const shown = groups.filter((g) => g.description.toLowerCase().includes(q) || g.rows.some((r) => (r.account || "").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(shown.length / 10)), current = Math.min(page, pages - 1);
  return (
    <section className="vd-page-unaliased" aria-labelledby={id + "-title"} id={id} tabIndex={-1}>
      <div className="vd-page-unaliased-head">
        <h2 id={id + "-title"}>Without a vendor</h2>
        {groups.length > 10 && <input type="search" aria-label="Search descriptions without a vendor" placeholder="Find a description or account" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />}
      </div>
      <p className="form-help">{plural(groups.length, "description")}, most frequent first. Choose one to make it a vendor; you see every transaction it covers before saving.</p>
      <div className="vd-unaliased-list">
        {shown.slice(current * 10, current * 10 + 10).map((g) => (
          <button key={g.id} disabled={disabled} aria-label={`Make ${g.description} a vendor`} onClick={() => onChoose(g)}>
            <strong title={g.description}>{g.description}</strong>
            <small>{g.rows.length > 1 ? `${plural(g.rows.length, "transaction")}, latest ${dayLabel(g.rows[0].date)}` : `${g.rows[0].account}, ${dayLabel(g.rows[0].date)}`}</small>
            <span className="tabular">{g.rows.length > 1 ? "" : money(g.rows[0].amountCents, g.rows[0].currency)}</span>
          </button>
        ))}
        {!shown.length && <p className="form-help">Nothing matches that search.</p>}
      </div>
      {pages > 1 && (
        <div className="vd-pages">
          <button className="icon ghost sm" aria-label="Previous descriptions" disabled={current === 0} onClick={() => setPage(current - 1)}><Icon name="chevron-left" size={16} /></button>
          <span>{current + 1} of {pages}</span>
          <button className="icon ghost sm" aria-label="Next descriptions" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><Icon name="chevron-right" size={16} /></button>
        </div>
      )}
    </section>
  );
}

export function VendorsWorkspace({ data, run, busy, onAssistant }) {
  const listId = "vendors-without";
  const [state, setState] = useState(null), [entities, setEntities] = useState([]), [editing, setEditing] = useState(null), [error, setError] = useState(""), [query, setQuery] = useState("");
  const [suggesting, setSuggesting] = useState(false), assistant = useAssistant();
  async function load() {
    const [vendors, review] = await Promise.all([api.vendors(), api.reviewState()]);
    setState(vendors); setEntities(categoryColors(review.entities || []));
  }
  useEffect(() => {
    let live = true;
    Promise.all([api.vendors(), api.reviewState()])
      .then(([vendors, review]) => { if (live) { setState(vendors); setEntities(categoryColors(review.entities || [])); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data]);
  // Saves go through the shell so other pages refresh; this page reloads its own lists too.
  const saved = () => run(async () => { await load(); return true; });
  const all = state?.vendors || [];
  const shown = all.filter((v) => `${v.name} ${v.matchers.map((m) => m.text).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const waiting = all.reduce((n, v) => n + v.waiting, 0);
  const unmatched = (state?.unmatched || []).filter((r) => !r.deleted);
  async function applyAll() {
    try {
      const result = await run(() => api.applyVendors(state.token));
      if (!result) return;
      await load();
      notify({ title: `Tagged ${plural(result.applied, "transaction")} from their vendors`, tone: "success", action: result.batch ? { label: "Undo", onClick: () => run(() => api.undoVendorApply(result.batch)).then(load) } : undefined });
    } catch (e) { setError(e.message); }
  }
  function suggest() {
    const ready = readiness(assistant.state);
    if (!ready.ok) { notify({ id: "assistant-setup", title: "Claude isn't ready", description: ready.reason, tone: "warning", action: onAssistant ? { label: "Set up Claude", onClick: onAssistant } : undefined }); return; }
    setSuggesting(true);
  }
  return (
    <section className="vendors-workspace workspace-page" aria-label="Vendors">
      <div className="page-heading">
        <div><h1>Vendors</h1><p>One name for every bank description that's really the same place, and the tag or person its new transactions get. Bank records themselves never change.</p></div>
        <div className="page-heading-actions">
          {unmatched.length > 0 && <button disabled={busy || !state} onClick={suggest}><Icon name="sparkles" size={16} />Suggest vendors</button>}
          <button className="primary" disabled={busy || !state} onClick={() => setEditing({ vendor: null })}><Icon name="plus" size={16} />New vendor</button>
        </div>
      </div>
      <div className="vd-body">
        {(all.length > 6 || waiting > 0 || unmatched.length > 0) && (
          <div className="og-toolbar">
            {all.length > 6 && <input type="search" aria-label="Search vendors" placeholder="Find a vendor" value={query} onChange={(e) => setQuery(e.target.value)} />}
            {state && (unmatched.length ? <button type="button" className="link og-stat" onClick={() => { const list = document.getElementById(listId); list?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); list?.focus({ preventScroll: true }); }}>{plural(unmatched.length, "transaction")} without one</button> : <span className="og-stat">Every transaction has one</span>)}
            {waiting > 0 && <button disabled={busy} onClick={applyAll}>Tag {plural(waiting, "transaction")} from their vendors</button>}
          </div>
        )}
        {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
        {!!state?.conflicts.length && (
          <Alert tone="warning" title={`${plural(state.conflicts.length, "transaction matches", "transactions match")} two vendors`}>
            <p>They keep their bank descriptions and get nothing automatically until one vendor is made more specific.</p>
            <ul className="vd-conflict-list">
              {state.conflicts.map((r) => (
                <li key={r.id}>
                  <span>{r.description} <small>{r.account}, {dayLabel(r.date)}</small></span>
                  <span>{r.vendorConflicts.map((c) => <button key={c.id} className="link" onClick={() => setEditing({ vendor: all.find((v) => v.id === c.id) })}>Edit {c.name}</button>)}</span>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {!state ? (
          <p role="status">{error ? "Vendors couldn't be loaded." : "Loading vendors…"}</p>
        ) : !all.length ? (
          <div className="empty-state">
            <Icon name="store" size={24} />
            <h2>One name for each place you spend.</h2>
            <p>Descriptions like “SQ *BEAN COUNTER 1042” and “BEAN COUNTER ONLINE” can both show as Bean Counter, and new ones can be tagged Coffee as they're imported. {unmatched.length ? "Choose a description below to start." : "Import a bank export to start."}</p>
          </div>
        ) : !shown.length ? (
          <p className="form-help">No vendors match that search.</p>
        ) : (
          <div className="og-rows">
            {shown.map((v) => {
              const gives = givesLabel(v, entities);
              return (
                <article className="og-row" key={v.id}>
                  <div className="og-row-body">
                    <h3 title={v.name}>{v.name}</h3>
                    <small>{[`Descriptions that ${describeMatchers(v.matchers, { plural: true })}`, plural(v.matched, "transaction"), gives ? `new ones get ${gives}` : "", v.waiting ? `${v.waiting} unsorted could get it` : "", v.conflicts ? plural(v.conflicts, "clash", "clashes") : ""].filter(Boolean).join(" · ")}</small>
                  </div>
                  <button className="sm" disabled={busy} aria-label={`Edit vendor ${v.name}`} onClick={() => setEditing({ vendor: v })}>Edit</button>
                </article>
              );
            })}
          </div>
        )}
        {unmatched.length > 0 && <Unmatched id={listId} rows={unmatched} disabled={busy} onChoose={(g) => setEditing({ vendor: null, seed: { description: g.description } })} />}
      </div>
      {editing && <VendorEditor key={editing.vendor?.id || "new"} vendor={editing.vendor} seed={editing.seed} entities={entities} onSaved={saved} onClose={() => setEditing(null)} />}
      {suggesting && <VendorSuggestions onClose={() => setSuggesting(false)} onApplied={saved} />}
    </section>
  );
}
