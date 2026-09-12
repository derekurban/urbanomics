import React, { useEffect, useState } from "react";
import "./transfer-lab.css";
const api = window.urbanomics;
const count = (n, s, p = s + "s") => `${n} ${n === 1 ? s : p}`;
const cash = (n, currency) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(n / 100);
function Transaction({ row, onSource }) {
  return (
    <button
      className="tl-transaction"
      onClick={() => onSource(row.id)}
      title={row.originalDescription || row.description}
    >
      <span>
        <i style={{ background: row.color }} />
        {row.account}
      </span>
      <strong>{row.description}</strong>
      <small>
        {row.date} · {cash(row.amountCents, row.currency)}
      </small>
    </button>
  );
}
export function TransferLab({ records, act, busy, onSource }) {
  const [state, setState] = useState(null),
    [draft, setDraft] = useState(null),
    [preview, setPreview] = useState(null),
    [selected, setSelected] = useState([]),
    [view, setView] = useState("unique"),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false);
  async function load() {
    setWorking(true);
    setError("");
    try {
      const s = await api.transferLabState();
      setState(s);
      setDraft({
        ...s.config,
        maxDays: String(s.config.maxDays),
        percent: String(s.config.basisPoints / 100),
      });
      setPreview(null);
      setSelected([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  useEffect(() => {
    let live = true;
    api
      .transferLabState()
      .then((s) => {
        if (live) {
          setState(s);
          setDraft({
            ...s.config,
            maxDays: String(s.config.maxDays),
            percent: String(s.config.basisPoints / 100),
          });
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const recordRevision = JSON.stringify(
    records.map((r) => [
      r.id,
      r.version,
      r.deleted,
      r.accountId,
      r.date,
      r.amountCents,
      r.description,
    ]),
  );
  useEffect(() => {
    setPreview(null);
    setSelected([]);
  }, [recordRevision]);
  const locked = busy || working;
  function change(changes) {
    setDraft((d) => ({ ...d, ...changes }));
    setPreview(null);
    setSelected([]);
    setNotice("");
    setError("");
  }
  const settings = draft
    ? {
        routes: draft.routes,
        maxDays: /^\d{1,2}$/.test(draft.maxDays) ? Number(draft.maxDays) : -1,
        basisPoints: /^\d{1,2}(\.\d{1,2})?$/.test(draft.percent)
          ? Math.round(Number(draft.percent) * 100)
          : -1,
      }
    : null;
  const valid =
    settings &&
    settings.maxDays >= 0 &&
    settings.maxDays <= 31 &&
    settings.basisPoints >= 0 &&
    settings.basisPoints <= 1000;
  async function run() {
    setWorking(true);
    setError("");
    setNotice("");
    setSelected([]);
    try {
      setPreview(await api.previewTransferLab(settings));
      setPage(0);
    } catch (e) {
      setPreview(null);
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function save() {
    setWorking(true);
    setError("");
    try {
      let config;
      const result = await act(async () => {
        config = await api.saveTransferLab(settings, state.config.version);
        return config;
      });
      if (result !== false) {
        setState((s) => ({ ...s, config }));
        setPreview(null);
        setSelected([]);
        setNotice("Setup saved. No transfers were linked.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function link() {
    if (!preview || !selected.length) return;
    setWorking(true);
    setError("");
    try {
      const result = await act(() =>
        api.applyTransferLab(preview.settings, preview.token, selected),
      );
      if (result !== false) {
        setNotice(
          `${count(result.linked, "pair")} linked. They are available in Linked. Run another preview to inspect what remains.`,
        );
        setPreview(null);
        setSelected([]);
      } else {
        setPreview(null);
        setSelected([]);
        setError(
          "Could not link this selection. Run a fresh preview before trying again.",
        );
      }
    } catch (e) {
      setError(e.message);
      setPreview(null);
      setSelected([]);
    } finally {
      setWorking(false);
    }
  }
  if (!draft || !state)
    return (
      <div className="transfer-lab">
        <p role={error ? "alert" : "status"}>
          {error || "Loading transfer lab…"}
        </p>
        <button onClick={load}>Reload setup</button>
      </div>
    );
  const unique = preview?.edges.filter((e) => e.unique) || [],
    ambiguous = preview?.edges.filter((e) => !e.unique) || [];
  const used = new Set(
    (preview?.edges || [])
      .filter((e) => selected.includes(e.key))
      .flatMap((e) => [e.outgoing.id, e.incoming.id]),
  );
  const rows = preview
    ? view === "history"
      ? preview.backtest.pairs
      : view === "unmatched"
        ? preview.unmatched
        : view === "unique"
          ? unique
          : ambiguous
    : [];
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, pages - 1);
  return (
    <section className="transfer-lab" aria-label="Auto-link lab">
      <div className="tl-intro">
        <div>
          <span className="tl-experiment">Temporary experiment</span>
          <h2>Find the other half.</h2>
          <p>
            Compare opposite amounts, nearby dates and allowed account routes.
            Preview first, then link the pairs you choose.
          </p>
        </div>
        <button disabled={locked} onClick={load}>
          Reload setup
        </button>
      </div>
      <details className="tl-setup" open>
        <summary>Allowed routes & matching settings</summary>
        <p>
          Rows send money; columns receive it. Each direction is independent.
          Unchecked routes are excluded from this experiment.
        </p>
        <fieldset disabled={locked}>
          <div className="tl-route-scroll">
            <table className="tl-routes">
              <thead>
                <tr>
                  <th scope="col">From ↓ / To →</th>
                  {state.accounts.map((a) => (
                    <th key={a.id} scope="col">
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((a) => (
                  <tr key={a.id}>
                    <th scope="row">
                      <i style={{ background: a.color }} />
                      {a.name}
                    </th>
                    {state.accounts.map((b) => (
                      <td key={b.id}>
                        {a.id === b.id ? (
                          <span aria-label="Same account">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`Allow ${a.name} to ${b.name}`}
                            checked={draft.routes.some(
                              (r) => r.from === a.id && r.to === b.id,
                            )}
                            onChange={(e) =>
                              change({
                                routes: e.target.checked
                                  ? [...draft.routes, { from: a.id, to: b.id }]
                                  : draft.routes.filter(
                                      (r) => r.from !== a.id || r.to !== b.id,
                                    ),
                              })
                            }
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tl-controls">
            <label>
              Date distance (± days)
              <input
                aria-label="Lab date window"
                type="number"
                min="0"
                max="31"
                step="1"
                value={draft.maxDays}
                onChange={(e) => change({ maxDays: e.target.value })}
              />
            </label>
            <label>
              Amount tolerance (±%)
              <input
                aria-label="Lab amount tolerance"
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={draft.percent}
                onChange={(e) => change({ percent: e.target.value })}
              />
            </label>
            <button disabled={!valid} onClick={save}>
              Save setup
            </button>
          </div>
        </fieldset>
        <small>
          Uses exported calendar dates and transaction amounts, not inferred
          account balances. Tolerance is relative to money sent. Start with 0%
          for exact amounts; a shortfall becomes a fee and extra received stays
          unexplained.
        </small>
        {state.config.version === 0 && (
          <p className="tl-hint">
            Suggested starting routes: Savings → Chequing → Mastercard;
            Simplii → Savings or Chequing. No reverse routes are assumed.
            Save setup to remember your choices.
          </p>
        )}
      </details>
      <div className="tl-run">
        <p>
          Scans all imported months and active accounts. The Review month and
          search filters do not limit this lab. Existing links, income,
          repayments, shared costs and manual cash remain protected.
        </p>
        <button className="primary" disabled={locked || !valid} onClick={run}>
          {working ? "Working…" : "Run preview"}
        </button>
      </div>
      {!valid && (
        <p role="alert">
          Enter 0–31 whole days and 0–10%, with up to two decimal places.
        </p>
      )}
      {error && (
        <p className="dr-error-text" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="tr-notice" role="status">
          {notice}
        </p>
      )}
      {preview && (
        <>
          <div className="tl-summary">
            <strong>{count(unique.length, "unique pair")}</strong>
            <span>{count(ambiguous.length, "competing candidate")}</span>
            <span>
              {count(
                preview.unmatched.length,
                "unmatched entry",
                "unmatched entries",
              )}
            </span>
            <small>
              “Unique” means only one candidate for each side under these
              settings; it does not prove transfer purpose.
            </small>
          </div>
          <div className="tl-history">
            <strong>Check against your existing links</strong>
            <p>
              {preview.backtest.recovered} uniquely recovered ·{" "}
              {preview.backtest.ambiguous} ambiguous ·{" "}
              {preview.backtest.excluded} outside this setup ·{" "}
              {count(preview.backtest.total, "existing pair")}
            </p>
            <small>
              Temporarily hides links in a copy of the data and adds pending
              transactions as competitors. This measures agreement with your
              links, not accuracy on unknown payments. Your saved pairs stay
              unchanged.
            </small>
          </div>
          <div className="tl-results-tools">
            <div className="rv-toggle" aria-label="Lab results">
              {[
                ["unique", "Unique"],
                ["ambiguous", "Ambiguous"],
                ["unmatched", "Unmatched"],
                ["history", "Existing pairs"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={view === id}
                  onClick={() => {
                    setView(id);
                    setPage(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              disabled={locked || !unique.length}
              onClick={() => setSelected(unique.map((e) => e.key))}
            >
              Select all {count(unique.length, "unique pair")}
            </button>
            <button
              disabled={locked || !selected.length}
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
          </div>
          <div className="tl-results" aria-label="Lab candidate list">
            {!rows.length && (
              <p className="tr-empty">
                {view === "history"
                  ? "No active linked pairs to compare."
                  : view === "unmatched"
                    ? "Every eligible entry has at least one candidate."
                    : "No candidates in this section. Try adjusting the routes or tolerances."}
              </p>
            )}
            {rows.slice(current * 20, current * 20 + 20).map((row) =>
              view === "unmatched" ? (
                <article className="tl-unmatched" key={row.id}>
                  <Transaction row={row} onSource={onSource} />
                  <small>
                    No eligible counterpart on an allowed route within the date
                    and amount window.
                  </small>
                </article>
              ) : (
                <article
                  key={row.key}
                  className={`tl-pair ${view === "history" ? "is-history" : row.unique ? "is-unique" : "is-ambiguous"}`}
                >
                  {view !== "history" && (
                    <input
                      type="checkbox"
                      aria-label={`Select pair ${row.outgoing.description} to ${row.incoming.description}`}
                      checked={selected.includes(row.key)}
                      disabled={
                        locked ||
                        (!selected.includes(row.key) &&
                          (used.has(row.outgoing.id) ||
                            used.has(row.incoming.id)))
                      }
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, row.key]
                            : s.filter((k) => k !== row.key),
                        )
                      }
                    />
                  )}
                  <Transaction row={row.outgoing} onSource={onSource} />
                  <span className="tl-arrow" aria-hidden="true">
                    →
                  </span>
                  <Transaction row={row.incoming} onSource={onSource} />
                  <div className="tl-pair-reason">
                    {view === "history" ? (
                      <>
                        <b>
                          {row.status === "recovered"
                            ? "Recovered"
                            : row.status === "ambiguous"
                              ? "Ambiguous"
                              : "Outside setup"}
                        </b>
                        <span>{row.reason}</span>
                      </>
                    ) : (
                      <>
                        <b>
                          {row.unique
                            ? "Unique pair"
                            : `${row.outAlternatives} matches for money out · ${row.inAlternatives} for money in`}
                        </b>
                        <span>
                          {row.days} day{row.days === 1 ? "" : "s"} apart ·{" "}
                          {row.differenceCents === 0
                            ? "Exact amount"
                            : `${row.differenceCents > 0 ? "Fee" : "Extra received"} ${cash(Math.abs(row.differenceCents), row.outgoing.currency)}`}
                        </span>
                      </>
                    )}
                  </div>
                </article>
              ),
            )}
          </div>
          {pages > 1 && (
            <div className="tl-pages">
              <button disabled={!current} onClick={() => setPage(current - 1)}>
                Previous results
              </button>
              <span>
                {current + 1} / {pages}
              </span>
              <button
                disabled={current === pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Next results
              </button>
            </div>
          )}
          {preview.edges.length > 0 && (
            <div className="tl-apply">
              <span>
                {count(selected.length, "pair")} selected across all result
                pages. Each entry can be used once.
              </span>
              <button
                className="primary"
                disabled={locked || !selected.length}
                onClick={link}
              >
                Link {count(selected.length, "selected pair")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
