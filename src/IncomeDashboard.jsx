import React from "react";
import { YearChart } from "./DashboardCharts.jsx";

export function IncomeDashboard({
  model,
  months,
  currency,
  selectedMonth,
  onMonth,
  year,
  money,
  onOpen,
}) {
  const purposes = model.cashGroups.slice(0, 4);
  const max = Math.max(1, ...model.incomeBreakdown.map((g) => g.cents));
  return (
    <div className="dash-income-view">
      <div className="dash-stats">
        {[
          [
            "Income received",
            model.incomeReceived,
            "Marked as income in Money in",
            "dash-mint",
            purposes[0].rows,
          ],
          [
            "Repayment receipts",
            model.repaymentReceived,
            "Shared-cost payments; may include an unallocated remainder",
            "dash-blue",
            purposes[1].rows,
          ],
          [
            "Other / unassigned receipts",
            model.otherReceived,
            "Includes unexplained transfer extra",
            "dash-lilac",
            [...purposes[2].rows, ...purposes[3].rows],
          ],
        ].map(([label, value, note, tone, rows]) => (
          <button
            className={`dash-stat ${tone}`}
            key={label}
            onClick={() => onOpen(label, rows)}
          >
            <small>{label}</small>
            <strong>{money(value)}</strong>
            <span>{note}</span>
          </button>
        ))}
      </div>
      <section className="dash-panel">
        <div className="dash-panel-heading">
          <h2>Incoming money by tag · {year}</h2>
          <span>Bank receipts · {currency}</span>
        </div>
        <YearChart
          {...{ months, currency, selectedMonth, onMonth }}
          kind="income"
        />
        <p className="dash-caption">
          Tags describe the receipt; its saved purpose determines income or
          repayment. Matched internal principal is excluded.
        </p>
      </section>
      <div className="dash-grid">
        <section className="dash-panel">
          <div className="dash-panel-heading">
            <h2>Income tags</h2>
            <span>{money(model.cashIn)} external receipts</span>
          </div>
          <div className="dash-bars">
            {model.incomeBreakdown.map((g) => (
              <button
                className="dash-bar"
                key={g.id}
                onClick={() => onOpen(g.name, g.rows)}
              >
                <span className="dash-between">
                  <span>
                    <i style={{ background: g.color }} />
                    {g.name}
                  </span>
                  <strong>{money(g.cents)}</strong>
                </span>
                <span className="dash-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${(100 * g.cents) / max}%`,
                      background: g.color,
                    }}
                  />
                </span>
                <small>
                  {g.rows.length} {g.rows.length === 1 ? "receipt" : "receipts"}
                </small>
              </button>
            ))}
          </div>
          {!model.inflow.length && (
            <p className="dash-empty-text">
              No incoming bank transactions match these dates and tags.
            </p>
          )}
        </section>
        <section className="dash-panel">
          <div className="dash-panel-heading">
            <h2>Receipt purpose</h2>
            <span>Independent of tags</span>
          </div>
          {purposes.map((g) => (
            <button
              key={g.id}
              className="dash-cash-row"
              onClick={() => onOpen(g.label, g.rows)}
            >
              <span>{g.label}</span>
              <strong>{money(g.rows.reduce((n, r) => n + r.cents, 0))}</strong>
            </button>
          ))}
          <button
            className="dash-cash-note"
            onClick={() => onOpen("Cash received outside accounts", model.cash)}
          >
            <span>Manual cash · outside bank totals</span>
            <strong>{money(model.cashReceived)}</strong>
          </button>
          <p className="dash-caption">
            Expense deductions follow the expenses they repay, including across
            months. View them under Expenses; unallocated receipts do not reduce
            spending.
          </p>
        </section>
      </div>
    </div>
  );
}
