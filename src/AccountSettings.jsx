import React, { useEffect, useId, useMemo, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { palette } from "./snapshots-v2-atoms.jsx";
import { Recognize } from "./recognize.jsx";
import { compileRule, decompileRule, patternMatches } from "./import-analysis.mjs";
import { Alert, ConfirmDialog, Swatches, plural } from "./ui.jsx";

const api = window.urbanomics;
// Name, type, colour and the sentence that recognizes this account's files. The proof is the files it
// has already imported; another account's file that would also match is flagged, since two matching
// rules mean being asked every time.
export function AccountEditor({ account, layouts, history = [], busy, run, onClose, onSnapshots }) {
  const formId = useId();
  const [name, setName] = useState(account?.name || ""), [kind, setKind] = useState(account?.kind || "");
  const [schema, setSchema] = useState(layouts[0] ? "custom:" + layouts[0].id : "");
  const [rule, setRule] = useState(() => decompileRule(account?.prefixRegex || "")), [color, setColor] = useState(account?.color || palette[0]);
  const [tryName, setTryName] = useState(""), [invalid, setInvalid] = useState(""), [error, setError] = useState("");
  const pattern = compileRule(rule);
  useEffect(() => {
    if (rule.mode !== "custom" || !pattern) return setInvalid("");
    let live = true;
    const timer = setTimeout(() => api.testPrefix(pattern, "").then(() => live && setInvalid("")).catch((e) => live && setInvalid(e.message)), 180);
    return () => { live = false; clearTimeout(timer); };
  }, [pattern, rule.mode]);
  const files = useMemo(() => {
    const seen = new Set();
    return history.filter((item) => {
      const key = JSON.stringify([item.account_id, item.filename]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [history]);
  const own = files.filter((f) => account && f.account_id === account.id).slice(0, 8).map((f) => ({ id: "own:" + f.filename, filename: f.filename }));
  const candidates = [...own, ...(tryName.trim() ? [{ id: "try", filename: tryName.trim() }] : [])];
  const others = files
    .filter((f) => f.account_id && f.account_id !== account?.id && patternMatches(pattern, f.filename))
    .map((f) => ({ id: "other:" + f.account_id + f.filename, filename: f.filename }));
  const noLayouts = !account && !layouts.length;
  async function save(e) {
    e.preventDefault();
    setError("");
    const values = { name, kind, prefixRegex: pattern, color };
    const result = await run(async () => {
      try { return account ? await api.updateAccount(account.id, values) : await api.addAccount(name, schema, kind, values); }
      catch (err) { setError(err.message); throw err; }
    }, "Account saved.");
    if (result !== false) onClose();
  }
  return (
    <WorkspaceModal className="accounts-modal" title={account ? "Edit account" : "Add account"} onClose={onClose}
      footer={<><button disabled={busy} onClick={onClose}>Cancel</button><button form={formId} type="submit" className="primary" disabled={busy || noLayouts || !name.trim() || !!invalid || (!account && !schema)}>Save account</button></>}>
      <form id={formId} className="account-editor" onSubmit={save}>
        {noLayouts && <Alert tone="info" title="Accounts start from a bank export" action={<button type="button" className="sm" onClick={() => { onClose(); onSnapshots(); }}>Go to Snapshots</button>}>Import one file from the account first; the setup learns its columns and creates the account with it.</Alert>}
        <div className="accounts-form-pair">
          <label>Account name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Everyday account" /></label>
          <label>Type (optional)<input maxLength={80} value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Chequing, savings, credit card" /></label>
        </div>
        {!account && layouts.length > 0 && (
          <label>How its files are read<select aria-label="Saved CSV layout" value={schema} onChange={(e) => setSchema(e.target.value)}>{layouts.map((t) => <option key={t.id} value={"custom:" + t.id}>{t.name}</option>)}</select></label>
        )}
        <div className="account-field"><span>Colour</span><Swatches colors={palette} value={color} onChange={setColor} label="Account colour" /></div>
        <div className="account-field">
          <span>Which files are this account's</span>
          <Recognize rule={rule} onChange={setRule} candidates={candidates} others={others} />
          {invalid && <Alert>{invalid}</Alert>}
          <label className="account-try">Try a filename<input spellCheck={false} maxLength={255} value={tryName} onChange={(e) => setTryName(e.target.value)} placeholder="A filename to check" /></label>
          <p className="form-help">{own.length ? "Checked against the files this account has imported, and against every other account's files so two rules never both match." : "Checked against every other account's imported files so two rules never both match."} Files already imported keep their account.</p>
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
    </WorkspaceModal>
  );
}

export function AccountDeleteDialog({ account, data, busy, run, onClose }) {
  const [error, setError] = useState("");
  const waiting = data.jobs.some((j) => j.accountId === account.id);
  return (
    <ConfirmDialog title={`Delete “${account.name}”?`} confirmLabel="Delete account" cancelLabel="Keep account" busy={busy} error={error} onClose={onClose}
      onConfirm={async () => {
        const result = await run(async () => { try { return await api.deleteAccount(account.id); } catch (e) { setError(e.message); throw e; } }, "Account deleted. You can restore it from Deleted accounts.");
        if (result !== false) onClose();
      }}>
      <p>It leaves your pages and new files stop going to it. Its {plural(account.transactionCount ?? account.rows?.length ?? 0, "transaction", "transactions")}, the original files and the import history are kept, and you can restore it from Deleted accounts at the bottom of this page.</p>
      {waiting && <p>Files waiting in Snapshots for this account will ask for an account again.</p>}
    </ConfirmDialog>
  );
}
