import { TransactionTemplateEditor } from "./TransactionTemplateEditor.jsx";
import { alphabetical, orderedTags, tagType } from "../electron/review/tag-model.mjs";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Recognize } from "./recognize.jsx";
import { describeText } from "./AliasesWorkspace.jsx";
import { compileTextRule, decompileTextRule, textMatches } from "./import-analysis.mjs";
import { Alert, ConfirmDialog, Segmented } from "./ui.jsx";
import { signedMoney, dayLabel, plural } from "./format.js";
import "./rules-workspace.css";

const api = window.urbanomics;
const directions = [
  { value: "any", label: "Either way" },
  { value: "out", label: "Money out" },
  { value: "in", label: "Money in" },
];
// What each preview status means for the person reading it (the same words as the template editor).
const statuses = [
  ["ready", "Will apply"],
  ["conflict", "Two rules match"],
  ["protected", "Left alone"],
  ["unchanged", "Already matches"],
];
const statusLabel = Object.fromEntries(statuses);
const statusHelp = {
  ready: "Has no tag or person yet; applying fills it in.",
  conflict: "More than one rule matches and they disagree, so neither applies.",
  protected: "You already decided something here, or it's a transfer or repayment, so it's left alone.",
  unchanged: "Already has what the rule would give it.",
};

function tally(list) {
  const t = { ready: 0, conflict: 0, protected: 0, unchanged: 0 };
  for (const c of list) if (c.status in t) t[c.status] += 1;
  return t;
}

function Gives({ categoryId, personId, byId }) {
  const category = categoryId ? byId.get(categoryId) : null,
    person = personId ? byId.get(personId) : null;
  return (
    <span className="rl-gives">
      {categoryId && <span className="rl-tag"><i style={{ background: category?.color || "var(--data-neutral)" }} />{category?.name || "Missing tag"}</span>}
      {personId && <span className="rl-tag"><Icon name="user" size={16} />{person?.name || "Missing person"}</span>}
    </span>
  );
}

function Status({ status }) {
  return <span className={`rl-status is-${status}`} title={statusHelp[status]}><i aria-hidden="true" />{statusLabel[status] || status}</span>;
}

