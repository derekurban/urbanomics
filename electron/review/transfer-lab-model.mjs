import { pendingTransfers, withinBand } from "./transfer-model.mjs";
function day(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return NaN;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date
    ? ms / 86400000
    : NaN;
}
export const pairKey = (outId, inId) => JSON.stringify([outId, inId]);
export function suggestedRoutes(accounts) {
  const one = (schema, kind) => {
    const found = accounts.filter(
      (a) => !a.deletedAt && a.schema === schema && a.kind === kind,
    );
    return found.length === 1 ? found[0].id : null;
  };
  const eq = one("eq", "savings"),
    pc = one("pc", "chequing"),
    card = one("pc", "credit"),
    simplii = one("simplii", "chequing");
  return [
    [eq, pc],
    [pc, card],
    [simplii, eq],
    [simplii, pc],
  ]
    .filter(([a, b]) => a && b)
    .map(([from, to]) => ({ from, to }));
}
export function pairReason(outgoing, incoming, settings) {
  if (
    !settings.routes.some(
      (r) => r.from === outgoing.accountId && r.to === incoming.accountId,
    )
  )
    return "Route not allowed";
  if (outgoing.currency !== incoming.currency) return "Different currencies";
  const days = Math.abs(day(incoming.date) - day(outgoing.date));
  if (!Number.isFinite(days) || days > settings.maxDays)
    return "Outside date window";
  if (
    !withinBand(
      outgoing.amountCents,
      incoming.amountCents,
      settings.basisPoints,
    )
  )
    return "Outside amount tolerance";
  return "";
}
export function transferLabCandidates(records, settings) {
  const pool = pendingTransfers(records),
    outgoing = pool.filter((r) => r.amountCents < 0),
    incoming = pool.filter((r) => r.amountCents > 0),
    edges = [],
    counts = new Map();
  // Build the complete graph before classifying any edge. Never turn an ambiguous
  // chain into a "unique" result by greedily consuming its first candidate.
  for (const input of incoming)
    for (const output of outgoing) {
      if (pairReason(output, input, settings)) continue;
      edges.push({
        key: pairKey(output.id, input.id),
        outgoing: output,
        incoming: input,
        days: Math.abs(day(input.date) - day(output.date)),
        differenceCents: -output.amountCents - input.amountCents,
      });
      counts.set(output.id, (counts.get(output.id) || 0) + 1);
      counts.set(input.id, (counts.get(input.id) || 0) + 1);
    }
  for (const edge of edges) {
    edge.outAlternatives = counts.get(edge.outgoing.id);
    edge.inAlternatives = counts.get(edge.incoming.id);
    edge.unique = edge.outAlternatives === 1 && edge.inAlternatives === 1;
  }
  edges.sort(
    (a, b) =>
      Number(b.unique) - Number(a.unique) ||
      Math.abs(a.differenceCents) - Math.abs(b.differenceCents) ||
      a.days - b.days ||
      a.key.localeCompare(b.key),
  );
  return {
    edges,
    unmatched: pool.filter((r) => r.amountCents !== 0 && !counts.has(r.id)),
    eligible: pool.length,
  };
}
export function transferLabBacktest(records, settings) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const known = records
    .filter(
      (r) =>
        !r.deleted &&
        !r.manual &&
        r.amountCents < 0 &&
        r.review.kind === "transfer",
    )
    .flatMap((outgoing) => {
      const incoming = byId.get(outgoing.review.transferId);
      return incoming &&
        !incoming.deleted &&
        !incoming.manual &&
        incoming.amountCents > 0 &&
        incoming.review.kind === "transfer" &&
        incoming.review.transferId === outgoing.id
        ? [{ outgoing, incoming }]
        : [];
    });
  const ids = new Set(known.flatMap((p) => [p.outgoing.id, p.incoming.id]));
  const copies = records.map((r) =>
    ids.has(r.id)
      ? {
          ...r,
          review: {
            ...r.review,
            kind: "unreviewed",
            transferId: "",
            shares: null,
          },
        }
      : r,
  );
  const trial = transferLabCandidates(copies, settings),
    edges = new Map(trial.edges.map((e) => [e.key, e]));
  const pairs = known.map((p) => {
    const key = pairKey(p.outgoing.id, p.incoming.id),
      edge = edges.get(key);
    return {
      ...p,
      key,
      status: edge ? (edge.unique ? "recovered" : "ambiguous") : "excluded",
      reason:
        pairReason(p.outgoing, p.incoming, settings) ||
        (!edge
          ? "Protected by another financial assignment"
          : edge.unique
            ? "Only candidate for both entries"
            : "Other candidates also qualify"),
    };
  });
  return {
    pairs,
    total: pairs.length,
    recovered: pairs.filter((p) => p.status === "recovered").length,
    ambiguous: pairs.filter((p) => p.status === "ambiguous").length,
    excluded: pairs.filter((p) => p.status === "excluded").length,
  };
}
