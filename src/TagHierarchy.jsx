import {
  blend,
  endpoints,
  systemPalette,
} from "../electron/review/palette.mjs";
import React, { useState } from "react";
import "./tag-hierarchy.css";
import { orderedTags as alphabetical, tagType } from "../electron/review/tag-model.mjs";
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
  const incomePalette = systemPalette(entities, "income");
  const ungroupedPalette = systemPalette(entities, "ungrouped");
  const paletteGroup = (palette) => ({
    ...palette,
    ...endpoints(palette),
    color: palette.color,
    id: "",
    paletteId: palette.id,
  });
  const groups =
    lens === "income"
      ? [{ ...paletteGroup(incomePalette), name: "Income tags" }]
      : [...buckets, paletteGroup(ungroupedPalette)];
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
  async function reorder(tag, beforeId) {
    if (busy || !tag || tag.id === beforeId) return;
    const siblings = tags.filter(t => t.parentId === tag.parentId);
    const expected = siblings.map(t => t.id), ids = expected.filter(id => id !== tag.id);
    ids.splice(beforeId ? ids.indexOf(beforeId) : ids.length, 0, tag.id);
    setLifted(""); setOver(null);
    await act(() => api.reorderTags(ids, expected));
  }
  return (
    <section
      className="th-workspace"
      aria-label="Categories and tags hierarchy"
    >
      <div className="th-lenses" role="group" aria-label="Organization lens">
        {["expense", "income", "transfer"].map((type) => (
          <button
            key={type}
            style={
              type === "income"
                ? {
                    "--lens-color": blend(
                      incomePalette.gradientStart,
                      incomePalette.gradientEnd,
                    ),
                  }
                : undefined
            }
            aria-pressed={lens === type}
            onClick={() => {
              setLens(type);
              setQuery("");
              setLifted("");
            }}
          >
            <strong>{type === "expense" ? "Expenses" : type === "income" ? "Income" : "Transfers"}</strong>
            <small>
              {type === "expense"
                ? "Categories with detailed tags"
                : type === "income" ? "Sources of money received" : "Linked movements between accounts"}
            </small>
          </button>
        ))}
      </div>
      {lens === "transfer" ? <div className="th-transfer-info"><h2>Transfers have a place of their own.</h2><p>Link the money leaving one account to the money arriving in another in Review → Transfers. Both entries leave expense and income tagging automatically. Their saved tags stay preserved if you unlink them.</p><p>Transfer fees remain separate costs. No transfer tags are needed.</p></div> : <>
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
          ? "Drag tags onto another tag to reorder, or into a category to move. Use the arrows for precise ordering. Keyboard: Space picks up; Enter places."
          : "Choose your income tag order by dragging or using the arrows. Gradient colors follow this order."}
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
              tabIndex={0}
              onKeyDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  e.key === "Enter" &&
                  lifted
                ) {
                  e.preventDefault();
                  const tag = tags.find((t) => t.id === lifted);
                  if (tag?.parentId === group.id) reorder(tag, null); else move(tag, group.id);
                }
              }}
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
                const tag = tags.find(t => t.id === e.dataTransfer.getData("application/urbanomics-tag"));
                if (tag?.parentId === group.id) reorder(tag, null); else move(tag, group.id);
              }}
            >
              <header>
                <i />
                <h3>{group.name}</h3>
                <small>
                  {children.length} {children.length === 1 ? "tag" : "tags"}
                </small>
                {(group.id || group.paletteId) && (
                  <button
                    disabled={busy}
                    aria-label={
                      group.paletteId
                        ? `Edit ${group.paletteId === "income" ? "Income" : "Ungrouped tags"} colors`
                        : `Edit category ${group.name}`
                    }
                    onClick={() =>
                      edit(
                        group.paletteId
                          ? systemPalette(entities, group.paletteId)
                          : group,
                      )
                    }
                  >
                    {group.paletteId ? "Colors" : "Edit"}
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
                    draggable={!busy}
                    tabIndex={0}
                    aria-label={`Tag ${tag.name}`}
                    aria-grabbed={lifted === tag.id}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === " ") {
                        e.preventDefault();
                        setLifted(lifted === tag.id ? "" : tag.id);
                      }
                      if (e.key === "Escape") setLifted("");
                      if (e.key === "Enter" && lifted) { e.preventDefault(); reorder(tags.find(t => t.id === lifted && t.parentId === tag.parentId), tag.id); }
                    }}
                    onDragOver={e => { if (!busy && e.dataTransfer.types.includes("application/urbanomics-tag")) { e.preventDefault(); e.stopPropagation(); setOver(tag.id); } }}
                    onDrop={e => { const dragged = tags.find(t => t.id === e.dataTransfer.getData("application/urbanomics-tag")); if (dragged?.parentId === tag.parentId) { e.preventDefault(); e.stopPropagation(); reorder(dragged, tag.id); } }}
                    data-drop-before={over === tag.id || undefined}
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
                      ⠿
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

                    <div className="th-order-actions">
                      <button aria-label={`Move ${tag.name} earlier`} disabled={busy || children[0]?.id === tag.id} onClick={() => reorder(tag, children[children.findIndex(t => t.id === tag.id) - 1]?.id)}>↑</button>
                      <button aria-label={`Move ${tag.name} later`} disabled={busy || children.at(-1)?.id === tag.id} onClick={() => reorder(tag, children[children.findIndex(t => t.id === tag.id) + 2]?.id)}>↓</button>
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
      </>}
    </section>
  );
}
