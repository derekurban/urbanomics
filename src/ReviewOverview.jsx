import React from "react";
import { reviewOverview } from "./review-overview-model.js";
import { currencyMoney } from "./CostBreakdown.jsx";
export function ReviewOverview({records, visible, entities, onStage, onSource}) {
  const summaries = reviewOverview(records, visible, entities);
  return <section className="rv-overview" aria-label="Review overview">
    <div className="rv-section-title"><div><h2>Everything finds its place.</h2><p>Your selected transactions, including those using default tags or awaiting a purpose.</p></div></div>
    {!summaries.length && <p className="rv-empty-panel">No transactions in this view.</p>}
    {summaries.map(({currency, model, income, allocated, unassigned, claims, notClaimed, noAgreement, untagged, transfers, events}) => {
      const money = n => currencyMoney(n,currency);
      return <div key={currency} className="rv-overview-currency"><h3>{currency}</h3>
        <div className="rv-overview-cards">
          <article><small>Money in · account boundary</small><strong>{money(model.cashIn)}</strong><span>Linked transfer principal excluded</span></article>
          <article><small>Money out · account boundary</small><strong>{money(model.cashOut)}</strong><span>Transfer fees included once</span></article>
          <article><small>Net external cash flow</small><strong>{money(model.cashIn-model.cashOut)}</strong><span>Manual cash received separately: {money(model.cashReceived)}</span></article>
        </div>
        <div className="rv-overview-grid">
          <article><header><h3>Incoming money</h3><button onClick={() => onStage("moneyin")}>Manage income →</button></header>
            <dl><div><dt>Specified as income</dt><dd>{money(income)}</dd></div><div><dt>Applied to expenses</dt><dd>{money(allocated)}</dd></div><div><dt>Not yet assigned</dt><dd>{money(unassigned)}</dd></div></dl>
            <p>Includes manual cash. Allocations follow the incoming receipts in this view.</p>
          </article>
          <article><header><h3>Expenses & repayments</h3><button onClick={() => onStage("organize")}>Manage expenses →</button></header>
            <dl><div><dt>Gross expenses</dt><dd>{money(model.gross)}</dd></div><div><dt>Repaid toward these expenses</dt><dd>{money(model.repaid)}</dd></div><div><dt>Still paid by you</dt><dd>{money(model.net)}</dd></div><div><dt>Claimed by other people</dt><dd>{money(claims)}</dd></div><div><dt>Claims still unpaid</dt><dd>{money(model.owed)}</dd></div></dl>
            <dl><div><dt>Not claimed by other people</dt><dd>{money(notClaimed)}</dd></div></dl>
            <p>Unclaimed includes your share and expenses without an agreement. {noAgreement} expenses have no agreed split. Repayments include later receipts across all months.</p>
          </article>
          <article><header><h3>Events in this view</h3><button onClick={() => onStage("groups")}>Manage events →</button></header>
            {events.map(event => <div className="rv-overview-event" key={event.id}><i style={{background:event.color}}/><span><strong>{event.name}</strong><small>{event.startDate || "Dates required"}{event.endDate && ` – ${event.endDate}`}</small></span><span>{visible.filter(t => t.currency === currency && t.review.groups.includes(event.id)).length} transactions</span></div>)}
            {!events.length && <p>No events linked yet. Events are optional.</p>}
          </article>
          <article><header><h3>Transfers</h3><button onClick={() => onStage("transfers")}>Manage transfers →</button></header>
            <p>{transfers.length} linked account entries, separate from income and expenses.</p>
            <div className="rv-overview-transfers">{transfers.map(t => <button key={t.id} onClick={() => onSource(t.id)}><span>{t.account}<small>{t.date} · {t.description}</small></span><strong>{money(t.amountCents)}</strong></button>)}</div>
          </article>
        </div>
        <p className="rv-help">{untagged} income / expense transactions use default tags. This describes imported activity, not proof of complete account coverage.</p>
      </div>;
    })}
  </section>;
}
