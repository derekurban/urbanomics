import React, { useRef, useState } from "react";
import { AdminAction } from "./admin-action.jsx";
import { Alert, ConfirmDialog } from "./ui.jsx";
import { plural } from "./format.js";
const api = window.urbanomics;

export function AdminResetWorkspace({ act, busy }) {
  const [preview, setPreview] = useState(null), [phrase, setPhrase] = useState(""), [working, setWorking] = useState(false), [error, setError] = useState(""), [result, setResult] = useState(null), saving = useRef(false);
  async function open() {
    setWorking(true); setError(""); setPhrase(""); setResult(null);
    try { setPreview(await api.previewWorkspaceReset()); } catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function confirm() {
    if (saving.current) return;
    saving.current = true; setWorking(true); setError("");
    try {
      const value = await act(() => api.resetWorkspace(preview.token, phrase));
      if (value !== false) { setResult(value); setPreview(null); localStorage.removeItem("urbanomics.transfer-route-layout"); }
    } catch (e) { setError(e.message); } finally { saving.current = false; setWorking(false); }
  }
  const c = preview?.counts;
  return (
    <>
      <AdminAction title="Start from scratch" count="The original files you imported are kept." action="Start from scratch…" onOpen={open} disabled={busy || working}>
        Erases every transaction and all your setup: accounts, tags, people, events, aliases and rules. The workspace is as it was on the first day.
      </AdminAction>
      {error && !preview && <Alert>{error}</Alert>}
      {result && <Alert tone="success" title="The workspace is empty again" onDismiss={() => setResult(null)}>Import a bank export to begin. The previous workspace and any files that were waiting are saved in archive/workspace-resets.</Alert>}
      {preview && (
        <ConfirmDialog title="Erase the whole workspace?" confirmLabel={working ? "Erasing…" : "Erase workspace"} busy={working || busy} disabled={phrase !== "RESET"} error={error} onClose={() => { if (!working) setPreview(null); }} onConfirm={confirm}>
          <p>This erases {plural(c.transactions + c.cash_receipts, "transaction")}, {plural(c.accounts, "account")}, {plural(c.transaction_rules, "rule")}, {plural(c.transaction_aliases, "alias", "aliases")}, every tag, person and event, and the import history{c.snapshots ? ` (${plural(c.snapshots, "snapshot")})` : ""}.</p>
          <p>The original files you imported stay in the archive, so you can import them again. A complete copy of the current workspace{preview.intake ? `, and ${plural(preview.intake, "file")} waiting to be imported,` : ""} is saved in archive/workspace-resets.</p>
          <label className="admin-phrase">Type RESET to confirm<input aria-label="Reset confirmation" autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} disabled={working} /></label>
        </ConfirmDialog>
      )}
    </>
  );
}
