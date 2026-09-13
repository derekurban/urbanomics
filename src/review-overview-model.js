import { dashboard } from "./dashboard-model.js";
import { transactionFlow } from "../electron/review/tag-model.mjs";
export function reviewOverview(records, visible, entities) {
  const ids = new Set(visible.map(t => t.id));
  const scoped = records.map(t => ids.has(t.id) ? t : {...t, deleted:true});
  const sum = (rows, fn) => rows.reduce((n,r) => n + fn(r), 0);
  return [...new Set(visible.map(t => t.currency))].map(currency => {
    const rows = visible.filter(t => t.currency === currency);
    const incoming = rows.filter(t => transactionFlow(t) === "income" && t.amountCents > 0);
    const expenses = rows.filter(t => transactionFlow(t) === "expense" && t.amountCents < 0);
    const model = dashboard(scoped, entities, {from:"1900-01-01", through:"2200-12-31", currency, later:true, layer:"categories"});
    const allocated = sum(incoming, t => t.review.kind === "repayment" ? sum(t.review.allocations, a => a.cents) : 0);
    const income = sum(incoming, t => t.review.kind === "income" ? t.amountCents : 0);
    return { currency, model, income, allocated,
      unassigned: sum(incoming,t => t.amountCents) - allocated - income,
      claims: sum(expenses,t => sum(t.review.shares || [], s => s.id === "me" ? 0 : s.cents)),
      notClaimed: sum(expenses,t => -t.amountCents - sum(t.review.shares || [], s => s.id === "me" ? 0 : s.cents)),
      noAgreement: expenses.filter(t => !t.review.shares).length,
      untagged: [...incoming,...expenses].filter(t => !t.review.tags.length).length,
      transfers: rows.filter(t => transactionFlow(t) === "transfer"),
      events: entities.filter(e => e.kind === "group" && rows.some(t => t.review.groups.includes(e.id))),
    };
  });
}
