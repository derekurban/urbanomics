import React, { useState } from "react";

/*
  DataWorkspace
  -------------
  The "Data" page of the Urbanomics workspace: Dropbox intake queue, recent
  receipts, upload history, and the archive of monthly snapshots by account.

  Everything rendered here derives from the `data` prop. All side effects go
  through the callbacks supplied by the parent shell.
*/

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const HISTORY_PAGE_SIZE = 15;
const RECENT_LIMIT = 4;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "Upload history" },
  { id: "archive", label: "Archive" },
];

const SCHEMA_LABELS = { pc: "PC Financial", eq: "EQ Bank", simplii: "Simplii" };
const KIND_LABELS = {
  credit: "Credit card",
  chequing: "Chequing",
  savings: "Savings",
};

const JOB_STATUS = {
  queued: { label: "Ready", tone: "ok" },
  routing: { label: "Needs account", tone: "warm", action: "Choose account" },
  overlap: { label: "Overlap", tone: "warm", action: "Review overlap" },
  error: { label: "Error", tone: "error", action: "Review error" },
  finalizing: { label: "Finalizing", tone: "warm", action: "Retry" },
};

/* ---------- small helpers ---------- */

const list = (value) => (Array.isArray(value) ? value : []);
const pad2 = (n) => String(n).padStart(2, "0");
const isMonthKey = (value) => /^\d{4}-\d{2}$/.test(String(value || ""));
const yearOf = (key) => Number(String(key).slice(0, 4));
const monthOf = (key) => Number(String(key).slice(5, 7));
const cellKey = (accountId, month) => `${String(accountId)}|${month}`;
const call = (fn, ...args) =>
  typeof fn === "function" ? fn(...args) : undefined;

