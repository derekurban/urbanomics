import React from "react";
import { AdminAction, useAdminAction } from "./admin-action.jsx";
import { AdminResetWorkspace } from "./AdminResetWorkspace.jsx";
import { AdminUnlinkTransfers } from "./AdminUnlinkTransfers.jsx";
import { AdminClearShares } from "./AdminClearShares.jsx";
import { Alert, ConfirmDialog } from "./ui.jsx";
import { plural } from "./format.js";
import "./admin-workspace.css";
const api = window.urbanomics;

// Workspace-wide changes, least to most sweeping. Each previews what it touches and saves a recovery copy.
export function AdminWorkspace({ data, act, busy }) {
  const tags = useAdminAction({ data, act, busy, preview: () => api.previewUntagAll(), run: (c) => api.untagAll(c.token) });
  return (
    <section className="admin-workspace" aria-label="Maintenance">
      <AdminAction title="Reset every tag" count={tags.preview ? `${plural(tags.preview.count, "tagged transaction")} now` : "Counting…"} action="Reset tags…" onOpen={tags.open} disabled={busy || tags.working || !tags.preview?.count}>
        Takes the tags off every transaction, in every month and account, so you can sort from the start. Untagged money shows as Other again.
      </AdminAction>
      {tags.error && !tags.confirmation && <Alert>{tags.error}</Alert>}
      {tags.result && <Alert tone="success" title={`Reset the tags on ${plural(tags.result.count, "transaction")}`} onDismiss={() => tags.setResult(null)}>{tags.result.backup ? "A recovery copy of the old tags is in your workspace's backups/admin folder." : "There were no tags to remove."}</Alert>}
      <AdminClearShares data={data} act={act} busy={busy || tags.working} />
      <AdminUnlinkTransfers data={data} act={act} busy={busy || tags.working} />
      <AdminResetWorkspace act={act} busy={busy || tags.working} />
      {tags.confirmation && (
        <ConfirmDialog title={`Reset the tags on ${plural(tags.confirmation.count, "transaction")}?`} confirmLabel={tags.working ? "Resetting…" : "Reset tags"} busy={tags.working || busy} disabled={!tags.confirmation.count} error={tags.error} onClose={tags.close} onConfirm={() => tags.confirm()}>
          <p>Every tag and its split amount comes off, across all months{tags.confirmation.archived ? `, ${plural(tags.confirmation.archived, "transaction")} in deleted accounts` : ""}{tags.confirmation.cash ? ` and ${plural(tags.confirmation.cash, "cash receipt")}` : ""}.</p>
          <p>Your tags and categories, events, people, repayments, transfer links, aliases and rules stay, and so do the original files.</p>
          <p className="form-help">A recovery copy is saved first. There's no undo button.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
