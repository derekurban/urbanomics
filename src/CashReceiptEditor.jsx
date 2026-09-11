import React, { useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";

export function CashReceiptEditor({ row, act, onClose, onSaved, error }) {
  const [description, setDescription] = useState(row?.description || "");
  const [date, setDate] = useState(
    row?.date || new Date().toLocaleDateString("en-CA"),
  );
  const [amount, setAmount] = useState(
    row ? (row.amountCents / 100).toFixed(2) : "",
  );
  const [saving, setSaving] = useState(false),
    [confirm, setConfirm] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const id = await act(() =>
        window.urbanomics.saveCash({
          id: row?.id,
          version: row?.version,
          description,
          date,
          currency: "CAD",
          amountCents: Math.round(Number(amount) * 100),
        }),
      );
      if (id !== false) onSaved(id);
    } finally {
      setSaving(false);
    }
  }
  return (
    <WorkspaceModal
      title={row ? "Edit cash receipt" : "Add cash received"}
      onClose={() => !saving && onClose()}
    >
      <form className="rv-entity-form" onSubmit={save}>
        <p className="rv-help">
          Record physical cash once, then allocate it to expenses. This stays
          outside your bank activity and snapshots.
        </p>
        <label>
          Description
          <input
            required
            maxLength={160}
            value={description}
            placeholder="Cash for our dates"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="event-date-inputs">
          <label>
            Received on
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Amount (CAD)
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="dr-error-text">
            {error}
          </p>
        )}
        <footer>
          {row && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirm(true)}
            >
              Remove receipt
            </button>
          )}
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {row ? "Save receipt" : "Continue to allocation"}
          </button>
        </footer>
        {confirm && (
          <div className="rv-confirm">
            <p>
              Remove this cash receipt and undo its deductions? Your original
              expenses stay intact.
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  if (
                    (await act(() =>
                      window.urbanomics.voidCash(row.id, row.version),
                    )) !== false
                  )
                    onClose();
                } finally {
                  setSaving(false);
                }
              }}
            >
              Confirm removal
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              Keep receipt
            </button>
          </div>
        )}
      </form>
    </WorkspaceModal>
  );
}
