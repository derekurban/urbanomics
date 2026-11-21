import React, { useEffect, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { Alert } from "./ui.jsx";
import { notify } from "./toast.jsx";
const api = window.urbanomics;

const when = (iso) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });

/* The first row of Maintenance, and the only one that changes nothing: a complete copy of the workspace on
   demand, and every copy the app has kept, backups and the recovery copies the actions below write. */
export function AdminBackup({ data, busy }) {
  const [state, setState] = useState(null), [working, setWorking] = useState(false), [error, setError] = useState("");
  const desktop = api.host !== "browser";
  const load = () => api.workspaceBackups().then((s) => { setState(s); setError(""); }, (e) => setError(e.message));
  useEffect(() => { load(); }, [data]);
  async function backup() {
    setWorking(true); setError("");
    try {
      const made = await api.backupWorkspace();
      await load();
      notify({ title: "Workspace backed up", description: `${made.name} is in the backups folder of your workspace.`, tone: "success", ...(desktop ? { action: { label: "Show in folder", onClick: reveal } } : {}) });
    } catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  function reveal() { api.reveal("backups").catch((e) => setError(e.message)); }
  const items = state?.items || [];
  return (
    <>
      <article className="admin-action admin-backup">
        <div>
          <h3>Back up the workspace</h3>
          <p>Saves a complete copy of your transactions, decisions and settings in the backups folder of your workspace. Nothing in the workspace changes.</p>
          <small>{!state ? "Checking…" : state.lastBackup ? `Last backup ${when(state.lastBackup)}` : "Not backed up yet"}</small>
        </div>
        <div className="admin-backup-actions">
          {desktop && <button className="sm" disabled={working} onClick={reveal}><Icon name="folder-open" size={16} />Show in folder</button>}
          <button className="primary sm" disabled={busy || working} onClick={backup}>{working ? "Backing up…" : "Back up now"}</button>
        </div>
      </article>
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      {items.length > 0 && (
        <details className="admin-copies">
          <summary>Backups and recovery copies · {items.length}</summary>
          <ul>
            {items.map((item) => (
              <li key={item.folder + "/" + item.name}>
                <span><strong>{item.what}</strong><small>{item.folder}/{item.name}</small></span>
                <time dateTime={item.created}>{when(item.created)}</time>
              </li>
            ))}
          </ul>
          <p className="form-help">
            {desktop ? "" : "They are on the computer that runs Urbanomics, in its workspace folder. "}
            To go back to a backup, close Urbanomics and put the copy in the workspace folder in place of {state.database}, under that name.
            {" "}Recovery copies hold what an action below changed, kept in case something has to be put back by hand.
          </p>
        </details>
      )}
    </>
  );
}
