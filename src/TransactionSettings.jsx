import React, { useRef, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { SplitEditor } from "./SplitEditor.jsx";
import { money, retag } from "./review-model.js";

export function TransactionSettings({
  row,
  categories,
  people,
  onSave,
  onClose,
  onSaved,
}) {
  const [parts, setParts] = useState(row.review.tags);
  const [assignedPerson, setAssignedPerson] = useState(
    row.review.assignedPersonId || "",
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const toggle = (id) => {
    const ids = parts.map((p) => p.id);
    setParts(
      retag(
        parts,
        ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
        Math.abs(row.amountCents),
      ),
    );
  };
  const close = () => {
    if (!saving.current) onClose();
  };
  async function save() {
    if (
      saving.current ||
      (!parts.length && assignedPerson === (row.review.assignedPersonId || ""))
    )
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await onSave([
        {
          id: row.id,
          version: row.version,
          tags: parts,
          ...(people ? { assignedPersonId: assignedPerson } : {}),
        },
      ]);
      if (result === false) {
        setError(
          "Could not save these settings. Close and reopen this card to load the latest version, then try again.",
        );
        return;
      }
      if (parts.length) onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const matches = categories.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <WorkspaceModal
      title="Transaction settings"
      onClose={close}
      footer={
        <div className="rv-modal-actions">
          <button disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              (!parts.length &&
                assignedPerson === (row.review.assignedPersonId || ""))
            }
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="rv-editor-title">
        <h3>{row.description}</h3>
        <strong>{money(Math.abs(row.amountCents))}</strong>
      </div>
      <p>
        {row.account} · {row.date}
      </p>
      {row.originalDescription && (
        <p className="alias-original">
          Bank description: {row.originalDescription}
        </p>
      )}
      {row.aliasConflicts?.length > 0 && (
        <p className="alias-warning">
          Competing aliases: {row.aliasConflicts.map((a) => a.name).join(", ")}.
          Resolve them in Organize → Aliases.
        </p>
      )}
      <fieldset disabled={busy} className="ts-fields">
        {people && (
          <label>
            Associated person
            <select
              aria-label="Associated person"
              value={assignedPerson}
              onChange={(e) => setAssignedPerson(e.target.value)}
            >
              <option value="">No person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <small>
              A person association does not create a repayment or shared-cost
              agreement.
            </small>
          </label>
        )}
        <label className="ts-search">
          Categories
          <input
            type="search"
            placeholder="Search categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="ts-selected" aria-label="Selected categories">
          {parts.map((p) => (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              aria-label={`Remove ${categories.find((c) => c.id === p.id)?.name || "category"}`}
            >
              {categories.find((c) => c.id === p.id)?.name ||
                "Removed category"}
              <span aria-hidden="true"> ×</span>
            </button>
          ))}
        </div>
        <div className="ts-options" role="group" aria-label="Category choices">
          {matches.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={parts.some((p) => p.id === c.id)}
                onChange={() => toggle(c.id)}
              />
              <i style={{ background: c.color }} />
              <span>{c.name}</span>
            </label>
          ))}
          {!matches.length && (
            <p>
              {categories.length
                ? "No matching categories."
                : "Create a category in Organize to start."}
            </p>
          )}
        </div>
        {parts.length > 1 && (
          <SplitEditor
            values={parts}
            onChange={setParts}
            labels={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
            colors={Object.fromEntries(categories.map((c) => [c.id, c.color]))}
          />
        )}
        {parts.length === 1 && (
          <p className="rv-help">
            The full {money(Math.abs(row.amountCents))} goes to this category.
          </p>
        )}
        {parts.length > 1 && (
          <p className="rv-help">
            New selections start equal. Adjust the dividers to fine-tune your
            split.
          </p>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="dr-error-text">
          {error}
        </p>
      )}
    </WorkspaceModal>
  );
}
