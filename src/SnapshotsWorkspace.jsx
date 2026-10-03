import { Icon } from "@derekurban/design-system";
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
import { GuidedSetup } from "./snapshots-v2-guided.jsx";
import { GuideDialog } from "./snapshots-v2-guide.jsx";
import { ArchiveDialog, HistoryDialog } from "./snapshots-v2-archive.jsx";
import { dropKind, skippedNote, splitCsvFiles } from "./drop-kind.js";


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
  const [step, setStep] = useState(() => (jobs.length ? "setup" : null));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [progress, setProgress] = useState(null),
    [results, setResults] = useState(null);
  const [activeId, setActiveId] = useState(null),
    [editTemplate, setEditTemplate] = useState(null);
  // null, or what a file drag over this page carries: 'accept', 'mixed' or 'reject' (see drop-kind.js).
  const [modal, setModal] = useState(null),
    [dragging, setDragging] = useState(null);
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

  const included = jobs;
  const needLayout = included.filter((job) => !job.schema);
  const needAccount = included.filter((job) => job.schema && !job.accountId);
  const failed = included.filter((job) => job.schema && job.status === "error");
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
  const stage = (work, filtered = 0) =>
    run(async () => {
      const value = await work();
      if (value?.ids?.length) setStep("setup");
      return value;
    }, (value) => {
      const added = value?.ids?.length || 0;
      const left = value?.skipped
        ? ` ${plural(value.skipped, "item was", "items were")} skipped: not a CSV, a subfolder, or too large.`
        : "";
      const dropped = filtered ? ` ${skippedNote(filtered)}` : "";
      return added
        ? `${plural(added, "file", "files")} added.${left}${dropped}`
        : `Nothing added.${left || dropped || " No files selected."}`;
    });

  // Dropped files are filtered by name first: only CSV exports reach the server.
  const dropFiles = (list) => {
    const files = Array.from(list || []);
    const { csv, skipped: filtered } = splitCsvFiles(files);
    if (!csv.length) {
      if (filtered) setNotice(skippedNote(filtered));
      return;
    }
    stage(() => api.stageDrop(csv), filtered);
  };
  const dropRef = useRef(dropFiles);dropRef.current=dropFiles;
  useEffect(()=>{const dropped=event=>dropRef.current(event.detail);window.addEventListener('snapshots-drop',dropped);return ()=>window.removeEventListener('snapshots-drop',dropped);},[]);
  const previousJobs=useRef(jobs.length);
  useEffect(()=>{if(jobs.length>previousJobs.current&&!step)setStep('files');previousJobs.current=jobs.length;},[jobs.length]);
  const reveal = (kind, id) => run(() => api.reveal(kind, id));
  const openLatest = (month) => {
    const saved = snapshots
      .filter((snapshot) => snapshot.month === month)
      .sort((a, b) => (b.revision || 0) - (a.revision || 0))[0];
    if (saved) onOpenSnapshot(saved);
  };

  const hover = (event) => {
    const kind = dropKind(event.dataTransfer);
    if (!kind) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === "reject") event.dataTransfer.dropEffect = "none";
    setDragging(kind);
  };
  const dragProps = {
    onDragEnter: hover,
    onDragOver: hover,
    onDragLeave: (event) => {
      event.stopPropagation();
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(null);
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(null);
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length && !busy) dropFiles(files);
    },
  };
  const dropCopy = {
    accept: "Drop to add them. Nothing imports until you say so.",
    mixed: "Drop to add the CSV files. Other files are skipped.",
    reject: "Only CSV exports can be added here",
  };

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
      className={`sv2${dragging ? ` sv2-dragging sv2-drop-${dragging}` : ""}`}
      aria-label="Snapshots"
      {...dragProps}
    >
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
            <h1>Start with a bank export.</h1>
            <p className="sv2-lede">
              Download a CSV of your account activity and bring it here. Every
              transaction is filed into its account and month, and the file is
              kept exactly as it came.
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
            </div>
            <p className="sv2-landing-hint">
              {dragging && (
                <span className="sv2-landing-hint-icon" aria-hidden="true">
                  <Icon name={dragging === "reject" ? "file-x" : "file-down"} size={16} />
                </span>
              )}
              <span>{dropCopy[dragging] || "or drop files anywhere on this page"}</span>
            </p>
            <button type="button" className="sv2-inline sv2-landing-guide" onClick={() => setModal("guide")}>
              How importing works
            </button>
          </div>
          <ul className="sv2-landing-notes">
            <li>
              Filed by the dates inside the file
              <InfoDot label="Monthly records">
                <span>
                  A snapshot is one account’s transactions for one calendar
                  month. An export that spans two months updates both, and a
                  partial export adds its rows without removing anything already
                  recorded.
                </span>
              </InfoDot>
            </li>
            <li>
              Exporting again never counts twice
              <InfoDot label="Repeat exports">
                <span>
                  Each row carries a fingerprint of its account, date,
                  description and exact amount. A row already recorded is
                  matched instead of added, and two identical payments on the
                  same day stay two payments.
                </span>
              </InfoDot>
            </li>
            <li>
              Originals stay on this computer
              <InfoDot label="Your originals">
                <span>
                  The file you add is copied into this computer’s archive with
                  its checksum and kept unchanged, next to every snapshot it
                  produced. Nothing is sent anywhere.
                </span>
              </InfoDot>
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
              <button type="button" className="sv2-inline" onClick={() => setModal("guide")}>
                How it works
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
                            : " "}
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
                Accounts appear here once a file is assigned to one.
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

          <section className={`sv2-dock${dragging ? ` sv2-over sv2-over-${dragging}` : ""}`}>
            <div className="sv2-dock-mark" aria-hidden="true">
              <FileGlyph />
              <FileGlyph />
            </div>
            <div className="sv2-dock-text">
              <strong>
                {dragging === "reject"
                  ? "Only CSV exports can be added here"
                  : dragging
                    ? "Drop to add them"
                    : jobs.length
                      ? `${plural(jobs.length, "file is", "files are")} waiting to be set up`
                      : "Add exports"}
              </strong>
              <p className="sv2-quiet">
                {dragging === "reject"
                  ? "Other files stay where they are."
                  : dragging === "mixed"
                    ? "Only the CSV files are added."
                    : "Drop CSVs anywhere on this page. Nothing imports until you say so."}
              </p>
            </div>
            <div className="sv2-dock-actions">
              {jobs.length > 0 && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setStep("setup")}
                >
                  Set up {plural(jobs.length, "file", "files")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => stage(() => api.stageChoose(false))}
              >
                Choose CSV files
              </button>
            </div>
          </section>
        </div>
      )}

      {step === "setup" && (
        <GuidedSetup
          jobs={jobs}
          accounts={accounts}
          templates={templates}
          run={run}
          busy={busy}
          progress={progress}
          settled={settled}
          onImported={(value) => { setProgress(null); setResults(value); setStep("done"); }}
          onBack={() => setStep(null)}
          onRemoveAll={() => setModal("clear")}
          onGuide={() => setModal("guide")}
        />
      )}

      {step === "done" && results && (
        <section className="sv2-panel sv2-results">
          <h2>
            {results.remaining ? "Imported, with some left over." : "Filed."}
          </h2>
          <p className="sv2-quiet">
            {results.completed} of {plural(results.attempted, "file", "files")} imported
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
              {plural(results.excluded, "row", "rows")} were left out by an
              earlier import and stay that way.
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
                  setStep("setup");
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
            <Icon name="x" size={16} />
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
      {modal === "guide" && <GuideDialog onClose={() => setModal(null)} />}
      {editTemplate && jobs.find((job) => job.id === activeId) && (
        <Sv2Dialog title={`Edit layout “${editTemplate.name}”`} onClose={() => setEditTemplate(null)} wide>
          <LayoutEditor
            key={`${activeId}:${editTemplate.id}:${editTemplate.version}`}
            job={jobs.find((job) => job.id === activeId)}
            template={editTemplate}
            busy={busy}
            run={run}
            onCancelEdit={() => setEditTemplate(null)}
            onApplied={() => setEditTemplate(null)}
          />
        </Sv2Dialog>
      )}
      {modal === "layouts" && (
        <LayoutLibrary
          jobs={included}
          onClose={() => setModal(null)}
          onEdit={(template, jobId) => {
            setModal(null);
            setEditTemplate(template);
            setActiveId(jobId);
            setStep("setup");
          }}
        />
      )}
      {modal === "clear" && (
        <Sv2Dialog
          title="Remove all files"
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
                      `${plural(result?.cleared ?? 0, "file", "files")} removed. Archived originals stay.`,
                  );
                  if (value !== false) setModal(null);
                }}
              >
                Remove files
              </button>
            </div>
          }
        >
          <p>
            This removes the {plural(jobs.length, "file", "files")} waiting to be set
            up. Archived originals and everything already imported stay as they are.
          </p>
        </Sv2Dialog>
      )}
    </section>
  );
}
