import React, { useEffect, useMemo, useState } from "react";
import { dashboard, UNCATEGORIZED, TRANSFER_FEES } from "./dashboard-model.js";
import { currencyMoney } from "./CostBreakdown.jsx";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { validDate } from "../electron/review/event-model.mjs";
import "./dashboard.css";

const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0);
const monthName = (m) =>
  new Date(m + "-15T12:00:00Z").toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const monthEnd = (m) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
function Stat({ label, value, note, tone, onClick }) {
  return (
    <button className={`dash-stat ${tone}`} onClick={onClick}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{note}</span>
    </button>
  );
}
function Stacked({ gross, net, max }) {
  return (
    <span className="dash-track" aria-hidden="true">
      <span className="dash-net" style={{ width: (100 * net) / max + "%" }} />
      <span
        className="dash-repaid"
        style={{ width: (100 * (gross - net)) / max + "%" }}
      />
    </span>
  );
}

export function Dashboard({ data, onSource }) {
  const [source, setSource] = useState(null),
    [error, setError] = useState("");
  const months = data.months
    .map((m) => m.month)
    .sort()
    .reverse();
  const latest =
    months.find((m) => m <= data.lastCompleteMonth) ||
    months[0] ||
    data.lastCompleteMonth;
  const [from, setFrom] = useState(latest + "-01"),
    [through, setThrough] = useState(monthEnd(latest));
  const [mode, setMode] = useState("spending"),
    [selected, setSelected] = useState([]),
    [later, setLater] = useState(false),
    [currency, setCurrency] = useState("CAD"),
    [detail, setDetail] = useState(null),
    [custom, setCustom] = useState(false);
  useEffect(() => {
    let current = true;
    window.urbanomics
      .reviewState()
      .then((s) => {
        if (current) {
          setSource(s);
          setError("");
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [data]);
  const valid = validDate(from) && validDate(through) && from <= through;
  const options = { from, through, currency, categories: selected, later };
  const model = useMemo(
    () =>
      source && valid
        ? dashboard(source.records, source.entities, options)
        : null,
    [source, from, through, currency, selected, later, valid],
  );
  const drill = useMemo(
    () =>
      detail?.category && source && valid
        ? dashboard(source.records, source.entities, {
            ...options,
            categories: [detail.category],
          })
        : model,
    [model, detail, source],
  );
  const money = (n) => currencyMoney(n, currency);
  function period(m) {
    setFrom(m + "-01");
    setThrough(monthEnd(m));
    setCustom(false);
    setDetail(null);
  }
  function filter(id) {
    setSelected((old) =>
      id === "all"
        ? []
        : old.includes(id)
          ? old.filter((v) => v !== id)
          : [...old, id],
    );
    setDetail(null);
  }
  const open = (title, rows, type = "expenses") =>
    setDetail({ title, rows, type });
  if (error)
    return (
      <div className="dash-empty" role="alert">
        <h1>Dashboard unavailable</h1>
        <p>{error}</p>
        <button
          onClick={() => {
            setError("");
            window.urbanomics
              .reviewState()
              .then(setSource)
              .catch((e) => setError(e.message));
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!source) return <p>Gathering your transactions…</p>;
  const currencies = [
    ...new Set(source.records.filter((t) => !t.deleted).map((t) => t.currency)),
  ].sort();
  const visibleCategories =
    model?.categoryOptions.filter(
      (c) =>
        ![UNCATEGORIZED, TRANSFER_FEES].includes(c.id) ||
        source.records.some((t) =>
          c.id === UNCATEGORIZED
            ? !t.review.tags.length
            : (t.review.transferFeeCents || 0) > 0,
        ),
    ) || [];
  const activeCount = source.records.filter((t) => !t.deleted).length;
  return (
    <div className="dash-workspace">
      <header className="dash-heading">
        <div>
          <span className="dash-eyebrow">YOUR MONEY, CONNECTED</span>
          <h1>The bigger picture.</h1>
          <p>Cash movement, shared costs, and the spending behind them.</p>
        </div>
        <button
          onClick={() =>
            setDetail({ type: "methods", title: "How the totals connect" })
          }
        >
          About these numbers
        </button>
      </header>
      {!activeCount ? (
        <section className="dash-empty">
          <h2>Your first snapshot starts the picture.</h2>
          <p>
            Import account activity in Snapshots to see your spending and cash
            flow here.
          </p>
        </section>
      ) : (
        <>
          <div className="dash-periods" aria-label="Dashboard date range">
            {months.slice(0, 3).map((m) => (
              <button
                key={m}
                aria-pressed={from === m + "-01" && through === monthEnd(m)}
                onClick={() => period(m)}
              >
                {monthName(m)}
              </button>
            ))}
            <button
              aria-pressed={
                from ===
                  source.records
                    .filter((t) => !t.deleted)
                    .map((t) => t.date)
                    .sort()[0] &&
                through ===
                  source.records
                    .filter((t) => !t.deleted)
                    .map((t) => t.date)
                    .sort()
                    .at(-1)
              }
              onClick={() => {
                const dates = source.records
                  .filter((t) => !t.deleted)
                  .map((t) => t.date)
                  .sort();
                setFrom(dates[0]);
                setThrough(dates.at(-1));
                setCustom(false);
                setDetail(null);
              }}
            >
              All dates
            </button>
            <button aria-pressed={custom} onClick={() => setCustom((v) => !v)}>
              Custom dates
            </button>
            {currencies.length > 1 && (
              <label>
                Currency
                <select
                  aria-label="Dashboard currency"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setDetail(null);
                  }}
                >
                  {[...new Set(["CAD", ...currencies])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <span>
              {from} — {through} · {currency}
            </span>
          </div>
          {custom && (
            <div className="dash-date-inputs">
              <label>
                From
                <input
                  aria-label="Dashboard from"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setDetail(null);
                  }}
                />
              </label>
              <label>
                Through
                <input
                  aria-label="Dashboard through"
                  type="date"
                  value={through}
                  onChange={(e) => {
                    setThrough(e.target.value);
                    setDetail(null);
                  }}
                />
              </label>
            </div>
          )}
          {!valid ? (
            <p role="alert">
              Choose valid dates, with the end on or after the start.
            </p>
          ) : (
            <>
              <nav className="dash-tabs" aria-label="Dashboard views">
                {[
                  ["spending", "Spending"],
                  ["cash", "Cash flow"],
                  ["events", "Events"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={mode === id}
                    onClick={() => {
                      setMode(id);
                      setDetail(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="dash-filter-heading">
                <strong>
                  {mode === "cash"
                    ? "Transaction categories"
                    : "Expense categories"}
                </strong>
                <span>
                  {selected.length
                    ? `${selected.length} selected`
                    : "All categories"}{" "}
                  · multiple selections combine
                </span>
              </div>
              <div className="dash-filters" aria-label="Dashboard categories">
                <button
                  aria-pressed={!selected.length}
                  onClick={() => filter("all")}
                >
                  All categories
                </button>
                {visibleCategories.map((c) => (
                  <button
                    key={c.id}
                    aria-pressed={selected.includes(c.id)}
                    onClick={() => filter(c.id)}
                  >
                    <i style={{ background: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
              {mode !== "cash" && (
                <label className="dash-later">
                  <input
                    type="checkbox"
                    checked={later}
                    onChange={(e) => {
                      setLater(e.target.checked);
                      setDetail(null);
                    }}
                  />
                  Include repayments received after {through}
                </label>
              )}
              {mode === "spending" && (
                <>
                  <div className="dash-stats">
                    <Stat
                      label="Paid for expenses"
                      value={money(model.gross)}
                      note="Fees included · linked transfer principal excluded"
                      tone="dash-peach"
                      onClick={() => open("Paid for expenses", model.expenses)}
                    />
                    <Stat
                      label="Repaid toward these expenses"
                      value={money(model.repaid)}
                      note={
                        later
                          ? "All saved linked repayments"
                          : "Received by " + through
                      }
                      tone="dash-blue"
                      onClick={() =>
                        open(
                          "Repayments toward these expenses",
                          model.expenses.filter((e) => e.repaid),
                        )
                      }
                    />
                    <Stat
                      label="Still paid by you"
                      value={money(model.net)}
                      note="Includes money friends still owe"
                      tone="dash-mint"
                      onClick={() => open("Still paid by you", model.expenses)}
                    />
                  </div>
                  <div className="dash-grid">
                    <section className="dash-panel">
                      <div className="dash-panel-heading">
                        <h2>Where it went</h2>
                        <span>{model.expenses.length} expense records</span>
                      </div>
                      <div className="dash-legend">
                        <span>
                          <i className="dash-net" />
                          Still paid
                        </span>
                        <span>
                          <i className="dash-repaid" />
                          Repaid
                        </span>
                      </div>
                      <div className="dash-bars">
                        {model.categories.map((c) => (
                          <button
                            key={c.id}
                            className="dash-bar"
                            onClick={() =>
                              setDetail({ title: c.name, category: c.id })
                            }
                          >
                            <span className="dash-between">
                              <span>
                                <i style={{ background: c.color }} />
                                {c.name}
                              </span>
                              <strong>{money(c.net)}</strong>
                            </span>
                            <Stacked
                              gross={c.gross}
                              net={c.net}
                              max={Math.max(
                                1,
                                ...model.categories.map((c) => c.gross),
                              )}
                            />
                            <small>
                              {money(c.gross)} paid · {money(c.repaid)} repaid
                            </small>
                          </button>
                        ))}
                      </div>
                      {!model.expenses.length && (
                        <p className="dash-empty-text">
                          No expense records match these dates and categories.
                        </p>
                      )}
                    </section>
                    <section className="dash-panel">
                      <div className="dash-panel-heading">
                        <h2>The relationships</h2>
                      </div>
                      <button
                        className="dash-relation dash-lilac"
                        onClick={() =>
                          open(
                            "Outstanding agreed shares",
                            model.expenses.filter((e) => e.owed !== null),
                            "owed",
                          )
                        }
                      >
                        <span>Friends still owe you</span>
                        <strong>
                          {model.known ? money(model.owed) : "Not set"}
                        </strong>
                        <small>
                          {model.known} expenses with recorded shares ·{" "}
                          {model.unknown} without
                        </small>
                      </button>
                      <button
                        className="dash-relation dash-sand"
                        onClick={() =>
                          setDetail({
                            title: "Linked account transfers",
                            type: "transfers",
                          })
                        }
                      >
                        <span>Internal transfers</span>
                        <strong>
                          {money(
                            sum(
                              model.expenses.filter((e) => e.fee),
                              (e) => e.gross,
                            ),
                          )}{" "}
                          in fees
                        </strong>
                        <small>Included once · principal excluded</small>
                      </button>
                      {model.events.slice(0, 2).map((e) => (
                        <button
                          className="dash-relation"
                          key={e.event.id}
                          onClick={() => open(e.event.name, e.rows)}
                        >
                          <span>{e.event.name}</span>
                          <strong>{money(e.net)}</strong>
                          <small>
                            Still paid · {e.rows.length} matching expenses
                          </small>
                        </button>
                      ))}
                    </section>
                  </div>
                </>
              )}
              {mode === "cash" && (
                <>
                  <div className="dash-stats">
                    <Stat
                      label="Gross account inflow"
                      value={money(model.cashIn)}
                      note="All matching positive bank entries"
                      tone="dash-blue"
                      onClick={() =>
                        open("Gross account inflow", model.inflow, "cash")
                      }
                    />
                    <Stat
                      label="Gross account outflow"
                      value={money(model.cashOut)}
                      note="All matching negative bank entries"
                      tone="dash-peach"
                      onClick={() =>
                        open("Gross account outflow", model.outflow, "cash")
                      }
                    />
                    <Stat
                      label="Net account movement"
                      value={money(model.cashIn - model.cashOut)}
                      note="Inflow minus outflow · not an account balance"
                      tone="dash-mint"
                      onClick={() =>
                        open("Account movements", model.bank, "cash")
                      }
                    />
                  </div>
                  <div className="dash-grid">
                    {[
                      ["Money in", model.cashGroups.slice(0, 4)],
                      ["Money out", model.cashGroups.slice(4)],
                    ].map(([title, groups]) => (
                      <section className="dash-panel" key={title}>
                        <div className="dash-panel-heading">
                          <h2>{title}</h2>
                          <span>By bank-entry date</span>
                        </div>
                        {groups.map((g) => (
                          <button
                            className="dash-cash-row"
                            key={g.id}
                            onClick={() => open(g.label, g.rows, "cash")}
                          >
                            <span>{g.label}</span>
                            <strong>
                              {money(sum(g.rows, (t) => t.cents))}
                            </strong>
                          </button>
                        ))}
                        {title === "Money in" && (
                          <button
                            className="dash-cash-note"
                            onClick={() =>
                              open(
                                "Cash received outside accounts",
                                model.cash,
                                "cash",
                              )
                            }
                          >
                            <span>Cash received · outside bank totals</span>
                            <strong>{money(model.cashReceived)}</strong>
                          </button>
                        )}
                        {title === "Money out" && (
                          <p className="dash-caption">
                            Internal transfers appear on both sides of gross
                            account movement. Transfer fees are already included
                            in the debit.
                          </p>
                        )}
                      </section>
                    ))}
                  </div>
                  <section className="dash-panel dash-accounts">
                    <div className="dash-panel-heading">
                      <h2>Across your accounts</h2>
                      <span>Selected transaction-category portions</span>
                    </div>
                    <div className="dash-account-grid">
                      {[...new Set(model.bank.map((t) => t.row.accountId))].map(
                        (id) => {
                          const list = model.bank.filter(
                            (t) => t.row.accountId === id,
                          );
                          return (
                            <button
                              key={id}
                              onClick={() =>
                                open(list[0].row.account, list, "cash")
                              }
                            >
                              <strong>
                                <i style={{ background: list[0].row.color }} />
                                {list[0].row.account}
                              </strong>
                              <span>
                                In{" "}
                                {money(
                                  sum(
                                    list.filter((t) => t.row.amountCents > 0),
                                    (t) => t.cents,
                                  ),
                                )}
                              </span>
                              <span>
                                Out{" "}
                                {money(
                                  sum(
                                    list.filter((t) => t.row.amountCents < 0),
                                    (t) => t.cents,
                                  ),
                                )}
                              </span>
                            </button>
                          );
                        },
                      )}
                    </div>
                    {!model.bank.length && (
                      <p className="dash-empty-text">
                        No bank entries match this selection.
                      </p>
                    )}
                  </section>
                </>
              )}
              {mode === "events" && (
                <>
                  <div className="dash-panel-heading">
                    <h2>Spending inside your events</h2>
                    <span>
                      Event collections may overlap; totals are not additive.
                    </span>
                  </div>
                  <div className="dash-event-grid">
                    {model.events.map((e, i) => (
                      <button
                        className={`dash-event ${["dash-lilac", "dash-blue", "dash-peach", "dash-mint"][i % 4]}`}
                        key={e.event.id}
                        onClick={() => open(e.event.name, e.rows)}
                      >
                        <h2>{e.event.name}</h2>
                        <small>
                          {e.event.startDate || "Dates not set"}
                          {e.event.endDate && " — " + e.event.endDate}
                        </small>
                        <strong>{money(e.net)}</strong>
                        <span>
                          Still paid by you · {e.rows.length} matching expenses
                        </span>
                        <Stacked
                          gross={e.gross}
                          net={e.net}
                          max={Math.max(1, e.gross)}
                        />
                        <span className="dash-between">
                          <span>Paid {money(e.gross)}</span>
                          <span>Repaid {money(e.repaid)}</span>
                        </span>
                        <small>
                          Friends still owe{" "}
                          {e.known ? money(e.owed) : "not set"}
                        </small>
                      </button>
                    ))}
                  </div>
                  {!model.events.length && (
                    <section className="dash-empty">
                      <h2>No event expenses in this selection.</h2>
                      <p>
                        Change the dates/categories, or link transactions to
                        events in Review.
                      </p>
                    </section>
                  )}
                </>
              )}
              <footer className="dash-footnote">
                <span>
                  Current saved assignments · bank-exported calendar dates ·{" "}
                  {currency} only
                </span>
                <span>
                  {mode === "cash"
                    ? "Bank cash flow excludes manual cash receipts."
                    : `${model.provisional.length} unclassified debits treated as expenses until linked or assigned.`}
                </span>
                <span>Imported activity may cover only part of a month.</span>
              </footer>
            </>
          )}
        </>
      )}
      {detail && (
        <WorkspaceModal
          title={detail.title}
          className="dash-dialog"
          onClose={() => setDetail(null)}
        >
          {detail.type === "methods" ? (
            <div className="dash-methods">
              {[
                [
                  "Gross cash flow",
                  "Uses bank entries dated inside the range, including both sides of linked transfers. Manual cash receipts remain separate. Category filters use each bank entry’s own categories.",
                ],
                [
                  "Spending",
                  "Uses negative entries dated inside the range, excluding linked transfer principal. Unclassified debits remain provisional expenses. Linked transfer fees appear once under Transfer fees (linked).",
                ],
                [
                  "Repayments",
                  "Follow the expense they reduce, even if received in a different month or hidden account. By default include payments received by the range end; the later-payments switch includes all saved repayments. Unallocated income does not reduce expenses.",
                ],
                [
                  "Category deductions",
                  "Allocate each repayment proportionally across remaining category costs, with exact-cent rounding and per-category caps. Filtered deductions follow those expense portions, not the incoming payment’s category.",
                ],
                [
                  "Agreed shares",
                  "Still paid is the expense minus repayments received. Friends still owe includes only recorded shares; missing agreements are not assumed. Amounts owed are distributed over remaining category costs.",
                ],
                [
                  "Events & history",
                  "Events are overlapping collections; an expense is counted once in overall spending. These are current assignments, not a reconstruction of past edits. Deleted accounts are excluded from cash flow and expense selection.",
                ],
              ].map(([h, p]) => (
                <section key={h}>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </section>
              ))}
            </div>
          ) : detail.type === "transfers" ? (
            <>
              <p className="dash-caption">
                All linked entries in this date range and currency, independent
                of category filters. Counterparts may fall outside the range or
                belong to a hidden account.
              </p>
              {model?.transfers
                .filter(
                  (t, i, list) =>
                    list.findIndex(
                      (p) => p.row.id === t.other.id || p.row.id === t.row.id,
                    ) === i,
                )
                .map((t) => {
                  const out = t.row.amountCents < 0 ? t.row : t.other,
                    inc = t.row.amountCents > 0 ? t.row : t.other;
                  return (
                    <div className="dash-transfer" key={out.id}>
                      <div>
                        <strong>{out.account}</strong>
                        <span>
                          {out.date} · {money(out.amountCents)}
                        </span>
                      </div>
                      <span aria-hidden="true">→</span>
                      <div>
                        <strong>{inc.account}</strong>
                        <span>
                          {inc.date} · +{money(inc.amountCents)}
                        </span>
                      </div>
                      <p>
                        Fee {money(out.review.transferFeeCents || 0)} ·
                        Unexplained extra{" "}
                        {money(inc.review.transferExcessCents || 0)}
                      </p>
                      <button
                        onClick={() => {
                          setDetail(null);
                          onSource(out.id);
                        }}
                      >
                        View original debit
                      </button>
                    </div>
                  );
                })}
              {!model?.transfers.length && (
                <p>No linked transfers in this period.</p>
              )}
            </>
          ) : detail.type === "cash" ? (
            <>
              <p className="dash-caption">
                In{" "}
                {money(
                  sum(
                    detail.rows.filter((t) => t.row.amountCents > 0),
                    (t) => t.cents,
                  ),
                )}
                {" · "}Out{" "}
                {money(
                  sum(
                    detail.rows.filter((t) => t.row.amountCents < 0),
                    (t) => t.cents,
                  ),
                )}
                {" · "}Net{" "}
                {money(
                  sum(detail.rows, (t) =>
                    t.row.amountCents < 0 ? -t.cents : t.cents,
                  ),
                )}
              </p>
              {detail.rows.map(({ row, cents }) => (
                <details className="dash-detail-row" key={row.id}>
                  <summary>
                    <span>
                      <strong>{row.description}</strong>
                      <small>
                        {row.date} · {row.account}
                      </small>
                    </span>
                    <strong>
                      {row.amountCents < 0 ? "−" : "+"}
                      {money(cents)}
                    </strong>
                  </summary>
                  <p>
                    Full source amount {money(row.amountCents)} ·{" "}
                    {row.review.kind === "unreviewed"
                      ? "Purpose unassigned"
                      : row.review.kind}
                  </p>
                  {row.review.allocations.map((a) => (
                    <p key={a.id}>
                      ↳{" "}
                      {source.records.find((t) => t.id === a.id)?.description ||
                        "Expense"}{" "}
                      · {money(a.cents)}
                    </p>
                  ))}
                  {!row.manual && (
                    <button
                      onClick={() => {
                        setDetail(null);
                        onSource(row.id);
                      }}
                    >
                      View original transaction
                    </button>
                  )}
                </details>
              ))}
              {!detail.rows.length && <p>No matching records.</p>}
            </>
          ) : (
            <>
              <p className="dash-caption">
                Paid{" "}
                {money(
                  sum(
                    detail.category ? drill.expenses : detail.rows,
                    (e) => e.gross,
                  ),
                )}{" "}
                · Repaid{" "}
                {money(
                  sum(
                    detail.category ? drill.expenses : detail.rows,
                    (e) => e.repaid,
                  ),
                )}{" "}
                · Still paid{" "}
                {money(
                  sum(
                    detail.category ? drill.expenses : detail.rows,
                    (e) => e.net,
                  ),
                )}
              </p>
              {detail.type === "owed" && (
                <p className="dash-caption">
                  Friends still owe{" "}
                  {detail.rows.length
                    ? money(sum(detail.rows, (e) => e.owed))
                    : "not set"}{" "}
                  · recorded shares only
                </p>
              )}
              {(detail.category ? drill.expenses : detail.rows).map((e) => (
                <details className="dash-detail-row" key={e.row.id}>
                  <summary>
                    <span>
                      <strong>
                        {e.fee ? "Transfer fee · " : ""}
                        {e.row.description}
                      </strong>
                      <small>
                        {e.row.date} · {e.row.account}
                      </small>
                    </span>
                    <span>
                      <strong>{money(e.net)}</strong>
                      <small>{money(e.repaid)} repaid</small>
                    </span>
                  </summary>
                  <div className="dash-detail-costs">
                    <span>
                      Selected cost <strong>{money(e.gross)}</strong>
                    </span>
                    <span>
                      Agreed own share{" "}
                      <strong>
                        {e.own === null ? "Not set" : money(e.own)}
                      </strong>
                    </span>
                    <span>
                      Friends still owe{" "}
                      <strong>
                        {e.owed === null ? "Not set" : money(e.owed)}
                      </strong>
                    </span>
                  </div>
                  {e.payments.map((p) => (
                    <div className="dash-payment" key={p.row.id}>
                      <span>
                        ↳ {p.row.description}
                        <small>
                          {p.row.date} ·{" "}
                          {p.row.manual ? "Cash receipt" : p.row.account}
                          {p.row.deleted ? " · hidden account" : ""}
                        </small>
                      </span>
                      <strong>{money(p.selected)}</strong>
                      {!p.row.manual && (
                        <button
                          onClick={() => {
                            setDetail(null);
                            onSource(p.row.id);
                          }}
                        >
                          Source
                        </button>
                      )}
                    </div>
                  ))}
                  {!e.payments.length && (
                    <p className="dash-caption">
                      No repayments applied in this view.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setDetail(null);
                      onSource(e.row.id);
                    }}
                  >
                    View original transaction
                  </button>
                </details>
              ))}
              {!(detail.category ? drill.expenses : detail.rows).length && (
                <p>No matching expenses.</p>
              )}
            </>
          )}
        </WorkspaceModal>
      )}
    </div>
  );
}
