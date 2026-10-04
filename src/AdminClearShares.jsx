import React from "react";
import { AdminAction, useAdminAction } from "./admin-action.jsx";
import { Alert, ConfirmDialog } from "./ui.jsx";
import { plural } from "./format.js";
const api = window.urbanomics;

/* Clears every split, repayment and applied amount so sharing can be recorded again from events and people. */
export function AdminClearShares({ data, act, busy }) {
  const a = useAdminAction({ data, act, busy, preview: () => api.previewClearShares(), run: (c) => api.clearAllShares(c.token) });
  const summary = (p) => [plural(p.shared, "split expense"), plural(p.repayments, "repayment") + (p.cash ? ` (${p.cash} in cash)` : "")].join(" and ");
  return (
    <>
      <AdminAction title="Clear every split and repayment" count={a.preview ? `${summary(a.preview)} now` : "Counting…"} action="Clear splits…" onOpen={a.open} disabled={busy || a.working || !a.preview?.count}>
        Removes who shared each expense and which money paid it back, everywhere, so you can record sharing again from events and people.
      </AdminAction>
      {a.error && !a.confirmation && <Alert>{a.error}</Alert>}
      {a.result && <Alert tone="success" title={`Cleared ${plural(a.result.shared, "split")} and ${plural(a.result.repayments, "repayment")}`} onDismiss={() => a.setResult(null)}>A recovery copy is in your workspace's backups/admin folder. Events keep their people, so expenses in an event split evenly again.</Alert>}
      {a.confirmation && (
        <ConfirmDialog title="Clear every split and repayment?" confirmLabel={a.working ? "Clearing…" : "Clear splits and repayments"} busy={a.working || busy} disabled={!a.confirmation.count} error={a.error} onClose={a.close} onConfirm={() => a.confirm()}>
          <p>{summary(a.confirmation)}, on {plural(a.confirmation.count, "transaction")}{a.confirmation.archived ? ` (${a.confirmation.archived} in deleted accounts)` : ""}, go back to ordinary money in and out. Repayments become income where they have an income tag, and unsorted otherwise.</p>
          <p>What you're owed and your cost after repayments change on the Dashboard until you record them again. Tags, events and their people, transfers, rules and the original files stay.</p>
          <p className="form-help">A recovery copy is saved first. There's no undo button.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
