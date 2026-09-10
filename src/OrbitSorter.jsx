import React, { useRef, useState } from "react";
import { SplitEditor } from "./SplitEditor.jsx";
import { money, retag } from "./review-model.js";
import "./orbit-sorter.css";

const positions = [
  [50, 8],
  [86, 28],
  [86, 72],
  [50, 92],
  [14, 72],
  [14, 28],
];
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
    [page, setPage] = useState(0),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [hover, setHover] = useState("");
  const root = useRef(null),
    gesture = useRef(null),
    saving = useRef(false);
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
  const pages = Math.max(1, Math.ceil(filtered.length / 6)),
    entityPage = Math.min(page, pages - 1),
    targets = filtered.slice(entityPage * 6, entityPage * 6 + 6);
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
    if (busy || !row) return;
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
  async function save() {
    if (
      !row ||
      busy ||
      saving.current ||
      stale ||
      (!events && !values.length) ||
      (events && !decided)
    )
      return;
    saving.current = true;
    try {
      const change = {
        id: row.id,
        version: draft?.version ?? row.version,
        [field]: values,
        ...(events ? { groupsReviewed: true } : {}),
      };
      const result = await onSave([change]);
      if (result === false) return;
      setDrafts((old) => {
        const next = { ...old };
        delete next[row.id];
        return next;
      });
      let next;
      for (let n = 1; n < rows.length; n++) {
        const t = rows[(index + n) % rows.length];
        if (!complete(t, events)) {
          next = t;
          break;
        }
      }
      setActive(next?.id || row.id);
      setMessage(`${row.description} saved.`);
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
    if (busy || e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const x = e.clientX - g.x,
      y = e.clientY - g.y;
    if (Math.hypot(x, y) < 5 && !g.moved) return;
    g.moved = true;
    e.currentTarget.style.transform = `translate(${x}px,${y}px) rotate(${Math.max(-9, Math.min(9, x / 20))}deg)`;
    setHover(hit(e.clientX, e.clientY)?.dataset.orbitTarget || "");
  }
  function end(e, cancel = false) {
    const g = gesture.current;
    if (!g) return;
    const target =
      !cancel && g.moved ? hit(e.clientX, e.clientY)?.dataset.orbitTarget : "";
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
      className="os-sorter"
      ref={root}
      aria-label={events ? "Event card sorter" : "Tag card sorter"}
    >
      <div className="os-top">
        <div>
          <h2>{events ? "Give it a shared story." : "One card at a time."}</h2>
          <p>
            {events
              ? "Events hold whole transactions. Select a container, or choose No event."
              : "Drop onto tags, adjust the amounts, then save."}
          </p>
        </div>
        <span>
          {index + 1} / {rows.length}
        </span>
      </div>
      {entities.length > 6 && (
        <div className="os-target-pages">
          <input
            aria-label={events ? "Search events" : "Search tags"}
            placeholder={events ? "Find an event…" : "Find a tag…"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <div>
            <button
              aria-label="Previous targets"
              disabled={!entityPage}
              onClick={() => setPage(entityPage - 1)}
            >
              ‹
            </button>
            <span>
              {entityPage + 1} / {pages}
            </span>
            <button
              aria-label="Next targets"
              disabled={entityPage === pages - 1}
              onClick={() => setPage(entityPage + 1)}
            >
              ›
            </button>
          </div>
        </div>
      )}
      <div className="os-body">
        <div className="os-stage">
          <div className="os-orbit">
            <div className="os-ring" aria-hidden="true" />
            <div className="os-stack">
              <article
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
                <h3 title={row.description}>{row.description}</h3>
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
                        : "Choose a tag"}
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
                    "--x": positions[i][0] + "%",
                    "--y": positions[i][1] + "%",
                    "--target-color": entity.color,
                  }}
                  aria-label={`${events ? "Event" : "Tag"} ${entity.name}`}
                  title={entity.name}
                  aria-pressed={selected(entity.id)}
                  disabled={busy}
                  onClick={() => choose(entity.id)}
                >
                  <span>
                    <i />
                    {entity.name}
                    {selected(entity.id) && " ✓"}
                  </span>
                  <small>
                    {events
                      ? selected(entity.id)
                        ? "Selected"
                        : "Add to event"
                      : part
                        ? `${money(part.cents)} · ${row.amountCents ? Math.round((part.cents / Math.abs(row.amountCents)) * 100) : 100}%`
                        : "Select tag"}
                  </small>
                </button>
              );
            })}
          </div>
          {!targets.length && (
            <p className="os-empty-targets">
              {entities.length
                ? "No matches. Try another search."
                : `Create your first ${events ? "event" : "tag"} using the button above.`}
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
                  <span aria-hidden="true">×</span>
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
              {values.length === 1 ? "this event" : "each selected event"}. Tags
              and repayment allocations stay unchanged.
            </p>
          )}
          {!events && values.length > 1 && (
            <fieldset disabled={busy} className="os-split">
              <SplitEditor
                values={values}
                onChange={setValues}
                labels={names}
                colors={colors}
              />
            </fieldset>
          )}
          {stale && (
            <p role="alert" className="dr-error-text">
              This transaction changed since you started editing. Discard this
              draft to load its saved version.
            </p>
          )}
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
              onClick={save}
            >
              Save & next
            </button>
          </div>
          <div className="os-navigation">
            <button
              disabled={busy || index === 0}
              aria-label="Previous transaction"
              onClick={() => navigate(index - 1)}
            >
              ‹
            </button>
            <div>
              <div className="os-progress-label">
                <span>
                  {count} of {rows.length}{" "}
                  {events ? "event decisions saved" : "tagged"}
                </span>
                <span>{percent}%</span>
              </div>
              <div
                className="os-progress"
                role="progressbar"
                aria-label={events ? "Event progress" : "Tagging progress"}
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
              ›
            </button>
          </div>
          <div className="os-status" role="status">
            {message ||
              (dirty
                ? "Draft stays with this card while you browse Review."
                : "Drag the card or select the surrounding buttons.")}
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
          <summary>Manage {events ? "events" : "tags"}</summary>
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
    </section>
  );
}
