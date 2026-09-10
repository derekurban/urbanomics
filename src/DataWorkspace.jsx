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
    `${item.filename} ${item.account || ""} ${statusName[item.status]}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <p>Every upload, including repeats and removed intake copies.</p>
      <input
        className="dr-search"
        aria-label="Search upload history"
        placeholder="Search files, accounts or status…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="dr-history-list">
        {entries.map((item) => (
          <article className="dr-history-item" key={item.id}>
            <div>
              <strong>{item.filename}</strong>
              <small>
                {item.account || "Unassigned"} · {when(item.created)}
              </small>
            </div>
            <span className={`dr-status ${item.status}`}>
              {statusName[item.status]}
            </span>
            {item.result && (
              <p>
                {item.result.added} added · {item.result.matched} matched ·{" "}
                {item.result.excluded} outside range
              </p>
            )}
            {item.error && <p className="dr-error-text">{item.error}</p>}
            <button onClick={() => onReveal("source", item.source_hash)}>
              Show original ↗
            </button>
          </article>
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
        <p>Original files and every saved snapshot, kept locally.</p>
        <button onClick={() => onReveal("archive")}>Open archive ↗</button>
      </div>
      <h3>All saved months</h3>
      <div className="dr-archive-months">
        {[...new Set(data.snapshotIndex.map((s) => s.month))]
          .sort()
          .reverse()
          .map((month) => (
            <div key={month}>
              <strong>{monthName(month)}</strong>
              {data.accounts.map((account) => {
                const versions = data.snapshotIndex
                  .filter(
                    (s) => s.month === month && s.accountId === account.id,
                  )
                  .sort((a, b) => b.revision - a.revision);
                return (
                  versions.length > 0 && (
                    <details key={account.id}>
                      <summary>
                        <span
                          className="dr-account-dot"
                          style={{ background: account.color }}
                        />
                        {account.name}{" "}
                        <small>{versions[0].rowCount} transactions</small>
                      </summary>
                      {versions.map((saved) => (
                        <div className="dr-saved-row" key={saved.id}>
                          <span>
                            {when(saved.created)} · {saved.rowCount} rows
                          </span>
                          <button onClick={() => onOpenSnapshot(saved)}>
                            Inspect snapshot
                          </button>
                          <button
                            onClick={() => onReveal("snapshot-file", saved.id)}
                          >
                            Show file ↗
                          </button>
                        </div>
                      ))}
                    </details>
                  )
                );
              })}
            </div>
          ))}
      </div>
      {!data.snapshotIndex.length && <p>No snapshots yet.</p>}
      <div className="dr-section-line">
        <h3>Original files</h3>
        <span>{data.sources.length} unique files</span>
      </div>
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
}) {
  const [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [confirmClear, setConfirmClear] = useState(false);
  const months = recentMonths(data.lastCompleteMonth);
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
          <div className="eyebrow">YOUR LOCAL DATA DESK</div>
          <h1>A place for every file.</h1>
          <p>Drop it in. Sort it out. Keep the history.</p>
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
          <small>Activity does not confirm complete month coverage.</small>
        </div>
      </section>

      <div className="dr-desk-columns">
        <section className="dr-dropbox" aria-label="Dropbox">
          <div className="dr-section-line">
            <div>
              <div className="eyebrow">01 / INTAKE</div>
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
                <h3>Fresh files, right here.</h3>
                <p>Drop your bank CSVs or a folder anywhere on this page.</p>
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
          <div className="dr-intake-range">
            <span>
              Importing {monthName(data.scope.startMonth, true)}
              {data.scope.startMonth !== data.scope.throughMonth &&
                ` — ${monthName(data.scope.throughMonth, true)}`}
            </span>
            <button className="dr-link" disabled={busy} onClick={onRange}>
              Change range
            </button>
          </div>
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
                        {job.rowCount != null && ` · ${job.rowCount} rows`}
                      </small>
                      {job.error && (
                        <small className="dr-error-text">{job.error}</small>
                      )}
                    </div>
                    {job.status === "queued" ? (
                      <span className="dr-status queued">Ready</span>
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
                <small>Your next upload will land here.</small>
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
          <p className="dr-footnote">
            PC Financial · EQ Bank · Simplii · CSV files stay local
          </p>
        </section>

        <aside className="dr-desk-aside">
          <section className="dr-results" aria-label="Processing results">
            <div className="eyebrow">02 / THE WRAP-UP</div>
            <h2>
              {progress
                ? "A little organizing…"
                : result
                  ? result.remaining
                    ? "A few files need a look."
                    : "Dropbox, sorted."
                  : "Ready when you are."}
            </h2>
            {progress ? (
              <p>
                Archiving originals, matching repeat rows and saving monthly
                snapshots.
              </p>
            ) : result ? (
              <>
                <p>
                  {result.completed} of {result.attempted} files processed
                  {result.remaining
                    ? ` · ${result.remaining} left for attention at the end of this run`
                    : ""}
                  .
                </p>
                <div className="dr-result-numbers">
                  <div>
                    <strong>{result.added}</strong>
                    <span>new rows</span>
                  </div>
                  <div>
                    <strong>{result.matched}</strong>
                    <span>matched</span>
                  </div>
                  <div>
                    <strong>{result.excluded}</strong>
                    <span>outside range</span>
                  </div>
                </div>
                <div className="dr-result-months">
                  {result.months.length ? (
                    result.months.map((month) => (
                      <span key={month}>✓ {monthName(month, true)}</span>
                    ))
                  ) : (
                    <span>No monthly snapshots changed.</span>
                  )}
                </div>
                <small className="dr-result-time">
                  Latest run · {when(result.created)}
                </small>
                {result.files.some((file) => file.status !== "complete") && (
                  <p className="dr-error-text">
                    Some files need review or archive recovery. See Dropbox for
                    their current status.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="dr-resting-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <p>
                  Process your Dropbox and the results land here: new rows,
                  repeat matches and months saved.
                </p>
              </>
            )}
            <button className="dr-link" onClick={() => setModal("history")}>
              View upload history ↗
            </button>
          </section>
          <section className="dr-archive-card">
            <div className="eyebrow">03 / SAFELY FILED</div>
            <h2>Your local archive</h2>
            <p>
              <strong>{data.sources.length}</strong> original file
              {data.sources.length === 1 ? "" : "s"} ·{" "}
              <strong>
                {
                  new Set(
                    data.snapshotIndex.map((s) => `${s.accountId}/${s.month}`),
                  ).size
                }
              </strong>{" "}
              account-month snapshots
            </p>
            <p>Originals and saved history, always within reach.</p>
            <div className="dr-actions">
              <button disabled={busy} onClick={() => onReveal("archive")}>
                Open archive ↗
              </button>
              <button className="dr-link" onClick={() => setModal("archive")}>
                Inspect files
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
              <details className="dr-previous-saves">
                <summary>Saved history ({selected.versions.length})</summary>
                {selected.versions.map((saved) => (
                  <div className="dr-saved-row" key={saved.id}>
                    <span>
                      {when(saved.created)} · {saved.rowCount} rows
                    </span>
                    <button onClick={() => inspect(saved)}>
                      Inspect saved snapshot
                    </button>
                  </div>
                ))}
              </details>
            </>
          ) : (
            <p>No snapshot has been uploaded for this account and month.</p>
          )}
        </WorkspaceModal>
      )}
    </div>
  );
}
