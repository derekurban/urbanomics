import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TransactionSettings } from "./TransactionSettings.jsx";
import { Chevron } from "./Chevron.jsx";
import { money, retag } from "./review-model.js";
import "./orbit-sorter.css";

import { orbitLayout } from "./orbit-layout.js";

const complete = (row, events) =>
  events
    ? row.review.groupsReviewed || row.review.groups.length > 0
    : row.review.tags.length > 0;

export function OrbitSorter({
  rows,
  entities,
  events,
  drafts,
  setDrafts,
  busy,
  onSave,
  onEdit,
  onContinue,
}) {
  const [active, setActive] = useState(""),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [hover, setHover] = useState(""),
    [editing, setEditing] = useState(null);
  const root = useRef(null),
    gesture = useRef(null),
    saving = useRef(false),
    suppressClick = useRef(false);
  const field = events ? "groups" : "tags";
  const row =
    rows.find((t) => t.id === active) ||
    rows.find((t) => !complete(t, events)) ||
    rows[0];
  const index = rows.findIndex((t) => t.id === row?.id);
  const draft = row && drafts[row.id];
  const values = draft?.values ?? row?.review[field] ?? [];
  const decided = draft?.decided ?? (row ? complete(row, events) : false);
  const dirty = !!draft;
  const stale = draft && draft.version !== row.version;
  const count = rows.filter((t) => complete(t, events)).length,
    percent = rows.length ? Math.round((count / rows.length) * 100) : 0;
  const filtered = entities.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()),
  );
  const targets = filtered;
  const orbit = useRef(null),
    stack = useRef(null);
  const [bounds, setBounds] = useState({ width: 680, cardHeight: 270 });
  useLayoutEffect(() => {
    if (!row || !orbit.current || !stack.current) return;
    const observer = new ResizeObserver(() => {
      const width = Math.round(orbit.current.getBoundingClientRect().width),
        cardHeight = Math.ceil(stack.current.getBoundingClientRect().height);
      setBounds((old) =>
        old.width === width && old.cardHeight === cardHeight
          ? old
          : { width, cardHeight },
      );
    });
    observer.observe(orbit.current);
    observer.observe(stack.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(gesture.current?.frame);
    };
  }, [!!row]);
  const layout = useMemo(
    () => orbitLayout(targets.length, bounds.width, bounds.cardHeight),
    [targets.length, bounds.width, bounds.cardHeight],
  );
  const names = Object.fromEntries(entities.map((e) => [e.id, e.name])),
    colors = Object.fromEntries(entities.map((e) => [e.id, e.color]));
  const selected = (id) =>
    events ? values.includes(id) : values.some((p) => p.id === id);
  const setValues = (next, decision = next.length > 0) => {
    if (!row || busy) return;
    setActive(row.id);
    setDrafts((old) => ({
      ...old,
      [row.id]: {
        version: draft?.version ?? row.version,
        values: next,
        decided: decision,
      },
    }));
    setMessage("");
  };
  function choose(id, toggle = true) {
    if (busy || !row || saving.current) return;
    if (!events) {
      if (toggle && selected(id)) {
        save(
          retag(
            values,
            values.map((p) => p.id).filter((v) => v !== id),
            Math.abs(row.amountCents),
          ),
          false,
        );
      } else save([{ id, cents: Math.abs(row.amountCents) }]);
      return;
    }
    if (!toggle && selected(id)) {
      setMessage("Already selected.");
      return;
    }
    const ids = events ? values : values.map((p) => p.id),
      next = ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
    setValues(events ? next : retag(values, next, Math.abs(row.amountCents)));
  }
  function discard() {
    setDrafts((old) => {
      const next = { ...old };
      delete next[row.id];
      return next;
    });
    setMessage("Saved version restored.");
  }
  function navigate(next) {
    setActive(rows[next].id);
    setMessage("");
  }
  function advance(savedRow) {
    const origin = rows.findIndex((t) => t.id === savedRow.id);
    const next = Array.from(
      { length: rows.length - 1 },
      (_, n) => rows[(origin + n + 1) % rows.length],
    ).find((t) => !complete(t, events));
    setActive(next?.id || savedRow.id);
    setMessage(`${savedRow.description} saved.`);
  }
  async function save(nextValues = values, advanceAfter = true) {
    if (
      !row ||
      busy ||
      saving.current ||
      stale ||
      (!events && !nextValues.length && advanceAfter) ||
      (events && !decided)
    )
      return;
    saving.current = true;
    setActive(row.id);
    try {
      const change = {
        id: row.id,
        version: draft?.version ?? row.version,
        [field]: nextValues,
        ...(events ? { groupsReviewed: true } : {}),
      };
      const result = await onSave([change]);
      if (result === false) return;
      setDrafts((old) => {
        const next = { ...old };
        delete next[row.id];
        return next;
      });
      if (advanceAfter) advance(row);
      else setMessage("Category removed. Stay here to adjust this card.");
    } finally {
      saving.current = false;
    }
  }
  const hit = (x, y) =>
    [...root.current.querySelectorAll("[data-orbit-target]")].find((el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  function start(e) {
    if (busy || saving.current || e.button !== 0) return;
    suppressClick.current = false;
    setActive(row.id);
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      scrollY: window.scrollY,
      element: e.currentTarget,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function positionDrag(g) {
    const x = g.clientX - g.x,
      y = g.clientY - g.y + window.scrollY - g.scrollY;
    g.element.style.transform = `translate(${x}px,${y}px) rotate(${Math.max(-9, Math.min(9, x / 20))}deg)`;
    setHover(hit(g.clientX, g.clientY)?.dataset.orbitTarget || "");
  }
  function scrollDrag() {
    const g = gesture.current;
    if (!g?.moved) return;
    const distance =
      g.clientY < 64
        ? g.clientY - 64
        : g.clientY > window.innerHeight - 64
          ? g.clientY - window.innerHeight + 64
          : 0;
    if (distance) {
      window.scrollBy(0, Math.max(-18, Math.min(18, distance / 3)));
      positionDrag(g);
    }
    g.frame = requestAnimationFrame(scrollDrag);
  }
  function move(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    g.clientX = e.clientX;
    g.clientY = e.clientY;
    if (Math.hypot(g.clientX - g.x, g.clientY - g.y) < 5 && !g.moved) return;
    const first = !g.moved;
    g.moved = true;
    positionDrag(g);
    if (first) g.frame = requestAnimationFrame(scrollDrag);
  }
  function end(e, cancel = false) {
    const g = gesture.current;
    if (!g) return;
    const target =
      !cancel && g.moved ? hit(e.clientX, e.clientY)?.dataset.orbitTarget : "";
    cancelAnimationFrame(g.frame);
    suppressClick.current = !!g.moved || cancel;
    gesture.current = null;
    e.currentTarget.style.transform = "";
    setHover("");
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (target) choose(target, false);
  }
  if (!row)
    return (
      <div className="rv-empty-panel">
        <h2>No transactions here.</h2>
        <p>Change the month or search, or import a snapshot to start.</p>
      </div>
    );
  return (
    <section
      className={`os-sorter ${events ? "" : "os-categories"}`}
      ref={root}
      aria-label={events ? "Event card sorter" : "Category card sorter"}
    >
      <div className="os-top">
        <div>
          <h2>{events ? "Give it a shared story." : "One card at a time."}</h2>
          <p>
            {events
              ? "Events hold whole transactions. Select a container, or choose No event."
              : "Drop onto a category to save. Click the card to split or edit."}
          </p>
        </div>
        <span>
          {index + 1} / {rows.length}
        </span>
      </div>
      {entities.length > 6 && (
        <div className="os-target-search">
          <input
            aria-label={events ? "Search events" : "Search categories"}
            placeholder={events ? "Find an event…" : "Find a category…"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <span>
            {targets.length} {events ? "events" : "categories"}
          </span>
        </div>
      )}
      <div className="os-body">
        <div className="os-stage">
          <div
            className="os-orbit"
            ref={orbit}
            style={{
              height: layout.height,
              "--card-width": layout.cardWidth + "px",
              "--target-width": layout.targetWidth + "px",
              "--target-height": layout.targetHeight + "px",
            }}
          >
            <div
              className="os-ring"
              aria-hidden="true"
              style={{ width: layout.rx * 2, height: layout.ry * 2 }}
            />
            <div className="os-stack" ref={stack}>
              <article
                role={events ? undefined : "button"}
                tabIndex={events ? undefined : 0}
                aria-haspopup={events ? undefined : "dialog"}
                aria-disabled={busy}
                onClick={() => {
                  if (
                    !events &&
                    !busy &&
                    !saving.current &&
                    !suppressClick.current
                  ) {
                    setActive(row.id);
                    setEditing(row);
                  }
                  suppressClick.current = false;
                }}
                onKeyDown={(e) => {
                  if (!events && !busy && ["Enter", " "].includes(e.key)) {
                    e.preventDefault();
                    setActive(row.id);
                    setEditing(row);
                  }
                }}
                className="os-transaction"
                aria-label={`Transaction ${row.description}`}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={(e) => end(e, true)}
              >
                <div className="os-card-top">
                  <span>
                    {row.amountCents > 0
                      ? "Money in"
                      : row.amountCents < 0
                        ? "Money out"
                        : "No cash movement"}
                  </span>
                  <span aria-hidden="true">⠿</span>
                </div>
                <h3 title={row.originalDescription || row.description}>
                  {row.description}
                </h3>
                {row.aliasConflicts?.length > 0 && (
                  <span className="alias-warning">
                    Alias conflict · resolve in Organize
                  </span>
                )}
                <small>
                  {row.account} · {row.date}
                </small>
                <strong>{money(Math.abs(row.amountCents))}</strong>
                <span className="os-card-state">
                  {dirty
                    ? "Unsaved changes"
                    : complete(row, events)
                      ? "✓ Saved"
                      : events
                        ? "Choose an event"
                        : "Click to edit · drag to sort"}
                </span>
              </article>
            </div>
            {targets.map((entity, i) => {
              const part = !events && values.find((p) => p.id === entity.id);
              return (
                <button
                  key={entity.id}
                  className={`os-target ${hover === entity.id ? "os-drop-ready" : ""}`}
                  data-orbit-target={entity.id}
                  style={{
                    "--x": layout.targets[i].x + "px",
                    "--y": layout.targets[i].y + "px",
                    "--target-color": entity.color,
                  }}
                  aria-label={`${events ? "Event" : "Category"} ${entity.name}`}
                  title={
                    part ? `${entity.name} · ${money(part.cents)}` : entity.name
                  }
                  aria-pressed={selected(entity.id)}
                  disabled={busy}
                  onClick={() => choose(entity.id)}
                >
                  <span>
                    <i />
                    {entity.name}
                    {selected(entity.id) && " ✓"}
                  </span>
                  {events && (
                    <small>
                      {selected(entity.id) ? "Selected" : "Add to event"}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          {!targets.length && (
            <p className="os-empty-targets">
              {entities.length
                ? "No matches. Try another search."
                : `Create your first ${events ? "event" : "category"} using the button above.`}
            </p>
          )}
        </div>
        <div className="os-controls">
          <div className="os-selected" aria-label="Selected assignments">
            {values.map((p) => {
              const id = events ? p : p.id;
              return (
                <button
                  key={id}
                  disabled={busy}
                  aria-label={`Remove ${names[id] || "missing assignment"}`}
                  onClick={() => choose(id)}
                >
                  <i style={{ background: colors[id] }} />
                  {names[id] || "Removed item"}{" "}
                  <span aria-hidden="true">
                    {events ? "×" : `${money(p.cents)} ×`}
                  </span>
                </button>
              );
            })}
            {events && (
              <button
                disabled={busy}
                aria-pressed={decided && !values.length}
                onClick={() => setValues([], true)}
              >
                No event{decided && !values.length ? " ✓" : ""}
              </button>
            )}
          </div>
          {events && !!values.length && (
            <p className="os-event-note">
              The full transaction belongs to{" "}
              {values.length === 1 ? "this event" : "each selected event"}.
              Categories and repayment allocations stay unchanged.
            </p>
          )}
          {stale && (
            <p role="alert" className="dr-error-text">
              This transaction changed since you started editing. Discard this
              draft to load its saved version.
            </p>
          )}
          {events && (
            <div className="os-actions">
              {dirty && (
                <button disabled={busy} onClick={discard}>
                  Discard draft
                </button>
              )}
              <button
                className="primary"
                disabled={
                  busy ||
                  !!stale ||
                  (!events && !values.length) ||
                  (events && !decided)
                }
                onClick={() => save()}
              >
                Save & next
              </button>
            </div>
          )}
          <div className="os-navigation">
            <button
              disabled={busy || index === 0}
              aria-label="Previous transaction"
              onClick={() => navigate(index - 1)}
            >
              <Chevron />
            </button>
            <div>
              <div className="os-progress-label">
                <span>
                  {count} of {rows.length}{" "}
                  {events ? "event decisions saved" : "categorized"}
                </span>
                <span>{percent}%</span>
              </div>
              <div
                className="os-progress"
                role="progressbar"
                aria-label={events ? "Event progress" : "Category progress"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div style={{ width: `${percent}%` }} />
              </div>
            </div>
            <button
              disabled={busy || index === rows.length - 1}
              aria-label="Next transaction"
              onClick={() => navigate(index + 1)}
            >
              <Chevron right />
            </button>
          </div>
          <div className="os-status" role="status">
            {message ||
              (dirty
                ? "Draft stays with this card while you browse Review."
                : events
                  ? "Drag the card or select the surrounding buttons."
                  : "Drop to save. Click a selected category to remove it.")}
          </div>
          {count === rows.length && (
            <button className="os-continue" onClick={onContinue}>
              {events ? "Continue to review" : "Continue to events"} →
            </button>
          )}
        </div>
      </div>
      {!!entities.length && (
        <details className="os-manage">
          <summary>Manage {events ? "events" : "categories"}</summary>
          <div>
            {entities.map((e) => (
              <button key={e.id} onClick={() => onEdit(e)}>
                <i style={{ background: e.color }} />
                {e.name}
                <span>Edit</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {editing && (
        <TransactionSettings
          row={editing}
          categories={entities}
          onSave={onSave}
          onClose={() => setEditing(null)}
          onSaved={() => advance(editing)}
        />
      )}
    </section>
  );
}
