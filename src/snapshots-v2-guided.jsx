// The guided setup for staged exports. Files sharing a header row are one kind; each kind gets one
// screen that states what the cells proved (columns, date order, which way money goes) in plain
// words and asks only about what they could not prove. A kind can belong to more than one account
// (one bank, one export format, several accounts): the accounts are tabs that stay on screen, the
// file list always shows which account each file goes to, and the selected tab holds that account's
// name, color and recognition sentence, for new and existing accounts alike. Nothing is saved until
// Looks right; nothing imports until the last screen's Import. A finished kind can be reopened.
import { Icon } from "@derekurban/design-system";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccountDot, api, palette, plural } from "./snapshots-v2-atoms.jsx";
import { Recognize } from "./recognize.jsx";
import { FloatingMenu, Swatches } from "./ui.jsx";
import { money } from "./format.js";
import { PreviewTable } from "./snapshots-v2-layout.jsx";
import {
  analyzeKind, compileRule, decompileRule, fileStem, formatLabel, fromMapping, monthsCovered, patternMatches,
  readRows, roleLabel, rolesComplete, ruleMatches, ruleModes, sharedStart, suggestName, suggestType, toMapping,
} from "./import-analysis.mjs";

const monthLabel = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-CA", { month: "short", year: "numeric" });
const readable = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");
const kindKeyOf = (inspect) => inspect.headers.join("\u0000");
let groupSeq = 0;

/* ---------- frame ---------- */
function Stage({ title, lede, step, steps, onBack, backLabel = "Back", next, nextLabel = "Continue", nextDisabled, aside, children, bodyKey, wide }) {
  return (
    <section className={`sv2-panel sv2-g-stage${wide ? " sv2-g-wide" : ""}`} aria-label="Set up files">
      <header className="sv2-g-head">
        <div>
          <p className="sv2-g-step">{steps ? `Step ${step} of ${steps}` : " "}</p>
          <h2>{title}</h2>
          {lede && <p className="sv2-quiet sv2-g-lede">{lede}</p>}
        </div>
        <div className="sv2-g-head-side">
          {aside}
          {steps && <ol className="sv2-g-dots" aria-hidden="true">{Array.from({ length: steps }, (_, i) => <li key={i} className={i + 1 < step ? "is-done" : i + 1 === step ? "is-now" : ""} />)}</ol>}
        </div>
      </header>
      <div className="sv2-g-body" key={bodyKey ?? title}>{children}</div>
      <footer className="sv2-g-foot">
        {onBack ? <button type="button" className={backLabel === "Back" ? "" : "ghost"} onClick={onBack}>{backLabel === "Back" && <Icon name="arrow-left" size={16} />}{backLabel}</button> : <span />}
        {next && <button type="button" className="primary" disabled={nextDisabled} onClick={next}>{nextLabel}<Icon name="arrow-right" size={16} /></button>}
      </footer>
    </section>
  );
}

function Fact({ ok, children, why, action }) {
  return (
    <li className={`sv2-g-fact${ok ? " is-ok" : " is-open"}`}>
      <span className="sv2-g-fact-mark" aria-hidden="true"><Icon name={ok ? "check" : "circle-help"} size={16} /></span>
      <div className="sv2-g-fact-main">
        <div className="sv2-g-fact-text">{children}</div>
        {why && <small>{why}</small>}
      </div>
      {action}
    </li>
  );
}

