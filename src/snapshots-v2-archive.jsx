import React, { useState } from "react";
import {
  AccountDot,
  fileSize,
  monthLabel,
  onDesktop,
  plural,
  Sv2Dialog,
  whenLabel,
} from "./snapshots-v2-atoms.jsx";

const statusName = {
  queued: "Ready",
  unresolved: "Needs a layout",
  routing: "Needs an account",
  overlap: "Overlap to review",
  error: "Error",
  finalizing: "Finishing archive",
  complete: "Imported",
  dismissed: "Removed from intake",
};

export function HistoryDialog({ data, onReveal, onClose }) {
  const [query, setQuery] = useState("");
  const entries = (data.activity || []).filter((item) =>
    `${item.account || "Unassigned"} ${item.filename} ${statusName[item.status] || item.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Sv2Dialog title="Import history" onClose={onClose} wide>
      <p>Every file this workspace has read, newest first.</p>
      <input
        className="sv2-search"
        aria-label="Search import history"
        placeholder="Search accounts, files or status…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="sv2-history">
        {entries.map((item, index) => (
          <li key={item.id} style={{ "--i": Math.min(index, 12) }}>
            <details>
              <summary>
                <span className="sv2-history-account">
                  <AccountDot color={item.accountColor} />
                  <span>
                    <strong>{item.account || "Unassigned"}</strong>
                    {item.accountDeleted && <small>Deleted account</small>}
                  </span>
                </span>
                <time dateTime={item.created}>{whenLabel(item.created)}</time>
                <span className="sv2-badge">
                  {statusName[item.status] || item.status}
                </span>
              </summary>
              <div className="sv2-history-body">
                <div>
                  <span className="sv2-history-file">{item.filename}</span>
                  {item.result && (
                    <p className="sv2-quiet">
                      {item.result.added} added · {item.result.matched} already
                      recorded
                      {item.result.excluded > 0 &&
                        ` · ${item.result.excluded} excluded in that import`}
                    </p>
                  )}
                  {item.error && (
                    <p className="sv2-error">{item.error}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onReveal("source", item.source_hash)}
                >
                  {onDesktop ? "Show original ↗" : "Download original ↓"}
                </button>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {!entries.length && <p className="sv2-quiet">Nothing matches that search.</p>}
    </Sv2Dialog>
  );
}

export function ArchiveDialog({ data, onReveal, onOpenSnapshot, onClose }) {
  const [query, setQuery] = useState("");
  const index = data.snapshotIndex || [];
  const accounts = [...(data.accounts || []), ...(data.deletedAccounts || [])];
  const months = [...new Set(index.map((snapshot) => snapshot.month))]
    .sort()
    .reverse();
  const sources = (data.sources || []).filter((source) =>
    source.filename.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Sv2Dialog title="Archive" onClose={onClose} wide>
      <div className="sv2-archive-intro">
        <p>
          One current snapshot per account, per month. Older saves stay as audit
          files.
        </p>
        {onDesktop && (
          <button type="button" onClick={() => onReveal("archive")}>
            Open archive folder ↗
          </button>
        )}
      </div>
      {months.map((month, monthIndex) => (
        <section
          className="sv2-archive-month"
          key={month}
          style={{ "--i": Math.min(monthIndex, 10) }}
        >
          <h4>{monthLabel(month)}</h4>
          {accounts.map((account) => {
            const saved = index
              .filter(
                (snapshot) =>
                  snapshot.month === month && snapshot.accountId === account.id,
              )
              .sort((a, b) => b.revision - a.revision)[0];
            if (!saved) return null;
            return (
              <div className="sv2-archive-row" key={account.id}>
                <span className="sv2-archive-account">
                  <AccountDot color={account.color} />
                  {account.name}
                  {account.deletedAt ? " (deleted)" : ""}
                </span>
                <small>{plural(saved.rowCount, "transaction", "transactions")}</small>
                <button
                  type="button"
                  aria-label={`Inspect ${account.name}, ${monthLabel(month)}`}
                  onClick={() => onOpenSnapshot(saved)}
                >
                  Inspect
                </button>
                <button
                  type="button"
                  aria-label={`Snapshot file for ${account.name}, ${monthLabel(month)}`}
                  onClick={() => onReveal("snapshot-file", saved.id)}
                >
                  {onDesktop ? "Show file ↗" : "Download ↓"}
                </button>
              </div>
            );
          })}
        </section>
      ))}
      {!months.length && <p className="sv2-quiet">No snapshots saved yet.</p>}
      <details className="sv2-originals">
        <summary>
          Original files <span>{(data.sources || []).length}</span>
        </summary>
        <input
          className="sv2-search"
          aria-label="Search archived originals"
          placeholder="Find an original file…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {sources.map((source) => (
          <div className="sv2-archive-row" key={source.hash}>
            <span className="sv2-archive-account">{source.filename}</span>
            <small>
              {fileSize(source.bytes)} ·{" "}
              {plural(source.uploads, "upload", "uploads")}
            </small>
            <button type="button" onClick={() => onReveal("source", source.hash)}>
              {onDesktop ? "Show original ↗" : "Download ↓"}
            </button>
          </div>
        ))}
        {!sources.length && (
          <p className="sv2-quiet">No original files match that search.</p>
        )}
      </details>
    </Sv2Dialog>
  );
}
