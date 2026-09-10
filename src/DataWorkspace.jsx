import React, { useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";

const monthName = (value, short = false) =>
  new Date(`${value}-15T12:00:00`).toLocaleDateString("en-CA", {
    month: short ? "short" : "long",
    year: "numeric",
  });
const when = (value) =>
  new Date(value).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const statusName = {
  queued: "Ready",
  routing: "Choose account",
  overlap: "Review overlap",
  error: "Review error",
  finalizing: "Finishing archive",
  complete: "Processed",
  dismissed: "Intake removed",
};
const size = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function recentMonths(end) {
  const [year, month] = end.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(year, month - 12 + i, 15);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function History({ data, onReveal }) {
  const [query, setQuery] = useState("");
  const entries = data.activity.filter((item) =>
    `${item.account || "Unassigned"} ${item.filename} ${statusName[item.status]} ${item.accountDeleted ? "deleted account" : ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <input
        className="dr-search"
        aria-label="Search upload history"
        placeholder="Search accounts, files or status…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="dr-compact-history">
        {entries.map((item) => (
          <details className="dr-history-entry" key={item.id}>
            <summary>
              <span className="dr-history-account">
                <i
                  style={{ background: item.accountColor || "#9CA797" }}
                  aria-hidden="true"
                />
                <span>
                  <strong>{item.account || "Unassigned"}</strong>
                  {item.accountDeleted && <small>Deleted account</small>}
                </span>
              </span>
              <time dateTime={item.created}>{when(item.created)}</time>
              <span className={`dr-status ${item.status}`}>
                {statusName[item.status]}
              </span>
            </summary>
            <div className="dr-upload-details">
              <div>
                <span className="dr-upload-filename">{item.filename}</span>
                {item.result && (
                  <p>
                    {item.result.added} added · {item.result.matched} matched
                    {item.result.excluded > 0 &&
                      ` · ${item.result.excluded} excluded in this earlier import`}
                  </p>
                )}
                {item.error && <p className="dr-error-text">{item.error}</p>}
              </div>
              <button onClick={() => onReveal("source", item.source_hash)}>
                Show original ↗
              </button>
            </div>
          </details>
        ))}
      </div>
      {!entries.length && <p className="dr-empty-copy">No uploads found.</p>}
    </>
  );
}

function Archive({ data, onReveal, onOpenSnapshot }) {
  const [query, setQuery] = useState("");
  const sources = data.sources.filter((source) =>
    source.filename.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="dr-modal-intro">
        <p>One snapshot per account, per month.</p>
        <button onClick={() => onReveal("archive")}>Open archive ↗</button>
      </div>
      <div className="dr-archive-months">
        {[...new Set(data.snapshotIndex.map((s) => s.month))]
          .sort()
          .reverse()
          .map((month) => (
            <div key={month}>
              <strong>{monthName(month)}</strong>
              {[...data.accounts, ...(data.deletedAccounts || [])].map(
                (account) => {
                  const saved = data.snapshotIndex
                    .filter(
                      (s) => s.month === month && s.accountId === account.id,
                    )
                    .sort((a, b) => b.revision - a.revision)[0];
                  return (
                    saved && (
                      <div className="dr-account-snapshot" key={account.id}>
                        <span className="dr-snapshot-account">
                          <span
                            className="dr-account-dot"
                            style={{ background: account.color }}
                          />
                          {account.name}
                          {account.deletedAt ? " (deleted)" : ""}
                        </span>
                        <small>{saved.rowCount} transactions</small>
                        <button
                          aria-label={`Inspect ${account.name}, ${monthName(month)}`}
                          onClick={() => onOpenSnapshot(saved)}
                        >
                          Inspect
                        </button>
                        <button
                          aria-label={`Show file for ${account.name}, ${monthName(month)}`}
                          onClick={() => onReveal("snapshot-file", saved.id)}
                        >
                          Show file ↗
                        </button>
                      </div>
                    )
                  );
                },
              )}
            </div>
          ))}
      </div>
      {!data.snapshotIndex.length && <p>No snapshots yet.</p>}
      <details className="dr-originals">
        <summary>
          Original files <span>{data.sources.length}</span>
        </summary>
        <input
          className="dr-search"
          aria-label="Search archive"
          placeholder="Find an original file…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {sources.map((source) => (
          <div className="dr-original" key={source.hash}>
            <div>
              <strong>{source.filename}</strong>
              <small>
                {size(source.bytes)} · {source.uploads} upload
                {source.uploads === 1 ? "" : "s"}
              </small>
            </div>
            <button onClick={() => onReveal("source", source.hash)}>
              Show original ↗
            </button>
          </div>
        ))}
        {!sources.length && (
          <p className="dr-empty-copy">No original files found.</p>
        )}
      </details>
    </>
  );
}

export function DataWorkspace({
  data,
  busy,
  progress,
  onUpload,
  onChooseFolder,
  onScan,
  onProcess,
  onClear,
  onReview,
  onDismiss,
  onReveal,
  onOpenSnapshot,
  onRange,
  onResults,
  onOrganize,
}) {
  const [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [confirmClear, setConfirmClear] = useState(false);
  const calendarEnd = [
    data.lastCompleteMonth,
    ...data.months.map((m) => m.month),
  ]
    .sort()
    .at(-1);
  const months = recentMonths(calendarEnd);
  const queued = data.jobs.filter((job) => job.status === "queued");
  const attention = data.jobs.filter((job) => job.status !== "queued");
  const result = data.lastProcessResult;
  const accountById = Object.fromEntries(
    data.accounts.map((account) => [account.id, account]),
  );
  const versionsFor = (accountId, month) =>
    data.snapshotIndex
      .filter(
        (snapshot) =>
          snapshot.accountId === accountId && snapshot.month === month,
      )
      .sort((a, b) => b.revision - a.revision);
  const inspect = (target) => {
    setModal(null);
    setSelected(null);
    onOpenSnapshot(target);
  };
  return (
    <div className="data-room">
      <header className="dr-heading">
        <div>
          <h1>Snapshots</h1>
        </div>
        <button className="dr-refresh" disabled={busy} onClick={onScan}>
          <span aria-hidden="true">↻</span> Refresh
        </button>
      </header>

      <section className="dr-library" aria-label="Snapshot library">
        <div className="dr-section-line">
          <div>
            <h2>Snapshot library</h2>
            <p>
              {monthName(months[0], true)} — {monthName(months.at(-1), true)}
            </p>
          </div>
          <button className="dr-link" onClick={() => setModal("archive")}>
            Browse archive ↗
          </button>
        </div>
        {data.accounts.length ? (
          <div className="dr-calendar">
            <table>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  {months.map((month, i) => (
                    <th scope="col" key={month}>
                      <span>
                        {new Date(`${month}-15T12:00:00`).toLocaleDateString(
                          "en-CA",
                          { month: "short" },
                        )}
                      </span>
                      <small>
                        {i === 0 || month.endsWith("-01")
                          ? month.slice(0, 4)
                          : "\u00a0"}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((account) => (
                  <tr
                    key={account.id}
                    style={{ "--account-color": account.color }}
                  >
                    <th scope="row">
                      <span className="dr-account-dot" />
                      {account.name}
                    </th>
                    {months.map((month) => {
                      const versions = versionsFor(account.id, month),
                        latest = versions[0];
                      return (
                        <td key={month}>
                          <div className="dr-cell-wrap">
                            <button
                              className={`dr-cell ${latest ? "filled" : ""}`}
                              data-count={latest ? 1 : 0}
                              aria-label={`${account.name}, ${monthName(month)}: ${latest ? `${latest.rowCount} transactions saved` : "no snapshot"}`}
                              aria-describedby={`hint-${account.id}-${month}`}
                              onClick={() =>
                                setSelected({ account, month, versions })
                              }
                            >
                              <span />
                            </button>
                            <div
                              className="dr-tooltip"
                              role="tooltip"
                              id={`hint-${account.id}-${month}`}
                            >
                              <strong>{monthName(month)}</strong>
                              <span>{account.name}</span>
                              <small>
                                {latest
                                  ? `${latest.rowCount} transactions · saved ${when(latest.created)}`
                                  : "No snapshot uploaded"}
                              </small>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dr-calendar-empty">
            <span aria-hidden="true">▦</span>
            <p>Your accounts will bring this calendar to life.</p>
            <button onClick={onRange}>Add accounts</button>
          </div>
        )}
        <div className="dr-calendar-legend">
          <span>
            <i className="dr-legend-filled" /> Snapshot saved
          </span>
          <span>
            <i /> No snapshot
          </span>
        </div>
      </section>

      <div className="dr-desk-columns">
        <section className="dr-dropbox" aria-label="Dropbox">
          <div className="dr-section-line">
            <div>
              <h2>
                Dropbox <span className="dr-count">{data.jobs.length}</span>
              </h2>
            </div>
            <button disabled={busy} onClick={() => onReveal("dropbox")}>
              Open folder ↗
            </button>
          </div>
          <div className={`dr-drop-pad ${progress ? "processing" : ""}`}>
            {progress ? (
              <div role="status" className="dr-processing">
                <div className="dr-file-flight" aria-hidden="true">
                  <i>CSV</i>
                  <i>CSV</i>
                  <i>CSV</i>
                  <b>▦</b>
                </div>
                <strong>Finding a home for your files…</strong>
                <p>
                  {progress.filename || "Preparing the Dropbox"} ·{" "}
                  {progress.done} / {progress.total}
                </p>
                <progress
                  aria-label="Files processed"
                  value={progress.done}
                  max={progress.total || 1}
                />
              </div>
            ) : (
              <>
                <div className="dr-drop-illustration" aria-hidden="true">
                  <span>CSV</span>
                  <span>CSV</span>
                  <b>↓</b>
                </div>
                <p>Drop bank CSVs or a folder here.</p>
                <div className="dr-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={onUpload}
                  >
                    Upload CSVs
                  </button>
                  <button disabled={busy} onClick={onChooseFolder}>
                    Choose folder
                  </button>
                </div>
              </>
            )}
          </div>
          <p className="dr-auto-import">
            Recognized files import automatically. Transactions find their month
            by date.
          </p>
          {data.jobs.length ? (
            <>
              <div className="dr-queue">
                {[...attention, ...queued].map((job) => (
                  <article className="dr-queue-item" key={job.id}>
                    <span className="dr-file-icon" aria-hidden="true">
                      CSV
                    </span>
                    <div>
                      <strong>{job.filename}</strong>
                      <small>
                        {accountById[job.accountId]?.name || "Account needed"}
                        {job.rowCount != null &&
                          ` · ${job.rowCount} transactions`}
                      </small>
                      {job.error && (
                        <small className="dr-error-text">{job.error}</small>
                      )}
                    </div>
                    {job.status === "queued" ? (
                      job.conflicts.length ? (
                        <button disabled={busy} onClick={() => onReview(job)}>
                          Review matches
                        </button>
                      ) : (
                        <span className="dr-status queued">Ready</span>
                      )
                    ) : job.status === "finalizing" ? (
                      <button disabled={busy} onClick={onScan}>
                        Retry archive
                      </button>
                    ) : (
                      <button disabled={busy} onClick={() => onReview(job)}>
                        {statusName[job.status]}
                      </button>
                    )}
                    <button
                      className="dr-remove"
                      disabled={busy || job.status === "finalizing"}
                      aria-label={`Remove ${job.filename} from intake`}
                      onClick={() => onDismiss(job.id)}
                    >
                      ×
                    </button>
                  </article>
                ))}
              </div>
              <div className="dr-queue-actions">
                <button
                  className="primary"
                  disabled={busy || !queued.length}
                  onClick={onProcess}
                >
                  Process {queued.length} queued file
                  {queued.length === 1 ? "" : "s"}
                </button>
                <button
                  className="dr-link"
                  disabled={busy}
                  onClick={() => setConfirmClear(true)}
                >
                  Clear intake copies
                </button>
              </div>
            </>
          ) : (
            <div className="dr-queue-empty">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Nothing waiting.</strong>
              </div>
            </div>
          )}
          {confirmClear && (
            <div className="dr-clear-confirm" role="alert">
              <strong>Clear the intake copies?</strong>
              <p>
                Originals stay archived. Snapshots, Downloads and other folder
                contents stay in place.
              </p>
              <button
                disabled={busy}
                onClick={async () => {
                  const cleared = await onClear();
                  if (cleared !== false) setConfirmClear(false);
                }}
              >
                Clear{" "}
                {data.jobs.filter((j) => j.status !== "finalizing").length}{" "}
                {data.jobs.filter((j) => j.status !== "finalizing").length === 1
                  ? "copy"
                  : "copies"}
              </button>
              <button onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          )}
        </section>

        <aside className="dr-desk-aside">
          <section className="dr-archive-card">
            <div className="dr-archive-icon" aria-hidden="true">
              ▤
            </div>
            <h2>Archive & history</h2>
            <p>
              {data.sources.length} original file
              {data.sources.length === 1 ? "" : "s"} ·{" "}
              {
                new Set(
                  data.snapshotIndex.map((s) => `${s.accountId}/${s.month}`),
                ).size
              }{" "}
              snapshot
              {new Set(
                data.snapshotIndex.map((s) => `${s.accountId}/${s.month}`),
              ).size === 1
                ? ""
                : "s"}
            </p>
            <div className="dr-archive-actions">
              {data.months.length > 0 && (
                <button onClick={onOrganize}>
                  Organize transactions <span>→</span>
                </button>
              )}
              <button onClick={() => setModal("history")}>
                View upload history <span>↗</span>
              </button>
              {result && (
                <button onClick={onResults}>
                  Latest results <span>↗</span>
                </button>
              )}
              <button disabled={busy} onClick={() => onReveal("archive")}>
                Open archive folder <span>↗</span>
              </button>
            </div>
          </section>
        </aside>
      </div>
      {modal === "history" && (
        <WorkspaceModal title="Upload history" onClose={() => setModal(null)}>
          <History data={data} onReveal={onReveal} />
        </WorkspaceModal>
      )}
      {modal === "archive" && (
        <WorkspaceModal title="Archive" onClose={() => setModal(null)}>
          <Archive data={data} onReveal={onReveal} onOpenSnapshot={inspect} />
        </WorkspaceModal>
      )}
      {selected && (
        <WorkspaceModal
          title={monthName(selected.month)}
          onClose={() => setSelected(null)}
        >
          <p>
            <span
              className="dr-account-dot"
              style={{ background: selected.account.color }}
            />
            {selected.account.name}
          </p>
          {selected.versions.length ? (
            <>
              <p>
                {selected.versions[0].rowCount} transactions in the latest saved
                snapshot.
              </p>
              <button
                className="primary"
                onClick={() => inspect(selected.versions[0])}
              >
                Inspect snapshot
              </button>
              <button
                className="dr-link"
                onClick={() => onReveal("month", selected.month)}
              >
                Open month folder ↗
              </button>
            </>
          ) : (
            <p>No snapshot has been uploaded for this account and month.</p>
          )}
        </WorkspaceModal>
      )}
    </div>
  );
}
