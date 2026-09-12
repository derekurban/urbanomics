import React, { useState } from "react";
import "./tag-hierarchy.css";
const api = window.urbanomics;
export function TagHierarchy({ entities, usage, edit, act, busy, error }) {
  const [query, setQuery] = useState(""),
    [over, setOver] = useState(null);
  const tags = entities.filter((e) => e.kind === "category"),
    buckets = entities.filter((e) => e.kind === "bucket");
  const groups = [
    ...buckets,
    { id: "", name: "Ungrouped tags", color: "#A4ADA3" },
  ];
  async function move(tag, parentId) {
    if (!tag || tag.parentId === parentId || busy) return;
    await act(() => api.saveEntity("category", { ...tag, parentId }));
  }
  return (
    <section
      className="th-workspace"
      aria-label="Categories and tags hierarchy"
    >
      <div className="th-heading">
        <div>
          <h2>Big buckets. Little details.</h2>
          <p>
            Tag each transaction. Categories collect their tags for the bigger
            picture.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => edit({ kind: "bucket", color: "#8DAE87" })}
        >
          + New category
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => edit({ kind: "category", color: "#8DAE87" })}
        >
          + New tag
        </button>
      </div>
      <div className="th-toolbar">
        <input
          type="search"
          aria-label="Search categories and tags"
          placeholder="Find a category or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>
          {buckets.length} categories · {tags.length} tags
        </span>
        <button
          disabled={busy}
          onClick={() => act(() => api.starterHierarchy())}
        >
          Add Food & Personal starter
        </button>
      </div>
      <p className="th-hint">
        Drag a tag to another category, or use its Move menu. Existing
        transaction amounts stay the same.
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
              onDragOver={(e) => {
                if (
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
                <small>{children.length} tags</small>
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
                    key={tag.id}
                    draggable={!busy}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/urbanomics-tag",
                        tag.id,
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setOver(null)}
                  >
                    <span aria-hidden="true">⠿</span>
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
                    <select
                      disabled={busy}
                      aria-label={`Move ${tag.name} to category`}
                      value={tag.parentId || ""}
                      onChange={(e) => move(tag, e.target.value)}
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
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
