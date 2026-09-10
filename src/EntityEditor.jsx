import React, { useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
const api = window.urbanomics;
const toggle = (list, id) =>
  list.includes(id) ? list.filter((v) => v !== id) : [...list, id];

export function EntityEditor({ entity, tags, onClose, act, error }) {
  const label = entity.kind === "group" ? "event" : entity.kind;
  const [name, setName] = useState(entity.name || ""),
    [color, setColor] = useState(entity.color || "#78976A"),
    [selected, setSelected] = useState(entity.tags || []),
    [confirm, setConfirm] = useState(false);
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
                tags: selected,
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
          <>
            <p>
              A category is a view over these tags. Tags can appear in more than
              one category.
            </p>
            <div className="rv-tag-choices">
              {tags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  aria-pressed={selected.includes(tag.id)}
                  onClick={() => setSelected(toggle(selected, tag.id))}
                >
                  {tag.name}
                </button>
              ))}
            </div>
            {!tags.length && (
              <p>Create a tag first, then add it to this category.</p>
            )}
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
              already in use must be removed from their transactions first.
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
