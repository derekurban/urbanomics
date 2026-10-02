import { blend, endpoints } from "../electron/review/palette.mjs";
import React, { useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
const api = window.urbanomics;
export function EntityEditor({ entity, onClose, act, error, entities = [] }) {
  const label =
    entity.systemRole ? "system tag" : entity.kind === "palette"
      ? "palette"
      : entity.kind === "group"
        ? "event"
        : entity.kind === "bucket"
          ? "category"
          : entity.kind === "category"
            ? "tag"
            : entity.kind;
  const isPalette = entity.kind === "bucket" || entity.kind === "palette";
  const initialGradient = endpoints(entity);
  const [gradientStart, setGradientStart] = useState(
    initialGradient.gradientStart,
  );
  const [gradientEnd, setGradientEnd] = useState(initialGradient.gradientEnd);
  const [flowType, setFlowType] = useState(entity.flowType || "expense");
  const [parentId, setParentId] = useState(entity.parentId || "");
  const [name, setName] = useState(entity.name || ""),
    [color, setColor] = useState(
      entity.customColor ?? entity.color ?? "#78976A",
    ),
    [confirm, setConfirm] = useState(false);
  const [startDate, setStartDate] = useState(entity.startDate || ""),
    [endDate, setEndDate] = useState(entity.endDate || "");
  const [participants, setParticipants] = useState(entity.participants || []);
  const people = entities.filter((e) => e.kind === "person");
  const parent =
    entity.kind === "category" &&
    flowType === "expense" &&
    entities.find((e) => e.kind === "bucket" && e.id === parentId);
  return (
    <WorkspaceModal
      title={`${entity.id ? "Edit" : "New"} ${label}`}
      onClose={onClose}
    >
      <form
        className="rv-entity-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            (await act(() =>
              api.saveEntity(entity.kind, {
                ...entity,
                name,
                color: isPalette ? blend(gradientStart, gradientEnd) : color,
                ...(isPalette ? { gradientStart, gradientEnd } : {}),
                startDate,
                endDate,
                parentId,
                flowType,
                ...(entity.kind === "group" ? { participants } : {}),
              }),
            )) !== false
          )
            onClose();
        }}
      >
        {entity.kind !== "palette" && (
          <label>
            Name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {entity.systemRole ? <p className="rv-help">{entity.description} Its role, gray color and placement are locked; you can rename it.</p> : isPalette ? (
          <fieldset className="gradient-editor">
            <legend>Gradient colors</legend>
            <div className="gradient-inputs">
              <label>
                Start color
                <input
                  type="color"
                  value={gradientStart}
                  onChange={(e) => setGradientStart(e.target.value)}
                />
              </label>
              <label>
                End color
                <input
                  type="color"
                  value={gradientEnd}
                  onChange={(e) => setGradientEnd(e.target.value)}
                />
              </label>
            </div>
            <div
              className="gradient-preview"
              style={{
                background: `linear-gradient(90deg, ${gradientStart}, ${gradientEnd})`,
              }}
              aria-label="Gradient preview"
            />
            <div className="gradient-midpoint">
              <i style={{ background: blend(gradientStart, gradientEnd) }} />
              Category color · blend of both
            </div>
            <small>Tags take evenly spaced steps, in your chosen tag order.</small>
          </fieldset>
        ) : entity.kind === "category" ? (
          <p className="rv-help">
            Color follows{" "}
            {flowType === "income"
              ? "Income"
              : parent?.name || "Ungrouped tags"}
            ’s gradient. Edit that palette to update its tags.
          </p>
        ) : (
          <label className="rv-color-label">
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        )}
        {entity.kind === "category" && !entity.systemRole && (
          <div className="entity-type">
            <span>Tag type</span>
            <div className="rv-toggle" role="group" aria-label="Tag type">
              {["expense", "income"].map((type) => (
                <button
                  type="button"
                  key={type}
                  aria-pressed={flowType === type}
                  onClick={() => {
                    setFlowType(type);
                    if (type === "income") setParentId("");
                  }}
                >
                  {type === "income" ? "Income" : "Expense"}
                </button>
              ))}
            </div>
            <small>
              {flowType === "income"
                ? "Income sources have no expense category."
                : `Category: ${entities.find((e) => e.id === parentId)?.name || "Ungrouped"}. Move tags by dragging in Organize.`}
            </small>
          </div>
        )}
        {entity.kind === "group" && (
          <>
            <div className="event-date-inputs">
              <label>
                Start date
                <input
                  type="date"
                  required
                  value={startDate}
                  max={endDate || "9999-12-31"}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  required
                  value={endDate}
                  min={startDate || "0001-01-01"}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
            <p className="rv-help">
              Set the event's time span. The calendar also suggests transactions
              one day before and after; you choose what belongs.
            </p>
            <div className="rv-field">
              <span>Split with</span>
              <div className="rv-people" role="group" aria-label="Participants">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={participants.includes(p.id)}
                    onClick={() =>
                      setParticipants((list) =>
                        list.includes(p.id) ? list.filter((id) => id !== p.id) : [...list, p.id],
                      )
                    }
                  >
                    <i style={{ background: p.color }}>{p.name.slice(0, 2)}</i>
                    <span>{p.name}</span>
                  </button>
                ))}
                {!people.length && <small>Add people under Settings → People first.</small>}
              </div>
              <small>
                {participants.length
                  ? `Every expense in this event is split evenly between you and ${participants.length === 1 ? "this person" : `these ${participants.length} people`}, unless you change a single expense's split in Organize. Anyone who has repaid part of an expense stays in its split.`
                  : "Name who shares this event's expenses and each one gets an even split. Leave empty to split expenses one by one."}
              </small>
            </div>
          </>
        )}
        {error && (
          <p className="dr-error-text" role="alert">
            {error}
          </p>
        )}
        <footer>
          {entity.id && !entity.systemRole && entity.kind !== "palette" && (
            <button
              type="button"
              className="account-delete-link"
              onClick={() => setConfirm(true)}
            >
              Delete {label}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!name.trim()}>
            Save {label}
          </button>
        </footer>
        {confirm && (
          <div className="rv-confirm">
            <p>
              Delete this {label}? Transactions stay intact. Tags and people
              already in use must be removed from their transactions first. Move
              child tags before deleting a category.
            </p>
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if ((await act(() => api.removeEntity(entity.id))) !== false)
                  onClose();
              }}
            >
              Confirm deletion
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </div>
        )}
      </form>
    </WorkspaceModal>
  );
}
