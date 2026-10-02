import {TransactionTemplateEditor} from './TransactionTemplateEditor.jsx';
import { alphabetical, orderedTags, tagType } from "../electron/review/tag-model.mjs";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import "./rules-workspace.css";
import { Icon } from "@derekurban/design-system";

const api = window.urbanomics;
const directions = [
  ["any", "Any direction"],
  ["in", "Money in"],
  ["out", "Money out"],
];
const directionLabel = Object.fromEntries(directions);
const statuses = [
  ["ready", "Ready"],
  ["conflict", "Conflict"],
  ["protected", "Protected"],
  ["unchanged", "Unchanged"],
];
const statusLabel = Object.fromEntries(statuses);

function tally(list) {
  const t = { ready: 0, conflict: 0, protected: 0, unchanged: 0 };
  for (const c of list) if (c.status in t) t[c.status] += 1;
  return t;
}

function plural(n, word, words = `${word}s`) {
  return `${n} ${n === 1 ? word : words}`;
}

function Mapping({ categoryId, personId, byId, missing = true, template = null }) {
  const category = categoryId ? byId.get(categoryId) : null,
    person = personId ? byId.get(personId) : null;
  return (
    <div className="rl-maps">
      {categoryId &&
        (category ? (
          <span className="rl-map">
            <i style={{ background: category.color }} />
            <em>Tag</em>
            {category.name}
          </span>
        ) : (
          missing && <span className="rl-map is-missing">Missing tag</span>
        ))}
      {personId &&
        (person ? (
          <span className="rl-map is-person">
            <em>Person</em>
            {person.name}
          </span>
        ) : (
          missing && <span className="rl-map is-missing">Missing person</span>
        ))}
      {!categoryId && !personId && !template && (
        <span className="rl-map is-none">No mapping</span>
      )}
    </div>
  );
}

function CandidateRow({ candidate: c, byId, onEditRule }) {
  const rules = c.rules || [],
    conflicts = c.conflicts || [];
  return (
    <article className={`rl-candidate is-${c.status}`}>
      <div className="rl-candidate-body">
        <strong title={c.description}>{c.description}</strong>
        <small>
          {c.account} · {c.date}
        </small>
        {(c.changes?.categoryId || c.changes?.personId) && (
          <Mapping
            categoryId={c.changes.categoryId}
            personId={c.changes.personId}
            byId={byId}
          />
        )}
        {c.reason && <small className="rl-reason">{c.reason}</small>}
        {rules.length > 0 && (
          <div className="rl-rulenames">
            {rules.map((name) =>
              onEditRule ? (
                <button
                  key={name}
                  type="button"
                  className={conflicts.includes(name) ? "is-conflict" : ""}
                  aria-label={`Edit rule ${name}`}
                  onClick={() => onEditRule(name)}
                >
                  {name}
                </button>
              ) : (
                <span
                  key={name}
                  className={conflicts.includes(name) ? "is-conflict" : ""}
                >
                  {name}
                </span>
              ),
            )}
          </div>
        )}
      </div>
      <div className="rl-candidate-side">
        <span className={`rl-status is-${c.status}`}>
          {statusLabel[c.status] || c.status}
        </span>
        <span className="rl-amount">
          {new Intl.NumberFormat("en-CA", {
            style: "currency",
            currency: c.currency,
            currencyDisplay: "code",
          }).format(c.amountCents / 100)}
        </span>
      </div>
    </article>
  );
}

