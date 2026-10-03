import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";

export const api = window.urbanomics;
export const onDesktop = api?.host !== "browser";
export const bankNames = {
  pc: "PC Financial",
  eq: "EQ Bank",
  simplii: "Simplii",
};
export const palette = [
  "#427A64",
  "#6883C5",
  "#B87654",
  "#9674B7",
  "#BE6684",
  "#529BA5",
  "#A38A38",
  "#687786",
];

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const countOf = (value) =>
  Array.isArray(value) ? value.length : value || 0;
export const money = (cents, currency = "CAD") => {
  const amount = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(
      amount,
    );
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};
export const monthLabel = (month, short = false) =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString("en-CA", {
    month: short ? "short" : "long",
    year: "numeric",
  });
export const whenLabel = (value) =>
  new Date(value).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export const fileSize = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/* A filename is a literal string, not a pattern: everything special is escaped
   before it becomes the start of a regular expression. */
export const escapeRegex = (text) =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const defaultPrefix = (filename) => `^${escapeRegex(filename)}.*`;

export function AccountDot({ color, className = "" }) {
  return (
    <i
      className={`sv2-dot ${className}`}
      style={{ background: color || "var(--data-neutral)" }}
      aria-hidden="true"
    />
  );
}

export function FileGlyph() {
  return (
    <span className="sv2-glyph" aria-hidden="true">
      CSV
    </span>
  );
}

export function Stat({ value, label }) {
  return (
    <div className="sv2-stat">
      <strong>
        {typeof value === "number" ? value.toLocaleString("en-CA") : value}
      </strong>
      <span>{label}</span>
    </div>
  );
}

/* Contextual detail lives behind the dot: hover, focus or click to open, click
   again or Escape to close. Nothing here repeats the copy beside it. */
export function InfoDot({ label, children, align = "center" }) {
  const [open, setOpen] = useState(false),
    [pinned, setPinned] = useState(false),
    [up, setUp] = useState(false);
  const wrap = useRef(null),
    pop = useRef(null),
    id = useId();
  useLayoutEffect(() => {
    const node = pop.current;
    if (!open || !node) return;
    // Measure in the default (below) position, then keep the note on screen: shift it sideways
    // and flip it above the dot when the window is too short for it below.
    node.classList.remove("sv2-pop-up");
    node.style.setProperty("--sv2-shift", "0px");
    const box = node.getBoundingClientRect(),
      edge = 18;
    let shift = 0;
    if (box.right > window.innerWidth - edge)
      shift = window.innerWidth - edge - box.right;
    if (box.left + shift < edge) shift = edge - box.left;
    node.style.setProperty("--sv2-shift", `${Math.round(shift)}px`);
    const dot = wrap.current?.getBoundingClientRect();
    const flip =
      box.bottom > window.innerHeight - edge &&
      !!dot && dot.top - box.height - 11 > edge;
    setUp(flip);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (event) => {
      if (!wrap.current?.contains(event.target)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const key = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setPinned(false);
      setOpen(false);
      wrap.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <span
      className="sv2-info"
      ref={wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
    >
      <button
        type="button"
        className="sv2-info-dot"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`About ${label}`}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
      >
        i
      </button>
      {open && (
        <span
          className={`sv2-pop sv2-pop-${align}${up ? " sv2-pop-up" : ""}`}
          id={id}
          role="note"
          ref={pop}
        >
          <strong>{label}</strong>
          {children}
        </span>
      )}
    </span>
  );
}

export function Sv2Dialog({ title, onClose, footer, wide = false, children }) {
  return (
    <WorkspaceModal
      title={title}
      onClose={onClose}
      footer={footer}
      className={`sv2-dialog${wide ? " sv2-dialog-wide" : ""}`}
    >
      {children}
    </WorkspaceModal>
  );
}

/* The server reports which part of a filename the pattern matched literally and
   which part a wildcard covered. A literal run is exact; a pattern run can
   accept other filenames too, so it is never described as equivalent. */
export function PatternSegments({ result, filename }) {
  const segments = result?.segments?.length
    ? result.segments
    : [{ text: filename, kind: result?.matches ? "pattern" : "unmatched" }];
  return (
    <p className="sv2-segments">
      {segments.map((segment, index) => (
        <span key={index} className={`sv2-seg sv2-seg-${segment.kind}`}>
          {segment.text}
        </span>
      ))}
    </p>
  );
}

export function PatternLegend() {
  return (
    <p className="sv2-seg-legend">
      <span className="sv2-seg sv2-seg-literal">exact text</span>
      <span className="sv2-seg sv2-seg-pattern">matched by the pattern</span>
      <span className="sv2-seg sv2-seg-unmatched">not matched</span>
    </p>
  );
}

/* Paper exports settling into twelve monthly cells. Decorative; the resting
   frame is the composed one, so reduced motion loses nothing. */
export function SnapshotScene() {
  // A dealt fan of exports. Each card fades in on the left, moves one slot to the right whenever
  // the oldest card is thrown into the calendar, and that arrival lights one day. Four cards share
  // one keyframe offset by a quarter period, so the fan always holds three with one in flight.
  const days = [2, 5, 9, 11];
  return (
    <div className="sv2-scene" aria-hidden="true">
      <svg className="sv2-scene-board" viewBox="0 0 360 210" focusable="false">
        <path className="sv2-scene-path" d="M118 58C150 26 196 30 224 68" />
        <g className="sv2-scene-calendar">
          <rect className="sv2-cal-ring" x="252" y="34" width="6" height="17" rx="3" />
          <rect className="sv2-cal-ring" x="302" y="34" width="6" height="17" rx="3" />
          <rect className="sv2-cal-body" x="214" y="44" width="132" height="124" rx="13" />
          <rect className="sv2-cal-title" x="230" y="53" width="46" height="8" rx="4" />
          <line className="sv2-cal-line" x1="214" y1="70" x2="346" y2="70" />
          {Array.from({ length: 12 }, (_, cell) => {
            const slot = days.indexOf(cell);
            return (
              <rect
                key={cell}
                className={`sv2-cal-cell${slot >= 0 ? ` sv2-cal-day-${slot}` : ""}`}
                x={228 + (cell % 4) * 28}
                y={84 + Math.floor(cell / 4) * 26}
                width="20"
                height="18"
                rx="5"
              />
            );
          })}
        </g>
      </svg>
      <div className="sv2-fan">
        {[0, 1, 2, 3].map((card) => (
          <div className="sv2-card" style={{ "--i": card }} key={card}>
            <i /><i /><i /><i /><i />
          </div>
        ))}
      </div>
    </div>
  );
}
