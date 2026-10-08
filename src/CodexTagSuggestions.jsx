// Codex suggestions for categories and tags, reviewed before anything changes. "missing" proposes new
// tags (and categories) with the transactions they fit; "restructure" proposes renames, moves, merges,
// new categories and deletions. Each suggestion has its own checkbox; approved ones are applied in order
// through the usual entity, organize and merge saves, and the dialog reports what happened to each.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Alert } from "./ui.jsx";
import { notify } from "./toast.jsx";
import { palette } from "./snapshots-v2-atoms.jsx";
import { plural } from "./format.js";
import { seconds, effortLabels } from "./codex.js";
import "./codex.css";

const api = window.urbanomics;

/** While Codex works: what it is doing, and how long it has been. */
export function Thinking({ title, detail }) {
  const [elapsed, setElapsed] = useState(0), started = useRef(Date.now());
  useEffect(() => { const t = setInterval(() => setElapsed(Date.now() - started.current), 500); return () => clearInterval(t); }, []);
  return (
    <div className="cx-thinking" role="status">
      <Icon name="loader-circle" size={24} className="cx-spin" />
      <b>{title}</b>
      <small>{detail}</small>
      <small>{seconds(elapsed)}</small>
    </div>
  );
}
export function RunNote({ run }) {
  if (!run) return null;
  return <span className="cx-run"><Icon name="sparkles" size={16} />{run.model || "Codex default"} · {run.effort ? effortLabels[run.effort] || run.effort : "default reasoning"} · {seconds(run.ms)}</span>;
}
function Outcome({ value }) {
  if (!value) return null;
  return value.ok ? <span className="cx-outcome is-ok"><Icon name="check" size={16} />{value.message}</span> : <span className="cx-outcome is-error"><Icon name="circle-alert" size={16} />{value.message}</span>;
}

