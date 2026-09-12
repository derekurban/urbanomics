import { eventDateLabel } from "../electron/review/event-model.mjs";
import React, { useEffect, useMemo, useState } from "react";
import { TagHierarchy } from "./TagHierarchy.jsx";
import { EntityEditor } from "./EntityEditor.jsx";
import { AliasesWorkspace } from "./AliasesWorkspace.jsx";
import { RulesWorkspace } from "./RulesWorkspace.jsx";
import "./organize-workspace.css";

const api = window.urbanomics;
const sections = [
  ["overview", "Overview"],
  ["category", "Categories & tags"],
  ["group", "Events"],
  ["person", "People"],
  ["accounts", "Accounts"],
  ["aliases", "Aliases"],
  ["rules", "Rules"],
];
const titles = Object.fromEntries(sections);
const singular = {
  category: "category",
  group: "event",
  person: "person",
};
const descriptions = {
  category:
    "Where your money goes. Split a transaction across several categories when needed.",
  group: "Trips, occasions, and other collections of whole transactions.",
  person: "People you share expenses with or receive repayments from.",
};
const colors = [
  "#78976A",
  "#8FA6CB",
  "#C8A06D",
  "#AF8EB5",
  "#70A8A5",
  "#CA8D86",
];
const tones = {
  category: "sage",
  group: "sand",
  person: "lilac",
  accounts: "sky",
  aliases: "mint",
  rules: "peach",
};
const glyphs = {
  overview: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </>
  ),
  category: (
    <>
      <path d="M2 2h5.6L14 8.4 8.4 14 2 7.6V2z" />
      <circle cx="5.3" cy="5.3" r="0.9" />
    </>
  ),
  group: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 7h12M5 1.5v3M11 1.5v3" />
    </>
  ),
  person: (
    <>
      <circle cx="8" cy="5.5" r="3" />
      <path d="M2.5 14.5c0-3.1 2.5-5 5.5-5s5.5 1.9 5.5 5" />
    </>
  ),
  accounts: (
    <>
      <rect x="2" y="4" width="12" height="9" rx="2" />
      <path d="M2 7.5h12M5 10.5h2.5" />
    </>
  ),
  aliases: <path d="M3 4h10M3 8h6M3 12h8" />,
  rules: <path d="M2 3h12l-4.5 5.2v4.3l-3-1.5V8.2L2 3z" />,
  check: <path d="M3 8.5l3 3 7-7" />,
  warn: (
    <>
      <path d="M8 2.2l6.3 11.3H1.7L8 2.2z" />
      <path d="M8 6.5v3.2M8 12h.01" />
    </>
  ),
  arrow: <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" />,
};

function Glyph({ name }) {
  return (
    <svg
      className="og-glyph"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphs[name]}
    </svg>
  );
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
}

function plural(n, word, words = `${word}s`) {
  return `${n} ${n === 1 ? word : words}`;
}

/* Resolves a promise-returning call so a missing or throwing API surfaces as
   a rejection instead of breaking the render. */
function attempt(fn) {
  try {
    return Promise.resolve(fn());
  } catch (e) {
    return Promise.reject(e);
  }
}

