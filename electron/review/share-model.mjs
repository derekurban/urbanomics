// Agreed shares on an expense. The user ("me") plus named people split the full amount; a person
// who has already repaid part of it keeps at least what they paid. Shares are stored as
// [{id:'me'|personId, cents}] and must total the expense.

export function splitShares(amountCents, personIds, paid = {}) {
  const people = [...new Set((personIds || []).filter(Boolean))];
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Shares need a positive expense amount.");
  if (!people.length) throw new Error("Choose at least one person to share with.");
  const each = Math.floor(amountCents / (people.length + 1));
  const shares = [{id: "me", cents: 0}, ...people.map(id => ({id, cents: Math.max(each, paid[id] || 0)}))];
  shares[0].cents = amountCents - shares.slice(1).reduce((n, s) => n + s.cents, 0);
  if (shares[0].cents < 0) throw new Error("Repayments already exceed this expense. Lower a repayment first.");
  return shares;
}

/* Cents each person has repaid against one expense, from every repayment that targets it. */
export function repaidByPerson(records, expenseId) {
  const paid = {};
  for (const r of records) {
    if (r.deleted || r.review?.kind !== "repayment" || !r.review.personId) continue;
    for (const a of r.review.allocations || []) if (a.id === expenseId && a.cents > 0) paid[r.review.personId] = (paid[r.review.personId] || 0) + a.cents;
  }
  return paid;
}

export const shareFor = (shares, personId) => shares?.find(s => s.id === personId)?.cents || 0;
export const followsEvent = (review, eventId) => typeof review?.sharesSource === "string" && review.sharesSource === "event:" + eventId;
