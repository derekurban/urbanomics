import React, { useEffect, useRef, useState } from "react";
import "./snapshots-v2.css";
import {
  AccountDot,
  api,
  bankNames,
  countOf,
  FileGlyph,
  InfoDot,
  monthLabel,
  onDesktop,
  plural,
  SnapshotScene,
  Stat,
  Sv2Dialog,
  whenLabel,
} from "./snapshots-v2-atoms.jsx";
import { LayoutEditor, LayoutLibrary } from "./snapshots-v2-layout.jsx";
import { AccountsStep } from "./snapshots-v2-accounts.jsx";
import { ArchiveDialog, HistoryDialog } from "./snapshots-v2-archive.jsx";

const flowSteps = [
  ["files", "Files"],
  ["layouts", "Layouts"],
  ["accounts", "Accounts"],
  ["import", "Import"],
];

function rollingMonths(end) {
  const [year, month] = end.split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const point = new Date(year, month - 12 + index, 15);
    return `${point.getFullYear()}-${String(point.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function SnapshotsWorkspace({ data, onRefresh, onOpenSnapshot, onReview }) {
  const jobs = data.jobs || [],
    accounts = data.accounts || [],
    snapshots = data.snapshotIndex || [];
  const [step, setStep] = useState(() => (jobs.length ? "files" : null));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [progress, setProgress] = useState(null),
    [results, setResults] = useState(null);
  const [skipped, setSkipped] = useState([]),
    [activeId, setActiveId] = useState(null),
    [editTemplate, setEditTemplate] = useState(null);
  const [modal, setModal] = useState(null),
    [dragging, setDragging] = useState(false);
  const [templates, setTemplates] = useState([]);
  const working = useRef(false);

  useEffect(() => api?.onProgress?.((value) => setProgress(value)), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5200);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run(work, message) {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await work();
      await onRefresh?.();
      if (message)
        setNotice(typeof message === "function" ? message(value) : message);
      return value;
    } catch (issue) {
      await onRefresh?.().catch(()=>{});
      setError(issue?.message || String(issue));
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const held = new Set(skipped);
  const included = jobs.filter((job) => !held.has(job.id));
  const needLayout = included.filter((job) => !job.schema);
  const needAccount = included.filter((job) => job.schema && !job.accountId);
  const failed = included.filter((job) => job.status === "error");
  const ready = included.filter(
    (job) => job.schema && job.accountId && job.status === "queued",
  );
  const canImport = included.length > 0 && ready.length === included.length;
  const jobsKey = jobs
    .map((job) => `${job.id}:${job.schema || ""}:${job.accountId || ""}:${job.status}`)
    .join(",");
  const byId = Object.fromEntries(accounts.map((account) => [account.id, account]));

  useEffect(() => {
    if (!busy && !jobs.length && step && step !== "done") setStep(null);
  }, [jobs.length, step, busy]);
  useEffect(() => {
    if (step !== "layouts") return;
    if (!activeId || !included.some((job) => job.id === activeId))
      setActiveId((needLayout[0] || included[0])?.id || null);
  }, [step, jobsKey, activeId]);
  useEffect(() => {
    if (!step) return;
    let active = true;
    api
      .importLayouts()
      .then((list) => active && setTemplates(list || []))
      .catch(() => active && setTemplates([]));
    return () => {
      active = false;
    };
  }, [step, jobsKey]);

  const layoutName = (job) =>
    !job.schema
      ? "Needs a layout"
      : bankNames[job.schema]
        ? `${bankNames[job.schema]} export`
        : templates.find((one) => "custom:" + one.id === job.schema)?.name || "Custom layout";

  const stage = (work) =>
    run(async () => {
      const value = await work();
      if (value?.ids?.length) setStep("files");
      return value;
    }, (value) => {
      const added = value?.ids?.length || 0;
      const left = value?.skipped
        ? ` ${plural(value.skipped, "item was", "items were")} skipped: not a CSV, a subfolder, or too large.`
        : "";
      return added
        ? `${plural(added, "file", "files")} staged. Nothing is imported yet.${left}`
        : `Nothing staged.${left || " No files selected."}`;
    });

  const stageRef = useRef(stage);stageRef.current=stage;
  useEffect(()=>{const dropped=event=>stageRef.current(()=>api.stageDrop(event.detail));window.addEventListener('snapshots-drop',dropped);return ()=>window.removeEventListener('snapshots-drop',dropped);},[]);
  const previousJobs=useRef(jobs.length);
  useEffect(()=>{if(jobs.length>previousJobs.current&&!step)setStep('files');previousJobs.current=jobs.length;},[jobs.length]);
  const reveal = (kind, id) => run(() => api.reveal(kind, id));
  const openLatest = (month) => {
    const saved = snapshots
      .filter((snapshot) => snapshot.month === month)
      .sort((a, b) => (b.revision || 0) - (a.revision || 0))[0];
    if (saved) onOpenSnapshot(saved);
  };

  const dragProps = {
    onDragEnter: (event) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(true);
    },
    onDragOver: (event) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(true);
    },
    onDragLeave: (event) => {
      event.stopPropagation();
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length && !busy) stage(() => api.stageDrop(files));
    },
  };

  const reach = (id) => {
    if (id === "files") return true;
    if (!included.length) return false;
    if (id === "layouts") return true;
    if (id === "accounts") return needLayout.length === 0;
    return needLayout.length === 0 && needAccount.length === 0;
  };
  const done = (id) =>
    id === "files"
      ? included.length > 0
      : id === "layouts"
        ? included.length > 0 && needLayout.length === 0
        : id === "accounts"
          ? included.length > 0 && needAccount.length === 0 && needLayout.length === 0
          : false;

  const activeJob = included.find((job) => job.id === activeId) || null;
  const calendarEnd = [data.lastCompleteMonth, ...(data.months || []).map((m) => m.month)]
    .filter(Boolean)
    .sort()
    .at(-1);
  const months = calendarEnd ? rollingMonths(calendarEnd) : [];
  const settled = snapshots.length > 0;
  const lastImport = (data.activity || []).find((item) => item.status === "complete");

  return (
    <section
      className={`sv2${dragging ? " sv2-dragging" : ""}`}
      aria-label="Snapshots"
      {...dragProps}
    >
      {step && (
        <header className="sv2-top">
          <div>
            <p className="sv2-eyebrow">Import</p>
            <h1>
              {step === "done"
                ? "Results"
                : `Set up ${plural(included.length, "file", "files")}`}
            </h1>
          </div>
          <div className="sv2-card-actions">
            <button type="button" onClick={() => setModal("layouts")}>
              Saved layouts
            </button>
            <button
              type="button"
              hidden={step === "done"}
              onClick={() => {
                setResults(null);
                setStep(null);
              }}
            >
              {settled ? "Back to snapshots" : "Back"}
            </button>
          </div>
        </header>
      )}

      {error && (
        <p className="sv2-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            Dismiss
          </button>
        </p>
      )}

      {!step && !settled && (
        <section className="sv2-landing" aria-label="Add bank exports">
          <div className="sv2-landing-core">
            <SnapshotScene />
            <p className="sv2-eyebrow">Snapshots</p>
            <h1>Every month, filed where it belongs.</h1>
            <p className="sv2-lede">
              Drop your bank CSV exports here. Each transaction is filed by its
              own date into that account's monthly record, and the file you
              dropped is kept exactly as it came.
            </p>
            <div className="sv2-landing-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => stage(() => api.stageChoose(false))}
              >
                Choose CSV files
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => stage(() => api.stageChoose(true))}
              >
                Choose a folder
              </button>
              <button
                type="button"
                className="sv2-inline"
                disabled={busy}
                onClick={() => stage(() => api.scan(true))}
              >
                Check the Dropbox folder
              </button>
            </div>
            <p className="sv2-quiet sv2-landing-hint">
              or drop them anywhere on this page
            </p>
          </div>
          <ul className="sv2-landing-notes">
            <li>
              <h3>
                Monthly records
                <InfoDot label="Monthly records">
                  <span>
                    A snapshot is one account's transactions for one calendar
                    month, built from the dates inside the file. An export that
                    spans two months updates both, and a partial export adds its
                    rows without removing anything already recorded.
                  </span>
                </InfoDot>
              </h3>
              <p>Built from transaction dates, not from when you imported.</p>
            </li>
            <li>
              <h3>
                Export as often as you like
                <InfoDot label="Repeat exports">
                  <span>
                    Each row carries a fingerprint of its account, date,
                    description and exact amount. A row that is already recorded
                    is matched instead of added, and two identical payments on
                    the same day stay two payments.
                  </span>
                </InfoDot>
              </h3>
              <p>Repeat exports match rows already recorded.</p>
            </li>
            <li>
              <h3>
                Originals stay here
                <InfoDot label="Your originals">
                  <span>
                    The file you drop is copied into this computer's archive with
                    its checksum and kept unchanged, next to every snapshot it
                    produced. Nothing is sent anywhere.
                  </span>
                </InfoDot>
              </h3>
              <p>Archived on this computer, byte for byte.</p>
            </li>
            <li>
              <h3>
                Your saved layouts
                <InfoDot label="Layouts">
                  <span>
                    Map the date, description and amount columns once. A layout’s
                    filename rule selects it for future uploads, independently
                    of the account’s filename rule.
                  </span>
                </InfoDot>
              </h3>
              <p>Map once. Reuse with your filename rules.</p>
            </li>
          </ul>
        </section>
      )}

      {!step && settled && (
        <div className="sv2-home">
          <header className="sv2-top">
            <div>
              <p className="sv2-eyebrow">Snapshots</p>
              <h1>{months.length ? `${monthLabel(months[0], true)} — ${monthLabel(months.at(-1), true)}` : "Your months"}</h1>
            </div>
            <div className="sv2-card-actions">
              <button
                type="button"
                className="sv2-refresh"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.scan(true),
                    (result) =>
                      result?.ids?.length
                        ? `${plural(result.ids.length, "new file", "new files")} staged from the Dropbox folder.`
                        : "Up to date. Nothing new in the Dropbox folder.",
                  )
                }
              >
                <span aria-hidden="true">↻</span> Refresh
              </button>
              <button type="button" onClick={() => setModal("archive")}>
                Archive
              </button>
              <button type="button" onClick={() => setModal("history")}>
                History
              </button>
              <button type="button" onClick={() => setModal("layouts")}>
                Saved layouts
              </button>
            </div>
          </header>

          <section className="sv2-panel sv2-calendar" aria-label="Snapshot calendar">
            {accounts.length ? (
              <table className="sv2-grid">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    {months.map((month, index) => (
                      <th scope="col" key={month}>
                        <span>
                          {new Date(`${month}-15T12:00:00`).toLocaleDateString(
                            "en-CA",
                            { month: "short" },
                          )}
                        </span>
                        <small>
                          {index === 0 || month.endsWith("-01")
                            ? month.slice(0, 4)
                            : " "}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account, row) => (
                    <tr
                      key={account.id}
                      style={{ "--sv2-account": account.color, "--r": row }}
                    >
                      <th scope="row">
                        <AccountDot color={account.color} />
                        {account.name}
                      </th>
                      {months.map((month, index) => {
                        const saved = snapshots
                          .filter(
                            (snapshot) =>
                              snapshot.accountId === account.id &&
                              snapshot.month === month,
                          )
                          .sort((a, b) => (b.revision || 0) - (a.revision || 0))[0];
                        return (
                          <td key={month} style={{ "--i": index }}>
                            {saved ? (
                              <span className="sv2-grid-wrap">
                                <button
                                  type="button"
                                  className="sv2-grid-cell sv2-filled"
                                  aria-label={`${account.name}, ${monthLabel(month)}: ${plural(saved.rowCount, "transaction", "transactions")} saved`}
                                  onClick={() => onOpenSnapshot(saved)}
                                >
                                  <i />
                                </button>
                                <span className="sv2-tip" role="tooltip">
                                  <strong>{monthLabel(month)}</strong>
                                  <span>{account.name}</span>
                                  <small>
                                    {plural(saved.rowCount, "transaction", "transactions")}
                                    {saved.created ? ` · saved ${whenLabel(saved.created)}` : ""}
                                  </small>
                                </span>
                              </span>
                            ) : (
                              <span className="sv2-grid-cell" aria-hidden="true">
                                <i />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="sv2-quiet">
                Accounts appear here as soon as your first export is assigned to
                one.
              </p>
            )}
            <p className="sv2-legend">
              <span>
                <i className="sv2-legend-filled" /> snapshot saved
              </span>
              <span>
                <i /> nothing imported
              </span>
              {lastImport && <small>Last import {whenLabel(lastImport.created)}</small>}
            </p>
          </section>

          <section className={`sv2-dock${dragging ? " sv2-over" : ""}`}>
            <div className="sv2-dock-mark" aria-hidden="true">
              <FileGlyph />
              <FileGlyph />
            </div>
            <div className="sv2-dock-text">
              <strong>Add more exports</strong>
              <p className="sv2-quiet">
                Drop CSVs anywhere on this page. Nothing imports until you have
                set every file up.
              </p>
            </div>
            <div className="sv2-dock-actions">
              {jobs.length > 0 && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setStep("files")}
                >
                  Continue with {plural(jobs.length, "file", "files")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => stage(() => api.stageChoose(false))}
              >
                Choose CSVs
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => stage(() => api.stageChoose(true))}
              >
                Folder
              </button>
              {onDesktop && (
                <button
                  type="button"
                  className="sv2-inline"
                  onClick={() => reveal("dropbox")}
                >
                  Open Dropbox ↗
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {step && step !== "done" && (
        <div className="sv2-flow">
          <nav className="sv2-rail" aria-label="Import steps">
            {flowSteps.map(([id, label], index) => (
              <button
                type="button"
                key={id}
                className={`sv2-rail-step${done(id) ? " sv2-rail-done" : ""}`}
                aria-current={step === id ? "step" : undefined}
                disabled={!reach(id)}
                onClick={() => setStep(id)}
              >
                {/* Keyed so the tick plays its small pop the moment a step
                    completes; the button itself never remounts. */}
                <i key={done(id) ? "done" : "todo"} aria-hidden="true">
                  {done(id) ? "✓" : index + 1}
                </i>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {step === "files" && (
            <section className="sv2-panel">
              <header className="sv2-card-head">
                <div>
                  <h2>Staged files</h2>
                  <p className="sv2-quiet">
                    Copied into the workspace and read, never imported on their
                    own.
                  </p>
                </div>
                <div className="sv2-card-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => stage(() => api.stageChoose(false))}
                  >
                    Add CSVs
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => stage(() => api.stageChoose(true))}
                  >
                    Add folder
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => stage(() => api.scan(true))}
                  >
                    Check Dropbox
                  </button>
                </div>
              </header>
              <ul className="sv2-files">
                {jobs.map((job, index) => (
                  <li
                    className={`sv2-file-row${held.has(job.id) ? " sv2-held" : ""}`}
                    key={job.id}
                    style={{ "--i": index }}
                  >
                    <FileGlyph />
                    <div className="sv2-file-main">
                      <strong>{job.filename}</strong>
                      <small>
                        {layoutName(job)} ·{" "}
                        {job.accountId
                          ? byId[job.accountId]?.name || "Account"
                          : "no account yet"}
                        {job.rowCount != null
                          ? ` · ${plural(job.rowCount, "row", "rows")}`
                          : ""}
                      </small>
                      {job.error && <small className="sv2-error">{job.error}</small>}
                    </div>
                    <label className="sv2-include">
                      <input
                        type="checkbox"
                        checked={!held.has(job.id)}
                        onChange={(event) =>
                          setSkipped((current) =>
                            event.target.checked
                              ? current.filter((id) => id !== job.id)
                              : [...current, job.id],
                          )
                        }
                      />
                      Include
                    </label>
                    <button
                      type="button"
                      className="sv2-remove"
                      disabled={busy}
                      aria-label={`Remove ${job.filename} from intake`}
                      onClick={() =>
                        run(
                          () => api.dismiss(job.id),
                          "Working copy removed. Any archived original stays.",
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {!jobs.length && (
                <p className="sv2-quiet">
                  Nothing staged. Drop CSVs anywhere on this page.
                </p>
              )}
              <footer className="sv2-panel-foot">
                <button
                  type="button"
                  className="primary"
                  disabled={!included.length}
                  onClick={() => setStep("layouts")}
                >
                  Set up {plural(included.length, "file", "files")}
                </button>
                <button
                  type="button"
                  className="sv2-inline"
                  disabled={busy || !jobs.length}
                  onClick={() => setModal("clear")}
                >
                  Clear staged copies
                </button>
              </footer>
            </section>
          )}

          {step === "layouts" && (
            <section className="sv2-panel sv2-split">
              <aside className="sv2-list">
                <h2>How each file reads</h2>
                <p className="sv2-quiet">
                  {needLayout.length
                    ? `${plural(needLayout.length, "file needs", "files need")} a layout.`
                    : "Every file can be read."}
                </p>
                <ul>
                  {included.map((job, index) => (
                    <li key={job.id} style={{ "--i": index }}>
                      <button
                        type="button"
                        className={`sv2-list-item${activeId === job.id ? " sv2-current" : ""}`}
                        onClick={() => {
                          setEditTemplate(null);
                          setActiveId(job.id);
                        }}
                      >
                        <i
                          className={`sv2-pip${job.schema ? " sv2-pip-on" : ""}`}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{job.filename}</strong>
                          <small>{layoutName(job)}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="sv2-inline"
                  onClick={() => setModal("layouts")}
                >
                  Manage saved layouts
                </button>
              </aside>
              <div className="sv2-detail">
                {activeJob ? (
                  <LayoutEditor
                    key={`${activeJob.id}:${editTemplate?.id || ""}:${editTemplate?.version || ""}`}
                    job={activeJob}
                    template={editTemplate}
                    busy={busy}
                    run={run}
                    onCancelEdit={() => setEditTemplate(null)}
                    onApplied={() => {
                      setEditTemplate(null);
                      setActiveId(null);
                    }}
                  />
                ) : (
                  <p className="sv2-quiet">Choose a file to set up.</p>
                )}
              </div>
              <footer className="sv2-panel-foot sv2-span">
                <button
                  type="button"
                  className="primary"
                  disabled={needLayout.length > 0}
                  onClick={() => setStep("accounts")}
                >
                  {needLayout.length
                    ? `${plural(needLayout.length, "file", "files")} still to map`
                    : "Continue to accounts"}
                </button>
              </footer>
            </section>
          )}

          {step === "accounts" && (
            <section className="sv2-panel">
              <header className="sv2-card-head">
                <div>
                  <h2>Which account is each file from?</h2>
                  <p className="sv2-quiet">
                    One account can take several files. A filename rule lets the
                    next export route itself.
                  </p>
                </div>
              </header>
              <AccountsStep
                jobs={included}
                accounts={accounts}
                busy={busy}
                run={run}
                layoutName={layoutName}
              />
              <footer className="sv2-panel-foot">
                <button
                  type="button"
                  className="primary"
                  disabled={needAccount.length > 0}
                  onClick={() => setStep("import")}
                >
                  {needAccount.length
                    ? `${plural(needAccount.length, "file", "files")} still need an account`
                    : "Continue to import"}
                </button>
              </footer>
            </section>
          )}

          {step === "import" && (
            <section className="sv2-panel sv2-import">
              <header className="sv2-card-head">
                <div>
                  <h2>Ready to import</h2>
                  <p className="sv2-quiet">
                    Each row is filed by its own date. Anything already recorded
                    is matched, not added again.
                  </p>
                </div>
              </header>
              <ul className="sv2-summary">
                {accounts
                  .filter((account) =>
                    included.some((job) => job.accountId === account.id),
                  )
                  .map((account, index) => (
                    <li
                      key={account.id}
                      style={{ "--sv2-account": account.color, "--i": index }}
                    >
                      <span className="sv2-summary-account">
                        <AccountDot color={account.color} />
                        {account.name}
                      </span>
                      <ul>
                        {included
                          .filter((job) => job.accountId === account.id)
                          .map((job) => (
                            <li key={job.id}>
                              <strong>{job.filename}</strong>
                              <small>{layoutName(job)}</small>
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
              </ul>
              {!canImport && (
                <p className="sv2-note" role="status">
                  {needLayout.length > 0 &&
                    `${plural(needLayout.length, "file", "files")} still need a layout. `}
                  {needAccount.length > 0 &&
                    `${plural(needAccount.length, "file", "files")} still need an account. `}
                  {failed.length > 0 &&
                    `${plural(failed.length, "file", "files")} could not be read. `}
                  Nothing imports until every included file is set up.
                </p>
              )}
              {progress && (
                <div className="sv2-progress" role="status">
                  <p className="sv2-progress-line">
                    <span>{progress.filename || "Working"}</span>
                    <span className="sv2-progress-count">
                      {progress.done} / {progress.total}
                    </span>
                  </p>
                  <progress
                    aria-label="Files imported"
                    value={progress.done}
                    max={progress.total || 1}
                  />
                </div>
              )}
              <footer className="sv2-panel-foot">
                <button
                  type="button"
                  className="primary"
                  disabled={!canImport || busy}
                  onClick={async () => {
                    const value = await run(() =>
                      api.processImportBatch(ready.map((job) => job.id)),
                    );
                    setProgress(null);
                    if (value !== false) {
                      setResults(value);
                      setStep("done");
                    }
                  }}
                >
                  Import {plural(included.length, "file", "files")}
                </button>
                {held.size > 0 && (
                  <span className="sv2-quiet">
                    {plural(held.size, "file", "files")} left out of this batch.
                  </span>
                )}
              </footer>
            </section>
          )}
        </div>
      )}

      {step === "done" && results && (
        <section className="sv2-panel sv2-results">
          <h2>
            {results.remaining ? "Imported, with some left over." : "Filed."}
          </h2>
          <p className="sv2-quiet">
            {results.completed} of {results.attempted} files read
            {results.remaining
              ? ` · ${plural(results.remaining, "file", "files")} still need attention`
              : ""}
            .
          </p>
          <div className="sv2-stats">
            <Stat value={results.added} label="rows added" />
            <Stat value={results.matched} label="already recorded" />
            <Stat value={countOf(results.files)} label="files read" />
            <Stat value={countOf(results.months)} label="months updated" />
          </div>
          {Array.isArray(results.months) && results.months.length > 0 && (
            <div className="sv2-chiprow">
              {results.months.map((month, index) => (
                <button
                  type="button"
                  className="sv2-chip"
                  key={month}
                  style={{ "--i": index }}
                  onClick={() => openLatest(month)}
                >
                  {monthLabel(month, true)}
                  <em>open</em>
                </button>
              ))}
            </div>
          )}
          {results.excluded > 0 && (
            <p className="sv2-quiet">
              {plural(results.excluded, "row", "rows")} were excluded by an
              earlier import and remain that way.
            </p>
          )}
          <footer className="sv2-panel-foot">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setResults(null);
                setStep(null);
              }}
            >
              Back to snapshots
            </button>
            {onReview && (
              <button type="button" onClick={onReview}>
                Organize these transactions
              </button>
            )}
            {results.remaining > 0 && (
              <button
                type="button"
                className="sv2-inline"
                onClick={() => {
                  setResults(null);
                  setStep("files");
                }}
              >
                See what is left
              </button>
            )}
          </footer>
        </section>
      )}

      {notice && (
        /* Keyed on the message so a new notice restarts both the entrance and
           the hairline that empties over the hold before it is cleared. */
        <div className="sv2-snack" key={notice} role="status" aria-live="polite">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      {modal === "history" && (
        <HistoryDialog
          data={data}
          onReveal={reveal}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "archive" && (
        <ArchiveDialog
          data={data}
          onReveal={reveal}
          onOpenSnapshot={(saved) => {
            setModal(null);
            onOpenSnapshot(saved);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "layouts" && (
        <LayoutLibrary
          jobs={included}
          onClose={() => setModal(null)}
          onEdit={(template, jobId) => {
            setModal(null);
            setEditTemplate(template);
            setActiveId(jobId);
            setStep("layouts");
          }}
        />
      )}
      {modal === "clear" && (
        <Sv2Dialog
          title="Clear staged copies"
          onClose={() => setModal(null)}
          footer={
            <div className="sv2-form-foot">
              <button type="button" onClick={() => setModal(null)}>
                Keep them
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                  const value = await run(
                    () => api.clear(),
                    (result) =>
                      `${plural(result?.cleared ?? 0, "working copy", "working copies")} cleared. Originals remain archived.`,
                  );
                  if (value !== false) setModal(null);
                }}
              >
                Clear copies
              </button>
            </div>
          }
        >
          <p>
            This removes the {plural(jobs.length, "working copy", "working copies")}{" "}
            waiting in the intake folder. Archived originals, saved snapshots and
            every imported transaction stay exactly as they are, and the
            workspace is never reset.
          </p>
          {onDesktop && (
            <p className="sv2-quiet sv2-gap">
              Other contents of the folder are left in place.
            </p>
          )}
        </Sv2Dialog>
      )}
    </section>
  );
}
