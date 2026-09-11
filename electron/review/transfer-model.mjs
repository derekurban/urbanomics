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
