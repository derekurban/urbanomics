import React, { useEffect, useState } from "react";
import { Icon } from "@derekurban/design-system";
import "./transfer-lab.css";
import { AccountRouteNetwork } from "./AccountRouteNetwork.jsx";
import { Alert, Segmented } from "./ui.jsx";
import { money, signedMoney, dayLabel, plural } from "./format.js";
const api = window.urbanomics;

function Transaction({ row, onSource }) {
  return (
    <button className="tl-transaction" onClick={() => onSource(row.id)} title={`${row.originalDescription || row.description}. Open the original record`}>
      <span><i style={{ background: row.color }} aria-hidden="true" />{row.account}</span>
      <strong>{row.description}</strong>
      <small className="tabular">{dayLabel(row.date)} · {signedMoney(row.amountCents, row.currency)}</small>
    </button>
  );
}

// Settings → Transfers: which accounts money moves between, how close in date and amount the two halves of
// a transfer must be, and a way to try those settings on every month before relying on them. Organize
// offers matches from the saved settings; nothing links here unless you choose pairs and link them.
export function TransferLab({ records, act, busy, onSource }) {
  const [state, setState] = useState(null),
    [draft, setDraft] = useState(null),
    [preview, setPreview] = useState(null),
    [selected, setSelected] = useState([]),
    [view, setView] = useState("unique"),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [simulation, setSimulation] = useState(true);
  const fromConfig = (s) => setDraft({ ...s.config, maxDays: String(s.config.maxDays), percent: String(s.config.basisPoints / 100) });
  async function load() {
    setWorking(true);
    setError("");
    try {
      const s = await api.transferLabState();
      setState(s);
      fromConfig(s);
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
    api.transferLabState().then((s) => { if (live) { setState(s); fromConfig(s); } }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  const recordRevision = JSON.stringify(records.map((r) => [r.id, r.version, r.deleted, r.accountId, r.date, r.amountCents, r.description]));
  useEffect(() => { setPreview(null); setSelected([]); }, [recordRevision]);
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
        basisPoints: /^\d{1,2}(\.\d{1,2})?$/.test(draft.percent) ? Math.round(Number(draft.percent) * 100) : -1,
      }
    : null;
  const valid = settings && settings.maxDays >= 0 && settings.maxDays <= 31 && settings.basisPoints >= 0 && settings.basisPoints <= 1000;
  const changed = state && draft && (JSON.stringify(draft.routes) !== JSON.stringify(state.config.routes) || settings.maxDays !== state.config.maxDays || settings.basisPoints !== state.config.basisPoints);
  async function run() {
    setWorking(true);
    setError("");
    setNotice("");
    setSelected([]);
    try {
      setPreview(await api.previewTransferLab(settings, simulation));
      setPage(0);
      setView("unique");
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
        setNotice("Settings saved. Organize uses them to suggest transfers; nothing was linked.");
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
      if (preview.simulation) {
        const result = await api.validateTransferLab(preview.settings, preview.token, selected);
        setNotice(`All ${plural(result.validated, "pair")} could be linked without using a transaction twice. Nothing was changed.`);
        return;
      }
      const result = await act(() => api.applyTransferLab(preview.settings, preview.token, selected));
      setPreview(null);
      setSelected([]);
      if (result !== false) setNotice(`Linked ${plural(result.linked, "pair")}. Find matches again to see what's left.`);
      else setError("These pairs couldn't be linked. Find matches again and choose from the new list.");
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
        {error ? <Alert action={<button className="sm" onClick={load}>Try again</button>}>{error}</Alert> : <p role="status">Loading transfer settings…</p>}
      </div>
    );
  const unique = preview?.edges.filter((e) => e.unique) || [],
    ambiguous = preview?.edges.filter((e) => !e.unique) || [];
  const used = new Set((preview?.edges || []).filter((e) => selected.includes(e.key)).flatMap((e) => [e.outgoing.id, e.incoming.id]));
  const rows = preview ? (view === "history" ? preview.backtest.pairs : view === "unmatched" ? preview.unmatched : view === "unique" ? unique : ambiguous) : [];
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, pages - 1);
  const difference = (row) => (row.differenceCents === 0 ? "same amount" : `${row.differenceCents > 0 ? "fee" : "extra received"} ${money(Math.abs(row.differenceCents), row.outgoing.currency)}`);
  return (
    <section className="transfer-lab" aria-label="Transfer settings">
      <fieldset disabled={locked} className="tl-panel">
        <legend><h3>Where money moves</h3></legend>
        <p className="form-help">Connect two accounts in the direction money goes between them, for example chequing to a credit card for its payments. The reverse direction is separate.</p>
        <AccountRouteNetwork accounts={state.accounts} routes={draft.routes} onChange={(routes) => change({ routes })} disabled={locked} />
        <div className="tl-controls">
          <label>Days apart, at most<span className="tl-unit"><input aria-label="Days apart, at most" type="number" min="0" max="31" step="1" value={draft.maxDays} onChange={(e) => change({ maxDays: e.target.value })} /><span>days</span></span></label>
          <label>Amounts may differ by<span className="tl-unit"><input aria-label="Amounts may differ by" type="number" min="0" max="10" step="0.01" value={draft.percent} onChange={(e) => change({ percent: e.target.value })} /><span>%</span></span></label>
          <button disabled={!valid || !changed} onClick={save}>{changed ? "Save settings" : "Saved"}</button>
          {changed && <button className="ghost" onClick={load}>Undo changes</button>}
        </div>
        <p className="form-help">{valid ? "The difference is measured against the money sent. If less arrives, the gap is recorded as a fee; if more arrives, it stays as extra received. Use 0% to match exact amounts only." : "Use 0 to 31 whole days, and 0 to 10% with up to two decimals."}</p>
      </fieldset>
      <section className="tl-panel" aria-label="Try these settings">
        <h3>Try these settings</h3>
        <div className="tl-run">
          <Segmented label="Which transactions" value={simulation ? "all" : "pending"} onChange={(v) => { setSimulation(v === "all"); setPreview(null); setSelected([]); setNotice(""); }}
            options={[{ value: "all", label: "As if nothing were linked" }, { value: "pending", label: "Only unlinked ones" }]} />
          <button className={preview ? "" : "primary"} disabled={locked || !valid} onClick={run}><Icon name="search" size={16} />{working && !preview ? "Looking…" : preview ? "Find again" : "Find matches"}</button>
        </div>
        <p className="form-help">
          {simulation
            ? "Looks at every month as if no transfer were linked yet, so you can see how well these settings find the transfers you already linked. Nothing is saved."
            : "Looks only at transactions that aren't linked yet. Pairs you choose here are linked for real."}{" "}
          Income, repayments, shared costs and cash are never matched.
        </p>
        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
        {preview && (
          <>
            <div className="tl-views">
              <Segmented label="Results" value={view} onChange={(v) => { setView(v); setPage(0); }} options={[
                { value: "unique", label: `One match · ${unique.length}` },
                { value: "ambiguous", label: `Several · ${ambiguous.length}` },
                { value: "unmatched", label: `None · ${preview.unmatched.length}` },
                ...(preview.backtest.total ? [{ value: "history", label: `Already linked · ${preview.backtest.total}` }] : []),
              ]} />
              {view === "unique" && unique.length > 0 && (
                selected.length ? <button className="sm ghost" disabled={locked} onClick={() => setSelected([])}>Clear selection</button>
                  : <button className="sm" disabled={locked} onClick={() => setSelected(unique.map((e) => e.key))}>Select all {unique.length}</button>
              )}
            </div>
            <p className="form-help">
              {view === "unique" ? "Each side has exactly one candidate on an allowed route. That makes a transfer likely, not certain."
                : view === "ambiguous" ? "A transaction with more than one candidate. Pick the right pair; each transaction can be used once."
                : view === "unmatched" ? "No candidate on an allowed route within the days and amount above."
                : `Of the ${plural(preview.backtest.total, "pair")} already linked, these settings find ${preview.backtest.recovered} on their own, ${preview.backtest.ambiguous} among several candidates, and ${preview.backtest.excluded} fall outside the routes, days or amount.`}
            </p>
            <div className="tl-results" aria-label="Matches">
              {!rows.length && <p className="form-help">{view === "unmatched" ? "Every transaction has at least one candidate." : view === "history" ? "Nothing is linked yet." : "Nothing here. Try more days, a larger difference or another route."}</p>}
              {rows.slice(current * 20, current * 20 + 20).map((row) =>
                view === "unmatched" ? (
                  <article className="tl-pair is-single" key={row.id}><Transaction row={row} onSource={onSource} /></article>
                ) : (
                  <article key={row.key} className="tl-pair">
                    {view !== "history" ? (
                      <input type="checkbox" aria-label={`Select ${row.outgoing.description} to ${row.incoming.description}`} checked={selected.includes(row.key)}
                        disabled={locked || (!selected.includes(row.key) && (used.has(row.outgoing.id) || used.has(row.incoming.id)))}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, row.key] : s.filter((k) => k !== row.key)))} />
                    ) : <span />}
                    <Transaction row={row.outgoing} onSource={onSource} />
                    <Icon name="arrow-right" size={16} />
                    <Transaction row={row.incoming} onSource={onSource} />
                    <small className="tl-pair-reason">
                      {view === "history"
                        ? `${row.status === "recovered" ? "Found on its own" : row.status === "ambiguous" ? "Among several" : "Outside these settings"} · ${row.reason}`
                        : `${plural(row.days, "day")} apart, ${difference(row)}${row.unique ? "" : ` · ${row.outAlternatives} candidates for the money out, ${row.inAlternatives} for the money in`}`}
                    </small>
                  </article>
                ),
              )}
            </div>
            {pages > 1 && (
              <div className="tl-pages">
                <button className="icon ghost sm" aria-label="Previous results" disabled={!current} onClick={() => setPage(current - 1)}><Icon name="chevron-left" size={16} /></button>
                <span>{current + 1} of {pages}</span>
                <button className="icon ghost sm" aria-label="Next results" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><Icon name="chevron-right" size={16} /></button>
              </div>
            )}
            {preview.edges.length > 0 && (
              <div className="tl-apply">
                <span>{selected.length ? `${plural(selected.length, "pair")} chosen, across every page.` : "Choose the pairs that are transfers."}</span>
                <button className="primary" disabled={locked || !selected.length} onClick={link}>
                  {preview.simulation ? `Check ${plural(selected.length, "pair")}` : `Link ${plural(selected.length, "pair")}`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}