/* Table-first columns: click a heading, say what it holds. The menu floats above the scrolling table. */
function ColumnMapper({ headers, rows, roles, onChange }) {
  const [open, setOpen] = useState(null);
  const anchors = useRef({});
  const set = (i, role) => {
    const next = { ...roles };
    for (const k of Object.keys(next)) if (next[k] === role) delete next[k];
    if (role) next[i] = role; else delete next[i];
    onChange(next);
  };
  return (
    <div className="sv2-g-mapper">
      <table>
        <thead><tr>{headers.map((h, i) => (
          <th key={i} className={roles[i] ? "is-set" : ""}>
            <button type="button" ref={(el) => (anchors.current[i] = el)} className={`sv2-g-col${open === i ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={open === i} aria-label={`Column ${h}: ${roles[i] ? roleLabel[roles[i]] : "not used"}`} onClick={() => setOpen(open === i ? null : i)}>
              <span className="sv2-g-col-role">{roles[i] ? roleLabel[roles[i]] : "Not used"}</span>
              <span className="sv2-g-col-name">{h}<Icon name="chevron-down" size={16} /></span>
            </button>
          </th>
        ))}</tr></thead>
        <tbody>{rows.slice(0, 4).map((r, ri) => <tr key={ri}>{headers.map((_, i) => <td key={i} className={roles[i] ? "is-set" : ""}>{r[i] || <span className="sv2-g-blank">—</span>}</td>)}</tr>)}</tbody>
      </table>
      {open != null && (
        <FloatingMenu
          anchor={anchors.current[open]}
          label={`What column ${headers[open]} holds`}
          onClose={() => setOpen(null)}
          onSelect={(value) => set(open, value === "none" ? null : value)}
          items={[
            ...Object.entries(roleLabel).map(([id, label]) => ({ value: id, label, selected: roles[open] === id })),
            { type: "divider" },
            { value: "none", label: "Not used", selected: !roles[open] },
          ]}
        />
      )}
    </div>
  );
}

/* ---------- account tabs within a kind ----------
   A tab is one account: what it is called, colored and recognized by. Which files go to it follows
   from its recognition sentence, so the sentence and the assignment can never disagree. A file no
   sentence matches can be sent to a tab by hand for this batch only. An existing account carries its
   stored values and is saved back only if changed. */
const fromAccount = (a) => ({ id: "g" + ++groupSeq, existingId: a.id, name: a.name, type: a.kind || "", color: a.color, rule: decompileRule(a.prefixRegex || "") });
/* A new account takes the first palette color no account or other new account in this batch uses yet. */
const pickColor = (taken) => {
  const free = palette.find((c) => !taken.has(c.toUpperCase())) || palette[taken.size % palette.length];
  taken.add(free.toUpperCase());
  return free;
};
const freshTab = (jobs, rows, taken) => {
  const names = jobs.map((j) => j.filename), start = sharedStart(names);
  return { id: "g" + ++groupSeq, existingId: null, name: names.length ? suggestName(start || fileStem(names[0])) : "", type: suggestType(names, rows), color: pickColor(taken), rule: { mode: "starts", text: start || (names.length === 1 ? fileStem(names[0]) : "") } };
};
const takenColors = (accounts, state, except) => new Set([...accounts.map((a) => (a.color || "").toUpperCase()), ...Object.entries(state).filter(([key]) => key !== except).flatMap(([, st]) => (st.tabs || []).map((g) => g.color.toUpperCase()))]);
/* Which tab a file goes to: the one tab whose sentence matches its name; failing that, a hand-picked
   tab for this batch; two matching sentences are ambiguous and need a hand pick. */
function resolveFile(job, tabs, manual) {
  const matches = tabs.filter((g) => ruleMatches(g.rule, job.filename));
  const picked = tabs.find((g) => g.id === manual[job.id]);
  if (matches.length === 1) return { tab: matches[0], how: "rule" };
  if (matches.length > 1) return picked && matches.includes(picked) ? { tab: picked, how: "manual" } : { tab: null, how: "ambiguous", matches };
  return picked ? { tab: picked, how: "manual" } : { tab: null, how: "none" };
}
/* Files already assigned, or matched by an existing rule, start on that account. The rest are grouped
   by what stays the same in their names: two files from one bank's export format with different stems
   (a card and a chequing account) become two tabs; three months of one export stay one. */
function initialTabs(kind, accounts, byId, rows, taken) {
  const tabs = [], known = new Map(), rest = [], manual = {};
  for (const job of kind.jobs) {
    const acc = byId[job.accountId] || accounts.find((a) => a.prefixRegex && patternMatches(a.prefixRegex, job.filename));
    if (acc) { if (!known.has(acc.id)) known.set(acc.id, []); known.get(acc.id).push(job); } else rest.push(job);
  }
  for (const [id, jobs] of known) { const tab = fromAccount(byId[id]); tabs.push(tab); for (const job of jobs) if (!patternMatches(byId[id].prefixRegex || "", job.filename)) manual[job.id] = tab.id; }
  const byStem = new Map();
  for (const job of rest) { const key = fileStem(job.filename).toLowerCase(); if (!byStem.has(key)) byStem.set(key, []); byStem.get(key).push(job); }
  for (const jobs of byStem.values()) { const tab = freshTab(jobs, rows, taken); tabs.push(tab); for (const job of jobs) if (!ruleMatches(tab.rule, job.filename)) manual[job.id] = tab.id; }
  return { tabs, manual };
}
const groupLabel = (g) => g.name.trim() || "New account";

/* ---------- the setup ---------- */
export function GuidedSetup({ jobs, accounts, templates, run, busy, progress, settled, onImported, onBack, onRemoveAll, onGuide }) {
  const byId = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const [inspects, setInspects] = useState({});
  const [state, setState] = useState({});
  const [screen, setScreen] = useState("intro");
  const [walk, setWalk] = useState(null);

  // Read every staged file once per state of that file (its layout and account can change under us).
  const jobsKey = jobs.map((j) => `${j.id}:${j.schema || ""}:${j.accountId || ""}:${j.status}`).join(",");
  useEffect(() => {
    let live = true;
    for (const job of jobs) {
      const key = `${job.id}:${job.schema || ""}`;
      if (inspects[job.id]?.key === key) continue;
      api.inspectImport(job.id)
        .then((result) => live && setInspects((v) => ({ ...v, [job.id]: { key, result } })))
        .catch((error) => live && setInspects((v) => ({ ...v, [job.id]: { key, error: error.message } })));
    }
    return () => { live = false; };
  }, [jobsKey]);

  // Kinds: staged files that share a header row, read the same way.
  const kinds = useMemo(() => {
    const map = new Map(), unreadable = [];
    for (const job of jobs) {
      const entry = inspects[job.id];
      if (!entry) continue;
      if (entry.error || !entry.result?.headers?.length) { unreadable.push({ job, error: entry.error || entry.result?.error || "Cannot read this file." }); continue; }
      const key = kindKeyOf(entry.result);
      if (!map.has(key)) map.set(key, { key, headers: entry.result.headers, delimiter: entry.result.delimiter, jobs: [], inspects: [] });
      map.get(key).jobs.push(job);
      map.get(key).inspects.push(entry.result);
    }
    const list = [...map.values()].map((k) => {
      const ready = k.jobs.every((j) => j.schema && j.accountId && j.status === "queued");
      const templateId = k.jobs.find((j) => j.schema?.startsWith("custom:"))?.schema.slice(7) || k.inspects.find((i) => i.templateId)?.templateId || null;
      const template = templates.find((t) => t.id === templateId) || null;
      const assigned = [...new Set(k.jobs.map((j) => j.accountId).filter(Boolean))].map((id) => byId[id]).filter(Boolean);
      return { ...k, ready, template, assigned, files: k.inspects.map((i) => ({ name: i.filename, rows: i.sample || [] })) };
    });
    return { list, unreadable, pending: jobs.filter((j) => !inspects[j.id]).length };
  }, [jobs, inspects, templates, byId]);

  // First look at a kind: what the cells prove, what a saved layout already says, which accounts.
  // Files arrive one by one, so a kind's groups are rebuilt as its files fill in, until the person touches them.
  useEffect(() => {
    setState((current) => {
      let next = current, changed = false;
      for (const kind of kinds.list) {
        const ids = kind.jobs.map((j) => j.id).join(",");
        const rows = kind.files.flatMap((f) => f.rows);
        if (current[kind.key]) {
          const st = current[kind.key];
          if (st.jobIds !== ids && !st.groupsTouched) { next = { ...next, [kind.key]: { ...st, jobIds: ids, ...initialTabs(kind, accounts, byId, rows, takenColors(accounts, next, kind.key)), analysis: analyzeKind({ headers: kind.headers, files: kind.files }) } }; changed = true; }
          continue;
        }
        const an = analyzeKind({ headers: kind.headers, files: kind.files });
        const tpl = kind.template;
        next = { ...next, [kind.key]: {
          analysis: an, roles: tpl ? fromMapping(tpl.mapping) : an.roles, changed: false, saved: false, jobIds: ids, groupsTouched: false,
          dateFormat: tpl ? tpl.mapping.dateFormat : an.dateFits.length === 1 ? an.dateFits[0] : null, dateChosen: false,
          sign: tpl ? tpl.mapping.sign : an.sign, currency: tpl?.mapping.currency || "CAD",
          ...initialTabs(kind, accounts, byId, rows, takenColors(accounts, next, kind.key)),
          layoutRule: tpl ? decompileRule(tpl.prefixRegex || "") : { mode: "accounts", text: "" },
          columns: false, dates: null, preview: null, previewError: "",
        } };
        changed = true;
      }
      return changed ? next : current;
    });
  }, [kinds.list.map((k) => `${k.key}:${k.jobs.map((j) => j.id).join(",")}`).join("|")]);

  const upd = (key, patch) => setState((v) => ({ ...v, [key]: { ...v[key], ...(typeof patch === "function" ? patch(v[key]) : patch) } }));
  const todo = kinds.list.filter((k) => !k.ready);
  // The walk is fixed when it starts (new kinds append), so step counts never shift as kinds complete.
  const order = [...(walk || []), ...kinds.list.map((k) => k.key).filter((key) => !(walk || []).includes(key))].filter((key) => kinds.list.some((k) => k.key === key));
  const screens = ["intro", ...order, "check"];
  const ix = Math.max(0, screens.indexOf(screen));
  const steps = screens.length;
  const isReady = (key) => kinds.list.find((k) => k.key === key)?.ready;
  const forward = (from) => screens.slice(from + 1).find((key) => key === "check" || !isReady(key)) || "check";

  // When the open kind turns ready (its saves landed), move on; a reopened kind stays until Done.
  const wasReady = useRef({});
  useEffect(() => {
    const now = Object.fromEntries(kinds.list.map((k) => [k.key, k.ready]));
    const before = wasReady.current;
    wasReady.current = now;
    if (screen === "intro" || screen === "check") return;
    if (!kinds.list.some((k) => k.key === screen)) { setScreen("intro"); return; }
    if (now[screen] && before[screen] === false) setScreen(forward(ix));
  }, [screen, kinds.list.map((k) => `${k.key}:${k.ready}`).join("|")]);
  useEffect(() => { if (!jobs.length) { setScreen("intro"); setWalk(null); } }, [jobs.length]);

  const openQuestions = (kind) => {
    const st = state[kind.key];
    if (!st || kind.ready) return 0;
    const used = new Set(kind.jobs.map((j) => resolveFile(j, st.tabs, st.manual).tab?.id).filter(Boolean));
    return (!st.dateFormat ? 1 : 0) + (Object.values(st.roles).includes("amount") && st.sign == null ? 1 : 0) + (rolesComplete(st.roles) ? 0 : 1) + (st.tabs.some((g) => used.has(g.id) && !g.name.trim()) ? 1 : 0) + (kind.jobs.some((j) => !resolveFile(j, st.tabs, st.manual).tab) ? 1 : 0);
  };
  const totalOpen = todo.reduce((n, k) => n + openQuestions(k), 0);
  const startWalk = (target) => { if (!walk) setWalk(kinds.list.map((k) => k.key)); setScreen(target); };

  /* ---- intro ---- */
  if (screen === "intro" || !screens.includes(screen)) {
    const loading = kinds.pending > 0;
    return (
      <Stage
        title={loading ? "Reading your files…" : `You added ${plural(jobs.length, "file", "files")}.`}
        lede={loading ? "Looking at the columns and the first rows of each one." : [
          kinds.list.length > 1 ? `They come in ${kinds.list.length} export formats` : jobs.length > 1 ? "They share one export format" : "",
          kinds.unreadable.length ? `${plural(kinds.unreadable.length, "file", "files")} can't be read` : "",
        ].filter(Boolean).join(", and ").replace(/^(.)/, (c) => c.toUpperCase()) + (kinds.list.length > 1 || jobs.length > 1 || kinds.unreadable.length ? ". " : "") + (todo.length ? `Columns, dates and signs were read from the files themselves; ${totalOpen ? `${plural(totalOpen, "question", "questions")} ${totalOpen === 1 ? "needs" : "need"} your answer.` : "nothing needs your answer."}` : "Everything is recognized and ready to import.")}
        step={1} steps={steps} bodyKey="intro"
        aside={<span className="sv2-g-aside">{onGuide && <button type="button" className="link" onClick={onGuide}>How importing works</button>}<button type="button" className="link" disabled={busy} onClick={onRemoveAll}>Remove all files</button></span>}
        onBack={onBack} backLabel={settled ? "Back to snapshots" : "Set up later"}
        next={() => startWalk(todo[0]?.key || "check")} nextLabel={todo.length ? "Walk me through it" : "Check and import"} nextDisabled={loading || !kinds.list.length}
      >
        <ul className="sv2-g-found">
          {kinds.list.map((kind) => {
            const st = state[kind.key];
            const live = st ? st.tabs.filter((g) => kind.jobs.some((j) => resolveFile(j, st.tabs, st.manual).tab?.id === g.id)) : [];
            const names = kind.ready ? kind.assigned.map((a) => a.name) : live.map(groupLabel);
            const color = (kind.ready ? kind.assigned[0]?.color : live[0]?.color) || null;
            const type = !kind.ready && live.length === 1 && !live[0].existingId ? live[0].type : "";
            const months = st ? monthsCovered(kind.files.flatMap((f) => f.rows), st.roles, st.dateFormat) : [];
            const q = openQuestions(kind);
            return (
              <li key={kind.key} className={kind.ready ? "is-known" : ""} style={{ "--sv2-account": color }}>
                <span className="sv2-g-found-mark" aria-hidden="true"><Icon name={kind.ready ? "circle-check" : "circle-dashed"} size={18} /></span>
                <div className="sv2-g-found-main">
                  <b>{names.join(", ") || "New account"}{type ? <span className="sv2-quiet"> · {type}</span> : null}</b>
                  <small>{plural(kind.jobs.length, "file", "files")}{names.length > 1 ? ` · ${plural(names.length, "account", "accounts")}` : ""}{months.length ? ` · ${months.length === 1 ? monthLabel(months[0]) : `${monthLabel(months[0])} to ${monthLabel(months.at(-1))}`}` : ""}</small>
                  <span className={`sv2-g-found-status${q ? " is-open" : ""}`}>
                    {kind.ready ? (st?.saved ? "Set up" : "Recognized from earlier imports") : q ? `${plural(q, "question", "questions")} for you` : "Columns, dates and signs worked out"}
                    {kind.ready && <button type="button" className="link" onClick={() => startWalk(kind.key)}>Review</button>}
                  </span>
                </div>
                <div className="sv2-g-found-files">{kind.jobs.map((j) => (
                  <span key={j.id} className="sv2-g-chip">{j.filename}<button type="button" className="icon ghost sm" aria-label={`Remove ${j.filename}`} title="Remove this file" disabled={busy} onClick={() => run(() => api.dismiss(j.id), "File removed. Its archived copy stays.")}><Icon name="x" size={16} /></button></span>
                ))}</div>
              </li>
            );
          })}
          {kinds.unreadable.map(({ job, error }) => (
            <li key={job.id} className="is-bad">
              <span className="sv2-g-found-mark" aria-hidden="true"><Icon name="file-x" size={18} /></span>
              <div className="sv2-g-found-main"><b>{job.filename}</b><small>{error}</small><span className="sv2-g-found-status is-open">Can't be read<button type="button" className="link" disabled={busy} onClick={() => run(() => api.dismiss(job.id), "File removed. Its archived copy stays.")}>Remove</button></span></div>
              <div className="sv2-g-found-files" />
            </li>
          ))}
        </ul>
      </Stage>
    );
  }

  /* ---- check and import ---- */
  if (screen === "check") {
    const ready = jobs.filter((j) => j.schema && j.accountId && j.status === "queued");
    return (
      <Stage title="Ready to import" lede="Nothing has been imported yet. Each row is filed by its own date into its account's month; rows already recorded are matched, not added again." step={steps} steps={steps} bodyKey="check"
        onBack={() => setScreen(screens[steps - 2])}
        next={async () => { const value = await run(() => api.processImportBatch(ready.map((j) => j.id))); if (value !== false) onImported(value); }}
        nextLabel={progress ? `Importing ${progress.done} / ${progress.total}` : `Import ${plural(ready.length, "file", "files")}`} nextDisabled={!ready.length || ready.length !== jobs.length || busy}
      >
        <ul className="sv2-g-plan">{jobs.map((j) => { const a = byId[j.accountId], ok = ready.includes(j), home = kinds.list.find((k) => k.jobs.some((x) => x.id === j.id)); return (
          <li key={j.id} className={ok ? "" : "is-open"}>
            <span className="sv2-g-fact-mark" aria-hidden="true"><Icon name={ok ? "check" : "circle-help"} size={16} /></span>
            <span className="sv2-g-plan-file"><AccountDot color={a?.color} /><span>{j.filename}</span></span>
            <small>{ok ? `${a?.name}${j.rowCount != null ? ` · ${plural(j.rowCount, "row", "rows")}` : ""}` : "Not set up yet"}</small>
            {!ok && <span className="sv2-g-plan-actions">{home && <button type="button" className="sm" onClick={() => startWalk(home.key)}>Set up</button>}<button type="button" className="sm ghost" disabled={busy} onClick={() => run(() => api.dismiss(j.id), "File removed. Its archived copy stays.")}>Remove</button></span>}
          </li>
        ); })}</ul>
        {ready.length !== jobs.length && <p className="form-help">{jobs.length - ready.length === 1 ? "One file isn't set up yet. Set it up or remove it to import the rest." : `${jobs.length - ready.length} files aren't set up yet. Set them up or remove them to import the rest.`}</p>}
      </Stage>
    );
  }

  /* ---- one kind ---- */
  const kind = kinds.list.find((k) => k.key === screen), st = state[screen];
  if (!kind || !st) return <section className="sv2-panel sv2-g-stage"><p className="sv2-quiet" role="status">Reading…</p></section>;
  return <KindScreen key={kind.key} kind={kind} st={st} upd={(patch) => upd(kind.key, patch)} accounts={accounts} byId={byId} templates={templates} run={run} busy={busy} step={ix + 1} steps={steps} n={order.indexOf(kind.key) + 1} total={order.length} onBack={() => setScreen(screens[ix - 1])} onDone={() => setScreen(forward(ix))} />;
}

function KindScreen({ kind, st, upd, accounts, byId, templates, run, busy, step, steps, n, total, onBack, onDone }) {
  const H = kind.headers, first = kind.jobs[0], rows = kind.files.flatMap((f) => f.rows);
  const colOf = (role) => { const i = Object.keys(st.roles).find((k) => st.roles[k] === role); return i == null ? null : Number(i); };
  const dateCol = colOf("date"), amountCol = colOf("amount");
  const mapping = toMapping(st.roles, { dateFormat: st.dateFormat, sign: st.sign, currency: st.currency, delimiter: kind.delimiter });
  const resolved = Object.fromEntries(kind.jobs.map((j) => [j.id, resolveFile(j, st.tabs, st.manual)]));
  const filesOf = (g) => kind.jobs.filter((j) => resolved[j.id].tab?.id === g.id);
  const live = st.tabs.filter((g) => filesOf(g).length);
  const unplaced = kind.jobs.filter((j) => !resolved[j.id].tab);
  const namesOk = live.every((g) => g.name.trim());
  const complete = rolesComplete(st.roles) && !!st.dateFormat && (amountCol == null || st.sign != null) && namesOk && live.length > 0 && !unplaced.length;

  // The date order, checked against every row of the first file by the real parser.
  useEffect(() => {
    if (dateCol == null) { upd({ dates: null }); return; }
    let alive = true;
    upd({ dates: null });
    api.detectImportDates(first.id, dateCol, kind.delimiter).then((result) => {
      if (!alive) return;
      upd((cur) => {
        const fits = result.candidates.filter((c) => result.rowCount > 0 && c.validCount === result.rowCount).map((c) => c.format);
        let dateFormat = cur.dateFormat;
        if (!cur.dateChosen) dateFormat = result.status === "conclusive" ? result.suggested : fits.includes(cur.dateFormat) ? cur.dateFormat : null;
        return { dates: result, dateFormat };
      });
    }).catch((error) => alive && upd({ dates: { status: "error", error: error.message, candidates: [], rowCount: 0 } }));
    return () => { alive = false; };
  }, [first.id, dateCol, kind.delimiter]);

  // The layout: one per kind. Its rule covers every account the kind's files go to.
  const accountsPattern = () => { const patterns = live.map((g) => compileRule(g.rule)).filter(Boolean); return patterns.length <= 1 ? patterns[0] || "" : `^(?:${patterns.map((p) => p.replace(/^\^/, "")).join("|")})`; };
  const layoutPatternFor = (rule) => (rule.mode === "accounts" ? accountsPattern() : compileRule(rule));
  const layoutRule = layoutPatternFor(st.layoutRule);
  const sameAsSaved = !!kind.template && !st.changed && kind.template.mapping.dateFormat === st.dateFormat && kind.template.mapping.sign === mapping.sign && kind.template.mapping.currency === st.currency && (kind.template.prefixRegex || "") === layoutRule;
  const layoutName = kind.template ? kind.template.name : uniqueName(`${(live[0]?.name || "Export").trim()} export`, templates);

  // The preview: every row of the first file read with the mapping, by the parser that will import it.
  useEffect(() => {
    if (!complete) { upd({ preview: null, previewError: "" }); return; }
    let alive = true;
    const timer = setTimeout(() => {
      api.previewImportLayout(first.id, { name: layoutName, prefixRegex: layoutRule, headers: H, mapping })
        .then((result) => alive && upd({ preview: result, previewError: "" }))
        .catch((error) => alive && upd({ preview: null, previewError: error.message }));
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [complete, JSON.stringify(mapping), layoutRule, layoutName, first.id]);

  const fits = (st.dates?.candidates?.filter((c) => st.dates.rowCount > 0 && c.validCount === st.dates.rowCount) || []).map((c) => c.format);
  const dateOpen = dateCol != null && !st.dateFormat;
  const [showDates, setShowDates] = useState(false);
  const [tab, setTab] = useState(st.tabs[0]?.id || null);
  const [adding, setAdding] = useState(false);
  const current = st.tabs.find((g) => g.id === tab) || st.tabs[0] || null;
  useEffect(() => { if (!st.tabs.some((g) => g.id === tab)) setTab(st.tabs[0]?.id || null); }, [st.tabs.map((g) => g.id).join(",")]);

  const accountChanged = (g) => { const a = byId[g.existingId]; return !a || a.name !== g.name.trim() || (a.kind || "") !== (g.type || "").trim() || a.color.toUpperCase() !== g.color.toUpperCase() || (a.prefixRegex || "") !== compileRule(g.rule); };
  const accountsDirty = live.some((g) => !g.existingId || accountChanged(g) || filesOf(g).some((j) => j.accountId !== g.existingId));
  const dirty = !kind.ready || !sameAsSaved || accountsDirty;
  const canConfirm = complete && !!st.preview && !st.previewError && !busy;

  const save = () => run(async () => {
    let templateId;
    if (sameAsSaved) templateId = kind.template.id;
    else {
      const saved = await api.saveImportLayout(first.id, { name: layoutName, prefixRegex: layoutRule, headers: H, mapping, ...(kind.template ? { id: kind.template.id, version: kind.template.version } : {}) });
      templateId = saved.id;
    }
    for (const job of kind.jobs) if (!(job === first && !sameAsSaved) && job.schema !== "custom:" + templateId) await api.applyImportLayout(job.id, templateId);
    const tabs = [];
    for (const g of st.tabs) {
      const files = filesOf(g);
      if (!files.length) continue;
      let accountId = g.existingId;
      const values = { prefixRegex: compileRule(g.rule), color: g.color };
      if (!accountId) accountId = await api.addAccount(g.name.trim(), "custom:" + templateId, (g.type || "").trim(), values);
      else if (accountChanged(g)) await api.updateAccount(accountId, { name: g.name.trim(), kind: (g.type || "").trim(), ...values });
      for (const j of files) if (j.accountId !== accountId) await api.assignImportAccount(j.id, accountId);
      tabs.push({ ...g, existingId: accountId });
    }
    upd({ changed: false, saved: true, tabs });
  }, kind.ready ? "Changes saved." : `${plural(kind.jobs.length, "file", "files")} ready for ${live.map(groupLabel).join(" and ")}.`);
  const confirm = async () => {
    if (!dirty) return onDone();
    const value = await save();
    if (value !== false && kind.ready) onDone();
  };

  const changeRoles = (roles) => upd((cur) => {
    const newDate = Object.keys(roles).find((k) => roles[k] === "date"), oldDate = Object.keys(cur.roles).find((k) => cur.roles[k] === "date");
    const newAmount = Object.keys(roles).find((k) => roles[k] === "amount"), oldAmount = Object.keys(cur.roles).find((k) => cur.roles[k] === "amount");
    return { roles, changed: true, ...(newDate !== oldDate ? { dateFormat: null, dateChosen: false } : {}), ...(newAmount !== oldAmount ? { sign: null } : {}) };
  });
  // Tabs: edit the selected one, add one for an existing or a new account, send an unmatched file to one by hand.
  const setTabs = (fn) => upd((cur) => ({ tabs: fn(cur.tabs), groupsTouched: true }));
  const editTab = (gid, patch) => setTabs((gs) => gs.map((g) => (g.id === gid ? { ...g, ...patch } : g)));
  const addTab = (account) => { const g = account ? fromAccount(account) : freshTab([], rows, new Set([...accounts.map((a) => (a.color || "").toUpperCase()), ...st.tabs.map((t) => t.color.toUpperCase())])); setTabs((gs) => [...gs, g]); setTab(g.id); setAdding(false); };
  const removeTab = (gid) => setTabs((gs) => gs.filter((g) => g.id !== gid));
  const sendTo = (jobId, gid) => upd((cur) => ({ manual: { ...cur.manual, [jobId]: gid }, groupsTouched: true }));
  const signExamples = (sign) => readRows(rows.slice(0, 2), st.roles, { sign, dateFormat: st.dateFormat }).map((r) => `${r.text} ${money(r.cents, st.currency)}`).join(" · ");
  const open = (dateOpen ? 1 : 0) + (amountCol != null && st.sign == null ? 1 : 0) + (rolesComplete(st.roles) ? 0 : 1) + (namesOk ? 0 : 1) + (unplaced.length ? 1 : 0);
  const spareAccounts = accounts.filter((a) => !st.tabs.some((g) => g.existingId === a.id));
  const currentJobs = current ? filesOf(current) : [];
  const otherJobs = current ? kind.jobs.filter((j) => resolved[j.id].tab && resolved[j.id].tab.id !== current.id) : [];

  return (
    <Stage
      title={`${total > 1 ? `${n} of ${total}: ` : ""}${kind.jobs.length === 1 ? first.filename : `${kind.jobs.length} files with the same columns`}`}
      lede={kind.ready ? "Already set up. Change anything here and save it again." : open ? (open === 1 ? "Almost everything is worked out. One question below needs your answer." : `Almost everything is worked out. ${open} questions below need your answer.`) : kind.template ? `Read the way you set up “${kind.template.name}”. Change anything that isn't right.` : "Everything here was worked out from the files. Change anything that isn't right."}
      step={step} steps={steps} bodyKey={kind.key} wide onBack={onBack}
      next={confirm} nextLabel={kind.ready ? (dirty ? "Save changes" : "Done") : n < total ? "Looks right, next" : "Looks right"} nextDisabled={kind.ready && !dirty ? false : !canConfirm}
    >
      <div className="sv2-g-two">
        <section className="sv2-g-block" aria-label={live.length > 1 ? "The accounts" : "The account"}>
          <h4>{live.length > 1 ? "The accounts" : "The account"}</h4>
          <div className="sv2-g-tabrow">
            <div className="sv2-g-tabs" role="tablist" aria-label="Accounts for these files" onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const at = st.tabs.findIndex((g) => g.id === current?.id), next = st.tabs[(at + (e.key === "ArrowRight" ? 1 : -1) + st.tabs.length) % st.tabs.length];
              if (next) { setTab(next.id); e.currentTarget.querySelector(`[data-tab="${next.id}"]`)?.focus(); }
            }}>
              {st.tabs.map((g) => { const n = filesOf(g).length; return (
                <button key={g.id} type="button" role="tab" data-tab={g.id} id={`tab-${g.id}`} aria-controls={`panel-${kind.key.length}-${g.id}`} aria-selected={current?.id === g.id} tabIndex={current?.id === g.id ? 0 : -1} className="sv2-g-tab" onClick={() => { setTab(g.id); setAdding(false); }}>
                  <AccountDot color={g.color} />{groupLabel(g)}<small className={n ? "" : "is-warn"} aria-label={plural(n, "file", "files")}>{n}</small>
                </button>
              ); })}
            </div>
            <button type="button" className="sm ghost" aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Icon name="plus" size={16} />Add account</button>
          </div>
          {adding && (
            <div className="sv2-g-row sv2-g-wrap sv2-g-add" role="group" aria-label="Add an account">
              {spareAccounts.map((a) => <button key={a.id} type="button" className="sm" onClick={() => addTab(a)}><AccountDot color={a.color} />{a.name}</button>)}
              <button type="button" className="sm" onClick={() => addTab(null)}><Icon name="plus" size={16} />New account</button>
            </div>
          )}
          {(kind.jobs.length > 1 || st.tabs.length > 1 || unplaced.length > 0) && (
            <ul className="sv2-g-filelist" aria-label="Where each file goes">
              {kind.jobs.map((j) => { const r = resolved[j.id]; return (
                <li key={j.id} className={r.tab && current && r.tab.id === current.id ? "is-current" : r.tab ? "" : "is-open"}>
                  <AccountDot color={r.tab?.color} /><span className="sv2-g-filename">{j.filename}</span>
                  <span className={`sv2-g-filewhere${r.tab ? "" : " is-warn"}`}>
                    {r.tab ? <>{groupLabel(r.tab)}{r.how === "manual" ? <small> · chosen by hand this time</small> : null}</> : r.how === "ambiguous" ? `Both ${r.matches.map(groupLabel).join(" and ")} recognize this name` : "No account recognizes this name"}
                  </span>
                  {!r.tab && current && <button type="button" className="sm" onClick={() => sendTo(j.id, current.id)}>Use {groupLabel(current)} this time</button>}
                </li>
              ); })}
            </ul>
          )}
          {current && (
            <div className="sv2-g-tabpanel" role="tabpanel" id={`panel-${kind.key.length}-${current.id}`} aria-labelledby={`tab-${current.id}`}>
              <div className="sv2-g-row">
                <input aria-label="Account name" value={current.name} maxLength={80} placeholder="Account name" onChange={(e) => editTab(current.id, { name: e.target.value })} />
                <input aria-label="Account type" className="sv2-g-type" value={current.type || ""} maxLength={40} placeholder="Type (optional)" onChange={(e) => editTab(current.id, { type: e.target.value })} />
              </div>
              <Swatches colors={palette} value={current.color} label="Account color" onChange={(color) => editTab(current.id, { color })} />
              <Recognize rule={current.rule} onChange={(rule) => editTab(current.id, { rule })} candidates={currentJobs} others={otherJobs}
                hint={!current.existingId && currentJobs.length === 1 && current.rule.mode === "starts" && current.rule.text === currentJobs[0].filename.replace(/.[^.]+$/, "") ? "This is the whole filename. If next month's export is named differently, shorten it to the part that stays the same." : ""} />
              <div className="sv2-g-row sv2-g-between">
                <small>{current.existingId ? (accountChanged(current) ? "Changes here are saved to this account." : "Saved with this account.") : `Next time, files matching this go to ${groupLabel(current)} on their own.`}</small>
                {!currentJobs.length && <button type="button" className="link" onClick={() => removeTab(current.id)}>Remove from this list</button>}
              </div>
            </div>
          )}
        </section>

        <section className="sv2-g-block" aria-label="How it is read">
          <h4>How it is read</h4>
          <ul className="sv2-g-facts">
            {dateCol != null ? (
              <Fact ok={!dateOpen} why={!st.dates ? "checking every date in the file…" : st.dates.status === "conclusive" ? `all ${st.dates.rowCount.toLocaleString()} rows read only as ${formatLabel[st.dates.suggested]}` : st.dates.status === "error" ? st.dates.error : st.dateFormat ? "your choice" : undefined}
                action={st.dates && st.dateFormat && fits.length > 1 && !showDates ? <button type="button" className="link" onClick={() => setShowDates(true)}>Change</button> : null}>
                Dates in <b>{H[dateCol]}</b>{st.dateFormat ? <>, written {formatLabel[st.dateFormat]}</> : null}
                {st.dates && (dateOpen || showDates) && st.dates.status !== "error" && st.dates.status !== "invalid" && (
                  <div className="sv2-g-choice">
                    {st.dates.candidates.filter((c) => fits.includes(c.format)).map((c) => (
                      <button type="button" key={c.format} aria-pressed={st.dateFormat === c.format} onClick={() => { upd({ dateFormat: c.format, dateChosen: true, changed: true }); setShowDates(false); }}>
                        <b>{formatLabel[c.format]}</b>
                        <small>{c.example ? `${c.example.raw} → ${readable(c.example.date)}` : ""}</small>
                      </button>
                    ))}
                  </div>
                )}
                {st.dates?.status === "invalid" && (
                  <div className="sv2-g-problem">
                    <p>No single date order reads every row, so this file can't be imported as it is.</p>
                    <ul>{st.dates.candidates.filter((c) => c.firstInvalid).map((c) => <li key={c.format}>Read as {formatLabel[c.format]}, row {c.firstInvalid.record} (“{c.firstInvalid.raw || "blank"}”) isn't a date.</li>)}</ul>
                    <p>Fix the dates in the file and add it again, or choose another column if this one isn't the date.</p>
                    <div className="sv2-g-row sv2-g-wrap">
                      <button type="button" className="sm" onClick={() => upd({ columns: true })}>Choose another date column</button>
                      <button type="button" className="sm danger" disabled={busy} onClick={() => run(async () => { for (const j of kind.jobs) await api.dismiss(j.id); }, kind.jobs.length === 1 ? "File removed. Its archived copy stays." : "Files removed. Their archived copies stay.")}>{kind.jobs.length === 1 ? "Remove this file" : "Remove these files"}</button>
                    </div>
                  </div>
                )}
              </Fact>
            ) : <Fact ok={false}>No column reads as dates in every row. Choose the date column below.</Fact>}
            {colOf("description") != null ? <Fact ok why={st.changed ? undefined : st.analysis.because.description}>Descriptions in <b>{H[colOf("description")]}</b></Fact> : <Fact ok={false}>No column for descriptions yet. Choose one below.</Fact>}
            {amountCol != null && (
              <Fact ok={st.sign != null} why={st.sign != null ? (st.changed ? undefined : st.analysis.because.sign || st.analysis.because.amount) : st.changed ? undefined : st.analysis.because.amount}
                action={st.sign != null ? <button type="button" className="link" onClick={() => upd({ sign: null })}>Change</button> : null}>
                Amounts in <b>{H[amountCol]}</b>{st.sign != null ? <>; positive means <b>{st.sign === 1 ? "money in" : "money out"}</b></> : null}
                {st.sign == null && (
                  <div className="sv2-g-choice">
                    {[1, -1].map((sgn) => <button type="button" key={sgn} onClick={() => upd({ sign: sgn, changed: true })}><b>Positive is money {sgn === 1 ? "in" : "out"}</b><small>{signExamples(sgn)}</small></button>)}
                  </div>
                )}
              </Fact>
            )}
            {colOf("debit") != null && colOf("credit") != null && (
              <Fact ok why={st.changed ? undefined : st.analysis.because.debit} action={<button type="button" className="link" onClick={() => changeRoles({ ...st.roles, [colOf("debit")]: "credit", [colOf("credit")]: "debit" })}>Swap</button>}>
                <b>{H[colOf("debit")]}</b> holds money out and <b>{H[colOf("credit")]}</b> money in
              </Fact>
            )}
            {amountCol == null && (colOf("debit") == null || colOf("credit") == null) && <Fact ok={false}>No amounts yet: choose one signed column, or a money-out and a money-in column, below.</Fact>}
            {colOf("balance") != null && <Fact ok why={st.changed ? undefined : st.analysis.because.balance}>Running balance in <b>{H[colOf("balance")]}</b></Fact>}
            <Fact ok action={<select aria-label="Currency" value={st.currency} onChange={(e) => upd({ currency: e.target.value, changed: true })}>{["CAD", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select>}>Amounts in <b>{st.currency}</b></Fact>
            {H.some((_, i) => !st.roles[i]) && <Fact ok>Not used: {H.filter((_, i) => !st.roles[i]).join(", ")}</Fact>}
          </ul>
          <button type="button" className="link sv2-g-columns-toggle" onClick={() => upd({ columns: !st.columns })}>{st.columns ? "Hide the columns" : "Not right? Change the columns"}</button>
          {st.columns && <ColumnMapper headers={H} rows={rows} roles={st.roles} onChange={changeRoles} />}
          <details className="sv2-g-layoutrule" open={st.layoutRule.mode !== "accounts" || undefined}>
            <summary>Which future files are read this way</summary>
            <p className="form-help">Usually the files these accounts recognize. Change this only when other files share these columns.</p>
            <Recognize lead="Files whose name" rule={st.layoutRule} onChange={(layoutRule) => upd({ layoutRule })} candidates={kind.jobs} extraModes={[{ id: "accounts", label: "is recognized by one of these accounts" }]} patternFor={layoutPatternFor} what="these columns" label="Text to match for these columns" />
          </details>
          {st.previewError && <p className="alert" role="alert">{st.previewError}</p>}
          {st.preview && <PreviewTable rows={st.preview.preview.slice(0, 3)} caption={`All ${plural(st.preview.rowCount, "row", "rows")} read. The first ones as they will be recorded:`} />}
        </section>
      </div>
    </Stage>
  );
}

function uniqueName(base, templates) {
  const names = new Set(templates.map((t) => t.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let n = 2;
  while (names.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}
