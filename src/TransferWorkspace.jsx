import React, { useState } from "react";
import {
  pendingTransfers,
  transferCandidates,
  validBand,
} from "../electron/review/transfer-model.mjs";
import { money } from "./review-model.js";
import "./transfer-workspace.css";
import { TransferLab } from "./TransferLab.jsx";

const api = window.urbanomics;
function Entry({ row, selected, onClick, busy, days, count }) {
  return (
    <button className="tr-entry" aria-pressed={selected} onClick={onClick} disabled={busy} draggable={!busy}
      onDragStart={e => { e.dataTransfer.setData("application/urbanomics-transfer", row.id); e.dataTransfer.effectAllowed="link"; }}>
      <span className="tr-check" aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
      <span className="tr-entry-text">
        <strong>{row.description}</strong>
        <small>
          <i style={{ background: row.color }} />
          {row.account} · {row.date}
          {days !== undefined && <em className="tr-match-badge">{days === 0 ? "Same day" : `${days}d apart`}</em>}
          {count !== undefined && <em className="tr-match-badge">{count ? `${count} ${count === 1 ? "match" : "matches"}` : "No match yet"}</em>}
        </small>
      </span>
      <strong className="tr-amount">
        {row.amountCents > 0 ? "+" : ""}
        {money(row.amountCents)}
      </strong>
    </button>
  );
}
function Difference({ outgoing, incoming }) {
  const delta = -outgoing.amountCents - incoming.amountCents;
  return (
    <div className="tr-difference">
      <span>
        Transfer{" "}
        <strong>
          {money(Math.min(-outgoing.amountCents, incoming.amountCents))}
        </strong>
      </span>
      {delta > 0 ? (
        <span className="tr-fee">
          Fee <strong>{money(delta)}</strong>
        </span>
      ) : delta < 0 ? (
        <span className="tr-unresolved">
          Unexplained extra received <strong>{money(-delta)}</strong>
        </span>
      ) : (
        <span>No difference</span>
      )}
    </div>
  );
}
export function TransferWorkspace({
  records,
  visible,
  busy,
  act,
  error,
  onSource,
  initialFilter = "pending",
}) {
  const [filter, setFilter] = useState(initialFilter),
    [band, setBand] = useState("2"),
    [selected, setSelected] = useState(""),
    [target, setTarget] = useState(""),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  const [days, setDays] = useState("all"), [account, setAccount] = useState(""),
    [incomingQuery,setIncomingQuery] = useState(""), [onlyMatches,setOnlyMatches] = useState(false),
    [dockOver,setDockOver] = useState(false), [lastLinked,setLastLinked] = useState("");
  const bandValue = /^\d{1,3}(\.\d{1,2})?$/.test(band)
    ? Math.round(Number(band) * 100)
    : NaN;
  const valid = validBand(bandValue),
    visibleIds = new Set(visible.map((t) => t.id));
  const dayGap = (a,b) => Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 86400000;
  const possible = row => valid ? transferCandidates(row, records, bandValue).filter(t => days === "all" || dayGap(row,t) <= Number(days)) : [];
  const allPending = pendingTransfers(records).filter(t => t.amountCents > 0 && visibleIds.has(t.id));
  const counts = new Map(allPending.map(row => [row.id, possible(row).length]));
  const pendingIncome = allPending.filter(t => (!account || t.accountId === account) && (!onlyMatches || counts.get(t.id)) && `${t.description} ${t.account} ${t.date}`.toLowerCase().includes(incomingQuery.toLowerCase()));
  const focus = pendingIncome.find((t) => t.id === selected);
  const candidates = focus ? possible(focus) : [];
  const outgoing = candidates.find((t) => t.id === target);
  const matches = candidates.filter((t) =>
    `${t.description} ${t.originalDescription || ""} ${t.account} ${t.date}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pairs = records
    .filter(
      (t) =>
        t.amountCents < 0 &&
        t.review.kind === "transfer" &&
        t.review.transferId,
    )
    .map((outgoing) => ({
      outgoing,
      incoming: records.find((t) => t.id === outgoing.review.transferId),
    }))
    .filter(
      (pair) =>
        pair.incoming &&
        (visibleIds.has(pair.outgoing.id) || visibleIds.has(pair.incoming.id)),
    );
  async function link() {
    if (!focus || !outgoing || busy) return;
    const next = pendingIncome.find((t) => t.id !== focus.id)?.id || "";
    const result = await act(() =>
      api.linkTransfer(
        outgoing.id,
        outgoing.version,
        focus.id,
        focus.version,
        bandValue,
      ),
    );
    if (result !== false) {
      setSelected(next);
      setTarget("");
      setQuery("");
      setNotice("Transfer linked. Both entries moved to Linked.");
      setLastLinked(outgoing.id);
    }
  }
  async function unlink(pair) {
    const result = await act(() =>
      api.unlinkTransfer(
        pair.outgoing.id,
        pair.outgoing.version,
        pair.incoming.version,
      ),
    );
    if (result !== false)
      setNotice("Pair unlinked. Both entries are pending again.");
  }
  function nextIncoming() {
    const index = pendingIncome.findIndex(t => t.id === selected);
    setSelected(pendingIncome[(index + 1) % pendingIncome.length]?.id || ""); setTarget(""); setQuery("");
  }
  function dropPair(e) {
    e.preventDefault(); setDockOver(false);
    if (busy) return;
    const id = e.dataTransfer.getData("application/urbanomics-transfer");
    if (pendingIncome.some(t => t.id === id)) { setSelected(id); setTarget(""); }
    else if (candidates.some(t => t.id === id)) setTarget(id);
  }
  return (
    <section className="transfer-workspace" aria-label="Transfer linking" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); link(); } }}>
      <div className="tr-intro"><div><small>BETWEEN YOUR ACCOUNTS</small><h2>Connect the dots.</h2><p>Pair both sides once. They leave income and expense review together.</p></div><span className="tr-pair-count">{pairs.length}<small>linked pairs in view</small></span></div>
      <div className="tr-toolbar">
        <div className="rv-toggle" aria-label="Transfer status">
          <button
            aria-pressed={filter === "pending"}
            onClick={() => {
              setFilter("pending");
              setNotice("");
            }}
          >
            Pending <span>{pendingIncome.length}</span>
          </button>
          <button
            aria-pressed={filter === "linked"}
            onClick={() => {
              setFilter("linked");
              setNotice("");
            }}
          >
            Linked <span>{pairs.length}</span>
          </button>
          <button
            aria-pressed={filter === "lab"}
            onClick={() => {
              setFilter("lab");
              setNotice("");
            }}
          >
            Auto-link lab
          </button>
        </div>
        {filter === "pending" && (
          <div className="tr-match-controls"><label className="tr-band">
            Amount tolerance (±%)
            <input
              aria-label="Transfer percentage band"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={band}
              disabled={busy}
              onChange={(e) => {
                setBand(e.target.value);
                setTarget("");
              }}
            />
          </label>
          <div className="tr-presets" aria-label="Amount tolerance presets">{["0", "0.5", "2"].map(value => <button key={value} disabled={busy} aria-pressed={band === value} onClick={() => {setBand(value); setTarget("");}}>{value === "0" ? "Exact" : `±${value}%`}</button>)}</div>
          <label className="tr-band">Date window<select aria-label="Transfer date window" value={days} disabled={busy} onChange={e => {setDays(e.target.value);setTarget("");}}><option value="all">All dates</option>{[0,1,3,7,14,31].map(day => <option key={day} value={day}>{day ? `±${day} days` : "Same day"}</option>)}</select></label></div>
        )}
      </div>
      {notice && (
        <div className="tr-notice" role="status">{notice}{lastLinked && records.find(t => t.id === lastLinked)?.review.kind === "transfer" && <button disabled={busy} onClick={async () => { const out = records.find(t => t.id === lastLinked), incoming = records.find(t => t.id === out.review.transferId); if(incoming) await unlink({outgoing:out,incoming}); setLastLinked(""); }}>Undo link</button>}</div>
      )}
      {error && (
        <p className="dr-error-text" role="alert">
          {error}
        </p>
      )}
      {filter === "lab" ? (
        <TransferLab
          records={records}
          act={act}
          busy={busy}
          onSource={onSource}
        />
      ) : filter === "pending" ? (
        <>
          <p className="tr-help">
            Select money in, then drag a matching outgoing card into the dock below or click it. Confirm with Link transfer (Ctrl+Enter). A shortfall becomes a fee.
          </p>
          <div className="tr-account-filters" aria-label="Receiving account"><button aria-pressed={!account} onClick={() => {setAccount("");setSelected("");setTarget("");}}>All receiving accounts</button>{[...new Map(allPending.map(t => [t.accountId,t])).values()].map(t => <button key={t.accountId} aria-pressed={account === t.accountId} onClick={() => {setAccount(t.accountId);setSelected("");setTarget("");}}><i style={{background:t.color}}/>{t.account}</button>)}</div>
          {!valid && (
            <p className="dr-error-text" role="alert">
              Enter 0–100%, with up to two decimal places.
            </p>
          )}
          <div className="tr-columns">
            <section
              aria-label="Pending incoming transfers"
              className="tr-column"
            >
              <header>
                <h2>1 · Money in</h2>
                <small>{pendingIncome.length} pending</small>
              </header>
              <input className="tr-search" aria-label="Search pending incoming transfers" placeholder="Find a receipt…" value={incomingQuery} onChange={e => {setIncomingQuery(e.target.value);setTarget("");}}/>
              <label className="tr-only-matches"><input type="checkbox" checked={onlyMatches} onChange={e => {setOnlyMatches(e.target.checked);setTarget("");}}/>Only receipts with matches</label>
              <div className="tr-list">
                {pendingIncome.map((row) => (
                  <Entry
                    key={row.id}
                    row={row}
                    busy={busy}
                    count={counts.get(row.id)}
                    selected={focus?.id === row.id}
                    onClick={() => {
                      if (!busy) {
                        setSelected(row.id === selected ? "" : row.id);
                        setTarget("");
                        setNotice("");
                      }
                    }}
                  />
                ))}
                {!pendingIncome.length && (
                  <p className="tr-empty">
                    No pending incoming entries in this view.
                  </p>
                )}
              </div>
            </section>
            <section
              aria-label="Possible outgoing matches"
              className="tr-column"
            >
              <header>
                <h2>2 · Money out</h2>
                <small>
                  {focus
                    ? `${candidates.length} possible ${candidates.length === 1 ? "match" : "matches"}`
                    : "Choose money in first"}
                </small>
              </header>
              {focus && (
                <input
                  className="tr-search"
                  aria-label="Search possible transfer matches"
                  placeholder="Search matches, accounts or dates…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              <div className="tr-list">
                {matches.map((row) => (
                  <Entry
                    key={row.id}
                    row={row}
                    busy={busy}
                    days={focus ? dayGap(focus,row) : undefined}
                    selected={outgoing?.id === row.id}
                    onClick={() => {
                      if (!busy) setTarget(row.id === target ? "" : row.id);
                    }}
                  />
                ))}
                {!matches.length && (
                  <p className="tr-empty">
                    {!focus
                      ? "Select an incoming transaction to see its possible matches."
                      : !valid
                        ? "Set a valid percentage band."
                        : candidates.length
                          ? "No matches for this search."
                          : "No matching outgoing entries. Adjust the band or import the other account’s month."}
                  </p>
                )}
              </div>
            </section>
          </div>
          <div className={`tr-pair-dock ${dockOver ? "is-over" : ""} ${focus && outgoing ? "is-ready" : ""}`} aria-label="Transfer pair dock"
            onDragOver={e => {if (!busy && e.dataTransfer.types.includes("application/urbanomics-transfer")) {e.preventDefault();setDockOver(true);}}}
            onDragLeave={e => {if(!e.currentTarget.contains(e.relatedTarget))setDockOver(false);}} onDrop={dropPair}>
            <div className="tr-dock-account"><small>FROM</small><strong>{outgoing?.account || "Drop money out here"}</strong><span>{outgoing ? money(-outgoing.amountCents) : "Choose a matching debit"}</span>{outgoing && <button onClick={() => onSource(outgoing.id)}>Inspect outgoing source</button>}</div>
            <div className="tr-dock-connector" aria-hidden="true">{outgoing && focus ? "● ━━ → ━━ ●" : "○ ┄┄ → ┄┄ ○"}</div>
            <div className="tr-dock-account"><small>TO</small><strong>{focus?.account || "Choose money in"}</strong><span>{focus ? money(focus.amountCents) : "Start with a receipt"}</span>{focus && <button onClick={() => onSource(focus.id)}>Inspect incoming source</button>}</div>
          </div>
          <div className="tr-link-footer">
            <div>
              {focus && outgoing ? (
                <>
                  <Difference outgoing={outgoing} incoming={focus} />
                  {focus.amountCents > -outgoing.amountCents && (
                    <small>
                      The extra stays separate from income until explained.
                    </small>
                  )}
                </>
              ) : (
                <span>Select both entries to link them.</span>
              )}
            </div>
            <button disabled={busy || !pendingIncome.length} onClick={nextIncoming}>Next incoming</button>
            <button
              className="primary"
              disabled={busy || !focus || !outgoing || !valid}
              onClick={link}
            >
              Link transfer
            </button>
          </div>
        </>
      ) : (
        <div className="tr-linked-list">
          {!pairs.length && (
            <p className="tr-empty">No linked transfers in this view.</p>
          )}
          {pairs.map((pair) => (
            <article className="tr-linked-pair" key={pair.outgoing.id}>
              <div className="tr-linked-entries">
                {[pair.incoming, pair.outgoing].map((row) => (
                  <button
                    key={row.id}
                    onClick={() => onSource(row.id)}
                    title={row.originalDescription || row.description}
                  >
                    <strong>{row.description}</strong>
                    <small>
                      {row.account}
                      {row.deleted ? " (deleted)" : ""} · {row.date}
                    </small>
                    <span>
                      {row.amountCents > 0 ? "+" : ""}
                      {money(row.amountCents)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="tr-linked-bottom">
                <Difference {...pair} />
                <button
                  disabled={
                    busy || pair.outgoing.deleted || pair.incoming.deleted
                  }
                  onClick={() => unlink(pair)}
                >
                  Unlink pair
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
