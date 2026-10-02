export function validBand(basisPoints) {
  return (
    Number.isInteger(basisPoints) && basisPoints >= 0 && basisPoints <= 10000
  );
}
export function withinBand(outgoing, incoming, basisPoints) {
  if (
    !validBand(basisPoints) ||
    !Number.isSafeInteger(outgoing) ||
    !Number.isSafeInteger(incoming) ||
    outgoing >= 0 ||
    incoming <= 0
  )
    return false;
  const sent = BigInt(-outgoing),
    received = BigInt(incoming);
  const delta = received > sent ? received - sent : sent - received;
  return delta * 10000n <= sent * BigInt(basisPoints);
}
export function pendingTransfers(records) {
  const reserved = new Set(
    records
      .filter((t) => t.review.kind === "repayment")
      .flatMap((t) =>
        t.review.allocations.filter((p) => p.cents > 0).map((p) => p.id),
      ),
  );
  return records.filter(
    (t) =>
      !t.deleted &&
      !t.manual &&
      ["unreviewed", "expense"].includes(t.review.kind) &&
      !t.review.shares?.some((p) => p.id !== "me" && p.cents > 0) &&
      !t.review.transferId &&
      t.review.kind !== "repayment" &&
      !reserved.has(t.id),
  );
}
export function transferCandidates(focus, records, basisPoints) {
  if (!focus) return [];
  return pendingTransfers(records)
    .filter(
      (t) =>
        t.accountId !== focus.accountId &&
        t.currency === focus.currency &&
        (focus.amountCents > 0
          ? withinBand(t.amountCents, focus.amountCents, basisPoints)
          : withinBand(focus.amountCents, t.amountCents, basisPoints)),
    )
    .sort(
      (a, b) =>
        Math.abs(a.amountCents + focus.amountCents) -
          Math.abs(b.amountCents + focus.amountCents) ||
        Math.abs(Date.parse(a.date) - Date.parse(focus.date)) -
          Math.abs(Date.parse(b.date) - Date.parse(focus.date)) ||
        a.id.localeCompare(b.id),
    );
}
export function transferParts(row, counterpart) {
  const sent = Math.abs(
    row.amountCents < 0 ? row.amountCents : counterpart.amountCents,
  );
  const received =
    row.amountCents > 0 ? row.amountCents : counterpart.amountCents;
  return {
    transferFeeCents: row.amountCents < 0 ? Math.max(0, sent - received) : 0,
    transferExcessCents: row.amountCents > 0 ? Math.max(0, received - sent) : 0,
  };
}

// Manual incoming-card filters use the selected receipt as their reference amount.
export function incomingTransferCandidates(incoming, records, days, basisPoints) {
  if (!incoming || incoming.amountCents <= 0 || incoming.manual ||
      !Number.isInteger(days) || days < 0 || days > 7 ||
      !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 1000) return [];
  const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00Z') / 86400000 : NaN;
  const referenceDay = day(incoming.date), received = BigInt(incoming.amountCents);
  return pendingTransfers(records).filter(t => {
    if (t.amountCents >= 0 || t.accountId === incoming.accountId || t.currency !== incoming.currency) return false;
    const delta = BigInt(Math.abs(t.amountCents)) - received;
    return Math.abs(day(t.date) - referenceDay) <= days &&
      (delta < 0n ? -delta : delta) * 10000n <= received * BigInt(basisPoints);
  }).sort((a,b) => Math.abs(a.amountCents + incoming.amountCents) - Math.abs(b.amountCents + incoming.amountCents) ||
    Math.abs(day(a.date) - referenceDay) - Math.abs(day(b.date) - referenceDay) || a.id.localeCompare(b.id));
}
// Existing persistence expresses tolerance relative to the sent amount. Convert
// this explicitly chosen pair without changing the global matching configuration.
export function transferPairBand(outgoing, incoming) {
  const sent = BigInt(Math.abs(outgoing.amountCents)), received = BigInt(incoming.amountCents);
  const delta = received > sent ? received - sent : sent - received;
  return Number((delta * 10000n + sent - 1n) / sent);
}