export function TagSuggestions({ mode, entities, onClose, onApplied }) {
  const [result, setResult] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState({}), [edits, setEdits] = useState({}), [outcomes, setOutcomes] = useState({}), [applying, setApplying] = useState(false), [applied, setApplied] = useState(false);
  const buckets = entities.filter((e) => e.kind === "bucket");
  useEffect(() => {
    let live = true;
    setResult(null); setError(""); setOutcomes({}); setApplied(false);
    api.suggestTags(mode).then((r) => {
      if (!live) return;
      setResult(r);
      const items = mode === "restructure" ? r.changes : r.suggestions;
      setPicked(Object.fromEntries(items.map((s) => [s.key, true])));
      setEdits(mode === "restructure" ? Object.fromEntries(r.changes.filter((c) => c.type === "create-tag").map((c) => [c.key, { tagUnsorted: c.unsorted.length > 0 }])) : Object.fromEntries(r.suggestions.map((s) => [s.key, { name: s.name, category: s.categoryId || (s.newCategory ? "new:" + s.newCategory : ""), tagUnsorted: s.unsorted.length > 0 }])));
    }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [mode, attempt]);

  const items = result ? (mode === "restructure" ? result.changes : result.suggestions) : [];
  // A change that needs another (a move into a new category) is only on when that one is.
  const blocked = (s) => (s.needs || []).some((k) => !picked[k]);
  const chosen = items.filter((s) => picked[s.key] && !blocked(s) && !outcomes[s.key]?.ok);
  const title = mode === "restructure" ? "Suggested restructure" : "Suggested tags";

  async function apply() {
    setApplying(true);
    const results = {};
    const record = (key, ok, message) => { results[key] = { ok, message }; setOutcomes((o) => ({ ...o, [key]: { ok, message } })); };
    try {
      if (mode === "restructure") await applyRestructure(chosen, edits, record);
      else await applyMissing(chosen, edits, record);
    } finally {
      setApplying(false); setApplied(true);
      const done = Object.values(results).filter((r) => r.ok).length, failed = Object.values(results).length - done;
      notify({ title: failed ? `${plural(done, "change")} applied, ${failed} didn't` : `${plural(done, "change")} applied`, tone: failed ? "warning" : "success" });
      onApplied?.();
    }
  }

  return (
    <WorkspaceModal size="wide" title={title} onClose={applying ? () => {} : onClose}
      footer={<>
        {result && <RunNote run={result.run} />}
        {result && !applied && <button type="button" disabled={applying} onClick={() => setAttempt((n) => n + 1)}><Icon name="refresh-cw" size={16} />Ask again</button>}
        <button type="button" disabled={applying} onClick={onClose}>{applied ? "Close" : "Cancel"}</button>
        {result && chosen.length > 0 && <button type="button" className="primary" disabled={applying} onClick={apply}>{applying ? "Applying…" : mode === "restructure" ? `Apply ${plural(chosen.length, "change")}` : `Create ${plural(chosen.length, "tag")}`}</button>}
      </>}>
      {error ? <Alert title="Codex couldn't make suggestions.">{error}</Alert>
        : !result ? <Thinking title={mode === "restructure" ? "Codex is reading your categories and tags…" : "Codex is reading your transactions…"} detail={mode === "restructure" ? "It looks for duplicates, tags in the wrong place and vague categories. Nothing changes until you approve it." : "It looks for spending and income your tags don't cover yet. Nothing changes until you approve it."} />
        : !items.length ? <div className="empty-state"><Icon name="circle-check" size={24} /><h2>{mode === "restructure" ? "Your structure already reads well." : "Nothing is missing."}</h2><p>{mode === "restructure" ? "Codex didn't find a change worth making." : "Codex thinks your tags already cover your transactions."}</p></div>
        : mode === "restructure" ? <Restructure result={result} picked={picked} setPicked={setPicked} blocked={blocked} outcomes={outcomes} applied={applied} edits={edits} setEdits={setEdits} />
        : <Missing items={items} buckets={buckets} picked={picked} setPicked={setPicked} edits={edits} setEdits={setEdits} outcomes={outcomes} applied={applied} />}
    </WorkspaceModal>
  );
}

function Missing({ items, buckets, picked, setPicked, edits, setEdits, outcomes, applied }) {
  const newNames = [...new Set(items.filter((s) => s.newCategory).map((s) => s.newCategory))];
  return (
    <>
      <p className="cx-summary">Check the ones you want. You can rename a tag or choose another category first. Tagging fills only transactions that have nothing on them yet.</p>
      <div className="cx-list">
        {items.map((s) => {
          const edit = edits[s.key], on = !!picked[s.key], done = outcomes[s.key]?.ok;
          return (
            <article key={s.key} className={"cx-item" + (on ? "" : " is-off") + (done ? " is-done" : "")}>
              <input type="checkbox" aria-label={`Create ${edit.name}`} checked={on} disabled={applied && done} onChange={(e) => setPicked((p) => ({ ...p, [s.key]: e.target.checked }))} />
              <div className="cx-item-body">
                <div className="cx-item-head">
                  <span className="cx-kind">{s.flowType === "income" ? "Income tag" : "Expense tag"}</span>
                  <input type="text" aria-label="Tag name" value={edit.name} disabled={done} onChange={(e) => setEdits((x) => ({ ...x, [s.key]: { ...edit, name: e.target.value } }))} />
                  {s.flowType === "expense" && (
                    <select aria-label={`Category for ${edit.name}`} value={edit.category} disabled={done} onChange={(e) => setEdits((x) => ({ ...x, [s.key]: { ...edit, category: e.target.value } }))}>
                      <option value="">Ungrouped</option>
                      {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      {newNames.map((n) => <option key={n} value={"new:" + n}>New category: {n}</option>)}
                    </select>
                  )}
                </div>
                <p className="cx-reason">{s.reason}</p>
                {s.vendors.length > 0 && <div className="cx-chips">{s.vendors.slice(0, 8).map((v) => <span key={v.name} className="cx-chip" title={v.name}>{v.name}{v.count > 1 ? ` × ${v.count}` : ""}</span>)}{s.vendors.length > 8 && <span className="cx-chip">+{s.vendors.length - 8} more</span>}</div>}
                <div className="cx-meta">
                  <span>Fits {plural(s.transactions, "transaction")}</span>
                  {s.unsorted.length > 0 && <label className="cx-check"><input type="checkbox" checked={edit.tagUnsorted} disabled={done} onChange={(e) => setEdits((x) => ({ ...x, [s.key]: { ...edit, tagUnsorted: e.target.checked } }))} />Also tag the {plural(s.unsorted.length, "untagged one")}</label>}
                  <Outcome value={outcomes[s.key]} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

const groupTitles = { "create-category": "New categories", "create-tag": "New tags", rename: "Renames", move: "Moves", merge: "Merges", delete: "Deletions" };
function describe(c) {
  if (c.type === "create-category") return <>Create the category <b>{c.name}</b></>;
  if (c.type === "create-tag") return <>Create the {c.flowType === "income" ? "income tag" : "tag"} <b>{c.name}</b>{c.flowType === "expense" ? <> in <b>{c.toCategory || "Ungrouped"}</b></> : null}</>;
  if (c.type === "rename") return <>Rename {c.kind === "bucket" ? "the category" : ""} <b>{c.from}</b> to <b>{c.name}</b></>;
  if (c.type === "move") return <>Move <b>{c.name}</b> {c.fromCategory ? <>from {c.fromCategory} </> : <>from Ungrouped </>}to <b>{c.toCategory || "Ungrouped"}</b></>;
  if (c.type === "merge") return <>Merge <b>{c.name}</b> into <b>{c.intoName}</b>{c.transactions ? ` (${plural(c.transactions, "transaction")} move)` : ""}</>;
  return <>Delete {c.kind === "bucket" ? "the empty category" : "the unused tag"} <b>{c.name}</b></>;
}
function Restructure({ result, picked, setPicked, blocked, outcomes, applied, edits, setEdits }) {
  const byKey = new Map(result.changes.map((c) => [c.key, c]));
  return (
    <>
      {result.summary && <p className="cx-summary">{result.summary}</p>}
      {Object.entries(groupTitles).map(([type, label]) => {
        const changes = result.changes.filter((c) => c.type === type);
        if (!changes.length) return null;
        return (
          <section key={type}>
            <h3 className="cx-group-title">{label}</h3>
            <div className="cx-list">
              {changes.map((c) => {
                const off = blocked(c), on = !!picked[c.key] && !off, done = outcomes[c.key]?.ok;
                return (
                  <article key={c.key} className={"cx-item" + (on ? "" : " is-off") + (done ? " is-done" : "")}>
                    <input type="checkbox" aria-label={`Apply: ${c.type} ${c.name}`} checked={on} disabled={off || (applied && done)} onChange={(e) => setPicked((p) => ({ ...p, [c.key]: e.target.checked }))} />
                    <div className="cx-item-body">
                      <div className="cx-item-head"><Icon name={type === "merge" ? "git-merge" : type === "create-category" ? "folder-plus" : type === "create-tag" ? "plus" : type === "rename" ? "pencil" : type === "move" ? "arrow-right" : "trash-2"} size={16} /><span>{describe(c)}</span></div>
                      <p className="cx-reason">{c.reason}</p>
                      {type === "create-tag" && c.vendors.length > 0 && <div className="cx-chips">{c.vendors.slice(0, 8).map((v) => <span key={v.name} className="cx-chip" title={v.name}>{v.name}{v.count > 1 ? ` × ${v.count}` : ""}</span>)}{c.vendors.length > 8 && <span className="cx-chip">+{c.vendors.length - 8} more</span>}</div>}
                      {type === "create-tag" && <div className="cx-meta"><span>Fits {plural(c.transactions, "transaction")}</span>{c.unsorted.length > 0 && <label className="cx-check"><input type="checkbox" checked={!!edits[c.key]?.tagUnsorted} disabled={done} onChange={(e) => setEdits((x) => ({ ...x, [c.key]: { tagUnsorted: e.target.checked } }))} />Also tag the {plural(c.unsorted.length, "untagged one")}</label>}</div>}
                      {(type === "merge" || off) && <div className="cx-meta">
                        {type === "merge" && <span>Its transactions and rules move to {c.intoName}, then {c.name} is deleted. A recovery copy is kept.</span>}
                        {off && <span>Needs: {(c.needs || []).map((k) => byKey.get(k)?.name).join(", ")}</span>}
                      </div>}
                      <Outcome value={outcomes[c.key]} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

/* ---------- applying approved suggestions ---------- */
async function applyMissing(chosen, edits, record) {
  const created = new Map(), state = await api.reviewState();
  let colorIndex = state.entities.filter((e) => e.kind === "bucket").length;
  const made = [];
  for (const s of chosen) {
    const edit = edits[s.key], name = edit.name.trim();
    try {
      let parentId = s.flowType === "expense" && !edit.category.startsWith("new:") ? edit.category : "";
      if (s.flowType === "expense" && edit.category.startsWith("new:")) {
        const categoryName = edit.category.slice(4);
        if (!created.has(categoryName)) created.set(categoryName, await api.saveEntity("bucket", { name: categoryName, color: palette[colorIndex++ % palette.length] }));
        parentId = created.get(categoryName);
      }
      const id = await api.saveEntity("category", { name, flowType: s.flowType, parentId, color: "#9aa993" });
      made.push({ s, id, edit, name });
      record(s.key, true, edit.tagUnsorted && s.unsorted.length ? "Created, tagging…" : "Created");
    } catch (e) { record(s.key, false, e.message); }
  }
  await tagUntouched(made.map(({ s, id, edit, name }) => ({ key: s.key, id, name, flowType: s.flowType, unsorted: edit.tagUnsorted ? s.unsorted : [] })), record);
}
/* Tag only rows that still have nothing on them (no tags, repayment or transfer), each once, in batches. */
async function tagUntouched(made, record) {
  const fresh = await api.reviewState(), taken = new Set();
  for (const s of made) {
    const { id, name } = s;
    if (!s.unsorted.length) continue;
    const ids = new Set(s.unsorted), changes = [];
    for (const r of fresh.records) {
      if (!ids.has(r.id) || taken.has(r.id) || r.deleted || r.amountCents === 0) continue;
      const saved = r.tagsAutomatic ? [] : r.review.tags;
      if (saved.length || r.review.kind === "transfer" || r.review.transferId || r.review.kind === "repayment" || (r.review.allocations || []).some((a) => a.cents > 0)) continue;
      if ((r.amountCents > 0) !== (s.flowType === "income")) continue;
      taken.add(r.id);
      changes.push({ id: r.id, version: r.version, tags: [{ id, cents: Math.abs(r.amountCents) }] });
    }
    try {
      for (let i = 0; i < changes.length; i += 500) await api.organize(changes.slice(i, i + 500));
      record(s.key, true, changes.length ? `Created and tagged ${plural(changes.length, "transaction")}` : "Created");
    } catch (e) { record(s.key, false, `Created ${name}, but tagging failed: ${e.message}`); }
  }
}
async function applyRestructure(chosen, edits, record) {
  const order = ["create-category", "create-tag", "rename", "move", "merge", "delete"], made = [];
  const created = new Map();
  let state = await api.reviewState(), colorIndex = state.entities.filter((e) => e.kind === "bucket").length;
  const current = (id) => state.entities.find((e) => e.id === id);
  for (const type of order) {
    for (const c of chosen.filter((x) => x.type === type)) {
      try {
        if (type === "create-category") { created.set(c.name, await api.saveEntity("bucket", { name: c.name, color: palette[colorIndex++ % palette.length] })); record(c.key, true, "Created"); }
        else if (type === "create-tag") {
          const parentId = c.newCategory ? created.get(c.newCategory) : c.parentId;
          if (c.newCategory && !parentId) throw new Error(`${c.newCategory} wasn't created.`);
          const id = await api.saveEntity("category", { name: c.name, flowType: c.flowType, parentId: parentId || "", color: "#9aa993" });
          made.push({ key: c.key, id, name: c.name, flowType: c.flowType, unsorted: edits[c.key]?.tagUnsorted ? c.unsorted : [] });
          record(c.key, true, edits[c.key]?.tagUnsorted && c.unsorted.length ? "Created, tagging…" : "Created");
        }
        else if (type === "rename") {
          const e = current(c.id); if (!e) throw new Error("It no longer exists.");
          await api.saveEntity(e.kind, { ...e, color: e.customColor ?? e.color, name: c.name });
          record(c.key, true, "Renamed");
        } else if (type === "move") {
          const e = current(c.id); if (!e) throw new Error("It no longer exists.");
          const parentId = c.newCategory ? created.get(c.newCategory) : c.parentId;
          if (c.newCategory && !parentId) throw new Error(`${c.newCategory} wasn't created.`);
          await api.saveEntity("category", { ...e, color: e.customColor ?? e.color, parentId: parentId || "" });
          record(c.key, true, "Moved");
        } else if (type === "merge") {
          const r = await api.mergeTags(c.id, c.into);
          record(c.key, true, r.moved ? `Merged · ${plural(r.moved, "transaction")} moved` : "Merged");
        } else {
          await api.removeEntity(c.id);
          record(c.key, true, "Deleted");
        }
      } catch (e) { record(c.key, false, e.message); }
      state = await api.reviewState();
    }
  }
  await tagUntouched(made, record);
}
