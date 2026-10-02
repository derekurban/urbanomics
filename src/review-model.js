import {isOther} from '../electron/review/system-tags.mjs';
export const sum = (rows) => rows.reduce((s, r) => s + r.cents, 0);
export const money = (cents) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    cents / 100,
  );
export function equal(ids, total) {
  return ids.map((id, i) => ({
    id,
    cents: Math.floor(total / ids.length) + (i < total % ids.length ? 1 : 0),
  }));
}
export function retag(previous, ids, total, entities=[]) {
  // Selecting a specific tag replaces the sole fallback. It remains available
  // to add back deliberately as a partial Other allocation.
  if (previous.length === 1 && isOther(previous[0].id, entities) && ids.some(id => !isOther(id, entities))) {
    ids = ids.filter(id => !isOther(id, entities));
    previous = [];
  }
  if (!ids.length) return [];
  const oldEqual = equal(
    previous.map((p) => p.id),
    total,
  );
  if (
    !previous.length ||
    previous.every((p, i) => p.cents === oldEqual[i].cents)
  )
    return equal(ids, total);
  const kept = ids.map((id) => ({
    id,
    cents: previous.find((p) => p.id === id)?.cents || 0,
  }));
  const missing = total - sum(kept),
    added = ids.filter((id) => !previous.some((p) => p.id === id));
  const extra = equal(added.length ? added : ids, missing);
  return kept.map((p) => ({
    ...p,
    cents: p.cents + (extra.find((e) => e.id === p.id)?.cents || 0),
  }));
}
export function divider(rows, index, absolute, precision, capacities = {}) {
  const next = rows.map((p) => ({ ...p })),
    before = sum(rows.slice(0, index));
  const a = next[index],
    b = next[index + 1],
    combined = a.cents + b.cents;
  const min = Math.max(0, combined - (capacities[b.id] ?? combined)),
    max = Math.min(combined, capacities[a.id] ?? combined);
  a.cents = Math.max(
    min,
    Math.min(max, Math.round(absolute / precision) * precision - before),
  );
  b.cents = combined - a.cents;
  return next;
}
export function capacity(expense, records, paymentId, personId) {
  let paid = 0,
    byPerson = 0;
  for (const p of records.filter(
    (t) => t.id !== paymentId && t.review.kind === "repayment",
  )) {
    const amount =
      p.review.allocations.find((a) => a.id === expense.id)?.cents || 0;
    paid += amount;
    if (p.review.personId === personId) byPerson += amount;
  }
  return Math.max(
    0,
    Math.min(
      Math.abs(expense.amountCents) - paid,
      expense.review.shares
        ? (expense.review.shares.find((p) => p.id === personId)?.cents || 0) -
            byPerson
        : Infinity,
    ),
  );
}
export function distribute(total, targets, capacities) {
  const rows = targets.map((id) => ({ id, cents: 0 }));
  let remaining = total;
  let active = rows.filter((p) => capacities[p.id] > 0);
  while (remaining && active.length) {
    const allotment = equal(
      active.map((p) => p.id),
      remaining,
    );
    let used = 0;
    active.forEach((p, i) => {
      const amount = Math.min(allotment[i].cents, capacities[p.id] - p.cents);
      p.cents += amount;
      used += amount;
    });
    if (!used) break;
    remaining -= used;
    active = active.filter((p) => p.cents < capacities[p.id]);
  }
  return [...rows, { id: "remainder", cents: remaining }];
}
export function moveTag(previous, from, to, total) {
  if (!from)
    return retag(
      previous,
      [...new Set([...previous.map((p) => p.id), to])],
      total,
    );
  if (from === to) return previous;
  const amount = previous.find((p) => p.id === from)?.cents || 0;
  const next = previous.filter((p) => p.id !== from).map((p) => ({ ...p }));
  const target = next.find((p) => p.id === to);
  if (target) target.cents += amount;
  else next.push({ id: to, cents: amount });
  return next;
}
export function flowSummary(records, tagIds) {
  const selected = new Set(tagIds),
    rows = [];
  const totals = {
    out: 0,
    income: 0,
    repayment: 0,
    unassigned: 0,
    unreviewedIn: 0,
    unreviewedOut: 0,
    transferIn: 0,
    transferOut: 0,
    transferFees: 0,
    transferExcess: 0,
  };
  for (const t of records) {
    const included = t.review.tags.filter((p) => selected.has(p.id));
    if (!included.length) continue;
    const amount = sum(included);
    let bucket;
    if (t.review.kind === "unreviewed")
      bucket = t.amountCents < 0 ? "unreviewedOut" : "unreviewedIn";
    else if (t.review.kind === "transfer") {
      bucket = t.amountCents < 0 ? "transferOut" : "transferIn";
      const fees = transferPortion(t, t.review.transferFeeCents || 0, selected);
      const excess = transferPortion(
        t,
        t.review.transferExcessCents || 0,
        selected,
      );
      totals.transferFees += fees;
      totals.transferExcess += excess;
      totals[bucket] -= fees + excess;
    } else if (t.review.kind === "expense") bucket = "out";
    else if (t.review.kind === "income") bucket = "income";
    else
      bucket = t.review.allocations.some((p) => p.cents)
        ? "repayment"
        : "unassigned";
    // Mixed repayments stay one separate gross bucket; no inferred attribution by tag.
    totals[bucket] += amount;
    rows.push({ ...t, portion: amount, bucket });
  }
  return { totals, rows };
}

function transferPortion(row, cents, selected) {
  if (!cents || !row.amountCents) return 0;
  const gross = BigInt(Math.abs(row.amountCents));
  const portions = row.review.tags.map((p, index) => ({
    id: p.id,
    index,
    cents: Number((BigInt(p.cents) * BigInt(cents)) / gross),
    remainder: (BigInt(p.cents) * BigInt(cents)) % gross,
  }));
  let remaining = cents - sum(portions);
  const ordered = [...portions].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const p of ordered) {
    if (remaining-- <= 0) break;
    p.cents++;
  }
  return sum(portions.filter((p) => selected.has(p.id)));
}
