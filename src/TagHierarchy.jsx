import React, { useState } from "react";
import "./tag-hierarchy.css";
import { alphabetical, tagType } from "../electron/review/tag-model.mjs";
const api = window.urbanomics;
export function TagHierarchy({ entities, usage, edit, act, busy, error }) {
  const [lens, setLens] = useState("expense");
  const [lifted, setLifted] = useState("");
  const [query, setQuery] = useState(""),
    [over, setOver] = useState(null);
  const tags = alphabetical(
      entities.filter((e) => e.kind === "category" && tagType(e) === lens),
    ),
    buckets = entities.filter((e) => e.kind === "bucket");
  const groups =
    lens === "income"
      ? [{ id: "", name: "Income tags", color: "#8FA6CB" }]
      : [...buckets, { id: "", name: "Ungrouped tags", color: "#A4ADA3" }];
  async function move(tag, parentId) {
    if (!tag || tagType(tag) !== "expense" || tag.parentId === parentId || busy)
      return;
    setLifted("");
    await act(() =>
      api.saveEntity("category", {
        ...tag,
        color: tag.customColor ?? tag.color,
        parentId,
      }),
    );
  }
  return (
    <section
      className="th-workspace"
      aria-label="Categories and tags hierarchy"
    >
      <div className="th-lenses" role="group" aria-label="Organization lens">
        {["expense", "income"].map((type) => (
          <button
            key={type}
            aria-pressed={lens === type}
            onClick={() => {
              setLens(type);
              setQuery("");
              setLifted("");
            }}
          >
            <strong>{type === "expense" ? "Expenses" : "Income"}</strong>
            <small>
              {type === "expense"
                ? "Categories with detailed tags"
                : "Sources of money received"}
            </small>
          </button>
        ))}
      </div>
      <div className="th-heading">
        <div>
          <h2>
            {lens === "expense" ? "Expense categories & tags" : "Income tags"}
          </h2>
          <p>
            {lens === "expense"
              ? "Organize spending from broad buckets down to details."
              : "Keep income sources separate from spending. Repayments and transfers retain their own relationships."}
          </p>
        </div>
        {lens === "expense" && (
          <button
            disabled={busy}
            onClick={() => edit({ kind: "bucket", color: "#8DAE87" })}
          >
            + New category
          </button>
        )}
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            edit({
              kind: "category",
              flowType: lens,
              color: lens === "income" ? "#8FA6CB" : "#8DAE87",
            })
          }
        >
          + New tag
        </button>
      </div>
      <div className="th-toolbar">
        <input
          type="search"
          aria-label="Search categories and tags"
          placeholder={
            lens === "income"
              ? "Find an income tag…"
              : "Find a category or tag…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>
          {lens === "expense" && `${buckets.length} categories · `}
          {tags.length} {tags.length === 1 ? "tag" : "tags"}
        </span>
        {lens === "expense" && (
          <button
            disabled={busy}
            onClick={() => act(() => api.starterHierarchy())}
          >
            Add Food & Personal starter
          </button>
        )}
      </div>
      <p className="th-hint">
        {lens === "expense"
          ? "Drag tags between categories. Keyboard: Space picks up a focused tag; Enter places it in a focused category."
          : "Income tags are a flat list, always alphabetical."}
      </p>
      {error && (
        <p role="alert" className="dr-error-text">
          {error}
        </p>
      )}
      <div className="th-groups">
        {groups.map((group) => {
          const children = tags.filter((t) => (t.parentId || "") === group.id),
            matches = children.filter((t) =>
              `${group.name} ${t.name}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            );
          if (
            query &&
            !matches.length &&
            !group.name.toLowerCase().includes(query.toLowerCase())
          )
            return null;
          return (
            <section
              key={group.id}
              className={`th-group ${over === group.id ? "is-over" : ""}`}
              style={{ "--group-color": group.color }}
              aria-label={`Category ${group.name}`}
              tabIndex={lens === "expense" ? 0 : undefined}
              onKeyDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  e.key === "Enter" &&
                  lifted
                ) {
                  e.preventDefault();
                  move(
                    tags.find((t) => t.id === lifted),
                    group.id,
                  );
                }
              }}
              onDragOver={(e) => {
                if (
                  lens === "expense" &&
                  !busy &&
                  e.dataTransfer.types.includes("application/urbanomics-tag")
                ) {
                  e.preventDefault();
                  setOver(group.id);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(
                  tags.find(
                    (t) =>
                      t.id ===
                      e.dataTransfer.getData("application/urbanomics-tag"),
                  ),
                  group.id,
                );
              }}
            >
              <header>
                <i />
                <h3>{group.name}</h3>
                <small>
                  {children.length} {children.length === 1 ? "tag" : "tags"}
                </small>
                {group.id && (
                  <button
                    disabled={busy}
                    aria-label={`Edit category ${group.name}`}
                    onClick={() => edit(group)}
                  >
                    Edit
                  </button>
                )}
                <button
                  disabled={busy}
                  aria-label={`Add tag to ${group.name}`}
                  onClick={() =>
                    edit({
                      kind: "category",
                      parentId: group.id,
                      flowType: lens,
                      color: group.color,
                    })
                  }
                >
                  ＋
                </button>
              </header>
              <div className="th-tags">
                {matches.map((tag) => (
                  <article
                    className="th-tag"
                    data-inherited-color={tag.inheritedColor || undefined}
                    style={{ "--tag-color": tag.color }}
                    key={tag.id}
                    draggable={!busy && lens === "expense"}
                    tabIndex={lens === "expense" ? 0 : undefined}
                    aria-label={`Tag ${tag.name}`}
                    aria-grabbed={lifted === tag.id}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === " ") {
                        e.preventDefault();
                        setLifted(lifted === tag.id ? "" : tag.id);
                      }
                      if (e.key === "Escape") setLifted("");
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/urbanomics-tag",
                        tag.id,
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setOver(null)}
                  >
                    <span aria-hidden="true">
                      {lens === "expense" ? "⠿" : ""}
                    </span>
                    <i style={{ background: tag.color }} />
                    <div>
                      <strong>{tag.name}</strong>
                      <small>
                        {usage.get(tag.id)?.active || 0}{" "}
                        {usage.get(tag.id)?.active === 1
                          ? "transaction"
                          : "transactions"}
                        {usage.get(tag.id)?.rules
                          ? ` · ${usage.get(tag.id).rules} rules`
                          : ""}
                      </small>
                    </div>

                    <button
                      disabled={busy}
                      aria-label={`Edit tag ${tag.name}`}
                      onClick={() => edit(tag)}
                    >
                      Edit
                    </button>
                  </article>
                ))}
              </div>
              {!matches.length && (
                <p className="th-empty">
                  {query
                    ? "No matching tags."
                    : lens === "income"
                      ? "Add an income tag to begin."
                      : "Drop tags here, or add a new one."}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
