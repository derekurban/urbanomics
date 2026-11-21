import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { vendorGroups, UNCATEGORIZED } from "./dashboard-model.js";
import { plural } from "./format.js";

// Share of the period, as a whole percentage; a sliver reads "<1%" rather than "0%".
export const shareOf = (part, whole) => (!whole || part <= 0 ? "" : part * 100 < whole ? "<1%" : `${Math.round((100 * part) / whole)}%`);

// Categories on one shared scale: your cost in the category's color, what was paid back in the same color
// at lower strength. Hovering (after 300ms, like the package Tooltip) or focusing shows the top vendors;
// clicking opens the full breakdown, which carries the same information for every input.
export function ExpenseCategoryBreakdown({ categories, tags, layer, money, onOpen, onOrganizeUnsorted }) {
  const [hover, setHover] = useState(null),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const tip = useRef(null),
    timer = useRef(null),
    shown = useRef(false);
  const clear = () => {
    clearTimeout(timer.current);
    setHover(null);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setHover(null); shown.current = false; }, 120);
  };
  const show = (event, group, delay = 300) => {
    clearTimeout(timer.current);
    const target = event.currentTarget;
    const open = () => { shown.current = true; setHover({ group, target, rect: target.getBoundingClientRect() }); };
    // The first card waits 300ms; neighbours open at once while one is showing.
    if (shown.current || !delay) open();
    else timer.current = setTimeout(open, delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!hover) return;
    const escape = (e) => { if (e.key === "Escape") clear(); };
    const scroll = (e) => {
      if (tip.current?.contains(e.target)) return;
      if (document.activeElement === hover.target) {
        const rect = hover.target.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) setHover((current) => (current ? { ...current, rect } : null));
        else clear();
      } else clear();
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [hover]);
  useLayoutEffect(() => {
    if (!hover || !tip.current) return;
    const r = hover.rect, h = tip.current.offsetHeight, w = tip.current.offsetWidth;
    setPosition({
      left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)),
      top: Math.max(12, r.bottom + h + 8 < window.innerHeight ? r.bottom + 8 : r.top - h - 8),
    });
  }, [hover]);
  const scopedRows = (group) =>
    group.rows
      .map((e) => {
        const ids = group.tagIds || [group.id];
        const gross = e.grossParts.filter((p) => ids.includes(p.id)).reduce((n, p) => n + p.cents, 0),
          net = e.netParts.filter((p) => ids.includes(p.id)).reduce((n, p) => n + p.cents, 0);
        return { ...e, gross, net, repaid: gross - net };
      })
      .filter((e) => e.gross > 0);
  const top = hover ? vendorGroups(scopedRows(hover.group)).slice(0, 3) : [];
  const max = Math.max(1, ...categories.map((c) => c.gross));
  const whole = categories.reduce((n, c) => n + c.net, 0);
  const events = (group) => ({
    onMouseEnter: (e) => show(e, group),
    onMouseLeave: leave,
    onFocus: (e) => e.currentTarget.matches(":focus-visible") && show(e, group, 0),
    onBlur: leave,
    onClick: () => { clear(); onOpen(group); },
  });
  return (
    <div className="dash-bars">
      {categories.map((c) => {
        const children =
          layer === "categories"
            ? tags
                .filter(
                  (t) =>
                    t.parentId === c.id ||
                    (c.id === "dashboard:ungrouped" && !categories.some((category) => category.id === t.parentId) && t.flowType !== "income" && t.kind === "category"),
                )
            : [];
        const category = { ...c, tagIds: children.length ? children.map((t) => t.id) : [c.id] };
        return (
          <article className={`dash-category-breakdown${c.id === UNCATEGORIZED ? " is-unsorted" : ""}`} key={c.id} style={{ "--c": c.color }}>
            <div className="dash-line">
              <button className="dash-bar" {...events(category)} aria-label={`${c.name}: ${money(c.net)}${shareOf(c.net, whole) ? `, ${shareOf(c.net, whole)} of the period` : ""}${c.id === UNCATEGORIZED ? `, ${plural(c.rows.length, "expense", "expenses")} not sorted yet` : ""}`}>
                <span className="dash-bar-name">
                  {c.id === UNCATEGORIZED ? <i className="dash-hatch" aria-hidden="true" /> : <i style={{ background: c.color }} />}
                  <span>{c.name}{c.id === UNCATEGORIZED && <small> · {plural(c.rows.length, "expense", "expenses")}</small>}</span>
                </span>
                <span className="dash-track" aria-hidden="true">
                  <span className="dash-net" style={{ width: `${(100 * c.net) / max}%` }} />
                  <span className="dash-repaid" style={{ width: `${(100 * c.repaid) / max}%` }} />
                </span>
                <strong className="tabular">{money(c.net)}</strong>
                <small className="tabular dash-share">{shareOf(c.net, whole)}</small>
              </button>
              {c.id === UNCATEGORIZED && onOrganizeUnsorted && (
                <button className="sm dash-organize-these" onClick={onOrganizeUnsorted}>Organize these</button>
              )}
            </div>
            {children.length > 0 && (
              <div className="dash-tag-chips" aria-label={`Tags in ${c.name}`}>
                {children.map((t) => (
                  <button className="dash-tag-chip" key={t.id} {...events(t)}>
                    <i style={{ background: t.color }} />
                    <span>{t.name}</span>
                    <strong className="tabular">{money(t.net)}</strong>
                  </button>
                ))}
              </div>
            )}
          </article>
        );
      })}
      {hover &&
        createPortal(
          <aside className="dash-spend-tooltip" ref={tip} style={position} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave}>
            <div className="dash-between">
              <strong>{hover.group.name}</strong>
              <strong className="tabular">{money(hover.group.net)}</strong>
            </div>
            <small className="tabular">Your cost · {money(hover.group.gross)} spent{hover.group.repaid ? ` · ${money(hover.group.repaid)} paid back` : ""}</small>
            <h4>Top vendors</h4>
            {top.map((vendor) => (
              <div className="dash-tooltip-vendor" key={vendor.key}>
                <span>{vendor.name}</span>
                <strong className="tabular">{money(vendor.net)}</strong>
              </div>
            ))}
            {!top.length && <p>No spending in this selection.</p>}
          </aside>,
          document.body,
        )}
    </div>
  );
}
