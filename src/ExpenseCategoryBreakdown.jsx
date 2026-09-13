import { tagOrder } from "../electron/review/tag-model.mjs";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { vendorGroups } from "./dashboard-model.js";

export function ExpenseCategoryBreakdown({
  categories,
  tags,
  layer,
  money,
  onOpen,
}) {
  const [hover, setHover] = useState(null),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const tip = useRef(null),
    timer = useRef(null);
  const clear = () => {
    clearTimeout(timer.current);
    setHover(null);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(null), 140);
  };
  const show = (event, group) => {
    clearTimeout(timer.current);
    setHover({ group, target: event.currentTarget, rect: event.currentTarget.getBoundingClientRect() });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!hover) return;
    const escape = (e) => {
      if (e.key === "Escape") clear();
    };
    const scroll = (e) => {
      if (tip.current?.contains(e.target)) return;
      // Keyboard focus can scroll a chip into view after its focus event.
      if (document.activeElement === hover.target) {
        const rect = hover.target.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight)
          setHover((current) => current ? { ...current, rect } : null);
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
    const r = hover.rect,
      h = tip.current.offsetHeight,
      w = tip.current.offsetWidth;
    setPosition({
      left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)),
      top: Math.max(
        12,
        r.bottom + h + 10 < window.innerHeight ? r.bottom + 8 : r.top - h - 8,
      ),
    });
  }, [hover]);
  const scopedRows = (group) =>
    group.rows
      .map((e) => {
        const ids = group.tagIds || [group.id];
        const gross = e.grossParts
            .filter((p) => ids.includes(p.id))
            .reduce((n, p) => n + p.cents, 0),
          net = e.netParts
            .filter((p) => ids.includes(p.id))
            .reduce((n, p) => n + p.cents, 0);
        return { ...e, gross, net, repaid: gross - net };
      })
      .filter((e) => e.gross > 0);
  const top = hover ? vendorGroups(scopedRows(hover.group)).slice(0, 3) : [];
  const max = Math.max(1, ...categories.map((c) => c.gross));
  const events = (group) => ({
    onMouseEnter: (e) => show(e, group),
    onMouseLeave: leave,
    onFocus: (e) => show(e, group),
    onBlur: leave,
    "aria-describedby":
      hover?.group.id === group.id ? "expense-spend-tooltip" : undefined,
    onClick: () => {
      clear();
      onOpen(group);
    },
  });
  return (
    <div className="dash-bars">
      {categories.map((c) => {
        const children =
          layer === "categories"
            ? tags.filter(
                (t) =>
                  t.parentId === c.id ||
                  (c.id === "dashboard:ungrouped" &&
                    !categories.some((category) => category.id === t.parentId) &&
                    t.flowType !== "income" &&
                    t.kind === "category"),
              ).sort(tagOrder)
            : [];
        const category = {
          ...c,
          tagIds: children.length ? children.map((t) => t.id) : [c.id],
        };
        return (
          <article className="dash-category-breakdown" key={c.id}>
            <button className="dash-bar" {...events(category)}>
              <span className="dash-between">
                <span>
                  <i style={{ background: c.color }} />
                  {c.name}
                </span>
                <strong>{money(c.net)}</strong>
              </span>
              <span className="dash-track" aria-hidden="true">
                <span
                  className="dash-net"
                  style={{ width: `${(100 * c.net) / max}%` }}
                />
                <span
                  className="dash-repaid"
                  style={{ width: `${(100 * c.repaid) / max}%` }}
                />
              </span>
              <small>
                {money(c.gross)} paid · {money(c.repaid)} repaid
              </small>
            </button>
            {children.length > 0 && (
              <div
                className="dash-category-tags"
                aria-label={`Tags in ${c.name}`}
              >
                <div className="dash-tag-stack" aria-hidden="true">
                  {children
                    .filter((t) => t.net > 0)
                    .map((t) => (
                      <span
                        key={t.id}
                        style={{
                          background: t.color,
                          width: `${(100 * t.net) / Math.max(1, c.net)}%`,
                        }}
                      />
                    ))}
                </div>
                <div className="dash-tag-chips">
                  {children.map((t) => (
                    <button className="dash-tag-chip" key={t.id} {...events(t)}>
                      <i style={{ background: t.color }} />
                      <span>{t.name}</span>
                      <strong>{money(t.net)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
      {hover &&
        createPortal(
          <aside
            id="expense-spend-tooltip"
            className="dash-spend-tooltip"
            role="tooltip"
            ref={tip}
            style={position}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={leave}
          >
            <div className="dash-between">
              <strong>{hover.group.name}</strong>
              <strong>{money(hover.group.net)}</strong>
            </div>
            <small>
              After repayments · {money(hover.group.gross)} paid ·{" "}
              {money(hover.group.repaid)} repaid
            </small>
            <h4>Top 3 vendors</h4>
            {top.map((vendor, i) => (
              <div className="dash-tooltip-vendor" key={vendor.key}>
                <span>
                  {i + 1}. {vendor.name}
                </span>
                <strong>{money(vendor.net)}</strong>
              </div>
            ))}
            {!top.length && <p>No spending in this selection.</p>}
          </aside>,
          document.body,
        )}
    </div>
  );
}
