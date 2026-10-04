import { systemPalette, endpoints } from "../electron/review/palette.mjs";
import React, { useState } from "react";
import { Icon } from "@derekurban/design-system";
import "./tag-hierarchy.css";
import { orderedTags as alphabetical, tagType } from "../electron/review/tag-model.mjs";
import { Alert, Segmented } from "./ui.jsx";
import { palette } from "./snapshots-v2-atoms.jsx";
import { plural } from "./format.js";
const api = window.urbanomics;

// Expense tags grouped into categories (drag or Space/Enter to move and reorder), income tags in their own
// list, and the system tags, which can only be renamed. Category palettes colour their tags.
export function TagHierarchy({ entities, usage, edit, act, busy, error }) {
  const [lens, setLens] = useState("expense");
  const [lifted, setLifted] = useState("");
  const [query, setQuery] = useState(""),
    [over, setOver] = useState(null);
  const tags = alphabetical(entities.filter((e) => e.kind === "category" && !e.systemRole && tagType(e) === lens)),
    buckets = entities.filter((e) => e.kind === "bucket"),
    system = entities.filter((e) => e.systemRole);
  const paletteGroup = (palette) => ({ ...palette, ...endpoints(palette), color: palette.color, id: "", paletteId: palette.id });
  const groups = lens === "income" ? [{ ...paletteGroup(systemPalette(entities, "income")), name: "Income tags" }] : [...buckets, paletteGroup(systemPalette(entities, "ungrouped"))];
  const fresh = lens === "expense" && !buckets.length && !tags.length;
  const usageLine = (id) => {
    const u = usage.get(id);
    return [plural(u?.active || 0, "transaction"), u?.rules ? plural(u.rules, "rule") : ""].filter(Boolean).join(" · ");
  };
  async function move(tag, parentId) {
    if (!tag || tagType(tag) !== "expense" || tag.parentId === parentId || busy) return;
    setLifted("");
    await act(() => api.saveEntity("category", { ...tag, color: tag.customColor ?? tag.color, parentId }));
  }
  async function reorder(tag, beforeId) {
    if (busy || !tag || tag.id === beforeId) return;
    const siblings = tags.filter((t) => t.parentId === tag.parentId);
    const expected = siblings.map((t) => t.id), ids = expected.filter((id) => id !== tag.id);
    ids.splice(beforeId ? ids.indexOf(beforeId) : ids.length, 0, tag.id);
    setLifted(""); setOver(null);
    await act(() => api.reorderTags(ids, expected));
  }
  const dragging = (e) => !busy && e.dataTransfer.types.includes("application/urbanomics-tag");
  return (
    <section className="th-workspace" aria-label="Categories and tags">
      <div className="th-toolbar">
        <Segmented label="Which tags" value={lens} onChange={(v) => { setLens(v); setQuery(""); setLifted(""); }}
          options={[{ value: "expense", label: "Expenses" }, { value: "income", label: "Income" }, { value: "system", label: "System tags" }]} />
        {lens !== "system" && tags.length > 6 && (
          <input type="search" aria-label="Search categories and tags" placeholder={lens === "income" ? "Find an income tag" : "Find a category or tag"} value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
        {lens !== "system" && (
          <div className="th-actions">
            {lens === "expense" && <button disabled={busy} onClick={() => edit({ kind: "bucket", color: palette[buckets.length % palette.length] })}><Icon name="plus" size={16} />New category</button>}
            <button className="primary" disabled={busy} onClick={() => edit({ kind: "category", flowType: lens })}><Icon name="plus" size={16} />New tag</button>
          </div>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {lens === "system" ? (
        <>
          <p className="form-help">The app uses these on its own. You can rename them; they can't be deleted or recoloured.</p>
          <div className="th-system">
            {system.map((t) => (
              <article key={t.id}>
                <i style={{ background: t.color }} aria-hidden="true" />
                <div>
                  <strong>{t.name}</strong>
                  <small>{t.systemRole === "other-income" ? "Money in that has no tag yet" : t.systemRole === "other-expense" ? "Money out that has no tag yet" : t.description}</small>
                </div>
                <button className="sm" disabled={busy} onClick={() => edit(t)} aria-label={`Rename ${t.name}`}>Rename</button>
              </article>
            ))}
          </div>
        </>
      ) : fresh ? (
        <div className="empty-state">
          <Icon name="tags" size={24} />
          <h2>No categories yet.</h2>
          <p>Make your own, or start with Food and Personal and their usual tags. You can rename, move or delete any of them later.</p>
          <button disabled={busy} onClick={() => act(() => api.starterHierarchy())}>Start with Food and Personal</button>
        </div>
      ) : (
        <>
          <p className="form-help">
            {lens === "expense"
              ? "Drag a tag into another category to move it, or onto a tag to put it before that one. With the keyboard, Space picks a tag up and Enter puts it down."
              : "Drag to reorder, or use the arrows. Colours follow this order across the income palette."}
          </p>
          <div className="th-groups">
            {groups.map((group) => {
              const children = tags.filter((t) => (t.parentId || "") === group.id),
                q = query.trim().toLowerCase(),
                matches = children.filter((t) => `${group.name} ${t.name}`.toLowerCase().includes(q));
              if (q && !matches.length && !group.name.toLowerCase().includes(q)) return null;
              const index = (tag) => children.findIndex((t) => t.id === tag.id);
              return (
                <section
                  key={group.id || group.paletteId}
                  className={`th-group ${over === (group.id || group.paletteId) ? "is-over" : ""}`}
                  aria-label={`Category ${group.name}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && e.key === "Enter" && lifted) {
                      e.preventDefault();
                      const tag = tags.find((t) => t.id === lifted);
                      if (tag?.parentId === group.id) reorder(tag, null); else move(tag, group.id);
                    }
                  }}
                  onDragOver={(e) => { if (dragging(e)) { e.preventDefault(); setOver(group.id || group.paletteId); } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const tag = tags.find((t) => t.id === e.dataTransfer.getData("application/urbanomics-tag"));
                    if (tag?.parentId === group.id) reorder(tag, null); else move(tag, group.id);
                  }}
                >
                  <header>
                    <i style={{ background: group.color }} aria-hidden="true" />
                    <h3>{group.name}</h3>
                    <small>{plural(children.length, "tag")}</small>
                    <button className="icon ghost sm" disabled={busy}
                      aria-label={group.paletteId ? `Edit ${group.paletteId === "income" ? "Income" : "Ungrouped tags"} colors` : `Edit category ${group.name}`}
                      title={group.paletteId ? "Colours" : "Edit category"}
                      onClick={() => edit(group.paletteId ? systemPalette(entities, group.paletteId) : group)}>
                      <Icon name={group.paletteId ? "palette" : "pencil"} size={16} />
                    </button>
                    <button className="icon ghost sm" disabled={busy} aria-label={`Add tag to ${group.name}`} title="Add a tag here"
                      onClick={() => edit({ kind: "category", parentId: group.id, flowType: lens })}>
                      <Icon name="plus" size={16} />
                    </button>
                  </header>
                  <div className="th-tags">
                    {matches.map((tag) => (
                      <article
                        className="th-tag"
                        key={tag.id}
                        draggable={!busy}
                        tabIndex={0}
                        aria-label={`Tag ${tag.name}${lifted === tag.id ? ", picked up" : ""}`}
                        data-lifted={lifted === tag.id || undefined}
                        data-drop-before={over === tag.id || undefined}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === " ") { e.preventDefault(); setLifted(lifted === tag.id ? "" : tag.id); }
                          if (e.key === "Escape") setLifted("");
                          if (e.key === "Enter" && lifted) { e.preventDefault(); reorder(tags.find((t) => t.id === lifted && t.parentId === tag.parentId), tag.id); }
                        }}
                        onDragOver={(e) => { if (dragging(e)) { e.preventDefault(); e.stopPropagation(); setOver(tag.id); } }}
                        onDrop={(e) => {
                          const dragged = tags.find((t) => t.id === e.dataTransfer.getData("application/urbanomics-tag"));
                          if (dragged?.parentId === tag.parentId) { e.preventDefault(); e.stopPropagation(); reorder(dragged, tag.id); }
                        }}
                        onDragStart={(e) => { e.dataTransfer.setData("application/urbanomics-tag", tag.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => setOver(null)}
                      >
                        <Icon name="grip-vertical" size={16} />
                        <i style={{ background: tag.color }} aria-hidden="true" />
                        <div>
                          <strong>{tag.name}</strong>
                          <small>{usageLine(tag.id)}</small>
                        </div>
                        <div className="th-tag-actions">
                          <button className="icon ghost sm" aria-label={`Move ${tag.name} earlier`} disabled={busy || index(tag) === 0} onClick={() => reorder(tag, children[index(tag) - 1]?.id)}><Icon name="chevron-up" size={16} /></button>
                          <button className="icon ghost sm" aria-label={`Move ${tag.name} later`} disabled={busy || index(tag) === children.length - 1} onClick={() => reorder(tag, children[index(tag) + 2]?.id)}><Icon name="chevron-down" size={16} /></button>
                          <button className="icon ghost sm" disabled={busy} aria-label={`Edit tag ${tag.name}`} onClick={() => edit(tag)}><Icon name="pencil" size={16} /></button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!matches.length && <p className="th-empty">{query ? "No matching tags." : lens === "income" ? "No income tags yet." : "Drop tags here, or add one with the plus."}</p>}
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
