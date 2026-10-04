// Small app-level compositions of @derekurban/design-system components and the shared native patterns.
// Package components render inside .du-host so the native element styles in design-system.css stay out of them.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, SegmentedControl, Tabs, Stat, Avatar, Menu } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";

/** The package Menu, opened from an anchor element and drawn in a fixed layer so scrolling tables can't clip it.
    Arrow keys move between items, Escape or a click elsewhere closes it and returns focus to the anchor. */
export function FloatingMenu({ anchor, items, onSelect, onClose, width = 200, label }) {
  const panel = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const h = panel.current?.offsetHeight || 240;
    const below = r.bottom + 4 + h <= window.innerHeight - 8;
    setPos({ left: Math.min(r.left, window.innerWidth - width - 8), top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h) });
  }, [anchor]);
  useEffect(() => {
    const items = () => [...(panel.current?.querySelectorAll("button:not(:disabled)") || [])];
    requestAnimationFrame(() => (items().find((b) => b.querySelector("svg")) || items()[0])?.focus());
    const away = (e) => { if (!panel.current?.contains(e.target) && !anchor?.contains(e.target)) onClose(); };
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); anchor?.focus(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = items(), at = list.indexOf(document.activeElement);
      list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    };
    const scroll = (e) => { if (!panel.current?.contains(e.target)) onClose(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor]);
  return createPortal(
    <div ref={panel} className="du-host floating-menu" role="presentation" aria-label={label} style={{ position: "fixed", zIndex: 80, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      <Menu items={items} width={width} onSelect={(value, item) => { onSelect(value, item); onClose(); anchor?.focus(); }} />
    </div>,
    document.body,
  );
}

const alertClass = { danger: "error", warning: "warning", info: "info", success: "success", neutral: "neutral" };
/** Low-volume status: subtle fill, matching line, colored icon, message in ink. */
export function Alert({ tone = "danger", title, children, action, onDismiss, className = "" }) {
  return (
    <div className={`alert ${alertClass[tone] || tone} ${className}`} role={tone === "danger" ? "alert" : "status"}>
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children}
      </div>
      {action}
      {onDismiss && (
        <button type="button" className="icon ghost sm" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

/** A decision in a dialog: a title naming it, what happens, and a button naming the result. */
export function ConfirmDialog({ title, children, confirmLabel, tone = "danger", busy = false, error = "", onConfirm, onClose, cancelLabel = "Cancel", disabled = false }) {
  return (
    <WorkspaceModal
      className="confirm-dialog"
      size="narrow"
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button type="button" className={tone === "danger" ? "danger" : "primary"} disabled={busy || disabled} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error && <Alert>{error}</Alert>}
    </WorkspaceModal>
  );
}

/** The package SegmentedControl (2–4 modes) inside a host. */
export function Segmented({ value, onChange, options, label, size = "sm", fullWidth = false, className = "" }) {
  return (
    <span className={`du-host segmented-host ${className}`}>
      <SegmentedControl value={value} onChange={onChange} options={options} label={label} size={size} fullWidth={fullWidth} />
    </span>
  );
}

/** The package Tabs for sibling sections of one page; scrolls sideways on narrow screens. */
export function PageTabs({ value, onChange, items, label, size = "md", className = "" }) {
  return (
    <div className={`du-host tabs-scroll ${className}`}>
      <Tabs value={value} onChange={onChange} items={items} label={label} size={size} />
    </div>
  );
}

/** A row of 2–4 package Stats. Items: { label, value, delta, emphasis, onClick, title }. */
export function StatRow({ items, size = "sm", className = "" }) {
  return (
    <div className={`stat-row du-host ${className}`}>
      {items.filter(Boolean).map((item, i) => {
        const stat = <Stat label={item.label} value={item.value} delta={item.delta} emphasis={!!item.emphasis} size={item.size || size} />;
        return item.onClick ? (
          <button key={i} type="button" className="stat-button" title={item.title} onClick={item.onClick}>{stat}</button>
        ) : (
          <div key={i}>{stat}</div>
        );
      })}
    </div>
  );
}

/** Package Avatar (initials on sunk) with the person's identity color as a dot. */
export function PersonAvatar({ name, size = 24 }) {
  return (
    <span className="du-host person-avatar">
      <Avatar name={name} size={size} />
    </span>
  );
}

/** Choose people: Avatar, name, accent tint and a check when chosen. */
export function PersonPicker({ people, selected, onToggle, label = "People", disabled = false }) {
  return (
    <div className="person-picker" role="group" aria-label={label}>
      {people.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button key={p.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => onToggle(p.id)}>
            <PersonAvatar name={p.name} size={24} />
            <span>{p.name}</span>
            {on && <Icon name="check" size={16} />}
          </button>
        );
      })}
    </div>
  );
}

/** Identity color swatches with a custom color well. */
export function Swatches({ colors, value, onChange, label = "Color", names = [] }) {
  const custom = !colors.some((c) => c.toLowerCase() === String(value).toLowerCase());
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c.toLowerCase() === String(value).toLowerCase()}
          aria-label={names[i] || `Color ${i + 1} of ${colors.length}`}
          style={{ "--swatch": c }}
          onClick={() => onChange(c)}
        />
      ))}
      <label>
        <input type="color" aria-label="Custom color" value={value} onChange={(e) => onChange(e.target.value)} />
        {custom ? "Custom" : "Custom…"}
      </label>
    </div>
  );
}

/** Plural helper: plural(1, "file") → "1 file"; plural(2, "person", "people") → "2 people". */
export function plural(n, one, many = one + "s") {
  return `${Number(n).toLocaleString()} ${n === 1 ? one : many}`;
}
