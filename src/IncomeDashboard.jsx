import React from "react";
import { YearChart } from "./DashboardCharts.jsx";
import { StatRow } from "./ui.jsx";
import { plural } from "./format.js";

// Money in: what it was (its saved purpose) leads; tags describe it underneath. One name per figure.
export function IncomeDashboard({ model, months, currency, selectedMonth, onMonth, year, money, onOpen, partialFrom }) {
  const purposes = model.cashGroups.slice(0, 4);
  const max = Math.max(1, ...model.incomeBreakdown.map((g) => g.cents));
  return (
    <div className="dash-income-view">
      <StatRow items={[
        { label: "Income", value: money(model.incomeReceived), delta: "Money in marked as income", emphasis: true, onClick: () => onOpen("Income", purposes[0].rows) },
        { label: "Repayments", value: money(model.repaymentReceived), delta: "Paid back for shared costs", onClick: () => onOpen("Repayments", purposes[1].rows) },
        { label: "Other money in", value: money(model.otherReceived), delta: "Not sorted yet, or extra received on transfers", onClick: () => onOpen("Other money in", [...purposes[2].rows, ...purposes[3].rows]) },
        { label: "Cash received", value: money(model.cashReceived), delta: "Recorded by hand; not in bank totals", onClick: () => onOpen("Cash received outside your accounts", model.cash) },
      ]} />
      <section className="dash-panel">
        <div className="dash-panel-heading">
          <h2>{year} by month</h2>
        </div>
        <YearChart {...{ months, currency, selectedMonth, onMonth, partialFrom }} kind="income" />
        <p className="dash-caption">Colored by income tag. A tag describes money in; its saved purpose decides whether it's income or a repayment.</p>
      </section>
      <section className="dash-panel">
        <div className="dash-panel-heading">
          <h2>By income tag</h2>
          <span className="dash-caption tabular">{money(model.cashIn)} in from outside your accounts</span>
        </div>
        <div className="dash-bars">
          {model.incomeBreakdown.map((g) => (
            <article className="dash-category-breakdown" key={g.id} style={{ "--c": g.color }}>
              <button className="dash-bar" onClick={() => onOpen(g.name, g.rows)}>
                <span className="dash-between">
                  <span><i style={{ background: g.color }} />{g.name}</span>
                  <strong className="tabular">{money(g.cents)}</strong>
                </span>
                <span className="dash-track" aria-hidden="true">
                  <span className="dash-net" style={{ width: `${(100 * g.cents) / max}%` }} />
                </span>
                <small>{plural(g.rows.length, "payment", "payments")}</small>
              </button>
            </article>
          ))}
        </div>
        {!model.inflow.length && <p className="dash-caption">No money in matches these dates and tags.</p>}
      </section>
    </div>
  );
}