function plural(count, one, many = `${one}s`) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 ? one : many}`;
}

function monthLabel(key, style = "short") {
  if (!isMonthKey(key)) return String(key || "");
  const names = style === "long" ? MONTHS_LONG : MONTHS_SHORT;
  return `${names[monthOf(key) - 1] || key} ${yearOf(key)}`;
}

function rangeLabel(start, through) {
  if (!isMonthKey(start) || !isMonthKey(through)) return "";
  if (start === through) return monthLabel(start);
  if (yearOf(start) === yearOf(through)) {
    return `${MONTHS_SHORT[monthOf(start) - 1]}–${MONTHS_SHORT[monthOf(through) - 1]} ${yearOf(start)}`;
  }
  return `${monthLabel(start)} – ${monthLabel(through)}`;
}

function toDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, { year = true } = {}) {
  const date = toDate(value);
  if (!date) return value ? String(value) : "";
  return date.toLocaleDateString(
    undefined,
    year
      ? { year: "numeric", month: "short", day: "numeric" }
      : { month: "short", day: "numeric" },
  );
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return value ? String(value) : "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isoDate(value) {
  const date = toDate(value);
  return date ? date.toISOString() : undefined;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const schemaLabel = (schema) =>
  SCHEMA_LABELS[schema] || (schema ? String(schema) : "Unknown format");
const kindLabel = (kind) => KIND_LABELS[kind] || (kind ? String(kind) : "");

function activityStatus(item) {
  const status = String(item.status || "").toLowerCase();
  if (JOB_STATUS[status]) return JOB_STATUS[status];
  if (["complete", "completed", "done", "filed", "processed"].includes(status))
    return { label: "Filed", tone: "ok" };
  if (["error", "failed"].includes(status))
    return { label: "Error", tone: "error" };
  if (["dismissed", "removed", "cleared"].includes(status))
    return { label: "Removed", tone: "muted" };
  if (!status)
    return item.result
      ? { label: "Filed", tone: "ok" }
      : { label: "Unknown", tone: "muted" };
  return {
    label: status.charAt(0).toUpperCase() + status.slice(1),
    tone: "muted",
  };
}

function resultSummary(result) {
  if (!result) return "";
  const parts = [
    `+${Number(result.added) || 0} new`,
    `${Number(result.matched) || 0} matched`,
  ];
  if (Number(result.excluded) > 0)
    parts.push(`${Number(result.excluded)} outside range`);
  return parts.join(" · ");
}

/* ---------- component ---------- */

export function DataWorkspace({
  data,
  busy = false,
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
  const d = data || {};
  const scope = d.scope || {};
  const accounts = list(d.accounts).filter((a) => a && a.id != null);
  const jobs = list(d.jobs).filter(Boolean);
  const history = list(d.history).filter(Boolean);
  const activity = list(d.activity).filter(Boolean);
  const sources = list(d.sources).filter(Boolean);
  const snapshots = list(d.snapshots).filter(Boolean);
  const snapshotIndex = list(d.snapshotIndex).filter(
    (e) => e && isMonthKey(e.month) && e.accountId != null,
  );

  const [tab, setTab] = useState("overview");
  const [pick, setPick] = useState(null);
  const [yearPick, setYearPick] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);

  /* lookups */
  const accountById = new Map(accounts.map((a) => [String(a.id), a]));
  const sourceByHash = new Map(sources.map((s) => [s.hash, s]));
  const accountName = (id) =>
    id == null ? null : (accountById.get(String(id))?.name ?? null);

  const cells = new Map();
  snapshotIndex.forEach((entry) => {
    const key = cellKey(entry.accountId, entry.month);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(entry);
  });
  cells.forEach((entries) => {
    entries.sort(
      (a, b) => (Number(b.revision) || 0) - (Number(a.revision) || 0),
    );
  });
  const indexMonths = new Set(snapshotIndex.map((e) => e.month));

  /* scope */
  const latestIndexMonth = [...indexMonths].sort().pop();
  const throughMonth = isMonthKey(scope.throughMonth)
    ? scope.throughMonth
    : isMonthKey(scope.startMonth)
      ? scope.startMonth
      : latestIndexMonth ||
        `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
  const startMonth =
    isMonthKey(scope.startMonth) && scope.startMonth <= throughMonth
      ? scope.startMonth
      : throughMonth;
  const inScope = (month) => month >= startMonth && month <= throughMonth;

  const yearSet = new Set([yearOf(throughMonth)]);
  for (let y = yearOf(startMonth); y <= yearOf(throughMonth); y += 1)
    yearSet.add(y);
  indexMonths.forEach((m) => yearSet.add(yearOf(m)));
  const years = [...yearSet].sort((a, b) => a - b);

  const monthsForYear = (year) => {
    const present = [];
    for (let m = 1; m <= 12; m += 1) {
      const key = `${year}-${pad2(m)}`;
      if (inScope(key) || indexMonths.has(key)) present.push(m);
    }
    if (!present.length) return [];
    const keys = [];
    for (let m = 1; m <= present[present.length - 1]; m += 1)
      keys.push(`${year}-${pad2(m)}`);
    return keys;
  };

  /* selection */
  let selection = null;
  if (
    pick &&
    accountById.has(String(pick.accountId)) &&
    isMonthKey(pick.month)
  ) {
    selection = pick;
  } else {
    const latest = snapshotIndex
      .filter((e) => accountById.has(String(e.accountId)))
      .sort(
        (a, b) =>
          (toDate(b.created)?.getTime() || 0) -
          (toDate(a.created)?.getTime() || 0),
      )[0];
    if (latest)
      selection = {
        accountId: latest.accountId,
        month: latest.month,
        snapshotId: null,
      };
    else if (accounts[0])
      selection = {
        accountId: accounts[0].id,
        month: throughMonth,
        snapshotId: null,
      };
  }

  const throughYear = yearOf(throughMonth);
  let year = throughYear;
  if (years.includes(yearPick)) year = yearPick;
  else if (selection && years.includes(yearOf(selection.month)))
    year = yearOf(selection.month);
  else if (!years.includes(year)) year = years[years.length - 1];
  const months = monthsForYear(year);

  const selectedAccount = selection
    ? accountById.get(String(selection.accountId))
    : null;
  const versions = selection
    ? cells.get(cellKey(selection.accountId, selection.month)) || []
    : [];
  const currentVersion =
    versions.find((v) => v.id != null && v.id === selection?.snapshotId) ||
    versions[0] ||
    null;
  const monthHasArchive = selection
    ? snapshots.some((s) => s.month === selection.month)
    : false;

  /* counts */
  const queued = jobs.filter((j) => j.status === "queued");
  const clearable = jobs.filter((j) => j.status !== "finalizing");
  const needsAttention = jobs.filter((j) =>
    ["routing", "overlap", "error"].includes(j.status),
  );
  const accountMonths = cells.size;
  const showClearConfirm = confirmClear && clearable.length > 0;

  /* history paging */
  const pageCount = Math.max(1, Math.ceil(activity.length / HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(historyPage, 0), pageCount - 1);
  const pageStart = page * HISTORY_PAGE_SIZE;
  const pageItems = activity.slice(pageStart, pageStart + HISTORY_PAGE_SIZE);

  /* handlers */
  const selectCell = (accountId, month) =>
    setPick({ accountId, month, snapshotId: null });
  const selectVersion = (entry) =>
    setPick({ ...selection, snapshotId: entry.id });
  const confirmClearNow = () => {
    setConfirmClear(false);
    return call(onClear);
  };
  const onTabKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const next =
      TABS[
        (index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) %
          TABS.length
      ];
    setTab(next.id);
    const button = event.currentTarget.querySelector(`#dr-tab-${next.id}`);
    if (button) button.focus();
  };

  /* ---------- pieces ---------- */

  const renderJob = (job) => {
    const status = JOB_STATUS[job.status] || {
      label: String(job.status || "Waiting"),
      tone: "muted",
    };
    const name = accountName(job.accountId);
    const meta = [
      name || "No account yet",
      job.rowCount != null ? plural(job.rowCount, "row") : null,
      job.schema ? schemaLabel(job.schema) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const conflicts = list(job.conflicts).length;
    const finalizing = job.status === "finalizing";
    return (
      <li className="dr-file" key={job.id}>
        <span className="dr-file-glyph" aria-hidden="true">
          CSV
        </span>
        <div className="dr-file-info">
          <strong>{job.filename || "Untitled file"}</strong>
          <small>
            {meta}
            {conflicts ? ` · ${plural(conflicts, "overlapping row")}` : ""}
          </small>
          {job.error ? (
            <small className="dr-error-text">{String(job.error)}</small>
          ) : null}
        </div>
        <span className={`dr-chip dr-chip-${status.tone}`}>{status.label}</span>
        {status.action ? (
          <button
            type="button"
            className="dr-small"
            disabled={busy}
            onClick={() => call(onReview, job)}
          >
            {status.action}
          </button>
        ) : null}
        <button
          type="button"
          className="dr-icon-button"
          aria-label={`Remove ${job.filename || "file"} from Dropbox`}
          title={
            finalizing
              ? "Finalizing files cannot be removed"
              : "Remove intake copy"
          }
          disabled={busy || finalizing}
          onClick={() => call(onDismiss, job.id)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </li>
    );
  };

  const dropboxPanel = (
    <section className="dr-box dr-inbox" aria-labelledby="dr-inbox-title">
      <div className="dr-box-head">
        <div>
          <div className="dr-titleline">
            <h2 id="dr-inbox-title">Dropbox</h2>
            <small>{jobs.length ? `${jobs.length} waiting` : "empty"}</small>
          </div>
          <small>
            Your local intake folder. Copies land here before filing.
          </small>
        </div>
        <div className="dr-actions">
          <button
            type="button"
            className="dr-quiet"
            disabled={busy}
            onClick={() => call(onScan)}
          >
            Scan folder
          </button>
          <button
            type="button"
            className="dr-quiet"
            onClick={() => call(onReveal, "dropbox")}
          >
            Open folder <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>

      {jobs.length ? (
        <ul className="dr-file-list">{jobs.map(renderJob)}</ul>
      ) : (
        <div className="dr-empty">
          <span className="dr-empty-mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>Nothing waiting.</strong>
            <small>
              Upload CSVs, choose a folder, or drop exports into the Dropbox
              folder and scan.
            </small>
          </div>
        </div>
      )}

      {busy ? (
        <div className="dr-working" role="status">
          Working…
        </div>
      ) : null}

      {showClearConfirm ? (
        <div
          className="dr-inbox-foot dr-confirm"
          role="group"
          aria-label="Confirm clearing Dropbox"
        >
          <span>
            Clear {plural(clearable.length, "intake copy", "intake copies")}{" "}
            from Dropbox? Your original downloads and the archive stay where
            they are.
          </span>
          <div className="dr-actions">
            <button type="button" disabled={busy} onClick={confirmClearNow}>
              Clear {plural(clearable.length, "copy", "copies")}
            </button>
            <button
              type="button"
              className="dr-quiet"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="dr-inbox-foot">
          <div className="dr-actions">
            <button
              type="button"
              className="dr-primary"
              disabled={busy}
              onClick={() => call(onProcess)}
            >
              {queued.length
                ? `Process ${plural(queued.length, "queued file")}`
                : "Process Dropbox"}
            </button>
            {needsAttention.length ? (
              <small>
                {plural(needsAttention.length, "file needs", "files need")} a
                decision first
              </small>
            ) : null}
          </div>
          <button
            type="button"
            className="dr-quiet"
            disabled={busy || clearable.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            Clear intake copies
          </button>
        </div>
      )}
    </section>
  );

  const recentPanel = (
    <section className="dr-box dr-recent" aria-labelledby="dr-recent-title">
      <div className="dr-box-head">
        <h2 id="dr-recent-title">Recently filed</h2>
        <button
          type="button"
          className="dr-quiet"
          onClick={() => setTab("history")}
        >
          All history <span aria-hidden="true">→</span>
        </button>
      </div>
      {history.length ? (
        <ul className="dr-event-list">
          {history.slice(0, RECENT_LIMIT).map((item) => {
            const name =
              (typeof item.account === "string" && item.account) ||
              accountName(item.account_id) ||
              "No account";
            return (
              <li className="dr-event" key={item.id}>
                <span className="dr-event-mark" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>{item.filename || "Untitled file"}</strong>
                  <small>
                    {name} · {resultSummary(item.result) || "filed"}
                  </small>
                </div>
                <time dateTime={isoDate(item.created)}>
                  {formatDate(item.created, { year: false })}
                </time>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="dr-empty dr-empty-quiet">
          <div>
            <strong>No receipts yet.</strong>
            <small>
              Processed uploads appear here with what was added and matched.
            </small>
          </div>
        </div>
      )}
      <div className="dr-archive-strip">
        <div>
          <strong>{plural(sources.length, "original")} archived</strong>
          <small>
            {plural(snapshotIndex.length, "account version")} across{" "}
            {plural(snapshots.length, "archive revision")}
          </small>
        </div>
        <button
          type="button"
          className="dr-quiet"
          onClick={() => call(onReveal, "archive")}
        >
          Open archive <span aria-hidden="true">↗</span>
        </button>
      </div>
    </section>
  );

  const renderSelected = () => {
    if (!selection || !selectedAccount) return null;
    const { month, accountId } = selection;
    const outside = !inScope(month);
    const hashes = currentVersion ? list(currentVersion.sourceHashes) : [];
    return (
      <div className="dr-selected">
        <div className="dr-selected-summary">
          <div className="dr-label">
            {monthLabel(month, "long")}
            {outside ? " · outside current range" : ""}
          </div>
          <h3>{selectedAccount.name}</h3>
          <small>
            {[
              kindLabel(selectedAccount.kind),
              schemaLabel(selectedAccount.schema),
            ]
              .filter(Boolean)
              .join(" · ")}
          </small>
          {versions.length ? (
            <>
              <p className="dr-sub">
                {plural(versions.length, "saved version")} of this account for
                the month
              </p>
              <div
                className="dr-versions"
                role="group"
                aria-label="Saved account versions"
              >
                {versions.map((entry, i) => (
                  <button
                    type="button"
                    key={entry.id ?? `${entry.revision}-${i}`}
                    aria-pressed={entry === currentVersion}
                    onClick={() => selectVersion(entry)}
                  >
                    r{entry.revision}
                    {i === 0 ? " · latest" : ""}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="dr-sub">
              No imported snapshot. A dash means nothing has been filed here
              yet, not that the month is empty.
            </p>
          )}
        </div>

        <div className="dr-selected-detail">
          {currentVersion ? (
            <>
              <strong>
                Version r{currentVersion.revision}
                {currentVersion.rowCount != null
                  ? ` · ${plural(currentVersion.rowCount, "transaction")}`
                  : ""}
              </strong>
              <p>
                Saved{" "}
                {formatDateTime(currentVersion.created) || "at an unknown time"}
                {currentVersion.workspaceRevision != null
                  ? ` · month archive revision ${currentVersion.workspaceRevision}`
                  : ""}
              </p>
              <div className="dr-label">Built from</div>
              {hashes.length ? (
                <ul className="dr-source-list">
                  {hashes.map((hash) => {
                    const source = sourceByHash.get(hash);
                    return (
                      <li key={hash}>
                        <span>
                          {source?.filename || "Original not in source list"}
                        </span>
                        <button
                          type="button"
                          className="dr-quiet dr-small"
                          onClick={() => call(onReveal, "source", hash)}
                        >
                          Show original <span aria-hidden="true">↗</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No source files recorded for this version.</p>
              )}
              <div className="dr-actions">
                <button
                  type="button"
                  onClick={() =>
                    call(onOpenSnapshot, {
                      month,
                      accountId,
                      id: currentVersion.id,
                    })
                  }
                >
                  Inspect snapshot
                </button>
                <button
                  type="button"
                  className="dr-quiet"
                  onClick={() => call(onReveal, "month", month)}
                >
                  Open month folder <span aria-hidden="true">↗</span>
                </button>
                <button
                  type="button"
                  className="dr-quiet"
                  onClick={() =>
                    call(onReveal, "snapshot-file", currentVersion.id)
                  }
                >
                  Show archive file <span aria-hidden="true">↗</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <strong>Nothing filed yet</strong>
              <p>
                Upload an export for {selectedAccount.name} that includes{" "}
                {monthLabel(month, "long")} and its snapshot will appear here.
              </p>
              {outside ? (
                <p>
                  This month is outside your import range, so its rows are set
                  aside until the range changes.
                </p>
              ) : null}
              <div className="dr-actions">
                <button
                  type="button"
                  className="dr-primary"
                  disabled={busy}
                  onClick={() => call(onUpload)}
                >
                  Upload CSVs
                </button>
                {outside ? (
                  <button
                    type="button"
                    className="dr-quiet"
                    onClick={() => call(onRange)}
                  >
                    Change range
                  </button>
                ) : null}
                {monthHasArchive ? (
                  <button
                    type="button"
                    className="dr-quiet"
                    onClick={() => call(onReveal, "month", month)}
                  >
                    Open month folder <span aria-hidden="true">↗</span>
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const snapshotMap = (
    <section className="dr-box dr-map" aria-labelledby="dr-map-title">
      <div className="dr-box-head">
        <div>
          <h2 id="dr-map-title">Snapshot library</h2>
          <small>
            {plural(accountMonths, "account-month")} ·{" "}
            {plural(snapshotIndex.length, "saved version")}
          </small>
        </div>
        {years.length > 1 ? (
          <div className="dr-years" role="group" aria-label="Archive year">
            {years.map((y) => (
              <button
                type="button"
                key={y}
                aria-pressed={y === year}
                onClick={() => setYearPick(y)}
              >
                {y}
              </button>
            ))}
          </div>
        ) : (
          <span className="dr-sub">{year}</span>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="dr-empty dr-empty-pad">
          <div>
            <strong>No accounts yet.</strong>
            <small>
              Add an account and set your import range to start filing exports.
            </small>
          </div>
          <button
            type="button"
            className="dr-quiet"
            onClick={() => call(onRange)}
          >
            Account settings <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : months.length === 0 ? (
        <div className="dr-empty dr-empty-pad">
          <div>
            <strong>Nothing archived for {year}.</strong>
            <small>Choose another year or change the import range.</small>
          </div>
        </div>
      ) : (
        <div className="dr-map-wrap">
          <div className="dr-map-scroll">
            <table className="dr-grid">
              <caption className="dr-visually-hidden">
                Saved monthly snapshot versions by account for {year}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  {months.map((m) => (
                    <th
                      scope="col"
                      key={m}
                      className={inScope(m) ? undefined : "dr-out"}
                    >
                      <abbr title={monthLabel(m, "long")}>
                        {MONTHS_SHORT[monthOf(m) - 1]}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <th scope="row" className="dr-row-label">
                      {account.name}
                      <small>
                        {[kindLabel(account.kind), schemaLabel(account.schema)]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </th>
                    {months.map((m) => {
                      const entries = cells.get(cellKey(account.id, m)) || [];
                      const n = entries.length;
                      const pressed =
                        !!selection &&
                        String(selection.accountId) === String(account.id) &&
                        selection.month === m;
                      return (
                        <td key={m}>
                          <button
                            type="button"
                            className={`dr-cell${n ? "" : " dr-missing"}${inScope(m) ? "" : " dr-cell-out"}`}
                            data-count={Math.min(n, 4)}
                            aria-pressed={pressed}
                            aria-label={`${account.name}, ${monthLabel(m, "long")}, ${
                              n
                                ? plural(n, "saved version")
                                : "no imported snapshot"
                            }`}
                            onClick={() => selectCell(account.id, m)}
                          >
                            {n ? `r${n}` : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dr-legend">
            <span>
              r1 = one saved version · r2 = two saved versions · — = no imported
              snapshot
            </span>
            <span>Saved versions do not mean a month is fully covered.</span>
          </div>
        </div>
      )}

      {accounts.length ? renderSelected() : null}
    </section>
  );

  const historyPanel = (
    <section className="dr-box dr-history" aria-labelledby="dr-history-title">
      <div className="dr-box-head">
        <div>
          <h2 id="dr-history-title">Upload history</h2>
          <small>
            {activity.length
              ? `${plural(activity.length, "upload")} · newest first`
              : "Every upload, including errors and removed copies, is listed here."}
          </small>
        </div>
        <button
          type="button"
          className="dr-quiet"
          onClick={() => call(onReveal, "sources")}
        >
          Open originals folder <span aria-hidden="true">↗</span>
        </button>
      </div>

      {activity.length ? (
        <ul className="dr-history-list">
          {pageItems.map((item) => {
            const status = activityStatus(item);
            const name =
              (typeof item.account === "string" && item.account) ||
              accountName(item.account_id) ||
              "No account";
            const monthsFiled = list(item.result?.months).filter(isMonthKey);
            const counts = item.result
              ? [
                  resultSummary(item.result),
                  item.result.sourceRows != null
                    ? plural(item.result.sourceRows, "source row")
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "";
            return (
              <li className="dr-history-row" key={item.id}>
                <span
                  className={`dr-status-mark dr-status-${status.tone}`}
                  aria-hidden="true"
                >
                  {status.tone === "ok"
                    ? "✓"
                    : status.tone === "error"
                      ? "!"
                      : "·"}
                </span>
                <div className="dr-history-info">
                  <strong>{item.filename || "Untitled file"}</strong>
                  <small>
                    {name} · {formatDateTime(item.created) || "unknown time"}
                  </small>
                  {counts ? <small>{counts}</small> : null}
                  {monthsFiled.length ? (
                    <small>
                      Filed into{" "}
                      {monthsFiled.map((m) => monthLabel(m)).join(", ")}
                    </small>
                  ) : null}
                  {item.error ? (
                    <small className="dr-error-text">
                      {String(item.error)}
                    </small>
                  ) : null}
                </div>
                <span className={`dr-chip dr-chip-${status.tone}`}>
                  {status.label}
                </span>
                {item.source_hash ? (
                  <button
                    type="button"
                    className="dr-small"
                    onClick={() => call(onReveal, "source", item.source_hash)}
                  >
                    Show original <span aria-hidden="true">↗</span>
                  </button>
                ) : (
                  <span className="dr-sub dr-no-source">No original kept</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="dr-empty dr-empty-pad">
          <div>
            <strong>No uploads yet.</strong>
            <small>
              Once you process a file its receipt will be kept here.
            </small>
          </div>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="dr-pager">
          <small>
            Showing {pageStart + 1}–
            {Math.min(pageStart + HISTORY_PAGE_SIZE, activity.length)} of{" "}
            {activity.length}
          </small>
          <div className="dr-actions">
            <button
              type="button"
              className="dr-small"
              disabled={page === 0}
              onClick={() => setHistoryPage(page - 1)}
            >
              Newer
            </button>
            <button
              type="button"
              className="dr-small"
              disabled={page >= pageCount - 1}
              onClick={() => setHistoryPage(page + 1)}
            >
              Older
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );

  const archivePanel = (
    <>
      <div className="dr-folders">
        <button
          type="button"
          className="dr-folder-card"
          onClick={() => call(onReveal, "sources")}
        >
          <span className="dr-folder-shape" aria-hidden="true" />
          <strong>Original uploads</strong>
          <small>
            {plural(sources.length, "preserved CSV file")} · open in Explorer
          </small>
        </button>
        <button
          type="button"
          className="dr-folder-card"
          onClick={() => call(onReveal, "snapshots")}
        >
          <span className="dr-folder-shape" aria-hidden="true" />
          <strong>Monthly snapshots</strong>
          <small>
            {plural(snapshots.length, "archive revision")} ·{" "}
            {plural(snapshotIndex.length, "account version")} · open in Explorer
          </small>
        </button>
      </div>

      {snapshotMap}

      <section className="dr-box dr-sources" aria-labelledby="dr-sources-title">
        <div className="dr-box-head">
          <div>
            <h2 id="dr-sources-title">Original files</h2>
            <small>
              Every upload is kept byte-for-byte. Duplicate uploads share one
              original.
            </small>
          </div>
        </div>
        {sources.length ? (
          <div className="dr-table-scroll">
            <table className="dr-files">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Format</th>
                  <th scope="col" className="dr-num">
                    Size
                  </th>
                  <th scope="col" className="dr-num">
                    Uploads
                  </th>
                  <th scope="col">
                    <span className="dr-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.hash}>
                    <td className="dr-file-name">
                      {source.filename || "Untitled file"}
                    </td>
                    <td>{schemaLabel(source.schema)}</td>
                    <td className="dr-num">{formatBytes(source.bytes)}</td>
                    <td className="dr-num">{Number(source.uploads) || 0}</td>
                    <td className="dr-row-action">
                      <button
                        type="button"
                        className="dr-small"
                        onClick={() => call(onReveal, "source", source.hash)}
                      >
                        Show original <span aria-hidden="true">↗</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dr-empty dr-empty-pad">
            <div>
              <strong>No originals archived yet.</strong>
              <small>
                Uploaded originals are preserved here unchanged, even before
                processing.
              </small>
            </div>
          </div>
        )}
      </section>
    </>
  );

  /* ---------- page ---------- */

  return (
    <div className="data-room">
      <header className="dr-heading">
        <div className="dr-heading-text">
          <div className="dr-eyebrow">Data</div>
          <h1>A place for every file.</h1>
          <p>From your Dropbox to a month you can come back to.</p>
        </div>
        <div className="dr-heading-side">
          <div className="dr-scope">
            <span className="dr-scope-chip">
              {rangeLabel(startMonth, throughMonth) || "No range set"}
            </span>
            <button
              type="button"
              className="dr-quiet dr-small"
              onClick={() => call(onRange)}
            >
              Change range
            </button>
          </div>
          <div className="dr-actions">
            <button
              type="button"
              className="dr-primary"
              disabled={busy}
              onClick={() => call(onUpload)}
            >
              <span className="dr-plus" aria-hidden="true">
                +
              </span>
              Upload CSVs
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => call(onChooseFolder)}
            >
              Choose folder…
            </button>
          </div>
        </div>
      </header>

      <div
        className="dr-nav"
        role="tablist"
        aria-label="Data sections"
        onKeyDown={onTabKeyDown}
      >
        {TABS.map((t) => {
          const badge =
            t.id === "overview"
              ? jobs.length
              : t.id === "history"
                ? activity.length
                : 0;
          return (
            <button
              type="button"
              role="tab"
              key={t.id}
              id={`dr-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="dr-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {badge ? (
                <span
                  className={`dr-badge${t.id === "overview" && needsAttention.length ? " dr-badge-warm" : ""}`}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id="dr-panel"
        role="tabpanel"
        aria-labelledby={`dr-tab-${tab}`}
        className="dr-panel"
      >
        {tab === "overview" ? (
          <>
            <div className="dr-top">
              {dropboxPanel}
              {recentPanel}
            </div>
            {snapshotMap}
          </>
        ) : null}
        {tab === "history" ? historyPanel : null}
        {tab === "archive" ? archivePanel : null}
      </div>
    </div>
  );
}

export default DataWorkspace;
