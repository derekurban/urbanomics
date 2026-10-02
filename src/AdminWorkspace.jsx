import {AdminResetWorkspace} from './AdminResetWorkspace.jsx';
import React, { useEffect, useState, useRef } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import "./admin-workspace.css";
import { AdminUnlinkTransfers } from "./AdminUnlinkTransfers.jsx";
const api = window.urbanomics;
export function AdminWorkspace({ data, act, busy }) {
  const [preview, setPreview] = useState(null),
    [confirmation, setConfirmation] = useState(null),
    [error, setError] = useState(""),
    [result, setResult] = useState(null),
    [working, setWorking] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    let live = true;
    api
      .previewUntagAll()
      .then((p) => {
        if (live) setPreview(p);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [data]);
  async function open() {
    setError("");
    setWorking(true);
    try {
      const p = await api.previewUntagAll();
      setPreview(p);
      setConfirmation(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  const close = () => {
    if (!saving.current) {
      setConfirmation(null);
      setError("");
    }
  };
  async function confirm() {
    if (saving.current || busy) return;
    saving.current = true;
    setWorking(true);
    setError("");
    try {
      const value = await act(async () => {
        try {
          return await api.untagAll(confirmation.token);
        } catch (e) {
          setError(e.message);
          throw e;
        }
      });
      if (value !== false) {
        setResult(value);
        setConfirmation(null);
        setPreview(await api.previewUntagAll());
      }
    } catch (e) {
      setError(e.message);
    } finally {
      saving.current = false;
      setWorking(false);
    }
  }
  return (
    <section className="admin-workspace" aria-label="Admin actions">
      <header>
        <h2>Admin</h2>
        <p>Workspace maintenance. Preview each action before confirming.</p>
      </header>
      <article className="admin-action">
        <div>
          <span className="admin-action-label">Transaction organization</span>
          <h3>Reset transaction tags</h3><p>Restores automatic Other tags. Transfer and Deduction tags continue to follow their links.</p>
          <p>
            Clear every expense and income tag assignment across all months and
            accounts, including archived accounts and cash receipts.
          </p>
          <small>
            {preview
              ? `${preview.count} tagged transaction${preview.count === 1 ? "" : "s"}`
              : "Checking transactions…"}
          </small>
        </div>
        <button
          className="danger"
          disabled={busy || working || !preview?.count}
          onClick={open}
        >
          Reset transaction tags
        </button>
      </article>
      <AdminResetWorkspace act={act} busy={busy || working} />
      <AdminUnlinkTransfers data={data} act={act} busy={busy || working} />
      {error && !confirmation && (
        <p role="alert" className="dr-error-text">
          {error}
        </p>
      )}
      {result && (
        <div className="admin-result" role="status">
          <strong>
            {result.count} transaction{result.count === 1 ? "" : "s"} reset to automatic defaults.
          </strong>
          <p>
            {result.backup
              ? "A recovery copy of the previous assignments was saved in your local workspace’s backups/admin folder."
              : "There were no tags to remove."}
          </p>
        </div>
      )}
      {confirmation && (
        <WorkspaceModal
          title="Reset transaction tags?"
          onClose={close}
          footer={
            <div className="admin-confirm-buttons">
              <button disabled={working} onClick={close}>
                Cancel
              </button>
              <button
                className="danger"
                disabled={working || busy || !confirmation.count}
                onClick={confirm}
              >
                {working ? "Resetting tags…" : "Confirm reset tags"}
              </button>
            </div>
          }
        >
          <div className="admin-confirm">
            <p>
              Remove all tag assignments and their split amounts from{" "}
              <strong>
                {confirmation.count} transaction
                {confirmation.count === 1 ? "" : "s"}
              </strong>
              ?
            </p>
            <p>
              This covers all imported months, including {confirmation.archived}{" "}
              transaction{confirmation.archived === 1 ? "" : "s"} in archived
              accounts and {confirmation.cash} cash receipt
              {confirmation.cash === 1 ? "" : "s"}.
            </p>
            <p>
              Your tag and category definitions, events, income sources,
              deductions, transfer links, aliases and rules will be kept.
              Original transactions, snapshots and archived files stay intact.
            </p>
            <p>
              A local recovery copy is saved before any tags are removed. This
              action has no automatic undo.
            </p>
            {error && (
              <p role="alert" className="dr-error-text">
                {error}
              </p>
            )}
          </div>
        </WorkspaceModal>
      )}
    </section>
  );
}
