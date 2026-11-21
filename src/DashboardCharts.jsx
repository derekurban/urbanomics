import React, { useState } from "react";
import { AccountNetwork } from "./AccountNetwork.jsx";
import { money as currencyMoney, dayLabel } from "./format.js";
import { chartSeries } from "./dashboard-model.js";

const shortMonth = (m) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" });
const fullMonth = (m) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const compact = (n, currency) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n / 100);

export function YearChart({ months, currency, kind, selectedMonth, onMonth, cost = "net", partialFrom = "" }) {
  const [hover, setHover] = useState(null);
  const expense = kind === "expenses",
    incoming = kind === "income",
    stacked = expense || incoming;
  const groups = (m) => (incoming ? m.model?.incomeBreakdown || [] : m.model?.categories || []);
  const value = (m) => (incoming ? m.model.cashIn : m.model[cost]);
  const partValue = (c) => (incoming ? c.cents : c[cost]);
  const highest = Math.max(0, ...months.map((m) => (!m.model ? 0 : stacked ? value(m) : Math.max(m.model.cashIn, m.model.cashOut))));
  // A year with nothing in it gets one $0 line rather than three.
  const empty = !highest && months.some((m) => m.model);
  const maxValue = Math.max(1, highest);
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const max = Math.ceil(maxValue / magnitude) * magnitude;
  const point = months.find((m) => m.month === hover);
  const series = stacked ? chartSeries(months, groups, partValue) : [];
  const segments = (m) =>
    series
      .map((s) => ({ ...s, cents: groups(m).filter((c) => s.ids.includes(c.id)).reduce((n, c) => n + partValue(c), 0) }))
      .filter((s) => s.cents > 0);
  const swatch = (s) => (s.hatch ? { className: "dash-hatch" } : { style: { background: s.color } });
  const partial = (m) => partialFrom && m.month > partialFrom;
  const label = (m) =>
    !m.model
      ? `${fullMonth(m.month)}: nothing imported`
      : `${fullMonth(m.month)}${partial(m) ? " so far" : ""}: ` +
        (incoming
          ? `money in ${currencyMoney(m.model.cashIn, currency)}`
          : expense
            ? `${cost === "net" ? "your cost after repayments" : "spent"} ${currencyMoney(m.model[cost], currency)}`
            : `money in ${currencyMoney(m.model.cashIn, currency)}, money out ${currencyMoney(m.model.cashOut, currency)}`);
  return (
    <div className="dash-chart-wrap">
      <div className="dash-year-chart" role="group" aria-label={incoming ? "Money in by month" : expense ? "Spending by month" : "Money in and out by month"}>
        <div className="dash-axis" aria-hidden="true">
          {empty ? <span className="dash-axis-zero">{compact(0, currency)}</span> : [1, 0.5, 0].map((n) => <span key={n}>{compact(max * n, currency)}</span>)}
        </div>
        <div className="dash-plot">
          <div className="dash-gridlines" aria-hidden="true"><i /><i /><i /></div>
          {months.map((m, i) => (
            <button
              key={m.month}
              className={`dash-month-bar${selectedMonth === m.month ? " is-selected" : ""}${partial(m) ? " is-partial" : ""}`}
              disabled={!m.available}
              aria-label={label(m)}
              aria-pressed={selectedMonth === m.month}
              style={{ "--i": i }}
              onClick={() => onMonth(m.month)}
              onMouseEnter={() => setHover(m.month)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(m.month)}
              onBlur={() => setHover(null)}
            >
              <span className="dash-columns" aria-hidden="true">
                {!m.available ? null : stacked ? (
                  <span className="dash-column dash-expense-column" style={{ height: `${(100 * value(m)) / max}%` }}>
                    {segments(m).map((s) => (
                      <i key={s.id} {...swatch(s)} style={{ ...swatch(s).style, height: `${(100 * s.cents) / Math.max(1, value(m))}%` }} />
                    ))}
                  </span>
                ) : (
                  <>
                    <span className="dash-column dash-in" style={{ height: `${(100 * m.model.cashIn) / max}%` }} />
                    <span className="dash-column dash-out" style={{ height: `${(100 * m.model.cashOut) / max}%` }} />
                  </>
                )}
              </span>
              <span className="dash-month-label"><span className="dash-month-long">{shortMonth(m.month)}</span><span className="dash-month-initial" aria-hidden="true">{shortMonth(m.month)[0]}</span>{partial(m) && m.available ? <small>so far</small> : null}</span>
            </button>
          ))}
          {stacked && point?.model && segments(point).length > 0 && (
            <div
              className={`dash-chart-card${months.indexOf(point) > 8 ? " is-end" : months.indexOf(point) < 3 ? " is-start" : ""}`}
              style={{ "--at": `${((months.indexOf(point) + 0.5) / months.length) * 100}%` }}
              aria-hidden="true"
            >
              <strong>{fullMonth(point.month)}</strong>
              {[...segments(point)].reverse().map((s) => (
                <span key={s.id}><i {...swatch(s)} />{s.name}<b className="tabular">{currencyMoney(s.cents, currency)}</b></span>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="dash-chart-readout">
        {point ? label(point) : empty ? `Nothing matches in ${months[0]?.month.slice(0, 4)}.` : "Select a month to open it. Months with nothing imported are left blank."}
      </p>
      {stacked ? (
        <div className="dash-chart-key">
          {series.map((s) => (
            <span key={s.id}><i {...swatch(s)} />{s.name}</span>
          ))}
        </div>
      ) : (
        <div className="dash-chart-key">
          <span><i className="dash-in" />Money in</span>
          <span><i className="dash-out" />Money out</span>
        </div>
      )}
    </div>
  );
}

export function AccountFlow({ overview, money, onCash, onTransfer }) {
  const max = Math.max(1, ...overview.accounts.flatMap((a) => [a.cashIn, a.cashOut]));
  return (
    <>
      <section className="dash-panel dash-accounts">
        <div className="dash-panel-heading">
          <h2>Your accounts</h2>
          <span className="dash-caption">Balances are the latest in your exports, not live.</span>
        </div>
        <div className="dash-account-grid">
          {overview.accounts.map((a) => (
            <div className="dash-account-card" key={a.id}>
              <h3><i style={{ background: a.color }} />{a.name}</h3>
              <button
                className={`dash-balance${a.balance.value === null ? " is-unavailable" : ""}`}
                disabled={!a.balance.observations.length}
                onClick={() => onCash(`${a.name}: exported balances`, a.balance.observations.map((row) => ({ row, cents: Math.abs(row.amountCents) })), "balances")}
              >
                <strong className="tabular">
                  {a.balance.value !== null ? money(a.balance.value) : a.balance.ambiguous ? "Several balances that day" : "Balance unavailable"}
                </strong>
                <small>
                  {a.balance.date
                    ? `As of ${dayLabel(a.balance.date)}${a.balance.ambiguous ? " · open to compare them" : ""}`
                    : "These exports have no balance column"}
                </small>
              </button>
              <button className="dash-account-movement" onClick={() => onCash(a.name, a.rows, "cash", a.id)}>
                <span>In <b className="tabular">{money(a.cashIn)}</b></span>
                <span className="dash-mini-track"><i className="dash-in" style={{ width: `${(a.cashIn / max) * 100}%` }} /></span>
                <span>Out <b className="tabular">{money(a.cashOut)}</b></span>
                <span className="dash-mini-track"><i className="dash-out" style={{ width: `${(a.cashOut / max) * 100}%` }} /></span>
                <span>Left over <b className="tabular">{money(a.cashIn - a.cashOut)}</b></span>
              </button>
            </div>
          ))}
        </div>
        <p className="dash-caption">In and out are for the selected period, without moves between your own accounts. Filters don't change these whole-account figures.</p>
      </section>
      <AccountNetwork overview={overview} money={money} onTransfer={onTransfer} />
    </>
  );
}