function CandidateList({ candidates, byId, onEditRule, pageSize = 25 }) {
  const [filter, setFilter] = useState("all"), [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const counts = tally(candidates);
  useEffect(() => setPage(0), [candidates]);
  const q = query.trim().toLowerCase();
  const rows = candidates.filter((c) => (filter === "all" || c.status === filter) && (!q || `${c.description} ${c.account} ${(c.rules || []).join(" ")}`.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), current = Math.min(page, pages - 1);
  const choose = (id) => { setFilter(id); setPage(0); };
  return (
    <div className="rl-list">
      <div className="rl-list-tools">
        {statuses.filter(([id]) => counts[id]).length > 1 ? <div className="rl-filters" role="group" aria-label="Show matches">
          <button className="sm" aria-pressed={filter === "all"} onClick={() => choose("all")}>All · {candidates.length}</button>
          {statuses.filter(([id]) => counts[id]).map(([id, label]) => (
            <button key={id} className="sm" aria-pressed={filter === id} onClick={() => choose(id)}>{label} · {counts[id]}</button>
          ))}
        </div> : <span />}
        {candidates.length > 10 && <input type="search" aria-label="Search matched transactions" placeholder="Find a transaction" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />}
      </div>
      {filter !== "all" && <p className="form-help">{statusHelp[filter]}</p>}
      {!rows.length ? (
        <p className="form-help">{q ? "Nothing matches that search." : "No matches."}</p>
      ) : (
        <div className="rl-candidates">
          {rows.slice(current * pageSize, current * pageSize + pageSize).map((c) => (
            <article key={c.id} className="rl-candidate">
              <div>
                <strong title={c.description}>{c.description}</strong>
                <small>{c.account}, {dayLabel(c.date)}{c.reason && (c.status === "protected" || c.status === "conflict") ? ` · ${c.reason}` : ""}</small>
                {(c.changes?.categoryId || c.changes?.personId) && <span className="rl-adds">Adds <Gives categoryId={c.changes.categoryId} personId={c.changes.personId} byId={byId} /></span>}
                {(c.rules || []).length > 1 && (
                  <small className="rl-rulenames">
                    Matched by {c.rules.map((name, i) => (
                      <React.Fragment key={name}>
                        {i ? ", " : ""}
                        {onEditRule ? <button className="link" aria-label={`Edit rule ${name}`} onClick={() => onEditRule(name)}>{name}</button> : name}
                      </React.Fragment>
                    ))}
                  </small>
                )}
              </div>
              <div className="rl-candidate-side">
                <Status status={c.status} />
                <span className="tabular">{signedMoney(c.amountCents, c.currency)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="rl-pages">
          <button className="icon ghost sm" aria-label="Previous matches" disabled={current === 0} onClick={() => setPage(current - 1)}><Icon name="chevron-left" size={16} /></button>
          <span>{current + 1} of {pages}</span>
          <button className="icon ghost sm" aria-label="Next matches" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><Icon name="chevron-right" size={16} /></button>
        </div>
      )}
    </div>
  );
}

function RuleEditor({ rule, aliases, categories, people, byId, act, busy, onClose, onSection }) {
  const [aliasQuery, setAliasQuery] = useState("");
  const [draft, setDraft] = useState({
    name: rule.name || "",
    pattern: rule.pattern || "",
    matchType: rule.matchType || (rule.id ? "regex" : aliases.length ? "aliases" : "regex"),
    aliasIds: rule.aliasIds || [],
    categoryId: rule.categoryId || "",
    personId: rule.personId || "",
    direction: rule.direction || "any",
    enabled: rule.enabled !== false,
  });
  const [preview, setPreview] = useState(null), [previewError, setPreviewError] = useState(null), [checking, setChecking] = useState(false);
  const [error, setError] = useState(""), [confirm, setConfirm] = useState(false), [working, setWorking] = useState(false);
  const seq = useRef(0), saving = useRef(false);
  const values = useMemo(() => ({
    ...(rule.id ? { id: rule.id, version: rule.version } : {}),
    name: draft.name.trim(),
    pattern: draft.matchType === "regex" ? draft.pattern : "",
    matchType: draft.matchType,
    aliasIds: draft.matchType === "aliases" ? draft.aliasIds : [],
    categoryId: draft.categoryId || null,
    personId: draft.personId || null,
    direction: draft.direction,
    enabled: draft.enabled,
  }), [draft, rule]);
  const signature = JSON.stringify(values);
  const mapped = !!(values.categoryId || values.personId),
    matching = values.matchType === "aliases" ? values.aliasIds.length > 0 : !!values.pattern.trim(),
    complete = !!(values.name && matching && mapped);
  const fresh = preview && preview.signature === signature, failed = previewError && previewError.signature === signature;
  const update = (key, value) => { setDraft((d) => ({ ...d, [key]: value })); setError(""); };
  // Existing transactions it would match are checked as you edit; nothing changes until Save, then Apply.
  useEffect(() => {
    if (!complete) return undefined;
    const id = ++seq.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.previewTransactionRule(values);
        if (id === seq.current) { setPreview({ matches: result.matches || [], checked: result.checked || 0, signature }); setPreviewError(null); }
      } catch (e) {
        if (id === seq.current) { setPreview(null); setPreviewError({ message: e.message, signature }); }
      } finally {
        if (id === seq.current) setChecking(false);
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, complete]);
  async function mutate(fn) {
    if (saving.current) return;
    saving.current = true;
    setWorking(true);
    setError("");
    try {
      if ((await act(fn)) !== false) onClose();
    } catch (e) {
      setError(e.message);
      setConfirm(false);
    } finally {
      saving.current = false;
      setWorking(false);
    }
  }
  const counts = fresh ? tally(preview.matches) : null;
  const shownAliases = alphabetical(aliases).filter((a) => a.name.toLowerCase().includes(aliasQuery.trim().toLowerCase()));
  return (
    <WorkspaceModal
      className="rl-editor-dialog"
      title={rule.id ? `Edit “${rule.name}”` : "New rule"}
      onClose={() => { if (!saving.current) onClose(); }}
      footer={
        <>
          {rule.id && <span className="footer-start"><button disabled={working} className="danger" onClick={() => setConfirm(true)}>Delete rule</button></span>}
          <button disabled={working} onClick={onClose}>Cancel</button>
          <button className="primary" disabled={working || busy || !complete || !!failed} onClick={() => mutate(() => api.saveTransactionRule(values))}>Save rule</button>
        </>
      }
    >
      <fieldset disabled={working} className="rl-editor">
        <label>Rule name<input maxLength={80} placeholder="Groceries" value={draft.name} onChange={(e) => update("name", e.target.value)} /></label>
        <div className="rl-field">
          <span>Which transactions</span>
          <div className="rl-field-row">
            <Segmented label="Match by" value={draft.matchType} onChange={(v) => update("matchType", v)} options={[{ value: "aliases", label: "Saved vendors" }, { value: "regex", label: "Bank description" }]} />
            <Segmented label="Direction" value={draft.direction} onChange={(v) => update("direction", v)} options={directions} />
          </div>
          {draft.matchType === "regex" ? (
            <Recognize lead="Bank descriptions that" rule={decompileTextRule(draft.pattern)} onChange={(r) => update("pattern", compileTextRule(r))}
              candidates={fresh ? preview.matches.slice(0, 6).map((m) => ({ id: m.id, filename: m.description })) : []} showChips={false}
              test={textMatches} patternFor={compileTextRule} noun={["transaction", "transactions"]} label="Description text to match"
              emptyMessage="Say which bank descriptions this rule is for. It reads the bank's text, not the alias." />
          ) : !aliases.length ? (
            <p className="form-help">No saved vendors yet. Make aliases first under Settings, Aliases, or match the bank description instead.</p>
          ) : (
            <div className="rl-aliases">
              {aliases.length > 8 && <input type="search" aria-label="Find a vendor" placeholder="Find a vendor" value={aliasQuery} onChange={(e) => setAliasQuery(e.target.value)} />}
              <div className="rl-alias-options" role="group" aria-label="Vendors">
                {shownAliases.map((a) => {
                  const on = draft.aliasIds.includes(a.id);
                  return <button key={a.id} className="sm" aria-pressed={on} onClick={() => update("aliasIds", on ? draft.aliasIds.filter((x) => x !== a.id) : [...draft.aliasIds, a.id])}>{on && <Icon name="check" size={16} />}{a.name}</button>;
                })}
                {!shownAliases.length && <p className="form-help">No vendor by that name.</p>}
              </div>
              <p className="form-help">{draft.aliasIds.length ? `Matches ${plural(draft.aliasIds.length, "vendor")}, following each alias as it changes.` : "Choose one or more vendors."} A transaction two aliases match is skipped.</p>
            </div>
          )}
        </div>
        <div className="rl-field">
          <span>What it gives them</span>
          <div className="rl-field-row">
            <label>Tag<select aria-label="Tag" value={draft.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
              <option value="">No tag</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{tagType(c) === "income" ? " (income)" : ""}</option>)}
            </select></label>
            <label>Person<select aria-label="Person" value={draft.personId} onChange={(e) => update("personId", e.target.value)}>
              <option value="">No person</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          </div>
          <p className="form-help">
            {!categories.length && !people.length
              ? <>There are no tags or people yet. <button className="link" onClick={() => { onClose(); onSection?.("category"); }}>Add tags</button></>
              : mapped ? "Only filled in where a transaction has none. A person here is a note of who it was with; it doesn't split the cost or record a repayment." : "Choose a tag, a person, or both."}
          </p>
        </div>
        <label className="rl-check"><input type="checkbox" checked={draft.enabled} onChange={(e) => update("enabled", e.target.checked)} />Use it on every new import</label>
      </fieldset>
      {error && <Alert>{error}</Alert>}
      <section className="rl-preview" aria-label="Matches on existing transactions" aria-busy={checking}>
        <h3>{!complete ? "Transactions it matches" : failed || !fresh ? "Checking your transactions…" : preview.matches.length ? `Matches ${plural(preview.matches.length, "transaction")} you already have` : "Matches nothing you already have"}</h3>
        {!complete ? (
          <p className="form-help">Name the rule, say which transactions it's for and what it gives them, and the matches appear here.</p>
        ) : failed ? (
          <Alert>{previewError.message}</Alert>
        ) : fresh && (
          <>
            {counts.conflict > 0 && <Alert tone="warning">{plural(counts.conflict, "transaction")} would match another rule too, so neither would apply. Make one of them more specific.</Alert>}
            {preview.matches.length ? <CandidateList candidates={preview.matches} byId={byId} pageSize={10} /> : <p className="form-help">It will still apply to matching transactions you import later.</p>}
            <p className="form-help">Saving changes future imports only. To fill in these, use Apply on the Rules page.</p>
          </>
        )}
      </section>
      {confirm && (
        <ConfirmDialog title={`Delete “${rule.name}”?`} confirmLabel="Delete rule" cancelLabel="Keep rule" busy={working} onClose={() => setConfirm(false)} onConfirm={() => mutate(() => api.removeTransactionRule(rule.id, rule.version))}>
          <p>New imports won't use it. Tags and people it already filled in stay where they are.</p>
        </ConfirmDialog>
      )}
    </WorkspaceModal>
  );
}

export function RulesWorkspace({ data, run, busy, onSection, onNavigate }) {
  const [state, setState] = useState(null), [error, setError] = useState(""), [editing, setEditing] = useState(null),
    [query, setQuery] = useState(""), [result, setResult] = useState(null), [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let live = true;
    api.transactionRulesState().then((s) => { if (live) setState(s); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data, reloadKey]);
  async function act(fn) {
    let failure;
    const outcome = await run(async () => {
      try {
        const value = await fn();
        setState(await api.transactionRulesState());
        return value;
      } catch (e) {
        failure = e;
        throw e;
      }
    });
    if (failure) throw failure;
    return outcome;
  }
  async function apply() {
    setError("");
    setResult(null);
    try {
      const outcome = await act(() => api.applyTransactionRules(state.token));
      if (outcome !== false) setResult(outcome);
    } catch (e) {
      setError(e.message);
      setReloadKey((k) => k + 1);
    }
  }
  const rules = state?.rules || [], entities = state?.entities || [], aliases = state?.aliases || [], candidates = state?.candidates || [];
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const categories = orderedTags(entities.filter((e) => e.kind === "category" && !e.systemRole)), people = entities.filter((e) => e.kind === "person");
  const counts = tally(candidates);
  const perRule = useMemo(() => {
    const map = new Map();
    for (const c of candidates)
      for (const name of c.rules || []) {
        const s = map.get(name) || { matched: 0, ready: 0, conflict: 0 };
        s.matched += 1;
        if (c.status === "ready") s.ready += 1;
        if ((c.conflicts || []).includes(name)) s.conflict += 1;
        map.set(name, s);
      }
    return map;
  }, [candidates]);
  const enabled = rules.filter((r) => r.enabled).length;
  const vendors = (r) => (r.aliasIds || []).map((id) => aliases.find((a) => a.id === id)?.name || "a deleted alias");
  const shownRules = rules.filter((r) => `${r.name} ${r.pattern} ${vendors(r).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const editByName = (name) => { const rule = rules.find((r) => r.name === name); if (rule) setEditing(rule); };
  const matchLine = (r) => {
    const what = r.matchType === "aliases" ? `Vendors ${vendors(r).join(", ") || "(none chosen)"}` : `Descriptions that ${describeText(r.pattern)}`;
    return r.direction === "in" ? `${what}, money in` : r.direction === "out" ? `${what}, money out` : what;
  };
  return (
    <section className="rules-workspace" aria-label="Rules">
      <div className="og-toolbar">
        {rules.length > 6 && <input type="search" aria-label="Search rules" placeholder="Find a rule or vendor" value={query} onChange={(e) => setQuery(e.target.value)} />}
        {state && rules.length > 0 && <span className="og-stat">{plural(rules.length, "rule")}, {enabled === rules.length ? "all on" : `${enabled} on`}</span>}
        <button className="primary" disabled={busy || !state} onClick={() => setEditing({})}><Icon name="plus" size={16} />New rule</button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!state ? (
        <p role="status">{error ? "Rules couldn't be loaded." : "Loading rules…"}</p>
      ) : !rules.length ? (
        <div className="empty-state">
          <Icon name="list" size={24} />
          <h2>No rules yet.</h2>
          <p>A rule tags new imports for you: transactions from a vendor, or whose bank description starts with some text, get a tag or a person as they arrive. You see what it matches before saving.</p>
          {!categories.length && !people.length && onSection && <p className="form-help">Rules need a tag or a person to give. <button className="link" onClick={() => onSection("category")}>Add tags first</button></p>}
        </div>
      ) : (
        <>
          {(counts.ready > 0 || result) && (
            <Alert tone="info" title={result ? `Filled in ${plural(result.applied, "transaction")}` : `Your rules can fill in ${plural(counts.ready, "transaction")} you already have`}
              action={!result && <button className="sm" disabled={busy} onClick={apply}>Fill in {counts.ready}</button>}
              onDismiss={result ? () => setResult(null) : undefined}>
              {result
                ? <p>Skipped {[result.conflicts && `${result.conflicts} where two rules match`, result.protected && `${result.protected} already decided`, result.unchanged && `${result.unchanged} already matching`].filter(Boolean).join(", ") || "nothing"}. {onNavigate && <button className="link" onClick={() => onNavigate("transactions")}>See transactions</button>}</p>
                : <p>Only empty tags and people are filled in. Anything you already decided stays.</p>}
            </Alert>
          )}
          {!shownRules.length ? (
            <p className="form-help">No rule by that name.</p>
          ) : (
            <div className="og-rows">
              {shownRules.map((r) => {
                const stats = perRule.get(r.name);
                return (
                  <article className={`og-row rl-rule ${r.enabled ? "" : "is-off"}`} key={r.id}>
                    <div className="og-row-body">
                      <h3 title={r.name}>{r.name}{!r.enabled && <span className="rl-off">Off</span>}</h3>
                      <small>{matchLine(r)}</small>
                      {r.template ? (
                        <span className="rl-gives">{r.template.tags.map((p) => <span key={p.id} className="rl-tag"><i style={{ background: byId.get(p.id)?.color || "var(--data-neutral)" }} />{byId.get(p.id)?.name || "Missing tag"} {p.weight / 100}%</span>)}{r.personId && <Gives personId={r.personId} byId={byId} />}</span>
                      ) : <Gives categoryId={r.categoryId} personId={r.personId} byId={byId} />}
                    </div>
                    <small className="rl-rule-stats">
                      {!r.enabled ? "Not running" : !stats ? "Matches nothing yet" : [plural(stats.matched, "match", "matches"), stats.ready && `${stats.ready} to fill in`, stats.conflict && `${stats.conflict} clashing`].filter(Boolean).join(" · ")}
                    </small>
                    <button className="sm" disabled={busy} aria-label={`Edit rule ${r.name}`} onClick={() => setEditing(r)}>Edit</button>
                  </article>
                );
              })}
            </div>
          )}
          <section className="rl-matches" aria-label="Matches on existing transactions">
            <h3>Transactions your rules match</h3>
            {candidates.length ? <CandidateList candidates={candidates} byId={byId} onEditRule={editByName} /> : <p className="form-help">{enabled ? "None of the transactions you have match a rule that's on." : "Every rule is off."}</p>}
          </section>
        </>
      )}
      {editing?.template ? (
        <TransactionTemplateEditor rule={editing} entities={entities} onClose={() => setEditing(null)} onSaved={async () => { await act(async () => true); }} />
      ) : editing && (
        <RuleEditor key={editing.id || "new"} rule={editing} aliases={aliases} categories={categories} people={people} byId={byId} act={act} busy={busy} onClose={() => setEditing(null)} onSection={onSection} />
      )}
    </section>
  );
}
