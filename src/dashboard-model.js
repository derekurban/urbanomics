export const UNCATEGORIZED = "dashboard:uncategorized";
export const TRANSFER_FEES = "dashboard:transfer-fees";
const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0);

// Integer largest-remainder allocation, bounded by the remaining category cost.
export function apportion(cents, parts) {
  const total = sum(parts, (p) => p.cents);
  if (!total || !cents) return parts.map((p) => ({ ...p, cents: 0 }));
  if (cents < 0 || cents > total)
    throw new Error("Allocation exceeds its expense.");
  const split = parts.map((p, i) => ({
    id: p.id,
    i,
    cents: Number((BigInt(cents) * BigInt(p.cents)) / BigInt(total)),
    remainder: (BigInt(cents) * BigInt(p.cents)) % BigInt(total),
  }));
  let left = cents - sum(split, (p) => p.cents);
  for (const p of [...split].sort((a, b) =>
    a.remainder === b.remainder
      ? a.i - b.i
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (!left--) break;
    p.cents++;
  }
  return split.map(({ id, cents }) => ({ id, cents }));
}

function categoryParts(row) {
  return row.review.tags.length
    ? row.review.tags.map((p) => ({ ...p }))
    : [{ id: UNCATEGORIZED, cents: Math.abs(row.amountCents) }];
}
export function dashboard(
  records,
  entities,
  { from, through, currency = "CAD", categories = [], later = false },
) {
  const byId = new Map(records.map((t) => [t.id, t]));
  const selected = new Set(categories);
  const portion = (parts) =>
    sum(parts, (p) => (!selected.size || selected.has(p.id) ? p.cents : 0));
  const inPeriod = (t) => t.date >= from && t.date <= through;
  const active = records.filter((t) => !t.deleted && t.currency === currency);
  const linked = (t) => {
    const other = byId.get(t.review.transferId);
    return (
      t.review.kind === "transfer" &&
      other?.review.kind === "transfer" &&
      other.review.transferId === t.id &&
      other.currency === t.currency &&
      t.amountCents * other.amountCents < 0
    );
  };
  const paymentIndex = new Map();
  // Payments from hidden accounts still reduce active expenses; voided cash is absent from records.
  for (const p of [...records].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    if (
      p.currency !== currency ||
      p.review.kind !== "repayment" ||
      (!later && p.date > through)
    )
      continue;
    for (const a of p.review.allocations)
      if (a.cents > 0) {
        if (!paymentIndex.has(a.id)) paymentIndex.set(a.id, []);
        paymentIndex.get(a.id).push({ row: p, applied: a.cents });
      }
  }
  const expenses = [];
  for (const row of active.filter((t) => t.amountCents < 0 && inPeriod(t))) {
    const transfer = linked(row);
    const cents = transfer
      ? row.review.transferFeeCents || 0
      : -row.amountCents;
    if (!cents) continue;
    const grossParts = transfer
      ? [{ id: TRANSFER_FEES, cents }]
      : categoryParts(row);
    let remaining = grossParts.map((p) => ({ ...p }));
    const payments = transfer
      ? []
      : (paymentIndex.get(row.id) || []).map((p) => {
          const parts = apportion(p.applied, remaining);
          remaining = remaining.map((part, i) => ({
            id: part.id,
            cents: part.cents - parts[i].cents,
          }));
          return { ...p, parts, selected: portion(parts) };
        });
    const gross = portion(grossParts),
      net = portion(remaining);
    if (!gross) continue;
    const shares = transfer ? null : row.review.shares;
    const owedTotal = shares
      ? sum(
          shares.filter((s) => s.id !== "me"),
          (s) =>
            Math.max(
              0,
              s.cents -
                sum(
                  payments.filter((p) => p.row.review.personId === s.id),
                  (p) => p.applied,
                ),
            ),
        )
      : null;
    expenses.push({
      row,
      fee: transfer,
      grossParts,
      netParts: remaining,
      gross,
      repaid: gross - net,
      net,
      payments: payments.filter((p) => p.selected > 0),
      owed:
        owedTotal === null ? null : portion(apportion(owedTotal, remaining)),
      own: shares
        ? portion(
            apportion(
              shares.find((s) => s.id === "me")?.cents || 0,
              grossParts,
            ),
          )
        : null,
      provisional: !transfer && row.review.kind === "unreviewed",
    });
  }
  const bank = active
    .filter((t) => !t.manual && inPeriod(t))
    .map((row) => ({
      row,
      cents: portion(categoryParts(row)),
      transfer: linked(row),
    }))
    .filter((t) => t.cents > 0);
  const cash = active
    .filter((t) => t.manual && inPeriod(t))
    .map((row) => ({ row, cents: portion(categoryParts(row)) }))
    .filter((t) => t.cents > 0);
  const inflow = bank.filter((t) => t.row.amountCents > 0),
    outflow = bank.filter((t) => t.row.amountCents < 0);
  const categoryMap = new Map();
  const categoryNames = new Map(
    entities.filter((e) => e.kind === "category").map((e) => [e.id, e]),
  );
  categoryNames.set(UNCATEGORIZED, {
    id: UNCATEGORIZED,
    name: "Uncategorized",
    color: "#b9b2c7",
  });
  categoryNames.set(TRANSFER_FEES, {
    id: TRANSFER_FEES,
    name: "Transfer fees (linked)",
    color: "#d8b38c",
  });
  for (const e of expenses)
    for (const p of e.grossParts) {
      if (selected.size && !selected.has(p.id)) continue;
      if (!categoryMap.has(p.id))
        categoryMap.set(p.id, {
          ...(categoryNames.get(p.id) || {
            id: p.id,
            name: "Archived category",
            color: "#b9b2c7",
          }),
          gross: 0,
          repaid: 0,
          net: 0,
          rows: [],
        });
      const c = categoryMap.get(p.id),
        net = e.netParts.find((n) => n.id === p.id).cents;
      c.gross += p.cents;
      c.net += net;
      c.repaid += p.cents - net;
      c.rows.push(e);
    }
  const summarize = (list) => ({
    gross: sum(list, (e) => e.gross),
    repaid: sum(list, (e) => e.repaid),
    net: sum(list, (e) => e.net),
    owed: sum(list, (e) => e.owed || 0),
    own: sum(list, (e) => e.own || 0),
    known: list.filter((e) => e.owed !== null).length,
    unknown: list.filter((e) => !e.fee && e.owed === null).length,
  });
  const events = entities
    .filter((e) => e.kind === "group")
    .map((event) => {
      const rows = expenses.filter((e) =>
        e.row.review.groups.includes(event.id),
      );
      return { event, rows, ...summarize(rows) };
    })
    .filter((e) => e.rows.length)
    .sort((a, b) => b.net - a.net);
  const transfers = active
    .filter((t) => linked(t) && inPeriod(t))
    .map((t) => ({ row: t, other: byId.get(t.review.transferId) }));
  return {
    expenses,
    categories: [...categoryMap.values()].sort((a, b) => b.net - a.net),
    categoryOptions: [...categoryNames.values()],
    events,
    ...summarize(expenses),
    bank,
    cash,
    inflow,
    outflow,
    transfers,
    cashIn: sum(inflow, (t) => t.cents),
    cashOut: sum(outflow, (t) => t.cents),
    cashReceived: sum(cash, (t) => t.cents),
    provisional: expenses.filter((e) => e.provisional),
    cashGroups: [
      {
        id: "income",
        label: "Income & interest",
        rows: inflow.filter((t) => t.row.review.kind === "income"),
      },
      {
        id: "repayment",
        label: "Repayments received",
        rows: inflow.filter((t) => t.row.review.kind === "repayment"),
      },
      {
        id: "transfer-in",
        label: "Internal transfer credits",
        rows: inflow.filter((t) => t.transfer),
      },
      {
        id: "unassigned",
        label: "Other / unassigned inflow",
        rows: inflow.filter(
          (t) =>
            !t.transfer && !["income", "repayment"].includes(t.row.review.kind),
        ),
      },
      {
        id: "expenses",
        label: "Expense debits & account fees",
        rows: outflow.filter((t) => !t.transfer),
      },
      {
        id: "transfer-out",
        label: "Internal transfer debits · fees included",
        rows: outflow.filter((t) => t.transfer),
      },
    ],
  };
}
