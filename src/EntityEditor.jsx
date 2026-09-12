import React, { useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
const api = window.urbanomics;
export function EntityEditor({ entity, onClose, act, error, entities = [] }) {
  const label =
    entity.kind === "group"
      ? "event"
      : entity.kind === "bucket"
        ? "category"
        : entity.kind === "category"
          ? "tag"
          : entity.kind;
  const [parentId, setParentId] = useState(entity.parentId || "");
  const [name, setName] = useState(entity.name || ""),
    [color, setColor] = useState(entity.color || "#78976A"),
    [confirm, setConfirm] = useState(false);
  const [startDate, setStartDate] = useState(entity.startDate || ""),
    [endDate, setEndDate] = useState(entity.endDate || "");
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
                color,
                startDate,
                endDate,
                parentId,
              }),
            )) !== false
          )
            onClose();
        }}
      >
        <label>
          Name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="rv-color-label">
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        {entity.kind === "category" && (
          <label>
            Category
            <select
              aria-label="Tag category"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Ungrouped tags</option>
              {entities
                .filter((e) => e.kind === "bucket")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
            <small>
              Moving a tag changes its category rollup, preserving every
              transaction split.
            </small>
          </label>
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
          </>
        )}
        {error && (
          <p className="dr-error-text" role="alert">
            {error}
          </p>
        )}
        <footer>
          {entity.id && (
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
