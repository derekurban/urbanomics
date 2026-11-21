import React from "react";
import { costBreakdown } from "../electron/review/event-model.mjs";
import { StatRow, PersonAvatar } from "./ui.jsx";
import { money, dayLabel, plural } from "./format.js";
export const currencyMoney = money;

// What a group of expenses cost, what was paid back, and who still owes what. Only recorded splits
// count toward what's owed; expenses without one are named, not guessed.
export function CostBreakdown({ expenses, records, people = [], onPayment, preview = false }) {
  const totals = costBreakdown(expenses, records);
  if (!totals.length) return <p className="form-help">Link expenses to see what they cost and who paid back.</p>;
  const nameOf = (id) => people.find((p) => p.id === id)?.name || "Someone";
  return (
    <section className="cost-breakdown" aria-label={preview ? "Allocation preview" : "Cost breakdown"}>
      {totals.map((t) => {
        const byPerson = new Map();
        for (const r of t.rows)
          for (const s of r.review?.shares || []) {
            if (s.id === "me") continue;
            const entry = byPerson.get(s.id) || { id: s.id, share: 0, paid: 0 };
            entry.share += s.cents;
            entry.paid += r.payments.filter((p) => p.review.personId === s.id).reduce((n, p) => n + p.applied, 0);
            byPerson.set(s.id, entry);
          }
        const persons = [...byPerson.values()].sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));
        const owing = persons.filter((p) => p.share - p.paid > 0);
        const splitLabel = (r) => !r.review?.shares ? "No split yet" : String(r.review.sharesSource || "").startsWith("event:") ? "Even split" : "Own split";
        return (
          <div key={t.currency}>
            {/* What it cost you leads: your share, who still owes, then what was spent and paid back. */}
            <StatRow items={[
              { label: totals.length > 1 ? `Your share · ${t.currency}` : "Your share", value: t.unknown === t.rows.length ? "Not recorded" : money(t.own, t.currency), delta: t.unknown ? `${plural(t.unknown, "expense has", "expenses have")} no split yet` : "From recorded splits", emphasis: t.unknown < t.rows.length },
              ...(owing.length && owing.length <= 2
                ? owing.map((p) => ({ label: `${nameOf(p.id)} owes`, value: money(p.share - p.paid, t.currency), delta: `Share ${money(p.share, t.currency)} · paid ${money(p.paid, t.currency)}` }))
                : [{ label: "Still owed to you", value: t.unknown === t.rows.length ? "Not recorded" : money(t.owed, t.currency), delta: persons.length ? (owing.length ? `From ${plural(owing.length, "person", "people")}` : "Everyone has paid") : "No one shares these yet" }]),
              { label: "Spent", value: money(t.gross, t.currency), delta: t.repaid ? `${money(t.repaid, t.currency)} paid back so far` : "Nothing paid back yet" },
            ]} />
            {persons.length > 0 && (
              <div className="cost-people">
                <h3>By person</h3>
                {persons.map((p) => (
                  <div className="cost-person" key={p.id}>
                    <span><PersonAvatar name={nameOf(p.id)} />{nameOf(p.id)}</span>
                    <small className="tabular">share {money(p.share, t.currency)} · paid {money(p.paid, t.currency)}</small>
                    <strong className="tabular">{p.share - p.paid > 0 ? `owes ${money(p.share - p.paid, t.currency)}` : "settled"}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="cost-expenses">
              <h3>Expenses</h3>
              {t.rows.map((r) => (
                <details key={r.id}>
                  <summary>
                    <span>
                      {r.description}
                      <small>
                        {dayLabel(r.date)} · {r.account}
                        {r.deleted ? " · deleted account" : ""} · {splitLabel(r)}
                      </small>
                    </span>
                    <span>
                      <span className="tabular">{money(r.gross, t.currency)}</span>
                      <small className="tabular">{r.repaid ? `${money(r.repaid, t.currency)} paid back` : "nothing paid back"}</small>
                    </span>
                  </summary>
                  <p className="form-help">Your share {r.own === null ? "isn't recorded" : money(r.own, t.currency)} · still owed {r.owed === null ? "not recorded" : money(r.owed, t.currency)}</p>
                  {r.payments.map((p) => (
                    <div className="cost-payment" key={p.id}>
                      <span>
                        {nameOf(p.review.personId)} · {dayLabel(p.date)}
                        <small>{p.description}</small>
                      </span>
                      <strong className="tabular">{money(p.applied, t.currency)}</strong>
                      {onPayment && !p.deleted && <button className="sm ghost" onClick={() => onPayment(p)}>Open in Organize</button>}
                    </div>
                  ))}
                  {!r.payments.length && <p className="form-help">Nothing paid back yet.</p>}
                </details>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
