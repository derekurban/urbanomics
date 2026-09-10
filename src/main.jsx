import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { DataWorkspace } from "./DataWorkspace.jsx";
import { AccountSettings } from "./AccountSettings.jsx";
import { ProcessingResults } from "./ProcessingResults.jsx";
import "./data-workspace.css";

const api = window.urbanomics;
const banks = { pc: "PC Financial", eq: "EQ Bank", simplii: "Simplii" };
const currency = (n) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    n / 100,
  );
const monthName = (m, short = false) =>
  new Date(`${m}-15T12:00:00`).toLocaleDateString("en-CA", {
    month: short ? "short" : "long",
    year: "numeric",
  });
const dateName = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

function App() {
  const [data, setData] = useState(null),
    [page, setPage] = useState("data"),
    [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [progress, setProgress] = useState(null);
  const [processResult, setProcessResult] = useState(null);
  useEffect(() => api?.onProgress(setProgress), []);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [month, setMonth] = useState(""),
    [rows, setRows] = useState([]),
    [search, setSearch] = useState(""),
    [accountFilter, setAccountFilter] = useState("");
  const [detail, setDetail] = useState(null),
    [selectedJob, setSelectedJob] = useState(null),
    [choices, setChoices] = useState({}),
    [revision, setRevision] = useState(null);
  async function refresh() {
    const next = await api.state();
    setData(next);
    const selected = month || next.months[0]?.month || next.scope.throughMonth;
    setMonth(selected);
    setRows(await api.transactions(selected));
  }
  useEffect(() => {
    if (api) refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let current = true;
    if (api && month) {
      api
        .transactions(month)
        .then((rows) => {
          if (current) setRows(rows);
        })
        .catch((e) => setError(e.message));
    }
    return () => {
      current = false;
    };
  }, [month]);
  useEffect(() => {
    if (!selectedJob && !detail) return;
    const previous = document.activeElement;
    const modal = document.querySelector('[role="dialog"]');
    modal?.querySelector("button")?.focus();
    const keyboard = (e) => {
      if (e.key === "Escape") {
        setSelectedJob(null);
        setDetail(null);
      }
      if (e.key === "Tab" && modal) {
        const items = [
          ...modal.querySelectorAll(
            "button:not(:disabled),input:not(:disabled)",
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [selectedJob, detail]);
  useEffect(
    () =>
      api?.onChanged((message) => {
        if (message) setError(message);
        refresh().catch((e) => setError(e.message));
      }),
    [month],
  );
  async function run(fn, message) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      await refresh();
      if (message)
        setNotice(typeof message === "function" ? message(result) : message);
      return result;
    } catch (e) {
      await refresh().catch(() => {});
      setError(e.message);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function intake(method) {
    setPage("data");
    await run(method, (result) =>
      result.ids.length
        ? `${result.ids.length} CSV${result.ids.length === 1 ? "" : "s"} received${result.skipped ? `. ${result.skipped} non-CSV, subfolder, or oversized item(s) skipped` : ""}. Originals stay where they are.`
        : result.skipped
          ? "No supported CSV files in that selection."
          : "No files selected.",
    );
  }
  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (!busy) intake(() => api.drop(Array.from(event.dataTransfer.files)));
  }
  if (!api)
    return (
      <div className="launch-message">
        <h1>Urbanomics is a desktop app.</h1>
        <p>Launch with npm start to connect to your local workspace.</p>
      </div>
    );
  if (!data)
    return (
      <div className="launch-message">
        <div className="brand">
          urbanomics<span>●</span>
        </div>
        <p>{error || "Opening your local workspace…"}</p>
      </div>
    );
  const activeJob = data.jobs.find((j) => j.id === selectedJob);
  const shown = (revision?.transactions || rows).filter(
    (r) =>
      (!accountFilter || r.accountId === accountFilter) &&
      `${r.description} ${r.type}`.toLowerCase().includes(search.toLowerCase()),
  );
  const imports = data.history;
  const openJob = (job) => {
    setSelectedJob(job.id);
    setChoices({});
  };
  const tabs = [
    ["data", "▤", "Snapshots"],
    ["months", "▦", "Transactions"],
    ["accounts", "◎", "Accounts"],
  ];
  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <aside className="sidebar">
        <div className="brand">
          urbanomics<span>●</span>
        </div>
        <p className="brand-sub">A little order. A clearer picture.</p>
        <nav>
          {tabs.map(([id, icon, label]) => (
            <button
              key={id}
              className={page === id ? "nav-item active" : "nav-item"}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setPage(id);
                setSelectedJob(null);
              }}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
              {id === "data" && data.jobs.length > 0 && (
                <b>{data.jobs.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="side-divider" />
        <div className="side-label">YOUR MONTHS</div>
        <div className="month-list">
          {data.months.length ? (
            data.months.map((m) => (
              <button
                className={
                  page === "months" && month === m.month
                    ? "month-button active"
                    : "month-button"
                }
                key={m.month}
                onClick={() => {
                  setRevision(null);
                  setAccountFilter("");
                  setMonth(m.month);
                  setPage("months");
                }}
              >
                <span>{monthName(m.month, true)}</span>
                <small>{m.count}</small>
              </button>
            ))
          ) : (
            <p className="sidebar-empty">Your first import starts the story.</p>
          )}
        </div>
        <div className="local-note">
          <span className="local-dot" /> Stored on this computer
          <small>Your files stay in your workspace.</small>
          <button onClick={() => run(() => api.reveal("private"))}>
            Open workspace ↗
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            {tabs.find((t) => t[0] === page)?.[2]}
          </div>
          <span className="scope-chip">
            Through {monthName(data.scope.throughMonth, true)}
          </span>
        </header>
        <main>
          {(error || data.archiveError) && (
            <div className="alert error" role="alert">
              {error || data.archiveError}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div className="notice snackbar" role="status" aria-live="polite">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {processResult && (
            <ProcessingResults
              {...processResult}
              onClose={() => setProcessResult(null)}
            />
          )}
          {page === "data" && (
            <DataWorkspace
              data={data}
              busy={busy}
              progress={progress}
              onResults={() =>
                setProcessResult({
                  result: data.lastProcessResult,
                  celebrate: false,
                })
              }
              onUpload={() => intake(() => api.choose(false))}
              onChooseFolder={() => intake(() => api.choose(true))}
              onScan={() =>
                run(
                  () => api.scan(),
                  (r) =>
                    r.skipped
                      ? "Dropbox refreshed. Non-CSV, oversized items and subfolders were left in place."
                      : "Snapshots refreshed.",
                )
              }
              onProcess={async () => {
                const result = await run(async () => {
                  setProgress({
                    done: 0,
                    total: data.jobs.filter((j) => j.status === "queued")
                      .length,
                    filename: null,
                  });
                  try {
                    return await api.process();
                  } finally {
                    setProgress(null);
                  }
                });
                if (result !== false)
                  setProcessResult({ result, celebrate: true });
              }}
              onClear={() =>
                run(
                  () => api.clear(),
                  (r) =>
                    r.cleared +
                    " intake copies cleared. Originals remain archived; other folder contents stay in place.",
                )
              }
              onReview={openJob}
              onDismiss={(id) =>
                run(
                  () => api.dismiss(id),
                  "Intake copy removed. Original remains archived.",
                )
              }
              onReveal={(kind, id) => run(() => api.reveal(kind, id))}
              onOpenSnapshot={async (target) => {
                try {
                  const saved = await api.snapshot(target.id);
                  setMonth(target.month);
                  setAccountFilter(target.accountId);
                  setRevision(saved);
                  setPage("months");
                } catch (e) {
                  setError(e.message);
                }
              }}
              onRange={() => setPage("accounts")}
            />
          )}
          {page === "months" && (
            <>
              <div className="page-heading split-heading">
                <div>
                  <div className="eyebrow">ONE MONTH AT A TIME</div>
                  <h1>{monthName(month)}</h1>
                  <p>Your imported transactions, together in one place.</p>
                </div>
                <span className="pill">
                  {revision ? "Saved snapshot" : "Current snapshot"}
                </span>
              </div>
              <div className="month-toolbar">
                <div className="segmented">
                  <button
                    className={!accountFilter ? "selected" : ""}
                    onClick={() => setAccountFilter("")}
                  >
                    All accounts
                  </button>
                  {data.accounts.map((a) => (
                    <button
                      key={a.id}
                      className={accountFilter === a.id ? "selected" : ""}
                      onClick={() => setAccountFilter(a.id)}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Search transactions"
                  placeholder="Search this month…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="table-caption">
                <span>{shown.length} transactions</span>
                <span>Bank-export dates · CAD · financial review pending</span>
              </div>
              <section className="transaction-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Transaction</th>
                      <th>Account</th>
                      <th className="amount">Cash movement</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => (
                      <tr key={row.id}>
                        <td className="date-cell">{dateName(row.date)}</td>
                        <td>
                          <button
                            className="transaction-name"
                            onClick={() =>
                              api
                                .detail(row.id)
                                .then(setDetail)
                                .catch((e) => setError(e.message))
                            }
                          >
                            {row.description}
                          </button>
                          <small className="bank-type">
                            {row.type || "Bank transaction"}
                          </small>
                        </td>
                        <td>
                          <span className="account-dot" />
                          {row.account}
                        </td>
                        <td
                          className={
                            "amount " + (row.amountCents > 0 ? "positive" : "")
                          }
                        >
                          {row.amountCents > 0 ? "+" : ""}
                          {currency(row.amountCents)}
                        </td>
                        <td>
                          <button
                            className="row-open"
                            aria-label={`View source for ${row.description}`}
                            onClick={() =>
                              api
                                .detail(row.id)
                                .then(setDetail)
                                .catch((e) => setError(e.message))
                            }
                          >
                            ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!shown.length && (
                  <p className="empty-text">
                    No imported rows match this view.
                  </p>
                )}
              </section>
              <p className="footnote">
                These are cash movements, before tags, repayments, and transfer
                review. Bank exports may show different dates from your local
                banking screen.
              </p>
              {revision && (
                <button onClick={() => setRevision(null)}>
                  Back to current transactions
                </button>
              )}
            </>
          )}
          {page === "accounts" && (
            <Accounts data={data} run={run} busy={busy} />
          )}
        </main>
        <footer>
          <span>URBANOMICS / LOCAL WORKSPACE</span>
          <span>{busy ? "Saving…" : "Your data stays with you."}</span>
        </footer>
      </div>
      {dragging && (
        <div className="drop-overlay">
          <div>
            <span>↓</span>
            <h1>Let’s put these in order.</h1>
            <p>Release to add CSVs to Dropbox.</p>
          </div>
        </div>
      )}
      {activeJob && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review import"
          >
            <button
              className="close"
              aria-label="Close import review"
              onClick={() => setSelectedJob(null)}
            >
              ×
            </button>
            <div className="eyebrow">IMPORT REVIEW</div>
            <h2>
              {activeJob.status === "routing"
                ? "Where does this belong?"
                : activeJob.status === "overlap"
                  ? "We’ve seen something similar."
                  : "Let’s check this file."}
            </h2>
            <p>{activeJob.filename}</p>
            {activeJob.status === "routing" && (
              <Route
                job={activeJob}
                data={data}
                run={run}
                done={() => setSelectedJob(null)}
              />
            )}
            {activeJob.status === "overlap" && (
              <>
                <p className="explanation">
                  Different exports can contain the same transactions. Check the
                  matching rows below. Identical repeated payments within a file
                  are preserved.
                </p>
                <div className="conflict-list">
                  {activeJob.conflicts.map((c) => (
                    <div className="conflict" key={c.fingerprint}>
                      <div>
                        <strong>{c.description}</strong>
                        <small>
                          {c.date} · {currency(c.amountCents)} · {c.incoming} in
                          this file, {c.existing} already here
                        </small>
                      </div>
                      <div className="segmented">
                        <button
                          className={
                            choices[c.fingerprint] === "match" ? "selected" : ""
                          }
                          onClick={() =>
                            setChoices({ ...choices, [c.fingerprint]: "match" })
                          }
                        >
                          Same transaction{c.matches > 1 ? "s" : ""}
                        </button>
                        <button
                          className={
                            choices[c.fingerprint] === "keep" ? "selected" : ""
                          }
                          onClick={() =>
                            setChoices({ ...choices, [c.fingerprint]: "keep" })
                          }
                        >
                          Additional payment{c.incoming > 1 ? "s" : ""}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    setChoices(
                      Object.fromEntries(
                        activeJob.conflicts.map((c) => [
                          c.fingerprint,
                          "match",
                        ]),
                      ),
                    )
                  }
                >
                  Mark all as existing transactions
                </button>
                <button
                  className="primary full"
                  disabled={
                    busy ||
                    activeJob.conflicts.some((c) => !choices[c.fingerprint])
                  }
                  onClick={() =>
                    run(
                      () => api.resolve(activeJob.id, choices),
                      "Match decisions saved.",
                    ).then((result) => {
                      if (result !== false) setSelectedJob(null);
                    })
                  }
                >
                  Save decisions & finish import
                </button>
              </>
            )}
            {["error", "finalizing", "queued"].includes(activeJob.status) && (
              <>
                <div className="alert error">
                  {activeJob.error ||
                    "The database has been saved. Finish writing the archive to clear the intake copy."}
                </div>
                {activeJob.accountId && (
                  <button
                    onClick={() =>
                      run(
                        () => api.resolve(activeJob.id, {}),
                        "Import retried.",
                      )
                    }
                  >
                    Retry
                  </button>
                )}
              </>
            )}
            {activeJob.status !== "finalizing" && (
              <button
                className="text-button dismiss-job"
                onClick={() =>
                  run(
                    () => api.dismiss(activeJob.id),
                    "Removed from intake. Original remains archived.",
                  ).then((result) => {
                    if (result !== false) setSelectedJob(null);
                  })
                }
              >
                Remove from intake · keep original archived
              </button>
            )}
          </section>
        </div>
      )}
      {detail && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Transaction source"
          >
            <button
              className="close"
              aria-label="Close transaction"
              onClick={() => setDetail(null)}
            >
              ×
            </button>
            <div className="eyebrow">BACK TO THE SOURCE</div>
            <h2>{detail.description}</h2>
            <div className="detail-amount">{currency(detail.amountCents)}</div>
            <p>
              {detail.date}
              {detail.time ? ` · ${detail.time} (as exported)` : ""} · CAD
            </p>
            <h3>Original bank values</h3>
            <div className="raw-values">
              {detail.raw.map((v, i) => (
                <span key={i}>{v || "(blank)"}</span>
              ))}
            </div>
            <h3>Source records</h3>
            {detail.sources.map((s) => (
              <div className="source-row" key={s.hash + ":" + s.record}>
                <div>
                  <strong>{s.filename}</strong>
                  <small>CSV record {s.record}</small>
                </div>
                <button onClick={() => run(() => api.reveal("source", s.hash))}>
                  Show original ↗
                </button>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Route({ job, data, run, done }) {
  const accounts = data.accounts.filter((a) => a.schema === job.schema);
  const [name, setName] = useState(""),
    [kind, setKind] = useState(job.schema === "pc" ? "credit" : "chequing"),
    [remember, setRemember] = useState(true);
  async function choose(id) {
    const result = await run(
      () => api.route(job.id, id, remember),
      "Account assigned. Ready to process from Dropbox.",
    );
    if (result !== false) done();
  }
  return (
    <>
      <p className="muted">
        We recognize {banks[job.schema]}. Choose the account to keep separate
        accounts separate.
      </p>
      <div className="account-choices">
        {accounts.map((a) => (
          <button key={a.id} onClick={() => choose(a.id)}>
            <span className="bank-avatar">{initials(a.name)}</span>
            {a.name}
            <span>→</span>
          </button>
        ))}
      </div>
      <h3>Or add an account</h3>
      <input
        aria-label="New account name"
        placeholder="e.g. Mastercard"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="segmented">
        {["credit", "chequing", "savings"].map((k) => (
          <button
            key={k}
            className={kind === k ? "selected" : ""}
            onClick={() => setKind(k)}
          >
            {k === "credit" ? "Credit card" : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Remember this bank and filename pattern
      </label>
      <button
        className="primary full"
        disabled={!name.trim()}
        onClick={async () => {
          const id = await run(() => api.addAccount(name, job.schema, kind));
          if (id) await choose(id);
        }}
      >
        Add account & queue
      </button>
    </>
  );
}
function Accounts({ data, run, busy }) {
  const [start, setStart] = useState(data.scope.startMonth),
    [through, setThrough] = useState(data.scope.throughMonth);
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">A PLACE FOR EACH ACCOUNT</div>
        <h1>Your accounts, your rules.</h1>
        <p>Recognize repeat exports without guessing where they belong.</p>
      </div>
      <AccountSettings data={data} busy={busy} run={run} />
      <section className="section settings-card">
        <h2>Monthly import range</h2>
        <p>
          Later rows are archived with the source, but stay out of monthly
          snapshots. Re-drop an original after extending the range to bring
          those rows in.
        </p>
        <div className="range-form">
          <label>
            Start month
            <input
              type="month"
              aria-label="Start month"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Through month
            <input
              type="month"
              aria-label="Through month"
              max={data.lastCompleteMonth}
              value={through}
              onChange={(e) => setThrough(e.target.value)}
            />
          </label>
          <button
            className="primary"
            onClick={() =>
              run(
                () => api.setScope(start, through),
                "Import range saved. Existing archived snapshots remain intact.",
              )
            }
          >
            Save range
          </button>
        </div>
      </section>
      <section className="section">
        <h2>Remembered filenames</h2>
        <p className="muted">
          Bank layout + filename pattern. Unfamiliar or ambiguous names ask for
          an account.
        </p>
        {data.rules.map((r) => (
          <div className="rule-row" key={r.key + r.account_id}>
            <code>{r.key}</code>
            <span>→ {r.account}</span>
            <button
              onClick={() =>
                run(
                  () => api.removeRule(r.key, r.schema, r.account_id),
                  "Filename rule removed.",
                )
              }
            >
              Forget
            </button>
          </div>
        ))}
      </section>
      <div className="privacy-card">
        <span className="local-dot" />
        <div>
          <h3>Local by design</h3>
          <p>
            Your database, originals, snapshots, and browser cache stay in the
            private workspace. No bank connections or cloud uploads.
          </p>
          <button onClick={() => run(() => api.reveal("private"))}>
            Open private workspace ↗
          </button>
        </div>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
