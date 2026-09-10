import React, { useState } from "react";
import {
  pendingTransfers,
  transferCandidates,
  validBand,
} from "../electron/review/transfer-model.mjs";
import { money } from "./review-model.js";
import "./transfer-workspace.css";

const api = window.urbanomics;
function Entry({ row, selected, onClick }) {
  return (
    <button className="tr-entry" aria-pressed={selected} onClick={onClick}>
      <span className="tr-check" aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
      <span className="tr-entry-text">
        <strong>{row.description}</strong>
        <small>
          <i style={{ background: row.color }} />
          {row.account} · {row.date}
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
}) {
  const [filter, setFilter] = useState("pending"),
    [band, setBand] = useState("2"),
    [selected, setSelected] = useState(""),
    [target, setTarget] = useState(""),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  const bandValue = /^\d{1,3}(\.\d{1,2})?$/.test(band)
    ? Math.round(Number(band) * 100)
    : NaN;
  const valid = validBand(bandValue),
    visibleIds = new Set(visible.map((t) => t.id));
  const pendingIncome = pendingTransfers(records).filter(
    (t) => t.amountCents > 0 && visibleIds.has(t.id),
  );
  const focus = pendingIncome.find((t) => t.id === selected);
  const candidates = valid ? transferCandidates(focus, records, bandValue) : [];
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
  return (
    <section className="transfer-workspace" aria-label="Transfer linking">
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
        </div>
        {filter === "pending" && (
          <label className="tr-band">
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
        )}
      </div>
      {notice && (
        <p className="tr-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="dr-error-text" role="alert">
          {error}
        </p>
      )}
      {filter === "pending" ? (
        <>
          <p className="tr-help">
            Start with money in, then find its outgoing match across accounts
            and months. Tolerance uses the amount sent; a shortfall defaults to
            a fee.
          </p>
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
                <h2>Money in</h2>
                <small>{pendingIncome.length} pending</small>
              </header>
              <div className="tr-list">
                {pendingIncome.map((row) => (
                  <Entry
                    key={row.id}
                    row={row}
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
                <h2>Money out</h2>
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
