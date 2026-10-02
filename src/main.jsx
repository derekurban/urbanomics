import "./browser-api.js";
import "@derekurban/design-system/styles.css";
import "./icons.js";
import { Icon, Mark } from "@derekurban/design-system";
import "./theme.js";
import { Dashboard } from "./Dashboard.jsx";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./design-system.css";
import "./styles.css";
import { SnapshotsWorkspace } from "./SnapshotsWorkspace.jsx";
import { AccountsWorkspace } from "./AccountsWorkspace.jsx";
import { TransactionsWorkspace } from "./TransactionsWorkspace.jsx";
import { EventsWorkspace } from "./EventsWorkspace.jsx";
import { OrganizeHub } from "./OrganizeHub.jsx";
import {RenderRecovery} from './RenderRecovery.jsx';


import { OrganizeWorkspace } from "./OrganizeWorkspace.jsx";
import { ProcessingResults } from "./ProcessingResults.jsx";
import "./data-workspace.css";
import "./mobile.css";
import "./workspace-refresh.css";

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
  const [organizeSection, setOrganizeSection] = useState("category");
  const [organizeTarget,setOrganizeTarget]=useState(null);
  const openOrganize=(id=null,mode="transactions")=>{setOrganizeTarget({id,mode,key:Date.now()});setPage("organize");};
  const [data, setData] = useState(null),
    [page, setPage] = useState(() => {const hash=location.hash.slice(1);return ({allocations:"organize",experimental:"organize",review:"organize",months:"transactions"})[hash]||(["dashboard","snapshots","accounts","events","transactions","organize","settings"].includes(hash)?hash:"snapshots");}),
    [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    const update = event => setConnected(event.detail);
    window.addEventListener("urbanomics-connection", update);
    return () => window.removeEventListener("urbanomics-connection", update);
  }, []);
  const [progress, setProgress] = useState(null);
  const [processResult, setProcessResult] = useState(null);
  useEffect(
    () =>
      api?.onProgress((value) => {
        setSelectedJob(null);
        setProgress(value);
      }),
    [],
  );
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [month,setMonth]=useState(""),[accountFilter,setAccountFilter]=useState("");
  const [detail, setDetail] = useState(null),
    [selectedJob, setSelectedJob] = useState(null),
    [choices, setChoices] = useState({}),
    [revision, setRevision] = useState(null);
  async function refresh() {
    const next = await api.state();
    setData(next);

  }
  useEffect(() => {
    if (api) refresh().catch((e) => setError(e.message));
  }, []);
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
      if (result?.result)
        setProcessResult({ result: result.result, celebrate: true });
      if (message)
        setNotice(typeof message === "function" ? message(result) : message);
      return result;
    } catch (e) {
      await refresh().catch(() => {});
      setError(e.message);
      return false;
    } finally {
      setProgress(null);
      running.current = false;
      setBusy(false);
    }
  }
  async function intake(method) {
    setPage("snapshots");
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
    if(page === 'snapshots'){window.dispatchEvent(new CustomEvent('snapshots-drop',{detail:Array.from(event.dataTransfer.files)}));return;}
    if (!busy && event.dataTransfer.files.length)
      intake(() => api.stageDrop(Array.from(event.dataTransfer.files)));
  }
  if (!api)
    return (
      <div className="launch-message">
        <h1>Open your Urbanomics workspace.</h1>
        <p>
          Use npm run web for browser verification, or npm start for Electron.
        </p>
      </div>
    );
  if (!data)
    return (
      <div className="launch-message">
        <div className="brand">
          <Mark size={28} label="Urbanomics" /><span>urbanomics</span>
        </div>
        <p>{error || "Opening your local workspace…"}</p>
      </div>
    );
  const activeJob = data.jobs.find((j) => j.id === selectedJob);
  const tabs = [
    ["dashboard", "layout-dashboard", "Dashboard", "Overview"],
    ["snapshots", "layers", "Snapshots", "Workspace"],
    ["organize", "tags", "Organize"],
    ["transactions", "list", "Transactions"],
    ["events", "calendar-days", "Events"],
    ["accounts", "wallet", "Accounts"],
    ["settings", "settings", "Settings", "Preferences"],
  ];
  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        e.preventDefault();
        if (page !== "snapshots" && e.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <aside className="sidebar">
        <div className="brand">
          <Mark size={28} label="Urbanomics" /><span>urbanomics</span>
        </div>
        <p className="brand-sub">A little order. A clearer picture.</p>
        {api.host === "browser" && (
          <p className="browser-workspace-note">
            {api.workspaceMode === "desktop" ? "Connected to your desktop" : "Browser verification"}
            <br />
            <small>{api.workspaceMode === "desktop" ? "Your files and changes stay there" : "Separate local workspace · starts with sample data"}</small>
          </p>
        )}
        <nav aria-label="Main navigation">
          {tabs.map(([id, icon, label, group]) => (
            <React.Fragment key={id}>{group&&<div className="navigation-group">{group}</div>}
            <button
              key={id}
              className={page === id ? "nav-item active" : "nav-item"}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setPage(id);
                if (id === "transactions") {setRevision(null);setAccountFilter("");setMonth("");}
                setSelectedJob(null);
              }}
            >
              <span aria-hidden="true"><Icon name={icon} size={18} /></span>
              {label}
              {id === "snapshots" && data.jobs.length > 0 && (
                <b>{data.jobs.length}</b>
              )}
            </button></React.Fragment>
          ))}
        </nav>
        <div className="local-note">
          <span className="local-dot" /> Stored on this computer
          <small>Your files stay in your workspace.</small>
          <button onClick={() => run(() => api.reveal("private"))}>
            Open workspace ↗
          </button>
        </div>
      </aside>
      <div className="workspace">
        <div className="mobile-topbar"><strong><Mark size={24} label="Urbanomics" /><span>urbanomics</span></strong><span className={connected ? "mobile-connection" : "mobile-connection offline"}>{api.host !== "browser" ? "On this desktop" : !connected ? "Reconnecting…" : api.workspaceMode === "desktop" ? "Desktop connected" : "Sample workspace"}</span></div>
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            {tabs.find((t) => t[0] === page)?.[2]}
          </div>
        </header>
        <main>
          {!connected && api.host === "browser" && <div className="alert error" role="status">Connection lost. Keep your desktop awake, Urbanomics open, and Tailscale connected. New changes need a connection to save.</div>}
          {(error || data.archiveError || data.configurationError) && (
            <div className="alert error" role="alert">
              {error || data.archiveError || data.configurationError}
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
                <Icon name="x" size={16} />
              </button>
            </div>
          )}
          {processResult && (
            <ProcessingResults
              {...processResult}
              onClose={() => setProcessResult(null)}
            />
          )}
          {page === "dashboard" && (
            <Dashboard
              data={data}
              onSource={(id) =>
                api
                  .detail(id)
                  .then(setDetail)
                  .catch((e) => setError(e.message))
              }
            />
          )}
          {page === "snapshots" && <SnapshotsWorkspace data={data} onRefresh={refresh} onReview={()=>openOrganize()} onOpenSnapshot={async(target)=>{try{const saved=await api.snapshot(target.id);setMonth(target.month);setAccountFilter(target.accountId);setRevision(saved);setPage("transactions");}catch(e){setError(e.message);}}}/>}
          {page === "accounts" && <AccountsWorkspace data={data} run={run} busy={busy} onSnapshots={()=>setPage("snapshots")} onSource={id=>api.detail(id).then(setDetail).catch(e=>setError(e.message))} />}
          {page === "organize" && <OrganizeHub data={data} run={run} busy={busy} target={organizeTarget} onSource={id=>api.detail(id).then(setDetail).catch(e=>setError(e.message))} />}
          {page === "events" && <EventsWorkspace data={data} run={run} busy={busy} onOrganize={openOrganize} onSource={id=>api.detail(id).then(setDetail).catch(e=>setError(e.message))} />}
          {page === "transactions" && <TransactionsWorkspace data={data} run={run} busy={busy} initialMonth={month} initialAccount={accountFilter} snapshot={revision} onCurrent={()=>setRevision(null)} onOrganize={openOrganize} onSource={id=>api.detail(id).then(setDetail).catch(e=>setError(e.message))} />}
          {page === "settings" && <OrganizeWorkspace data={data} run={run} busy={busy} section={organizeSection} onSection={setOrganizeSection} onNavigate={target=>{if(target==="accounts"||target==="events"||target==="transactions")setPage(target);else openOrganize(null,target.startsWith("transfers")?"transfers":"transactions");}} />}
        </main>
        <footer>
          <span>Urbanomics · local workspace</span>
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
              <Icon name="x" size={18} />
            </button>
            
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
            {(activeJob.status === "overlap" ||
              activeJob.conflicts.length > 0) && (
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
            {(["error", "finalizing"].includes(activeJob.status) ||
              (activeJob.status === "queued" &&
                !activeJob.conflicts.length)) && (
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
              <Icon name="x" size={18} />
            </button>
            
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
      (r) =>
        r.result.completed
          ? "Account assigned and import processed."
          : "Account assigned. Check Dropbox for the import issue.",
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
        Add account & import
      </button>
    </>
  );
}
createRoot(document.getElementById("root")).render(<RenderRecovery><App /></RenderRecovery>);