function CandidateList({ candidates, byId, onEditRule, pageSize = 25 }) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const counts = tally(candidates);
  useEffect(() => {
    setPage(0);
  }, [candidates]);
  const q = query.trim().toLowerCase();
  const rows = candidates.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      (!q ||
        `${c.description} ${c.account} ${c.date} ${(c.rules || []).join(" ")}`
          .toLowerCase()
          .includes(q)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, pages - 1);
  return (
    <div className="rl-list">
      <div className="rl-list-tools">
        <div
          className="segmented rl-filters"
          role="group"
          aria-label="Filter matches by status"
        >
          <button
            type="button"
            className={filter === "all" ? "selected" : ""}
            aria-pressed={filter === "all"}
            onClick={() => {
              setFilter("all");
              setPage(0);
            }}
          >
            All <small>{candidates.length}</small>
          </button>
          {statuses.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "selected" : ""}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setPage(0);
              }}
            >
              {label} <small>{counts[id]}</small>
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search matched transactions"
          placeholder="Find a match…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>
      {!rows.length ? (
        <p className="rl-none">
          {q
            ? "No matches for this search."
            : filter === "all"
              ? "No matches."
              : `No ${statusLabel[filter].toLowerCase()} matches.`}
        </p>
      ) : (
        <div className="rl-candidates">
          {rows
            .slice(current * pageSize, current * pageSize + pageSize)
            .map((c) => (
              <CandidateRow
                key={c.id}
                candidate={c}
                byId={byId}
                onEditRule={onEditRule}
              />
            ))}
        </div>
      )}
      {pages > 1 && (
        <div className="rl-pages">
          <button
            type="button"
            aria-label="Previous matches"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            type="button"
            aria-label="Next matches"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function RuleEditor({
  rule,
  aliases,
  categories,
  people,
  byId,
  act,
  busy,
  onClose,
}) {
  const [aliasQuery, setAliasQuery] = useState("");
  const [draft, setDraft] = useState({
    name: rule.name || "",
    pattern: rule.pattern || "",
    matchType: rule.matchType || (rule.id ? "regex" : "aliases"),
    aliasIds: rule.aliasIds || [],
    categoryId: rule.categoryId || "",
    personId: rule.personId || "",
    direction: rule.direction || "any",
    enabled: rule.enabled !== false,
  });
  const [preview, setPreview] = useState(null),
    [previewError, setPreviewError] = useState(null),
    [checking, setChecking] = useState(false);
  const [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [working, setWorking] = useState(false);
  const seq = useRef(0),
    saving = useRef(false);
  const values = useMemo(
    () => ({
      ...(rule.id ? { id: rule.id, version: rule.version } : {}),
      name: draft.name.trim(),
      pattern: draft.matchType === "regex" ? draft.pattern : "",
      matchType: draft.matchType,
      aliasIds: draft.matchType === "aliases" ? draft.aliasIds : [],
      categoryId: draft.categoryId || null,
      personId: draft.personId || null,
      direction: draft.direction,
      enabled: draft.enabled,
    }),
    [draft, rule],
  );
  const signature = JSON.stringify(values);
  const mapped = !!(values.categoryId || values.personId),
    complete = !!(
      values.name &&
      (values.matchType === "aliases"
        ? values.aliasIds.length
        : values.pattern.trim()) &&
      mapped
    );
  const fresh = preview && preview.signature === signature,
    failed = previewError && previewError.signature === signature;

  const update = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError("");
  };
  const close = () => {
    if (!saving.current) onClose();
  };
  async function check() {
    if (!complete) return;
    const id = ++seq.current;
    setChecking(true);
    try {
      const result = await api.previewTransactionRule(values);
      if (id !== seq.current) return;
      setPreview({
        matches: result.matches || [],
        checked: result.checked || 0,
        signature,
      });
      setPreviewError(null);
    } catch (e) {
      if (id !== seq.current) return;
      setPreview(null);
      setPreviewError({ message: e.message, signature });
    } finally {
      if (id === seq.current) setChecking(false);
    }
  }
  useEffect(() => {
    if (!complete) return undefined;
    const timer = setTimeout(check, 450);
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
    } finally {
      saving.current = false;
      setWorking(false);
    }
  }
  const counts = fresh ? tally(preview.matches) : null;
  const noTargets = !categories.length && !people.length;
  return (
    <WorkspaceModal
      className="rl-editor-dialog"
      title={rule.id ? "Edit rule" : "New rule"}
      onClose={close}
      footer={
        <div className="rv-modal-actions rl-actions">
          {rule.id && (
            <button
              type="button"
              disabled={working}
              className="account-delete-link"
              onClick={() => setConfirm(true)}
            >
              Delete rule
            </button>
          )}
          <button type="button" disabled={working} onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={working || busy || !complete || !!failed}
            onClick={() => mutate(() => api.saveTransactionRule(values))}
          >
            Save rule
          </button>
        </div>
      }
    >
      <div className="rl-editor">
        <fieldset disabled={working} className="rl-fields">
          <label>
            Name
            <input
              maxLength={80}
              placeholder="e.g. Grocery run"
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </label>
          <label>
            Direction
            <select
              aria-label="Direction"
              value={draft.direction}
              onChange={(e) => update("direction", e.target.value)}
            >
              {directions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="rl-span segmented"
            role="group"
            aria-label="Match using"
          >
            {[
              ["aliases", "Aliases / vendors"],
              ["regex", "Regex"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={draft.matchType === id}
                className={draft.matchType === id ? "selected" : ""}
                onClick={() => update("matchType", id)}
              >
                {label}
              </button>
            ))}
          </div>
          {draft.matchType === "regex" ? (
            <>
              <label className="rl-span">
                Bank description regex
                <input
                  className="rl-regex"
                  maxLength={256}
                  spellCheck={false}
                  placeholder={"e.g. ^GREEN GROCER(?:\\s|$)"}
                  value={draft.pattern}
                  onChange={(e) => update("pattern", e.target.value)}
                />
              </label>
              <p className="rv-help rl-span">
                Matches the original bank description, not its alias. Use ^ and
                $ to anchor. RE2 syntax; no / delimiters, lookarounds or
                backreferences.
              </p>
            </>
          ) : (
            <div className="rl-span rl-alias-picker">
              <label>
                Search aliases / vendors
                <input
                  type="search"
                  placeholder="Find a saved vendor…"
                  value={aliasQuery}
                  onChange={(e) => setAliasQuery(e.target.value)}
                />
              </label>
              <div className="rl-alias-selected" aria-label="Selected aliases">
                {draft.aliasIds.map((id) => (
                  <button
                    type="button"
                    key={id}
                    aria-label={`Remove ${aliases.find((a) => a.id === id)?.name || "missing alias"}`}
                    onClick={() =>
                      update(
                        "aliasIds",
                        draft.aliasIds.filter((x) => x !== id),
                      )
                    }
                  >
                    {aliases.find((a) => a.id === id)?.name || "Missing alias"}{" "}
                    <Icon name="x" size={14} style={{ display: "inline-block", verticalAlign: "-2px" }} />
                  </button>
                ))}
              </div>
              <div
                className="rl-alias-options"
                role="group"
                aria-label="Available aliases"
              >
                {alphabetical(aliases)
                  .filter((a) =>
                    a.name
                      .toLowerCase()
                      .includes(aliasQuery.trim().toLowerCase()),
                  )
                  .map((a) => (
                    <label key={a.id} className="rl-alias-option">
                      <input
                        type="checkbox"
                        checked={draft.aliasIds.includes(a.id)}
                        onChange={(e) =>
                          update(
                            "aliasIds",
                            e.target.checked
                              ? [...draft.aliasIds, a.id]
                              : draft.aliasIds.filter((id) => id !== a.id),
                          )
                        }
                      />
                      <span>{a.name}</span>
                    </label>
                  ))}
                {!aliases.length ? (
                  <p className="rl-muted">
                    Create vendors in Settings → Aliases first, or use Regex.
                  </p>
                ) : (
                  !aliases.some((a) =>
                    a.name
                      .toLowerCase()
                      .includes(aliasQuery.trim().toLowerCase()),
                  ) && <p className="rl-muted">No aliases match this search.</p>
                )}
              </div>
              <p className="rv-help">
                {draft.aliasIds.length} selected · Matches any selected alias
                using its current definition. Ambiguous aliases are skipped.
              </p>
            </div>
          )}
          <label>
            Tag
            <select
              aria-label="Tag"
              value={draft.categoryId}
              onChange={(e) => update("categoryId", e.target.value)}
            >
              <option value="">No tag</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {tagType(c) === "income" ? "Income" : "Expense"} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Person
            <select
              aria-label="Person"
              value={draft.personId}
              onChange={(e) => update("personId", e.target.value)}
            >
              <option value="">No person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className={`rv-help rl-span ${mapped ? "" : "rl-hint"}`}>
            {mapped
              ? "A tag fills in only where none is set. A person is an association only: no debt, split, income or repayment is created."
              : noTargets
                ? "Create a tag or a person first so the rule has something to map to."
                : "Choose a tag, a person, or both."}
          </p>
          <label className="rl-check rl-span">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => update("enabled", e.target.checked)}
            />
            Enabled. Runs on every new import.
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="dr-error-text">
            {error}
          </p>
        )}
        <section
          className="rl-preview"
          aria-label="Matches on existing transactions"
          aria-busy={checking}
        >
          <div className="rl-preview-head">
            <h3>Existing transactions</h3>
            <button
              type="button"
              onClick={check}
              disabled={!complete || checking || working}
            >
              {checking ? "Checking…" : "Check now"}
            </button>
          </div>
          {!complete ? (
            <p className="rl-muted">
              Add a name, aliases or a regex, and at least one mapping to see
              matches.
            </p>
          ) : failed ? (
            <p role="alert" className="dr-error-text">
              {previewError.message}
            </p>
          ) : !fresh ? (
            <p className="rl-muted" role="status">
              {checking ? "Checking…" : "Checking soon…"}
            </p>
          ) : (
            <>
              <div className="rl-summary" role="status">
                <strong>
                  {plural(preview.matches.length, "match", "matches")}
                </strong>
                {statuses.map(([id, label]) =>
                  counts[id] ? (
                    <span key={id} className={`rl-status is-${id}`}>
                      <b>{counts[id]}</b> {label}
                    </span>
                  ) : null,
                )}
                <small>
                  {plural(preview.checked, "active transaction")} checked
                </small>
              </div>
              {preview.matches.length ? (
                <CandidateList candidates={preview.matches} byId={byId} />
              ) : (
                <p className="rl-muted">
                  No existing transactions match. Saving still covers future
                  imports.
                </p>
              )}
            </>
          )}
          <p className="rv-help">
            Preview only. Save the rule, then use Apply on the Rules page to
            fill in existing transactions.
            {!draft.enabled &&
              " This preview shows what the rule would match if enabled."}
          </p>
        </section>
        {confirm && (
          <div className="rv-confirm">
            <p>
              Delete this rule? Categories and people it already filled in stay
              on those transactions. New imports will no longer use it.
            </p>
            <button
              type="button"
              disabled={working}
              className="danger"
              onClick={() =>
                mutate(() => api.removeTransactionRule(rule.id, rule.version))
              }
            >
              Confirm deletion
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => setConfirm(false)}
            >
              Keep rule
            </button>
          </div>
        )}
      </div>
    </WorkspaceModal>
  );
}

