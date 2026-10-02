import { AppearanceWorkspace } from "./AppearanceWorkspace.jsx";
import { AdminWorkspace } from "./AdminWorkspace.jsx";
import { categoryColors } from "./category-colors.js";
import { eventDateLabel } from "../electron/review/event-model.mjs";
import React, { useEffect, useMemo, useState } from "react";
import { TagHierarchy } from "./TagHierarchy.jsx";
import { EntityEditor } from "./EntityEditor.jsx";
import { AliasesWorkspace } from "./AliasesWorkspace.jsx";
import { RulesWorkspace } from "./RulesWorkspace.jsx";
import "./organize-workspace.css";

const api = window.urbanomics;
const sections = [
  ["category", "Categories & tags"],
  ["person", "People"],
  ["aliases", "Aliases"],
  ["rules", "Rules"],
  ["admin", "Admin"],
  ["appearance", "Appearance"],
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

export function OrganizeWorkspace({
  data,
  run,
  busy,
  section,
  onSection,
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
      attempt(() => api.transactionRulesState()),
    ]).then(([rules]) => {
      if (!live) return;
      setExtras({
        rules: rules.status === "fulfilled" ? rules.value : null,
      });
      const failed = [rules].filter((r) => r.status === "rejected");
      if (failed.length)
        setExtrasError(
          failed.map((f) => f.reason?.message || String(f.reason)).join(" "),
        );
    });
    return () => {
      live = false;
    };
  }, [data]);

  const entities = categoryColors(state?.entities || []),
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
      for (const id of [rule.categoryId, rule.personId,...(rule.template?.tags||[]).map(p=>p.id),...(rule.template?.groups||[])].filter(Boolean)) {
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
  const label = titles[section] || "Settings",
    lower = label.toLowerCase();

  function go(id) {
    if(id==="accounts"||id==="group"){onNavigate(id==="group"?"events":"accounts");return;}
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
    <div className="organize-workspace settings-workspace">
      <div className="workspace-heading"><div><p className="workspace-eyebrow">MAKE IT YOURS</p><h1>Settings</h1></div></div>
      <nav className="og-sections" aria-label="Settings sections">
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
      {extrasError&&<p role="alert" className="dr-error-text">{extrasError}</p>}
      {section === "appearance" ? <AppearanceWorkspace/> : section === "admin" ? (
        <AdminWorkspace data={data} act={act} busy={busy} />
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
                    : `Create a ${singular[section]} to use it throughout your workspace.`}
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