function Overview({ state, data, usage, extras, extrasError, go, onNavigate }) {
  const entities = state.entities,
    records = state.records;
  const byKind = (kind) => entities.filter((e) => e.kind === kind);
  const categories = byKind("category"),
    events = byKind("group"),
    people = byKind("person");
  const active = records.filter((r) => !r.deleted);
  const uncategorized = active.filter((r) => !r.review?.tags?.length).length;
  const undated = events.filter((e) => !e.startDate || !e.endDate).length;
  const aliasConflicts = records.filter((r) => r.aliasConflicts?.length).length;
  const transferDifferences = active.filter(
    (r) =>
      r.review?.kind === "transfer" &&
      (r.review.transferFeeCents > 0 || r.review.transferExcessCents > 0),
  ).length;
  const unused = (list) => list.filter((e) => !usage.get(e.id)).length;
  const unusedCategories = unused(categories),
    unusedPeople = unused(people),
    emptyEvents = unused(events);
  const rulesState = extras?.rules,
    aliasState = extras?.aliases;
  const candidates = rulesState?.candidates || [];
  const ready = candidates.filter((c) => c.status === "ready").length,
    ruleConflicts = candidates.filter((c) => c.status === "conflict").length,
    offRules = (rulesState?.rules || []).filter((r) => !r.enabled).length;

  const items = [];
  if (transferDifferences && onNavigate)
    items.push({
      tone: "info",
      count: transferDifferences,
      title: "Linked transfers with a difference",
      detail:
        "Shortfalls are recorded as fees; extra received remains unexplained. Inspect the linked pairs.",
      actions: [
        {
          label: "Inspect transfers",
          go: () => onNavigate("transfers-linked"),
        },
      ],
    });
  if (ruleConflicts)
    items.push({
      tone: "warn",
      count: ruleConflicts,
      title: "Transactions where rules disagree",
      detail:
        "Two or more rules map to different tags or people, so nothing is applied.",
      actions: [{ label: "Inspect rules", go: () => go("rules") }],
    });
  if (aliasConflicts)
    items.push({
      tone: "warn",
      count: aliasConflicts,
      title: "Transactions with competing aliases",
      detail: "They keep their original bank names until one alias wins.",
      actions: [{ label: "Fix aliases", go: () => go("aliases") }],
    });
  if (undated)
    items.push({
      tone: "warn",
      count: undated,
      title: "Events missing dates",
      detail:
        "Without a start and end the calendar cannot suggest transactions.",
      actions: [{ label: "Edit events", go: () => go("group") }],
    });
  if (ready)
    items.push({
      tone: "ok",
      count: ready,
      title: "Transactions ready for your saved rules",
      detail:
        "Applying fills empty tags or people. Nothing is applied on its own.",
      actions: [{ label: "Review and apply", go: () => go("rules") }],
    });
  if (uncategorized)
    items.push({
      tone: "info",
      count: uncategorized,
      title: "Active transactions without a tag",
      detail: onNavigate
        ? "Tag them in Review, or add a rule so imports fill them in."
        : "Add a rule so imports fill them in, or tag them in Review.",
      actions: [
        onNavigate && {
          label: "Open transactions",
          go: () => onNavigate("transactions"),
        },
        { label: "Rules", go: () => go("rules") },
      ].filter(Boolean),
    });
  if (offRules)
    items.push({
      tone: "tidy",
      count: offRules,
      title: "Rules switched off",
      detail: "Kept for later but ignored on import.",
      actions: [{ label: "Rules", go: () => go("rules") }],
    });
  if (unusedCategories)
    items.push({
      tone: "tidy",
      count: unusedCategories,
      title: "Tags with no transactions",
      detail: "Fine to keep, or delete them to shorten your pickers.",
      actions: [{ label: "Categories", go: () => go("category") }],
    });
  if (emptyEvents)
    items.push({
      tone: "tidy",
      count: emptyEvents,
      title: "Events with no transactions",
      detail: "Add transactions from Review, or delete the event.",
      actions: [{ label: "Events", go: () => go("group") }],
    });
  if (unusedPeople)
    items.push({
      tone: "tidy",
      count: unusedPeople,
      title: "People with no transactions",
      detail: "Nothing is shared with or owed by them yet.",
      actions: [{ label: "People", go: () => go("person") }],
    });

  const tiles = [
    {
      id: "category",
      count: categories.length,
      hint: unusedCategories ? `${unusedCategories} unused` : "",
    },
    {
      id: "group",
      count: events.length,
      hint: undated ? `${undated} need dates` : "",
    },
    {
      id: "person",
      count: people.length,
      hint: unusedPeople ? `${unusedPeople} unused` : "",
    },
    { id: "accounts", count: data.accounts.length, hint: "" },
    {
      id: "aliases",
      count: aliasState ? aliasState.rules.length : null,
      hint: aliasConflicts ? `${aliasConflicts} conflicts` : "",
    },
    {
      id: "rules",
      count: rulesState ? rulesState.rules.length : null,
      hint: ready
        ? `${ready} ready to apply`
        : ruleConflicts
          ? `${ruleConflicts} conflicts`
          : "",
    },
  ];
  const checking = !extras && !extrasError;

  return (
    <div className="og-overview">
      <div className="og-tiles">
        {tiles.map((t) => (
          <button
            key={t.id}
            className={`og-tile is-${tones[t.id]}`}
            aria-label={`${titles[t.id]}${
              t.count === null ? "" : `, ${t.count}`
            }${t.hint ? `, ${t.hint}` : ""}. Open section`}
            onClick={() => go(t.id)}
          >
            <i>
              <Glyph name={t.id} />
            </i>
            <b>{t.count === null ? (checking ? "…" : "–") : t.count}</b>
            <span>{titles[t.id]}</span>
            {t.hint && <small>{t.hint}</small>}
          </button>
        ))}
      </div>
      <div className="og-overview-grid">
        <section className="og-panel" aria-label="Needs attention">
          <div className="og-panel-head">
            <h3>Needs attention</h3>
            <small>
              {plural(active.length, "active transaction")} ·{" "}
              {`${records.length - active.length} in deleted accounts`}
            </small>
          </div>
          {items.length ? (
            <div className="og-attention">
              {items.map((item) => (
                <div
                  className={`og-attention-row is-${item.tone}`}
                  key={item.title}
                >
                  <b className="og-count">{item.count}</b>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <div className="og-attention-actions">
                    {item.actions.map((a) => (
                      <button key={a.label} onClick={a.go}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="og-clear">
              <Glyph name="check" />
              <div>
                <strong>
                  {checking || extrasError
                    ? "Nothing found so far."
                    : "No cleanup items found."}
                </strong>
                <small>
                  {checking
                    ? "Still checking aliases and rules."
                    : extrasError
                      ? "Some checks could not finish."
                      : "No issues found by these organization checks."}
                </small>
              </div>
            </div>
          )}
          {checking && items.length > 0 && (
            <p className="og-pending">Checking aliases and rules…</p>
          )}
          {extrasError && (
            <p className="og-pending is-error" role="alert">
              Could not check aliases or rules: {extrasError}
            </p>
          )}
        </section>
        {onNavigate && (
          <section className="og-panel" aria-label="Check in Review">
            <div className="og-panel-head">
              <h3>Check in Review</h3>
            </div>
            <p>
              Organize keeps the building blocks. Money decisions happen in
              Review.
            </p>
            <div className="og-links">
              <button onClick={() => onNavigate("transactions")}>
                <Glyph name="arrow" />
                <span>
                  <strong>Transactions</strong>
                  <small>Tag, split and assign people.</small>
                </span>
              </button>
              <button onClick={() => onNavigate("transfers")}>
                <Glyph name="arrow" />
                <span>
                  <strong>Transfers</strong>
                  <small>Compare both sides of moves between accounts.</small>
                </span>
              </button>
              <button onClick={() => onNavigate("money-in")}>
                <Glyph name="arrow" />
                <span>
                  <strong>Money in</strong>
                  <small>Income, refunds and repayments.</small>
                </span>
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export function OrganizeWorkspace({
  data,
  run,
  busy,
  section,
  onSection,
  accounts,
  onNavigate,
}) {
  const [state, setState] = useState(null),
    [query, setQuery] = useState(""),
    [unusedOnly, setUnusedOnly] = useState(false),
    [editing, setEditing] = useState(null),
    [error, setError] = useState("");
  const [extras, setExtras] = useState(null),
    [extrasError, setExtrasError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .reviewState()
      .then((s) => {
        if (live) setState(s);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [data]);
  useEffect(() => {
    let live = true;
    setExtras(null);
    setExtrasError("");
    Promise.allSettled([
      attempt(() => api.aliases()),
      attempt(() => api.transactionRulesState()),
    ]).then(([aliases, rules]) => {
      if (!live) return;
      setExtras({
        aliases: aliases.status === "fulfilled" ? aliases.value : null,
        rules: rules.status === "fulfilled" ? rules.value : null,
      });
      const failed = [aliases, rules].filter((r) => r.status === "rejected");
      if (failed.length)
        setExtrasError(
          failed.map((f) => f.reason?.message || String(f.reason)).join(" "),
        );
    });
    return () => {
      live = false;
    };
  }, [data]);

  const entities = state?.entities || [],
    records = state?.records || [];
  /* Per-entity usage, counting each transaction once per entity it touches. */
  const usage = useMemo(() => {
    const map = new Map();
    for (const row of records) {
      const review = row.review || {},
        seen = new Set();
      for (const t of review.tags || []) seen.add(t.id);
      for (const g of review.groups || []) seen.add(g);
      if (review.personId) seen.add(review.personId);
      if (review.assignedPersonId) seen.add(review.assignedPersonId);
      for (const s of review.shares || []) seen.add(s.id);
      for (const id of seen) {
        const u = map.get(id) || { active: 0, archived: 0 };
        if (row.deleted) u.archived += 1;
        else u.active += 1;
        map.set(id, u);
      }
    }
    for (const rule of extras?.rules?.rules || []) {
      for (const id of [rule.categoryId, rule.personId].filter(Boolean)) {
        const u = map.get(id) || { active: 0, archived: 0 };
        u.rules = (u.rules || 0) + 1;
        map.set(id, u);
      }
    }
    return map;
  }, [records, extras]);

  const list = entities.filter((e) => e.kind === section);
  const unusedCount = list.filter((e) => !usage.get(e.id)).length;
  const shown = list.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) &&
      (!unusedOnly || !usage.get(e.id)),
  );
  const peak = Math.max(1, ...list.map((e) => usage.get(e.id)?.active || 0));
  const label = titles[section] || "Organize",
    lower = label.toLowerCase();

  function go(id) {
    onSection(id);
    setQuery("");
    setUnusedOnly(false);
    setError("");
  }
  function edit(entity) {
    setError("");
    setEditing(entity);
  }
  async function act(fn) {
    setError("");
    return run(async () => {
      try {
        const result = await fn();
        setState(await api.reviewState());
        return result;
      } catch (e) {
        setError(e.message);
        throw e;
      }
    });
  }
  return (
    <div className="organize-workspace">
      <div className="page-heading">
        <h1>Organize</h1>
        <p>
          The pieces that sort your transactions: categories, tags, events,
          people, accounts, aliases and rules.
        </p>
      </div>
      <nav className="og-sections" aria-label="Organize sections">
        {sections.map(([id, name]) => {
          const count =
            id === "accounts"
              ? data.accounts.length
              : singular[id]
                ? entities.filter((e) => e.kind === id).length
                : null;
          return (
            <button
              key={id}
              aria-label={name}
              aria-pressed={section === id}
              onClick={() => go(id)}
            >
              <span>{name}</span>
              {count !== null && <small aria-hidden="true">{count}</small>}
            </button>
          );
        })}
      </nav>
      {section === "accounts" ? (
        accounts
      ) : section === "aliases" ? (
        <AliasesWorkspace
          data={data}
          run={run}
          busy={busy}
          onAccounts={() => go("accounts")}
        />
      ) : section === "category" ? (
        <TagHierarchy
          entities={entities}
          usage={usage}
          edit={edit}
          act={act}
          busy={busy || !state}
          error={editing ? "" : error}
        />
      ) : section === "rules" ? (
        <RulesWorkspace
          data={data}
          run={run}
          busy={busy}
          onSection={go}
          onNavigate={onNavigate}
        />
      ) : section === "overview" ? (
        <>
          {error && (
            <p className="dr-error-text" role="alert">
              {error}
            </p>
          )}
          {!state ? (
            <p className="og-empty">
              {error
                ? "Unable to load organization items."
                : "Loading your workspace…"}
            </p>
          ) : (
            <Overview
              state={state}
              data={data}
              usage={usage}
              extras={extras}
              extrasError={extrasError}
              go={go}
              onNavigate={onNavigate}
            />
          )}
        </>
      ) : (
        <>
          <div className="og-heading">
            <div>
              <h2>{label}</h2>
              <p>{descriptions[section]}</p>
            </div>
            <button
              className="primary"
              disabled={busy || !state}
              onClick={() =>
                edit({
                  kind: section,
                  color: colors[list.length % colors.length],
                })
              }
            >
              + New {singular[section]}
            </button>
          </div>
          <div className="og-toolbar">
            <input
              className="og-search"
              type="search"
              aria-label={`Search ${lower}`}
              placeholder={`Find ${lower}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="og-filter"
              aria-pressed={unusedOnly}
              disabled={!state}
              onClick={() => setUnusedOnly((v) => !v)}
            >
              Unused only <small>{unusedCount}</small>
            </button>
            {state && (
              <span className="og-stat">
                {plural(list.length, singular[section] || "item")}
              </span>
            )}
          </div>
          {error && !editing && (
            <p className="dr-error-text" role="alert">
              {error}
            </p>
          )}
          {!state ? (
            <p className="og-empty">
              {error
                ? "Unable to load organization items."
                : "Loading your workspace…"}
            </p>
          ) : !shown.length ? (
            <div className="og-empty">
              <h3>
                {query || unusedOnly ? "No matches." : `No ${lower} yet.`}
              </h3>
              <p>
                {query
                  ? "Try a different name."
                  : unusedOnly
                    ? `Every ${singular[section]} is in use.`
                    : `Create a ${singular[section]} to use it throughout Review.`}
              </p>
            </div>
          ) : (
            <div className="og-rows">
              {shown.map((entity) => {
                const u = usage.get(entity.id) || { active: 0, archived: 0 },
                  total = u.active + u.archived + (u.rules || 0),
                  dated =
                    entity.kind !== "group" ||
                    (entity.startDate && entity.endDate);
                return (
                  <article className="og-row" key={entity.id}>
                    <span
                      className={`og-symbol ${section === "person" ? "og-avatar" : ""}`}
                      style={{ "--item-color": entity.color }}
                      aria-hidden="true"
                    >
                      {section === "person" ? initials(entity.name) : null}
                    </span>
                    <div className="og-row-body">
                      <h3 title={entity.name}>{entity.name}</h3>
                      <div className="og-row-meta">
                        {entity.kind === "group" &&
                          (dated ? (
                            <span>{eventDateLabel(entity)}</span>
                          ) : (
                            <span className="og-badge is-warn">
                              Dates required
                            </span>
                          ))}
                        <span>{plural(u.active, "transaction")}</span>
                        {u.rules > 0 && <span>{plural(u.rules, "rule")}</span>}
                        {u.archived > 0 && (
                          <span>{u.archived} in deleted accounts</span>
                        )}
                        {!total && <span className="og-badge">Unused</span>}
                      </div>
                    </div>
                    <span
                      className="og-usage-bar"
                      aria-hidden="true"
                      style={{ "--fill": `${(u.active / peak) * 100}%` }}
                    />
                    <button
                      disabled={busy}
                      aria-label={`Edit ${singular[section]} ${entity.name}`}
                      onClick={() => edit(entity)}
                    >
                      Edit
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {editing && (
        <EntityEditor
          key={editing.id || editing.kind}
          entity={editing}
          entities={entities}
          act={act}
          error={error}
          onClose={() => {
            setEditing(null);
            setError("");
          }}
        />
      )}
    </div>
  );
}
