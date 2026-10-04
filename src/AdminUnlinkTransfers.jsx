import React from "react";
import { AdminAction, useAdminAction } from "./admin-action.jsx";
import { Alert, ConfirmDialog } from "./ui.jsx";
import { plural } from "./format.js";
const api = window.urbanomics;

export function AdminUnlinkTransfers({ data, act, busy }) {
  const a = useAdminAction({ data, act, busy, preview: () => api.previewUnlinkAll(), run: (c) => api.unlinkAllTransfers(c.token) });
  return (
    <>
      <AdminAction title="Unlink every transfer" count={a.preview ? `${plural(a.preview.pairs, "linked pair")} now` : "Counting…"} action="Unlink transfers…" onOpen={a.open} disabled={busy || a.working || !a.preview?.count}>
        Separates both halves of every transfer between your accounts, so you can match them again from Organize or Settings, Transfers.
      </AdminAction>
      {a.error && !a.confirmation && <Alert>{a.error}</Alert>}
      {a.result && <Alert tone="success" title={`Unlinked ${plural(a.result.pairs, "transfer")}`} onDismiss={() => a.setResult(null)}>A recovery copy is in your workspace's backups/admin folder. Nothing is linked again on its own.</Alert>}
      {a.confirmation && (
        <ConfirmDialog title={`Unlink ${plural(a.confirmation.pairs, "transfer")}?`} confirmLabel={a.working ? "Unlinking…" : "Unlink transfers"} busy={a.working || busy} disabled={!a.confirmation.count} error={a.error} onClose={a.close} onConfirm={() => a.confirm()}>
          <p>Both halves of each transfer ({plural(a.confirmation.count, "transaction")}{a.confirmation.archived ? `, ${a.confirmation.archived} in deleted accounts` : ""}) become ordinary money in and out{a.confirmation.unpaired ? `, and ${plural(a.confirmation.unpaired, "half-finished link")} ${a.confirmation.unpaired === 1 ? "is" : "are"} cleared` : ""}. Recorded fees and extra received go too, so spending and income totals change until they're linked again.</p>
          <p>Amounts, tags, events, people, rules and the original files stay.</p>
          <p className="form-help">A recovery copy is saved first. There's no undo button.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
