import React from "react";
import { costBreakdown } from "../electron/review/event-model.mjs";
export const currencyMoney = (cents, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(
    cents / 100,
  );

export function CostBreakdown({
  expenses,
  records,
  people = [],
  onPayment,
  preview = false,
}) {
  const totals = costBreakdown(expenses, records);
  if (!totals.length)
    return (
      <p className="rv-help">
        Link expenses to see their costs and repayments here.
      </p>
    );
  return (
    <section
      className="cost-breakdown"
      aria-label={preview ? "Allocation preview" : "Cost breakdown"}
    >
      <h3>{preview ? "After this allocation" : "Cost breakdown"}</h3>
      {totals.map((t) => (
        <div key={t.currency}>
          <div className="cost-metrics">
            {[
              ["You paid", t.gross],
              ["Friends repaid", t.repaid],
              ["Still fronted by you", t.fronted],
            ].map(([label, value]) => (
              <div key={label}>
                <small>
                  {label} · {t.currency}
                </small>
                <strong>{currencyMoney(value, t.currency)}</strong>
              </div>
            ))}
          </div>
          <div className="cost-agreement">
            <span>
              Your agreed share{" "}
              <strong>
                {t.unknown === t.rows.length
                  ? "Not set"
                  : currencyMoney(t.own, t.currency)}
              </strong>
            </span>
            <span>
              Friends still owe{" "}
              <strong>
                {t.unknown === t.rows.length
                  ? "Not set"
                  : currencyMoney(t.owed, t.currency)}
              </strong>
            </span>
          </div>
          {!!t.unknown && (
            <p className="rv-help">
              {t.unknown} {t.unknown === 1 ? "expense has" : "expenses have"} no
              agreed split. Agreed share and amount owed include only expenses
              with a split.
            </p>
          )}
          <div className="cost-expenses">
            {t.rows.map((r) => (
              <details key={r.id}>
                <summary>
                  <span>
                    {r.description}
                    <small>
                      {r.date} · {r.account}
                      {r.deleted ? " · deleted account" : ""}
                    </small>
                  </span>
                  <span>
                    {currencyMoney(r.fronted, t.currency)}
                    <small>{currencyMoney(r.repaid, t.currency)} repaid</small>
                  </span>
                </summary>
                <p className="rv-help">
                  Paid {currencyMoney(r.gross, t.currency)} · Agreed share{" "}
                  {r.own === null
                    ? "not set"
                    : currencyMoney(r.own, t.currency)}
                </p>
                {r.payments.map((p) => (
                  <div className="cost-payment" key={p.id}>
                    <span>
                      {people.find((person) => person.id === p.review.personId)
                        ?.name || "Repayment"}{" "}
                      · {p.date}
                      <small>{p.description}</small>
                    </span>
                    <strong>{currencyMoney(p.applied, t.currency)}</strong>
                    {onPayment && !p.deleted && (
                      <button onClick={() => onPayment(p)}>
                        Inspect payment
                      </button>
                    )}
                  </div>
                ))}
                {!r.payments.length && (
                  <p className="rv-help">No repayments linked yet.</p>
                )}
              </details>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
