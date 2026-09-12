import React, { useEffect, useState } from "react";
const slots = (n, cx, cy, radius) =>
  Array.from({ length: n }, (_, i) => ({
    x: cx + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n) * radius,
    y: cy + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n) * radius,
  }));
export function RadialHierarchy({
  tags,
  buckets,
  expanded,
  onExpand,
  width,
  query,
  choose,
  selected,
  hover,
  busy,
}) {
  const [page, setPage] = useState(0),
    [tagPage, setTagPage] = useState(0);
  useEffect(() => setTagPage(0), [expanded, query]);
  useEffect(() => setPage(0), [query]);
  const groups = [
    ...buckets,
    { id: "ungrouped", name: "Ungrouped", color: "#9AA993" },
  ]
    .map((b) => ({
      ...b,
      children: tags.filter((t) => (t.parentId || "ungrouped") === b.id),
    }))
    .filter((b) => b.id !== "ungrouped" || b.children.length);
  const matching = groups.filter(
    (b) =>
      !query ||
      b.name.toLowerCase().includes(query.toLowerCase()) ||
      b.children.some((t) =>
        t.name.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const actualPage = Math.min(
      page,
      Math.max(0, Math.ceil(matching.length / 8) - 1),
    ),
    visible = matching.slice(actualPage * 8, actualPage * 8 + 8);
  const points = slots(visible.length, width / 2, 260, 205),
    active = groups.find((b) => b.id === expanded),
    anchor = visible.findIndex((b) => b.id === expanded);
  const cx =
      anchor < 0
        ? width / 2
        : Math.max(175, Math.min(width - 175, points[anchor].x)),
    cy = anchor < 0 ? 260 : Math.max(180, Math.min(340, points[anchor].y));
  const children =
      active?.children.filter(
        (t) =>
          !query ||
          active.name.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase()),
      ) || [],
    tp = Math.min(tagPage, Math.max(0, Math.ceil(children.length / 8) - 1)),
    shown = children.slice(tp * 8, tp * 8 + 8),
    tagPoints = slots(shown.length, cx, cy, 123);
  function open(id) {
    if (expanded !== id) {
      setTagPage(0);
      onExpand(id);
    }
  }
  return (
    <>
      {visible.map((b, i) => (
        <button
          key={b.id}
          data-orbit-bucket={b.id}
          className={`rh-bucket ${expanded === b.id ? "is-open" : ""}`}
          style={{
            left: points[i].x,
            top: points[i].y,
            "--bubble-color": b.color,
          }}
          aria-label={`Category ${b.name}`}
          aria-expanded={expanded === b.id}
          disabled={busy}
          onMouseEnter={() => open(b.id)}
          onFocus={() => open(b.id)}
          onClick={() => open(b.id)}
        >
          <strong>{b.name}</strong>
          <small>{b.children.length} tags</small>
        </button>
      ))}
      {!matching.length && (
        <p className="rh-no-buckets">
          Create categories and tags in Organize to begin.
        </p>
      )}
      {matching.length > 8 && (
        <div className="rh-pages">
          <button
            disabled={actualPage === 0 || busy}
            onClick={() => {
              setPage(actualPage - 1);
              onExpand("");
            }}
          >
            Previous categories
          </button>
          <span>
            {actualPage + 1} / {Math.ceil(matching.length / 8)}
          </span>
          <button
            disabled={(actualPage + 1) * 8 >= matching.length || busy}
            onClick={() => {
              setPage(actualPage + 1);
              onExpand("");
            }}
          >
            More categories
          </button>
        </div>
      )}
      {active && (
        <div className="rh-expanded" style={{ "--bubble-color": active.color }}>
          <div
            className="rh-petal-disc"
            data-petal-disc
            style={{ left: cx, top: cy }}
          />
          <div className="rh-petal-title" style={{ left: cx, top: cy }}>
            <strong>{active.name}</strong>
            <small>
              {children.length ? "Drop onto a tag" : "Add tags in Organize"}
            </small>
            <button
              aria-label="Close category tags"
              onClick={() => onExpand("")}
            >
              Back
            </button>
            {children.length > 8 && (
              <div>
                <button
                  aria-label="Previous tags"
                  disabled={tp === 0}
                  onClick={() => setTagPage(tp - 1)}
                >
                  ‹
                </button>
                <span>
                  {tp + 1}/{Math.ceil(children.length / 8)}
                </span>
                <button
                  aria-label="More tags"
                  disabled={(tp + 1) * 8 >= children.length}
                  onClick={() => setTagPage(tp + 1)}
                >
                  ›
                </button>
              </div>
            )}
          </div>
          {shown.map((tag, i) => (
            <button
              key={tag.id}
              data-orbit-target={tag.id}
              className={`rh-tag ${hover === tag.id ? "os-drop-ready" : ""}`}
              style={{
                left: tagPoints[i].x,
                top: tagPoints[i].y,
                "--bubble-color": tag.color,
                "--petal-index": i,
              }}
              disabled={busy}
              title={tag.name}
              aria-label={`Tag ${tag.name}`}
              aria-pressed={selected(tag.id)}
              onClick={() => choose(tag.id)}
            >
              <span>{tag.name}</span>
              {selected(tag.id) && <small>✓</small>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
