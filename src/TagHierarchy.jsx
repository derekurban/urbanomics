import { systemPalette, endpoints } from "../electron/review/palette.mjs";
import React, { useState } from "react";
import { Icon } from "@derekurban/design-system";
import "./tag-hierarchy.css";
import { orderedTags as alphabetical, tagType } from "../electron/review/tag-model.mjs";
import { Alert, Segmented, FloatingMenu } from "./ui.jsx";
import { palette } from "./snapshots-v2-atoms.jsx";
import { plural } from "./format.js";
import { notify } from "./toast.jsx";
const api = window.urbanomics;

// Expense tags grouped into categories (drag or Space/Enter to move and reorder), income tags in their own
// list, and the system tags, which can only be renamed. Category palettes colour their tags.
export function TagHierarchy({ entities, usage, edit, act, busy, error, onSuggest, hasTransactions = true }) {
  const [lens, setLens] = useState("expense");
  const [suggestMenu, setSuggestMenu] = useState(null);
  const [lifted, setLifted] = useState("");
  // On phones and touch screens the reorder arrows stay hidden until a category's Reorder is switched on.
  const [reordering, setReordering] = useState(() => new Set());
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
    return [plural(u?.active || 0, "transaction"), u?.rules ? plural(u.rules, "vendor") : ""].filter(Boolean).join(" · ");
  };
  const groupName = (id) => (id ? buckets.find((b) => b.id === id)?.name || "its category" : "Ungrouped tags");
  const siblingIds = (list, parentId, flowType = "expense") =>
    alphabetical(list.filter((t) => t.kind === "category" && !t.systemRole && tagType(t) === flowType && (t.parentId || "") === (parentId || ""))).map((t) => t.id);
  async function move(tag, parentId) {
    if (!tag || tagType(tag) !== "expense" || (tag.parentId || "") === (parentId || "") || busy) return;
    setLifted("");
    const from = tag.parentId || "", order = siblingIds(entities, from);
    const done = await act(() => api.saveEntity("category", { ...tag, color: tag.customColor ?? tag.color, parentId }));
    if (done === false) return;
    notify({
      title: `Moved “${tag.name}” to ${groupName(parentId)}`,
      tone: "success",
      action: {
        label: "Undo",
        // Back to its category, then back to its place there (a moved tag goes to the end of its new category).
        onClick: () => act(async () => {
          await api.saveEntity("category", { ...tag, color: tag.customColor ?? tag.color, parentId: from });
          const now = siblingIds((await api.reviewState()).entities, from);
          if (JSON.stringify(now) !== JSON.stringify(order) && now.length === order.length && order.every((id) => now.includes(id))) await api.reorderTags(order, now);
        }),
      },
    });
  }
  async function reorder(tag, beforeId) {
    if (busy || !tag || tag.id === beforeId) return;
    const siblings = tags.filter((t) => t.parentId === tag.parentId);
    const expected = siblings.map((t) => t.id), ids = expected.filter((id) => id !== tag.id);
    ids.splice(beforeId ? ids.indexOf(beforeId) : ids.length, 0, tag.id);
    if (JSON.stringify(ids) === JSON.stringify(expected)) { setLifted(""); setOver(null); return; }
    setLifted(""); setOver(null);
    const done = await act(() => api.reorderTags(ids, expected));
    if (done === false) return;
    const before = siblings.find((t) => t.id === beforeId);
    notify({
      title: before ? `Moved “${tag.name}” before “${before.name}”` : `Moved “${tag.name}” to the end of ${lens === "income" ? "Income tags" : groupName(tag.parentId)}`,
      tone: "success",
      action: { label: "Undo", onClick: () => act(() => api.reorderTags(expected, ids)) },
    });
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
            {onSuggest && <button disabled={busy} aria-haspopup="menu" aria-expanded={!!suggestMenu} onClick={(e) => setSuggestMenu(suggestMenu ? null : e.currentTarget)}><Icon name="sparkles" size={16} />Suggest<Icon name="chevron-down" size={16} /></button>}
            {suggestMenu && <FloatingMenu anchor={suggestMenu} label="Claude suggestions" width={240} onClose={() => setSuggestMenu(null)} onSelect={(value) => onSuggest(value)}
              items={[{ value: "missing", label: "Suggest missing tags" }, { value: "restructure", label: "Suggest a restructure" }]} />}
            {lens === "expense" && <button disabled={busy} onClick={() => edit({ kind: "bucket", color: palette[buckets.length % palette.length] })}><Icon name="plus" size={16} />New category</button>}
            <button className={fresh && lens === "expense" ? undefined : "primary"} disabled={busy} onClick={() => edit({ kind: "category", flowType: lens })}><Icon name="plus" size={16} />New tag</button>
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
          <p>{hasTransactions ? "Make your own, let Claude propose categories and tags from your transactions, or start with Food and Personal and their usual tags." : "Make your own, or start with Food and Personal and their usual tags. Once you have imported a bank export, Claude can propose a structure from your transactions."} You can rename, move or delete any of them later.</p>
          <div className="empty-state-actions">{onSuggest && hasTransactions && <button className="primary" disabled={busy} onClick={() => onSuggest("restructure")}><Icon name="sparkles" size={16} />Suggest a structure from my transactions</button>}<button className={onSuggest && hasTransactions ? undefined : "primary"} disabled={busy} onClick={async () => { if ((await act(() => api.starterHierarchy())) !== false) notify({ title: "Added Food and Personal with their usual tags", tone: "success" }); }}>Start with Food and Personal</button></div>
        </div>
      ) : (
        <>
          <p className="form-help th-touch-hint">Each tag's colour steps along its category's palette, in order. Choose Reorder on a category to change the order.</p>
          <p className="form-help th-drag-hint">
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
                  className={`th-group ${over === (group.id || group.paletteId) ? "is-over" : ""} ${reordering.has(group.id || group.paletteId) ? "is-reordering" : ""}`}
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
                    {children.length > 1 && (
                      <button type="button" className="sm ghost th-reorder" aria-pressed={reordering.has(group.id || group.paletteId)} aria-label={`Reorder ${group.name}`}
                        onClick={() => setReordering((set) => { const next = new Set(set), key = group.id || group.paletteId; if (next.has(key)) next.delete(key); else next.add(key); return next; })}>
                        {reordering.has(group.id || group.paletteId) ? "Done" : "Reorder"}
                      </button>
                    )}
                    <button className="icon ghost sm" disabled={busy}
                      aria-label={group.paletteId ? `Edit ${group.paletteId === "income" ? "Income" : "Ungrouped tags"} colors` : `Edit category ${group.name}`}
                      title={group.paletteId ? "Colours" : "Edit category"}
                      onClick={() => edit(group.paletteId ? systemPalette(entities, group.paletteId) : group)}>
                      <Icon name={group.paletteId ? "palette" : "pencil"} size={16} />
                    </button>
                    <button className="icon ghost sm" disabled={busy} aria-label={`Add a tag to ${group.name}`} title="Add a tag here"
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
                        <span className="th-grip" aria-hidden="true"><Icon name="grip-vertical" size={16} /></span>
                        <i style={{ background: tag.color }} aria-hidden="true" />
                        <div>
                          <strong>{tag.name}</strong>
                          <small>{usageLine(tag.id)}</small>
                        </div>
                        <div className="th-tag-actions">
                          <button className="icon ghost sm th-move" aria-label={`Move ${tag.name} earlier`} disabled={busy || index(tag) === 0} onClick={() => reorder(tag, children[index(tag) - 1]?.id)}><Icon name="chevron-up" size={16} /></button>
                          <button className="icon ghost sm th-move" aria-label={`Move ${tag.name} later`} disabled={busy || index(tag) === children.length - 1} onClick={() => reorder(tag, children[index(tag) + 2]?.id)}><Icon name="chevron-down" size={16} /></button>
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
