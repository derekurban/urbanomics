import React, { useEffect, useRef } from "react";
import { orderedTags as alphabetical } from "../electron/review/tag-model.mjs";
import { ringSlots } from "./radial-hierarchy-layout.js";
export function RadialHierarchy({
  tags,
  buckets,
  expanded,
  onExpand,
  width,
  height,
  query,
  choose,
  selected,
  hover,
  busy,
  lens = "expense",
  ungroupedColor = "#9AA993",
}) {
  const expandedRef = useRef(null);
  const matches = (name) =>
    name.toLowerCase().includes(query.trim().toLowerCase());
  const sorted = alphabetical(tags);
  const groups = [
    ...buckets,
    { id: "ungrouped", name: "Ungrouped", color: ungroupedColor },
  ]
    .map((b) => ({
      ...b,
      children: sorted.filter((t) => (t.parentId || "ungrouped") === b.id),
    }))
    .filter((b) => b.id !== "ungrouped" || b.children.length)
    .filter((b) => matches(b.name) || b.children.some((t) => matches(t.name)));
  const points = ringSlots(groups.length, 205, 102).points;
  const active =
    lens === "income"
      ? {
          id: "income",
          name: "Income tags",
          color: "#8FA6CB",
          children: sorted,
        }
      : groups.find((b) => b.id === expanded);
  const children =
    active?.children.filter((t) => matches(active.name) || matches(t.name)) ||
    [];
  const ring = ringSlots(children.length, lens === "income" ? 205 : 123),
    disc = 2 * (ring.radius + 48);
  const anchor = groups.findIndex((b) => b.id === expanded);
  const clamp = (n, max) =>
    Math.max(disc / 2 + 5, Math.min(max - disc / 2 - 5, n));
  const cx =
      lens === "income"
        ? width / 2
        : clamp(width / 2 + (points[anchor]?.x || 0), width),
    cy =
      lens === "income"
        ? height / 2
        : clamp(height / 2 + (points[anchor]?.y || 0), height);
  useEffect(() => {
    if (lens !== "expense" || !active) return;
    const leave = (event) => {
      const stage = expandedRef.current?.parentElement;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      // Use the final circle, not its animated bounding box. Pointer capture
      // redirects drag events to the card, so listen at the document level.
      if (
        Math.hypot(
          event.clientX - rect.left - cx,
          event.clientY - rect.top - cy,
        ) >
        disc / 2
      )
        onExpand("");
    };
    const exitWindow = (event) => {
      if (!event.relatedTarget) onExpand("");
    };
    document.addEventListener("pointermove", leave);
    document.addEventListener("pointerout", exitWindow);
    return () => {
      document.removeEventListener("pointermove", leave);
      document.removeEventListener("pointerout", exitWindow);
    };
  }, [lens, active?.id, cx, cy, disc, onExpand]);
  return (
    <>
      {lens === "expense" &&
        groups.map((b, i) => (
          <button
            key={b.id}
            data-orbit-bucket={b.id}
            className={`rh-bucket ${expanded === b.id ? "is-open" : ""}`}
            style={{
              left: width / 2 + points[i].x,
              top: height / 2 + points[i].y,
              "--bubble-color": b.color,
            }}
            aria-label={`Category ${b.name}`}
            aria-expanded={expanded === b.id}
            disabled={busy}
            onMouseEnter={() => onExpand(b.id)}
            onFocus={() => onExpand(b.id)}
            onClick={() => onExpand(b.id)}
          >
            <strong>{b.name}</strong>
            <small>{b.children.length} tags</small>
          </button>
        ))}
      {lens === "expense" && !groups.length && (
        <p className="rh-no-buckets">
          No categories or tags match. Create them in Organize to begin.
        </p>
      )}
      {active && (
        <div
          ref={expandedRef}
          className="rh-expanded"
          style={{ "--bubble-color": active.color }}
        >
          {lens === "expense" && (
            <>
              <div
                className="rh-petal-disc"
                data-petal-disc
                style={{ left: cx, top: cy, width: disc, height: disc }}
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
              </div>
            </>
          )}
          {children.map((tag, i) => (
            <button
              key={tag.id}
              data-orbit-target={tag.id}
              data-inherited-color={tag.inheritedColor || undefined}
              className={`rh-tag ${hover === tag.id ? "os-drop-ready" : ""}`}
              style={{
                left: cx + ring.points[i].x,
                top: cy + ring.points[i].y,
                "--bubble-color": tag.color,
                "--petal-index": Math.min(i, 8),
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
