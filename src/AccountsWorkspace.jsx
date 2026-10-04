import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { AccountEditor, AccountDeleteDialog } from "./AccountSettings.jsx";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { YearChart } from "./DashboardCharts.jsx";
import { accountsModel } from "./accounts-model.js";
import { decompileRule, describeRule } from "./import-analysis.mjs";
import { Alert, Segmented, StatRow } from "./ui.jsx";
import { money, signedMoney, dayLabel, monthName, rangeLabel, plural } from "./format.js";
import "./accounts-workspace.css";
const api = window.urbanomics;

// Each account: what came in and went out (the boundary of your own accounts, so linked transfers are
// left out), its latest reported balance, transfers to your other accounts and how its files are recognized.
export function AccountsWorkspace({ data, busy, run, onSnapshots, onSource, onTransactions }) {
  const [source, setSource] = useState(null), [layouts, setLayouts] = useState([]), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(""), [currencyChoice, setCurrency] = useState(""), [yearChoice, setYear] = useState(""), [month, setMonth] = useState("");
  const [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null), [observations, setObservations] = useState(false), [limit, setLimit] = useState(10);
  useEffect(() => {
    let live = true;
    Promise.all([api.reviewState(), api.importLayouts()]).then(([s, l]) => { if (live) { setSource(s); setLayouts(l); setError(""); } }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data, reload]);
  const records = source?.records || [];
  const activeIds = new Set(data.accounts.map((a) => a.id));
  const liveRows = records.filter((r) => !r.deleted && !r.manual && activeIds.has(r.accountId));
  const currencies = [...new Set(liveRows.map((r) => r.currency))].sort();
  const currency = currencies.includes(currencyChoice) ? currencyChoice : currencies.includes("CAD") ? "CAD" : currencies[0] || "CAD";
  const currenciesOf = (id) => [...new Set(liveRows.filter((r) => r.accountId === id).map((r) => r.currency))];
  const years = [...new Set(liveRows.filter((r) => r.currency === currency).map((r) => r.date.slice(0, 4)))].sort().reverse();
  const year = years.includes(yearChoice) ? yearChoice : years[0] || String(new Date().getFullYear());
  const models = useMemo(() => accountsModel(records, data.accounts, { year, currency }), [source, data.accounts, year, currency]);
  const account = models.find((a) => a.id === selected) || models[0];
  const selectedMonth = account?.months.find((m) => m.month === month && m.count) ? month : "";
  const period = selectedMonth ? account.months.find((m) => m.month === selectedMonth) : account;
  const recent = account?.rows.filter((r) => (selectedMonth ? r.date.startsWith(selectedMonth) : r.date.startsWith(year))) || [];
  const routes = (account?.routes || []).map((r) => ({ ...r, pairs: r.pairs.filter((p) => !selectedMonth || p.row.date.startsWith(selectedMonth)) })).filter((r) => r.pairs.length);
  const periodLabel = selectedMonth ? monthName(selectedMonth) : year;
  const remembered = account ? data.rules.filter((r) => r.account_id === account.id) : [];
  const reset = () => { setMonth(""); setLimit(10); setObservations(false); };
  const recognizes = (a) => (a.prefixRegex ? `Files whose name ${describeRule(decompileRule(a.prefixRegex))}` : "Chosen by hand when you import");
  const balanceNote = (b) => (b.ambiguous ? `Different balances on ${dayLabel(b.date)}` : b.date ? `Reported ${dayLabel(b.date)}` : "No balance in its exports");
  return (
    <div className="accounts-workspace workspace-page">
      <div className="page-heading">
        <div><h1>Accounts</h1><p>What came in and went out of each account, its latest reported balance, and how its files are recognized.</p></div>
        {!!data.accounts.length && (
          <div className="page-heading-actions">
            <button onClick={onSnapshots}><Icon name="upload" size={16} />Import bank exports</button>
            {layouts.length > 0 && <button className="primary" disabled={busy || !source} onClick={() => setEditing({})}><Icon name="plus" size={16} />Add account</button>}
          </div>
        )}
      </div>
      {error && <Alert action={<button className="sm" onClick={() => setReload((n) => n + 1)}>Try again</button>}>{error}</Alert>}
      {!source && !error && <p role="status">Loading accounts…</p>}
      {source && !data.accounts.length && (
        <div className="empty-state">
          <Icon name="wallet" size={24} />
          <h2>A place for every account.</h2>
          <p>Accounts come from your bank exports. Choose the files in Snapshots and the setup suggests each account from the file names.</p>
          <div className="empty-state-actions">
            <button className="primary" onClick={onSnapshots}>Import a bank export</button>
            {layouts.length > 0 && <button onClick={() => setEditing({})}>Add one by hand</button>}
          </div>
        </div>
      )}
      {!!data.accounts.length && source && account && (
        <>
          {currencies.length > 1 && (
            <div className="accounts-toolbar">
              <Segmented label="Account currency" value={currency} onChange={(c) => { setCurrency(c); reset(); }} options={currencies.map((c) => ({ value: c, label: c }))} />
            </div>
          )}
          <div className="accounts-cards" role="group" aria-label="Choose account">
            {models.map((a) => {
              const elsewhere = !a.rows.length && currenciesOf(a.id).filter((c) => c !== currency);
              return (
                <button className="accounts-tile" key={a.id} style={{ "--account-color": a.color }} aria-pressed={a.id === account.id} onClick={() => { setSelected(a.id); reset(); }}>
                  <span className="accounts-tile-name"><i aria-hidden="true" /><strong>{a.name}</strong>{a.kind && <small>{a.kind}</small>}</span>
                  <span className="accounts-balance">{a.balance.value !== null ? money(a.balance.value, currency) : "—"}</span>
                  <small>{balanceNote(a.balance)}</small>
                  <small className="accounts-tile-count">{elsewhere?.length ? `Only in ${elsewhere.join(", ")}` : plural(a.rows.length, "transaction", "transactions")}</small>
                </button>
              );
            })}
          </div>
          <div className="accounts-detail" key={account.id} style={{ "--account-color": account.color }}>
            <div className="accounts-detail-heading">
              <div><i className="accounts-dot" aria-hidden="true" /><h2>{account.name}</h2></div>
              <div className="page-heading-actions">
                {onTransactions && <button className="sm" onClick={() => onTransactions(account.id, selectedMonth)}><Icon name="list" size={16} />See its transactions</button>}
                <button className="sm" disabled={busy} aria-label={`Edit ${account.name}`} onClick={() => setEditing(account)}>Edit account</button>
              </div>
            </div>
            <div className="accounts-columns">
              <div className="accounts-main-column">
                <section className="accounts-panel" aria-label="Money in and out">
                  <div className="accounts-panel-heading">
                    <h3>Money in and out</h3>
                    {years.length > 1 ? (
                      <select aria-label="Account year" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}>{years.map((y) => <option key={y}>{y}</option>)}</select>
                    ) : <small>{year}</small>}
                  </div>
                  <YearChart kind="cashflow" currency={currency} selectedMonth={selectedMonth}
                    months={account.months.map((m) => ({ month: m.month, available: m.count > 0, model: { cashIn: m.cashIn, cashOut: m.cashOut } }))}
                    onMonth={(m) => { setMonth(selectedMonth === m ? "" : m); setLimit(10); }} />
                  {selectedMonth && (
                    <div className="accounts-period">
                      <strong>{periodLabel}</strong>
                      <button className="sm ghost" onClick={() => { setMonth(""); setLimit(10); }}>Show all of {year}</button>
                    </div>
                  )}
                  <StatRow items={[
                    { label: "Money in", value: <span data-testid="account-money-in">{money(period.cashIn, currency)}</span> },
                    { label: "Money out", value: <span data-testid="account-money-out">{money(period.cashOut, currency)}</span> },
                    { label: "Left over", value: signedMoney(period.cashIn - period.cashOut, currency), emphasis: true, delta: "Transfers between your accounts aren't counted" },
                  ]} />
                </section>
                <section className="accounts-panel" aria-label="Transfers with your other accounts">
                  <div className="accounts-panel-heading"><h3>Transfers with your other accounts</h3><small>{periodLabel}</small></div>
                  {routes.length ? (
                    <div className="accounts-routes">
                      {routes.map((r) => (
                        <div className="accounts-route" key={r.key}>
                          <span><i style={{ background: r.fromColor }} />{data.accounts.find((a) => a.id === r.fromId)?.name || r.from}</span>
                          <Icon name="arrow-right" size={16} />
                          <span><i style={{ background: r.toColor }} />{data.accounts.find((a) => a.id === r.toId)?.name || r.to}</span>
                          <span className="accounts-route-amount">
                            <strong className="tabular">{money(r.pairs.reduce((n, p) => n + Math.min(-p.row.amountCents, p.other.amountCents), 0), currency)}</strong>
                            <small>{plural(r.pairs.length, "transfer", "transfers")}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="form-help">No linked transfers in {periodLabel}. Transfers count in the month they left.</p>}
                </section>
              </div>
              <aside className="accounts-panel accounts-side-column" aria-label="Account details">
                <dl className="accounts-facts">
                  <div>
                    <dt>Latest reported balance</dt>
                    <dd className="accounts-fact-figure">{account.balance.value !== null ? money(account.balance.value, currency) : account.balance.ambiguous ? "Different balances" : "Not in its exports"}</dd>
                    <small>{account.balance.date ? `${dayLabel(account.balance.date)}, from an imported file. Not a live bank balance.` : "Some exports carry a running balance; this one doesn't."}</small>
                    {account.balance.observations.length > 0 && <button className="link" onClick={() => setObservations(true)}>{account.balance.ambiguous ? `See the ${account.balance.observations.length} balances` : "See where it comes from"}</button>}
                  </div>
                  <div><dt>Type</dt><dd>{account.kind || "Not set"}</dd></div>
                  <div>
                    <dt>Imported</dt>
                    <dd>{plural(account.rows.length, "transaction", "transactions")} over {plural(account.snapshotMonths.length, "month", "months")}</dd>
                    {account.rows.length > 0 && <small>{rangeLabel(account.rows.at(-1).date, account.rows[0].date)}</small>}
                  </div>
                  <div><dt>Recognizes</dt><dd>{recognizes(account)}</dd></div>
                  {remembered.length > 0 && (
                    <div>
                      <dt>Also always goes here</dt>
                      {remembered.map((r) => (
                        <dd className="accounts-remembered" key={r.key + r.schema}>
                          <span>{r.key}</span>
                          <button className="sm ghost" disabled={busy} onClick={() => run(() => api.removeRule(r.key, r.schema, r.account_id), "Filename forgotten.")}>Forget</button>
                        </dd>
                      ))}
                      <small>Filenames you assigned by hand.</small>
                    </div>
                  )}
                </dl>
                <button className="danger sm" disabled={busy} aria-label={`Delete ${account.name}`} onClick={() => setDeleting(account)}>Delete account</button>
              </aside>
            </div>
            <section className="accounts-panel accounts-activity" aria-label="Activity">
              <div className="accounts-panel-heading">
                <h3>Activity</h3>
                <small>{plural(recent.length, "transaction", "transactions")} in {periodLabel}</small>
              </div>
              {recent.length ? (
                <>
                  <div className="accounts-activity-list">
                    {recent.slice(0, limit).map((r) => (
                      <button key={r.id} onClick={() => onSource?.(r.id)} aria-label={`${r.description}, ${dayLabel(r.date)}, ${signedMoney(r.amountCents, currency)}. Open the original record`}>
                        <time dateTime={r.date}>{dayLabel(r.date, { year: false })}</time>
                        <span>{r.description}<small>{r.review.kind === "transfer" ? "Transfer between your accounts" : r.amountCents > 0 ? "Money in" : "Money out"}</small></span>
                        <strong className="tabular">{signedMoney(r.amountCents, currency)}</strong>
                      </button>
                    ))}
                  </div>
                  {recent.length > limit && <button className="sm accounts-load" onClick={() => setLimit((n) => n + 20)}>Show {Math.min(20, recent.length - limit)} more of {recent.length - limit}</button>}
                </>
              ) : <p className="form-help">No transactions in {periodLabel}.</p>}
            </section>
          </div>
        </>
      )}
      {!!data.deletedAccounts?.length && (
        <details className="deleted-accounts">
          <summary>Deleted accounts ({data.deletedAccounts.length})</summary>
          {data.deletedAccounts.map((a) => (
            <div key={a.id}>
              <span><i className="accounts-dot" style={{ "--account-color": a.color }} />{a.name}</span>
              <button className="sm" disabled={busy} aria-label={`Restore ${a.name}`} onClick={() => run(() => api.restoreAccount(a.id), "Account restored.")}>Restore</button>
            </div>
          ))}
        </details>
      )}
      {editing && <AccountEditor account={editing.id ? editing : null} layouts={layouts} history={data.history} busy={busy} run={run} onClose={() => setEditing(null)} onSnapshots={onSnapshots} />}
      {deleting && <AccountDeleteDialog account={deleting} data={data} busy={busy} run={run} onClose={() => setDeleting(null)} />}
      {observations && account && (
        <WorkspaceModal title="Balance observations" size="narrow" onClose={() => setObservations(false)}>
          <p>{account.name}, {dayLabel(account.balance.date)}. {account.balance.ambiguous ? "These rows on the same day carry different balances, so no closing balance is assumed." : "The balance column of the latest row."}</p>
          <div className="accounts-observations">
            {account.balance.observations.map((r) => (
              <button key={r.id} onClick={() => { setObservations(false); onSource?.(r.id); }}>
                <span>{r.description}</span>
                <strong className="tabular">{money(r.balanceCents, currency)}</strong>
              </button>
            ))}
          </div>
        </WorkspaceModal>
      )}
    </div>
  );
}