export function RulesWorkspace({ data, run, busy, onSection, onNavigate }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [query, setQuery] = useState(""),
    [result, setResult] = useState(null),
    [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let live = true;
    api
      .transactionRulesState()
      .then((s) => {
        if (live) setState(s);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [data, reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

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
      reload();
    }
  }

  const rules = state?.rules || [],
    entities = state?.entities || [],
    aliases = state?.aliases || [],
    candidates = state?.candidates || [];
  const byId = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities],
  );
  const categories = orderedTags(
      entities.filter((e) => e.kind === "category"),
    ),
    people = entities.filter((e) => e.kind === "person");
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
  const uncategorized = (state?.records || []).filter(
    (r) => !r.deleted && !r.review?.tags?.length,
  ).length;
  const shownRules = rules.filter((r) =>
    `${r.name} ${r.pattern} ${(r.aliasIds || []).map((id) => aliases.find((a) => a.id === id)?.name || "").join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const editByName = (name) => {
    const rule = rules.find((r) => r.name === name);
    if (rule) setEditing(rule);
  };

  return (
    <section className="rules-workspace">
      <div className="og-heading">
        <div>
          <h2>Rules</h2>
          <p>
            Match saved vendors or a bank-description regex to fill in a tag or
            person automatically.
          </p>
        </div>
        <button
          className="primary"
          disabled={busy || !state}
          onClick={() => setEditing({})}
        >
          + New rule
        </button>
      </div>
      <div className="rl-facts">
        <div className="rl-fact">
          <strong>Runs on import</strong>
          New transactions that match get their tag or person right away.
        </div>
        <div className="rl-fact">
          <strong>Fills gaps only</strong>
          Existing splits, repayments and choices are never overwritten.
        </div>
        <div className="rl-fact">
          <strong>Existing transactions</strong>
          Applying to what is already imported is a separate step you trigger
          here.
        </div>
      </div>
      {error && (
        <p role="alert" className="dr-error-text">
          {error}
        </p>
      )}
      {!state ? (
        <p className="og-empty">
          {error ? "Unable to load rules." : "Loading rules…"}
        </p>
      ) : (
        <>
          {!categories.length && !people.length && onSection && (
            <div className="og-callout">
              <div>
                <strong>Nothing to map to yet</strong>
                <small>
                  Rules fill in tags and people, so create one first.
                </small>
              </div>
              <div className="og-callout-actions">
                <button onClick={() => onSection("category")}>
                  Categories
                </button>
                <button onClick={() => onSection("person")}>People</button>
              </div>
            </div>
          )}
          {rules.length > 0 && (
            <section
              className="rl-apply"
              aria-label="Apply rules to existing transactions"
            >
              <div className="rl-apply-counts">
                {candidates.length ? (
                  statuses.map(([id, label]) => (
                    <span key={id} className={`rl-status is-${id}`}>
                      <b>{counts[id]}</b> {label}
                    </span>
                  ))
                ) : (
                  <span className="rl-muted">
                    {enabled
                      ? "No existing transactions match your enabled rules."
                      : "All rules are switched off."}
                  </span>
                )}
                <small>
                  {plural(candidates.length, "transaction")} matched by{" "}
                  {plural(enabled, "enabled rule")}
                  {uncategorized
                    ? ` · ${plural(uncategorized, "active transaction")} without a tag`
                    : ""}
                </small>
              </div>
              <div className="rl-apply-actions">
                <button
                  className="primary"
                  disabled={busy || !counts.ready}
                  onClick={apply}
                >
                  Apply to {plural(counts.ready, "ready transaction")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={reload}
                >
                  Refresh
                </button>
              </div>
              {result && (
                <p className="rl-result" role="status">
                  Applied {result.applied}. Skipped {result.conflicts}{" "}
                  conflicting, {result.protected} protected and{" "}
                  {result.unchanged} unchanged.
                  {onNavigate && (
                    <button
                      className="text-button"
                      onClick={() => onNavigate("transactions")}
                    >
                      See transactions
                    </button>
                  )}
                </p>
              )}
              <p>
                Optional. Only empty tag or person fields are filled, and only
                for transactions marked ready.
              </p>
            </section>
          )}
          {!rules.length ? (
            <div className="og-empty rl-empty">
              <h3>No rules yet.</h3>
              <p>
                Choose your saved vendors or a description regex, then assign a
                tag or person for future imports.
                {uncategorized
                  ? ` Right now ${plural(uncategorized, "active transaction has", "active transactions have")} no tag.`
                  : ""}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => setEditing({})}
              >
                + New rule
              </button>
            </div>
          ) : (
            <>
              <div className="og-toolbar">
                <input
                  className="og-search"
                  type="search"
                  aria-label="Search rules"
                  placeholder="Find a rule, vendor or regex…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="og-stat">
                  {plural(rules.length, "rule")} · {enabled} enabled
                </span>
              </div>
              {!shownRules.length ? (
                <div className="og-empty">
                  <h3>No matching rules.</h3>
                  <p>Try another name, vendor or part of the regex.</p>
                </div>
              ) : (
                <div className="rl-rules">
                  {shownRules.map((r) => {
                    const stats = perRule.get(r.name);
                    return (
                      <article
                        className={`rl-rule ${r.enabled ? "" : "is-off"}`}
                        key={r.id}
                      >
                        <span className="rl-dot" aria-hidden="true" />
                        <div className="rl-rule-body">
                          <div className="rl-rule-title">
                            <h3 title={r.name}>{r.name}</h3>
                            {!r.enabled && (
                              <span className="rl-badge is-off">Off</span>
                            )}
                            {r.direction && r.direction !== "any" && (
                              <span className="rl-badge">
                                {directionLabel[r.direction] || r.direction}
                              </span>
                            )}
                          </div>
                          {r.matchType === "aliases" ? (
                            <div
                              className="rl-vendor-summary"
                              title={(r.aliasIds || [])
                                .map(
                                  (id) =>
                                    aliases.find((a) => a.id === id)?.name ||
                                    "Missing alias",
                                )
                                .join(", ")}
                            >
                              Vendors ·{" "}
                              {(r.aliasIds || [])
                                .map(
                                  (id) =>
                                    aliases.find((a) => a.id === id)?.name ||
                                    "Missing alias",
                                )
                                .join(", ")}
                            </div>
                          ) : (
                            <code title={r.pattern}>{r.pattern}</code>
                          )}
                          {r.template&&<div className="rl-maps">Template · {r.template.tags.map(p=>`${byId.get(p.id)?.name||'Missing tag'} ${p.weight/100}%`).join(', ')} · {r.template.autoReview?'Auto-review':'Manual verification'}</div>}
                          <Mapping
                            template={r.template}
                            categoryId={r.categoryId}
                            personId={r.personId}
                            byId={byId}
                          />
                        </div>
                        <div className="rl-rule-stats">
                          {stats ? (
                            <>
                              {stats.ready > 0 && (
                                <span className="rl-status is-ready">
                                  {stats.ready} ready
                                </span>
                              )}
                              {stats.conflict > 0 && (
                                <span className="rl-status is-conflict">
                                  {plural(stats.conflict, "conflict")}
                                </span>
                              )}
                              <small>{stats.matched} matched</small>
                            </>
                          ) : (
                            <small>
                              {r.enabled ? "No matches yet" : "Not running"}
                            </small>
                          )}
                        </div>
                        <button
                          disabled={busy}
                          aria-label={`Edit rule ${r.name}`}
                          onClick={() => setEditing(r)}
                        >
                          Edit
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
              <section
                className="rl-matches"
                aria-label="Matches on existing transactions"
              >
                <div className="og-panel-head">
                  <h3>Existing transactions</h3>
                  <small>
                    Conflicts list every rule involved. Open one to change it.
                  </small>
                </div>
                {candidates.length ? (
                  <CandidateList
                    candidates={candidates}
                    byId={byId}
                    onEditRule={editByName}
                  />
                ) : (
                  <p className="rl-none">
                    {enabled
                      ? "No active bank transactions match your enabled rules."
                      : "Enable a rule to see its matches here."}
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
      {editing?.template ? <TransactionTemplateEditor rule={editing} entities={entities} onClose={()=>setEditing(null)} onSaved={async()=>{await act(async()=>true);}}/> : editing && (
        <RuleEditor
          key={editing.id || "new"}
          rule={editing}
          aliases={aliases}
          categories={categories}
          people={people}
          byId={byId}
          act={act}
          busy={busy}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
