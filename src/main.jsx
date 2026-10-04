import "./browser-api.js";
import "@derekurban/design-system/styles.css";
import "./icons.js";
import { Icon, Mark } from "@derekurban/design-system";
import "./theme.js";
import { readSidebarPinned, saveSidebarPinned } from "./sidebar.js";
import { dropKind, skippedNote, splitCsvFiles } from "./drop-kind.js";
import { Dashboard } from "./Dashboard.jsx";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./design-system.css";
import "./shared-ui.css";
import "./styles.css";
import { SnapshotsWorkspace } from "./SnapshotsWorkspace.jsx";
import { AccountsWorkspace } from "./AccountsWorkspace.jsx";
import { TransactionsWorkspace } from "./TransactionsWorkspace.jsx";
import { EventsWorkspace } from "./EventsWorkspace.jsx";
import { OrganizeDesk } from "./OrganizeDesk.jsx";
import { RenderRecovery } from "./RenderRecovery.jsx";
import { OrganizeWorkspace } from "./OrganizeWorkspace.jsx";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { ToastRegion, notify } from "./toast.jsx";
import { Alert } from "./ui.jsx";
import "./mobile.css";
import "./workspace-refresh.css";

const api = window.urbanomics;
const pages = ["dashboard", "snapshots", "organize", "transactions", "events", "accounts", "settings"];
// Older addresses keep working: retired pages open their replacements.
const legacy = { allocations: "organize", experimental: "organize", review: "organize", months: "transactions", data: "snapshots", "snapshots-v2": "snapshots" };
function readLocation() {
  const [head, section] = location.hash.slice(1).split("/");
  const page = legacy[head] || (pages.includes(head) ? head : "snapshots");
  return { page, section: page === "settings" ? section || "" : "" };
}
const money = (cents, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
const hostLabel = () =>
  api.host !== "browser" ? "On this computer" : api.workspaceMode === "desktop" ? "Connected to your desktop" : "Sample workspace";

function App() {
  const initial = readLocation();
  const [organizeSection, setOrganizeSection] = useState(initial.section || "category");
  const [organizeTarget, setOrganizeTarget] = useState(null);
  const [data, setData] = useState(null),
    [page, setPageState] = useState(initial.page),
    [busy, setBusy] = useState(false);
  const running = useRef(false);
  // The address follows the page (and the Settings section), so back, forward and reload work.
  const go = (next, section = next === "settings" ? organizeSection : "") => {
    const hash = "#" + next + (next === "settings" && section ? "/" + section : "");
    if (location.hash !== hash) history.pushState(null, "", hash);
    setPageState(next);
  };
  useEffect(() => {
    const sync = () => {
      const { page: next, section } = readLocation();
      setPageState(next);
      if (section) setOrganizeSection(section);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    if (location.hash !== "#" + initial.page + (initial.section ? "/" + initial.section : "")) history.replaceState(null, "", "#" + initial.page + (initial.page === "settings" ? "/" + (initial.section || "category") : ""));
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  const openOrganize = (id = null, mode = "transactions") => {
    setOrganizeTarget({ id, mode, key: Date.now() });
    go("organize");
  };
  const [connected, setConnected] = useState(true);
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    let live = true;
    api?.updatesState?.().then((s) => { if (live) setUpdate(s); }).catch(() => {});
    const off = api?.onUpdate?.((s) => { if (live) setUpdate(s); });
    return () => { live = false; off?.(); };
  }, []);
  useEffect(() => { if (api?.host !== "browser" && update && update.build !== "release") document.title = "Urbanomics (development)"; }, [update?.build]);
  useEffect(() => {
    const listen = (event) => setConnected(event.detail);
    window.addEventListener("urbanomics-connection", listen);
    return () => window.removeEventListener("urbanomics-connection", listen);
  }, []);
  const [error, setError] = useState(""),
    [dragging, setDragging] = useState(null);
  // Unpinned, the sidebar is an icon rail that opens over the page while hovered or keyboard-focused.
  const [pinned, setPinned] = useState(readSidebarPinned),
    [railOpen, setRailOpen] = useState(false);
  const railTimer = useRef(null);
  useEffect(() => () => clearTimeout(railTimer.current), []);
  const openRail = () => {
    clearTimeout(railTimer.current);
    setRailOpen(true);
  };
  const closeRail = (delay = 150) => {
    clearTimeout(railTimer.current);
    railTimer.current = setTimeout(() => setRailOpen(false), delay);
  };
  const togglePinned = () => {
    const next = saveSidebarPinned(!pinned);
    setPinned(next);
    // Unpinning under the pointer keeps the rail open until the pointer leaves.
    if (!next) openRail();
  };
  const [month, setMonth] = useState(""),
    [accountFilter, setAccountFilter] = useState("");
  const [detail, setDetail] = useState(null),
    [revision, setRevision] = useState(null),
    [loadError, setLoadError] = useState("");
  async function refresh() {
    const next = await api.state();
    setData(next);
    setLoadError("");
  }
  const load = () => refresh().catch((e) => setLoadError(e.message));
  useEffect(() => {
    if (api) load();
  }, []);
  useEffect(
    () =>
      api?.onChanged((message) => {
        if (message) setError(message);
        refresh().catch((e) => setError(e.message));
      }),
    [month],
  );
  // local: the caller shows its own error (a dialog or page), so the shell banner stays quiet.
  async function run(fn, message, { local = false } = {}) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await refresh();
      if (message) notify({ title: typeof message === "function" ? message(result) : message, tone: "success" });
      return result;
    } catch (e) {
      await refresh().catch(() => {});
      if (!local) setError(e.message);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function intake(method, clientSkipped = 0) {
    go("snapshots");
    const filtered = clientSkipped ? ` ${skippedNote(clientSkipped)}` : "";
    await run(method, (result) =>
      (result.ids.length
        ? `${result.ids.length} CSV ${result.ids.length === 1 ? "file" : "files"} added${result.skipped ? `. ${result.skipped} other ${result.skipped === 1 ? "item was" : "items were"} skipped` : ""}.`
        : result.skipped
          ? "No CSV files in that selection."
          : "No files selected.") + filtered,
    );
  }
  function onDrop(event) {
    event.preventDefault();
    setDragging(null);
    const files = Array.from(event.dataTransfer.files);
    if (page === "snapshots") { window.dispatchEvent(new CustomEvent("snapshots-drop", { detail: files })); return; }
    if (busy || !files.length) return;
    // Only CSV exports reach the server; anything else is reported here and left where it is.
    const { csv, skipped } = splitCsvFiles(files);
    if (!csv.length) {
      notify({ title: "Nothing added", description: skippedNote(skipped), tone: "warning" });
      return;
    }
    intake(() => api.stageDrop(csv), skipped);
  }
  const openSource = (id) => api.detail(id).then(setDetail).catch((e) => setError(e.message));
  if (!api)
    return (
      <div className="launch-message">
        <Mark size={28} label="Urbanomics" />
        <h1>Urbanomics needs its workspace.</h1>
        <p>Open the desktop app, or run npm run web and open the address it prints.</p>
      </div>
    );
  if (!data)
    return (
      <div className="launch-message">
        <div className="brand">
          <Mark size={28} label="Urbanomics" /><span>urbanomics</span>
        </div>
        {loadError ? (
          <>
            <Alert title="Your workspace didn't open.">{loadError} Check that Urbanomics is still running, then try again.</Alert>
            <button className="primary" onClick={load}>Try again</button>
          </>
        ) : (
          <p>Opening your workspace…</p>
        )}
      </div>
    );
  const tabs = [
    ["dashboard", "layout-dashboard", "Dashboard", "Overview"],
    ["snapshots", "layers", "Snapshots", "Workspace"],
    ["organize", "tags", "Organize"],
    ["transactions", "list", "Transactions"],
    ["events", "calendar-days", "Events"],
    ["accounts", "wallet", "Accounts"],
    ["settings", "settings", "Settings", "Preferences"],
  ];
  const updateReady = update?.status === "ready";
  const persistent = data.archiveError || data.configurationError;
  return (
    <div
      className={pinned ? "app-shell" : "app-shell sidebar-rail"}
      onDragOver={(e) => {
        e.preventDefault();
        const kind = dropKind(e.dataTransfer);
        if (kind === "reject") e.dataTransfer.dropEffect = "none";
        if (page !== "snapshots" && kind) setDragging(kind);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(null);
      }}
      onDrop={onDrop}
    >
      <aside
        className={`sidebar ${pinned ? "is-pinned" : railOpen ? "is-rail is-open" : "is-rail"}`}
        onMouseEnter={() => !pinned && openRail()}
        onMouseLeave={() => !pinned && closeRail()}
        onFocus={(e) => {
          if (!pinned && e.target.matches?.(":focus-visible")) openRail();
        }}
        onBlur={(e) => {
          if (!pinned && !e.currentTarget.contains(e.relatedTarget)) closeRail(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !pinned && railOpen) closeRail(0);
        }}
      >
        <div className="brand">
          <Mark size={28} label="Urbanomics" /><span className="brand-word">urbanomics</span>
        </div>
        {update?.build === "development" && (
          <p className="dev-tag" role="note" title="Development build">
            <span className="dev-tag-full">Development build</span>
            <span className="dev-tag-short" aria-hidden="true">dev</span>
          </p>
        )}
        <nav aria-label="Main navigation">
          {tabs.map(([id, icon, label, group]) => (
            <React.Fragment key={id}>{group && <div className="navigation-group">{group}</div>}
            <button
              className={page === id ? "nav-item active" : "nav-item"}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                go(id);
                if (id === "transactions") { setRevision(null); setAccountFilter(""); setMonth(""); }
              }}
            >
              <span aria-hidden="true"><Icon name={icon} size={18} /></span>
              <span className="sidebar-label">{label}</span>
              {id === "snapshots" && data.jobs.length > 0 && (
                <b aria-label={`${data.jobs.length} ${data.jobs.length === 1 ? "file" : "files"} waiting`}>{data.jobs.length}</b>
              )}
              {id === "settings" && updateReady && <i className="nav-dot" aria-label="Update ready" />}
            </button></React.Fragment>
          ))}
        </nav>
        <div className="sidebar-extras">
          {updateReady && (
            <div className="update-note" role="status">
              <span>Urbanomics {update.latest} is ready.</span>
              <button className="sm" onClick={() => api.installUpdate().catch((e) => setError(e.message))}>Restart to update</button>
            </div>
          )}
          <div className="local-note">
            <strong>{hostLabel()}</strong>
            <small>
              {api.host !== "browser"
                ? "Your files and decisions stay in your workspace folder."
                : api.workspaceMode === "desktop"
                  ? "Your files and changes stay on the desktop."
                  : "A separate local workspace with invented data."}
            </small>
            {api.host !== "browser" && (
              <button className="link" onClick={() => run(() => api.reveal("private"))}>
                Open workspace folder ↗
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          className="sidebar-pin"
          aria-pressed={pinned}
          aria-label="Keep sidebar open"
          title="Keep sidebar open"
          onClick={togglePinned}
        >
          <span aria-hidden="true"><Icon name={pinned ? "pin-off" : "pin"} size={18} /></span>
          <span className="sidebar-label">Keep sidebar open</span>
        </button>
      </aside>
      <div className="workspace">
        <div className="mobile-topbar"><strong><Mark size={24} label="Urbanomics" /><span>{tabs.find((t) => t[0] === page)?.[2]}</span></strong><span className={connected ? "mobile-connection" : "mobile-connection offline"}>{!connected ? "Reconnecting…" : hostLabel()}</span></div>
        <main>
          {!connected && api.host === "browser" && (
            <Alert tone="warning" title="Connection lost.">
              {api.workspaceMode === "desktop"
                ? "Keep your desktop awake, Urbanomics open and Tailscale connected. Changes save again once it reconnects."
                : "The sample workspace stopped responding. Restart it, then reload this page."}
            </Alert>
          )}
          {persistent && <Alert title="Part of your workspace needs attention.">{persistent}</Alert>}
          {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
          {page === "dashboard" && (
            <Dashboard data={data} onSnapshots={() => go("snapshots")} onSource={openSource} />
          )}
          {page === "snapshots" && <SnapshotsWorkspace data={data} onRefresh={refresh} onReview={() => openOrganize()} onOpenSnapshot={async (target) => { try { const saved = await api.snapshot(target.id); setMonth(target.month); setAccountFilter(target.accountId); setRevision(saved); go("transactions"); } catch (e) { setError(e.message); } }} />}
          {page === "accounts" && <AccountsWorkspace data={data} run={run} busy={busy} onSnapshots={() => go("snapshots")} onTransactions={(accountId, month = "") => { setRevision(null); setMonth(month); setAccountFilter(accountId); go("transactions"); }} onSource={openSource} />}
          {page === "organize" && <OrganizeDesk data={data} run={run} onSource={openSource} target={organizeTarget} onSettings={() => { setOrganizeSection("transfers"); go("settings", "transfers"); }} />}
          {page === "events" && <EventsWorkspace data={data} run={run} busy={busy} onOrganize={openOrganize} onSettings={(section) => { setOrganizeSection(section); go("settings", section); }} onSource={openSource} />}
          {page === "transactions" && <TransactionsWorkspace key={revision?.id || "current"} data={data} run={run} busy={busy} initialMonth={month} initialAccount={accountFilter} snapshot={revision} onCurrent={() => setRevision(null)} onOrganize={openOrganize} onSource={openSource} />}
          {page === "settings" && <OrganizeWorkspace data={data} run={run} busy={busy} section={organizeSection} onSection={(section) => { setOrganizeSection(section); go("settings", section); }} onSource={openSource} onNavigate={(target) => { if (["accounts", "events", "transactions", "snapshots"].includes(target)) go(target); else openOrganize(null, target.startsWith("transfers") ? "transfers" : "transactions"); }} />}
        </main>
      </div>
      <ToastRegion />
      {dragging && (
        <div className={`drop-overlay drop-${dragging}`} aria-hidden="true">
          <div>
            <span className="drop-overlay-icon">
              <Icon name={dragging === "reject" ? "file-x" : "file-down"} size={24} />
            </span>
            <h1>{dragging === "reject" ? "Only CSV exports can be added" : "Drop to add to Snapshots"}</h1>
            <p>
              {dragging === "reject"
                ? "These files will stay where they are."
                : dragging === "mixed"
                  ? "Only the CSV files will be used. Nothing imports until you review them."
                  : "Nothing imports until you review them."}
            </p>
          </div>
        </div>
      )}
      {detail && (
        <WorkspaceModal
          title="Original bank record"
          onClose={() => setDetail(null)}
          footer={<button onClick={() => setDetail(null)}>Close</button>}
        >
          <div className="source-summary">
            <span>{detail.date}{detail.time ? ` · ${detail.time} (as exported)` : ""}</span>
            <h3>{detail.description}</h3>
            <strong className="tabular">{money(detail.amountCents, detail.currency || "CAD")}</strong>
          </div>
          <h4>Values in the exported file</h4>
          <div className="raw-values">
            {detail.raw.map((v, i) => (
              <code key={i}>{v || "(blank)"}</code>
            ))}
          </div>
          <h4>Files that contain it</h4>
          {detail.sources.map((s) => (
            <div className="source-row" key={s.hash + ":" + s.record}>
              <div>
                <strong>{s.filename}</strong>
                <small>Row {s.record}</small>
              </div>
              {api.host !== "browser" && (
                <button onClick={() => run(() => api.reveal("source", s.hash))}>
                  Show file ↗
                </button>
              )}
            </div>
          ))}
        </WorkspaceModal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<RenderRecovery><App /></RenderRecovery>);
