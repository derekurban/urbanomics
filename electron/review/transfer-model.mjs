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
      !t.review.reviewed &&
      !t.review.transferId &&
      t.review.kind !== "repayment" &&
      !reserved.has(t.id),
  );
}
export function transferCandidates(outgoing, records, basisPoints) {
  if (!outgoing) return [];
  return pendingTransfers(records)
    .filter(
      (t) =>
        t.accountId !== outgoing.accountId &&
        t.currency === outgoing.currency &&
        withinBand(outgoing.amountCents, t.amountCents, basisPoints),
    )
    .sort(
      (a, b) =>
        Math.abs(a.amountCents + outgoing.amountCents) -
          Math.abs(b.amountCents + outgoing.amountCents) ||
        Math.abs(Date.parse(a.date) - Date.parse(outgoing.date)) -
          Math.abs(Date.parse(b.date) - Date.parse(outgoing.date)) ||
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
