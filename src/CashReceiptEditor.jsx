import React, { useId, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Alert, ConfirmDialog } from "./ui.jsx";

// Cash someone handed you (recorded in CAD). It stays apart from bank totals and snapshots; after saving,
// the Organize desk says what it was for: a tag, or a person settling what they owe.
export function CashReceiptEditor({ row, act, onClose, onSaved, error }) {
  const formId = useId();
  const [description, setDescription] = useState(row?.description || "");
  const [date, setDate] = useState(row?.date || new Date().toLocaleDateString("en-CA"));
  const [amount, setAmount] = useState(row ? (row.amountCents / 100).toFixed(2) : "");
  const [saving, setSaving] = useState(false),
    [confirm, setConfirm] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const id = await act(() =>
        window.urbanomics.saveCash({ id: row?.id, version: row?.version, description, date, currency: "CAD", amountCents: Math.round(Number(amount) * 100) }),
      );
      if (id !== false) onSaved(id);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setSaving(true);
    try {
      if ((await act(() => window.urbanomics.voidCash(row.id, row.version))) !== false) onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <WorkspaceModal
      title={row ? "Edit cash receipt" : "Cash received"}
      size="narrow"
      onClose={() => !saving && onClose()}
      footer={
        <>
          {row && <span className="footer-start"><button type="button" className="danger" disabled={saving} onClick={() => setConfirm(true)}>Remove receipt</button></span>}
          <button type="button" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="primary" form={formId} disabled={saving}>{row ? "Save receipt" : "Save and organize"}</button>
        </>
      }
    >
      <form id={formId} className="entity-form" onSubmit={save}>
        <p className="form-help">Cash someone handed you. It stays apart from your bank totals. After saving, say what it was for on the Organize desk, such as who it was from.</p>
        <label>
          Description
          <input required maxLength={160} value={description} placeholder="Cash from a friend for dinner" onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field-row">
          <label>
            Received on
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Amount (CAD)
            <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
      {confirm && (
        <ConfirmDialog title="Remove this cash receipt?" confirmLabel="Remove receipt" busy={saving} onClose={() => setConfirm(false)} onConfirm={remove}>
          <p>Anything it paid back is undone. The expenses themselves stay as they are.</p>
        </ConfirmDialog>
      )}
    </WorkspaceModal>
  );
}
