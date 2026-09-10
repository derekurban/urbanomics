import React, { useEffect, useState } from "react";
import { EntityEditor } from "./EntityEditor.jsx";
import { AliasesWorkspace } from "./AliasesWorkspace.jsx";
import "./organize-workspace.css";

const api = window.urbanomics;
const sections = [
  ["category", "Categories"],
  ["group", "Events"],
  ["accounts", "Accounts"],
  ["person", "People"],
  ["aliases", "Aliases"],
];
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
function uses(row, entity) {
  if (entity.kind === "category")
    return row.review.tags.some((p) => p.id === entity.id);
  if (entity.kind === "group") return row.review.groups.includes(entity.id);
  if (entity.kind === "person")
    return (
      row.review.personId === entity.id ||
      row.review.shares?.some((p) => p.id === entity.id)
    );
  return false;
}

export function OrganizeWorkspace({
  data,
  run,
  busy,
  section,
  onSection,
  accounts,
}) {
  const [state, setState] = useState(null),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState(null),
    [error, setError] = useState("");
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
  const entities = state?.entities || [],
    list = entities.filter((e) => e.kind === section);
  const shown = list.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()),
  );
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
          Manage the pieces you use to sort and understand your transactions.
        </p>
      </div>
      <nav className="og-sections" aria-label="Organize sections">
        {sections.map(([id, label]) => (
          <button
            key={id}
            aria-label={label}
            aria-pressed={section === id}
            onClick={() => {
              onSection(id);
              setQuery("");
              setError("");
            }}
          >
            <span>{label}</span>
            {id !== "aliases" && (
              <small>
                {id === "accounts"
                  ? data.accounts.length
                  : entities.filter((e) => e.kind === id).length}
              </small>
            )}
          </button>
        ))}
      </nav>
      {section === "accounts" ? (
        accounts
      ) : section === "aliases" ? (
        <AliasesWorkspace
          data={data}
          run={run}
          busy={busy}
          onAccounts={() => onSection("accounts")}
        />
      ) : (
        <>
          <div className="og-heading">
            <div>
              <h2>{sections.find(([id]) => id === section)?.[1]}</h2>
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
          <input
            className="og-search"
            aria-label={`Search ${sections.find(([id]) => id === section)?.[1].toLowerCase()}`}
            placeholder={`Find ${sections.find(([id]) => id === section)?.[1].toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
                {query
                  ? "No matches."
                  : `No ${sections.find(([id]) => id === section)?.[1].toLowerCase()} yet.`}
              </h3>
              <p>
                {query
                  ? "Try a different name."
                  : `Create a ${singular[section]} to use it throughout Review.`}
              </p>
            </div>
          ) : (
            <div className="og-list">
              {shown.map((entity) => {
                const linked = state.records.filter((t) => uses(t, entity)),
                  active = linked.filter((t) => !t.deleted).length,
                  archived = linked.length - active;
                return (
                  <article className="og-item" key={entity.id}>
                    <span
                      className={`og-symbol ${section === "person" ? "og-avatar" : ""}`}
                      style={{ "--item-color": entity.color }}
                      aria-hidden="true"
                    >
                      {section === "person"
                        ? entity.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")
                        : null}
                    </span>
                    <div className="og-item-body">
                      <h3>{entity.name}</h3>
                      <small>
                        {active} {active === 1 ? "transaction" : "transactions"}
                        {archived ? ` · ${archived} in deleted accounts` : ""}
                      </small>
                    </div>
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
