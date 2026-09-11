import React, { useState } from "react";
import { currencyMoney } from "./CostBreakdown.jsx";

const shortMonth = (m) =>
  new Date(m + "-15T12:00:00Z").toLocaleDateString("en", {
    month: "short",
    timeZone: "UTC",
  });
const fullMonth = (m) =>
  new Date(m + "-15T12:00:00Z").toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0);
const tones = [
  "#b8cdb4",
  "#b9cfe5",
  "#d4bfdd",
  "#e6c5a8",
  "#add3cf",
  "#e3b9be",
  "#d3cea6",
];
const pastel = (color) =>
  /^#[0-9a-f]{6}$/i.test(color || "")
    ? "#" +
      [1, 3, 5]
        .map((i) =>
          Math.round(parseInt(color.slice(i, i + 2), 16) * 0.65 + 255 * 0.35)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    : tones[0];
const compact = (n, currency) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n / 100);

function YearChart({ months, currency, kind, selectedMonth, onMonth, cost }) {
  const [hover, setHover] = useState(null);
  const expense = kind === "expenses";
  const maxValue = Math.max(
    1,
    ...months.map((m) =>
      !m.model
        ? 0
        : expense
          ? m.model[cost]
          : Math.max(m.model.cashIn, m.model.cashOut),
    ),
  );
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const max = Math.ceil(maxValue / magnitude) * magnitude;
  const point = months.find((m) => m.month === hover);
  const categoryIds = [
    ...new Set(
      months.flatMap((m) => m.model?.categories.map((c) => c.id) || []),
    ),
  ];
  const color = (id) =>
    pastel(
      months.flatMap((m) => m.model?.categories || []).find((c) => c.id === id)
        ?.color,
    );
  const label = (m) =>
    !m.model
      ? `${fullMonth(m.month)}: no imported data`
      : expense
        ? `${fullMonth(m.month)}: ${cost === "net" ? "after repayments" : "gross expenses"} ${currencyMoney(m.model[cost], currency)}`
        : `${fullMonth(m.month)}: money in ${currencyMoney(m.model.cashIn, currency)}, money out ${currencyMoney(m.model.cashOut, currency)}`;
  return (
    <div className="dash-chart-wrap">
      <div
        className="dash-year-chart"
        aria-label={
          expense ? "Monthly expense chart" : "Monthly money in and out chart"
        }
      >
        <div className="dash-axis" aria-hidden="true">
          {[1, 0.5, 0].map((n) => (
            <span key={n}>{compact(max * n, currency)}</span>
          ))}
        </div>
        <div className="dash-plot">
          <div className="dash-gridlines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          {months.map((m) => (
            <button
              key={m.month}
              className={`dash-month-bar ${selectedMonth === m.month ? "is-selected" : ""}`}
              disabled={!m.available}
              aria-label={label(m)}
              onClick={() => onMonth(m.month)}
              onMouseEnter={() => setHover(m.month)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(m.month)}
              onBlur={() => setHover(null)}
            >
              <span className="dash-columns" aria-hidden="true">
                {!m.available ? (
                  <span className="dash-missing">—</span>
                ) : expense ? (
                  <span
                    className="dash-column dash-expense-column"
                    style={{ height: `${(100 * m.model[cost]) / max}%` }}
                  >
                    {categoryIds
                      .map((id) => m.model.categories.find((c) => c.id === id))
                      .filter(Boolean)
                      .map((c) => (
                        <i
                          key={c.id}
                          style={{
                            height: `${(100 * c[cost]) / Math.max(1, m.model[cost])}%`,
                            background: color(c.id),
                          }}
                        />
                      ))}
                  </span>
                ) : (
                  <>
                    <span
                      className="dash-column dash-in"
                      style={{ height: `${(100 * m.model.cashIn) / max}%` }}
                    />
                    <span
                      className="dash-column dash-out"
                      style={{ height: `${(100 * m.model.cashOut) / max}%` }}
                    />
                  </>
                )}
              </span>
              <span className="dash-month-label">{shortMonth(m.month)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="dash-chart-readout" role="status">
        {point
          ? label(point)
          : "Select a bar to open that month. — means no imported data."}
      </div>
      {expense ? (
        <div className="dash-chart-key">
          {categoryIds.map((id) => {
            const c = months
              .flatMap((m) => m.model?.categories || [])
              .find((c) => c.id === id);
            return (
              <span key={id}>
                <i style={{ background: color(id) }} />
                {c.name}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="dash-chart-key">
          <span>
            <i className="dash-in" />
            Money in
          </span>
          <span>
            <i className="dash-out" />
            Money out
          </span>
        </div>
      )}
    </div>
  );
}

export function TrendPanels({
  months,
  currency,
  selectedMonth,
  onMonth,
  year,
  later,
}) {
  const [cost, setCost] = useState("net");
  return (
    <div className="dash-trend-grid">
      <section className="dash-panel">
        <div className="dash-panel-heading">
          <h2>Expense trends · {year}</h2>
          <div className="dash-segmented" aria-label="Expense trend measure">
            <button
              aria-pressed={cost === "net"}
              onClick={() => setCost("net")}
            >
              After repayments
            </button>
            <button
              aria-pressed={cost === "gross"}
              onClick={() => setCost("gross")}
            >
              Gross
            </button>
          </div>
        </div>
        <YearChart
          {...{ months, currency, selectedMonth, onMonth, cost }}
          kind="expenses"
        />
        <p className="dash-caption">
          Selected expense categories ·{" "}
          {later
            ? "all saved repayments"
            : "repayments received by each month end"}
          . Linked transfer principal excluded.
        </p>
      </section>
      <section className="dash-panel">
        <div className="dash-panel-heading">
          <h2>Money in & out · {year}</h2>
        </div>
        <YearChart
          {...{ months, currency, selectedMonth, onMonth }}
          kind="cash"
        />
        <p className="dash-caption">
          Selected bank-entry categories · includes linked transfers. Each entry
          uses its own date; manual cash excluded.
        </p>
      </section>
    </div>
  );
}

export function Composition({ model, money, onCategory, onCash }) {
  const incoming = model.cashGroups
    .slice(0, 4)
    .map((g, i) => ({
      ...g,
      value: sum(g.rows, (t) => t.cents),
      color: tones[(i + 1) % tones.length],
    }))
    .filter((g) => g.value);
  const expenses = model.categories
    .filter((c) => c.net > 0)
    .map((c) => ({ ...c, value: c.net, color: pastel(c.color) }));
  const max = Math.max(1, model.net, model.cashIn);
  return (
    <section className="dash-panel dash-composition">
      <div className="dash-panel-heading">
        <h2>Inside this period</h2>
        <span>Same amount scale · {money(max)} maximum</span>
      </div>
      {[
        {
          name: "Expenses after repayments",
          total: model.net,
          items: expenses,
          expense: true,
        },
        {
          name: "Money in · gross bank receipts",
          total: model.cashIn,
          items: incoming,
        },
      ].map((g) => (
        <div className="dash-composition-row" key={g.name}>
          <div className="dash-between">
            <strong>{g.name}</strong>
            <strong>{money(g.total)}</strong>
          </div>
          <div className="dash-composition-track">
            {g.items.map((item) => (
              <button
                key={item.id}
                style={{
                  width: `${(100 * item.value) / max}%`,
                  background: item.color,
                }}
                aria-label={`${item.name || item.label}: ${money(item.value)}`}
                title={`${item.name || item.label}: ${money(item.value)}`}
                onClick={() => (g.expense ? onCategory(item) : onCash(item))}
              />
            ))}
          </div>
          <div className="dash-chart-key">
            {g.items.map((item) => (
              <button
                key={item.id}
                onClick={() => (g.expense ? onCategory(item) : onCash(item))}
              >
                <i style={{ background: item.color }} />
                {item.name || item.label} <b>{money(item.value)}</b>
              </button>
            ))}
            {!g.items.length && <span>No matching amounts</span>}
          </div>
        </div>
      ))}
    </section>
  );
}

export function AccountFlow({ overview, money, onCash, onTransfer }) {
  const max = Math.max(
    1,
    ...overview.accounts.flatMap((a) => [a.cashIn, a.cashOut]),
  );
  return (
    <>
      <section className="dash-panel dash-accounts">
        <div className="dash-panel-heading">
          <h2>Account standing</h2>
          <span>Latest imported balance · not a live bank connection</span>
        </div>
        <div className="dash-account-grid">
          {overview.accounts.map((a) => (
            <div className="dash-account-card" key={a.id}>
              <h3>
                <i style={{ background: a.color }} />
                {a.name}
              </h3>
              <button
                className="dash-balance"
                disabled={!a.balance.observations.length}
                onClick={() =>
                  onCash(
                    `${a.name} · exported balances`,
                    a.balance.observations.map((row) => ({
                      row,
                      cents: Math.abs(row.amountCents),
                    })),
                    "balances",
                  )
                }
              >
                <strong>
                  {a.balance.value !== null
                    ? money(a.balance.value)
                    : a.balance.ambiguous
                      ? "Multiple observations"
                      : "Balance unavailable"}
                </strong>
                <small>
                  {a.balance.date
                    ? `Exported ${a.balance.date}${a.balance.ambiguous ? " · inspect same-day balances" : ""}`
                    : "This export has no balance column"}
                </small>
              </button>
              <button
                className="dash-account-movement"
                onClick={() => onCash(a.name, a.rows)}
              >
                <span>
                  In <b>{money(a.cashIn)}</b>
                </span>
                <span className="dash-mini-track">
                  <i
                    className="dash-in"
                    style={{ width: `${(a.cashIn / max) * 100}%` }}
                  />
                </span>
                <span>
                  Out <b>{money(a.cashOut)}</b>
                </span>
                <span className="dash-mini-track">
                  <i
                    className="dash-out"
                    style={{ width: `${(a.cashOut / max) * 100}%` }}
                  />
                </span>
                <span>
                  Net movement <b>{money(a.cashIn - a.cashOut)}</b>
                </span>
              </button>
            </div>
          ))}
        </div>
        <p className="dash-caption">
          Balance observations use all imported dates. Movement bars use the
          selected period and whole accounts, independent of category filters.
          Missing opening balances prevent reconstructing balances from movement
          alone.
        </p>
      </section>
      <section className="dash-panel dash-routes">
        <div className="dash-panel-heading">
          <h2>Between your accounts</h2>
          <span>Registered transfers · outgoing date in this period</span>
        </div>
        {overview.routes.map((r) => (
          <button
            className="dash-route"
            key={r.key}
            onClick={() => onTransfer(r)}
          >
            <span className="dash-route-account">
              <i style={{ background: r.fromColor }} />
              {r.from}
              <small>{money(r.debit)} sent</small>
            </span>
            <span className="dash-route-arrow">
              <strong>{money(r.credit)}</strong>
              <svg
                viewBox="0 0 200 20"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M0 10H194M185 2L195 10L185 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <small>
                {r.pairs.length} linked{" "}
                {r.pairs.length === 1 ? "transfer" : "transfers"}
                {r.fees ? ` · ${money(r.fees)} fee` : ""}
                {r.excess ? ` · ${money(r.excess)} extra` : ""}
              </small>
            </span>
            <span className="dash-route-account">
              <i style={{ background: r.toColor }} />
              {r.to}
              <small>{money(r.credit)} received</small>
            </span>
          </button>
        ))}
        {!overview.routes.length && (
          <p className="dash-caption">
            No registered transfers with an outgoing entry in this period.
          </p>
        )}
        <p className="dash-caption">
          Each pair appears once in its direction. Credits can land in another
          month; category filters do not hide account routes.
        </p>
      </section>
    </>
  );
}
