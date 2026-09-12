export const UNCATEGORIZED = "dashboard:uncategorized";
export const TRANSFER_FEES = "dashboard:transfer-fees";
export const TRANSFER_EXCESS = "dashboard:transfer-excess";
const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0);

function isLinked(row, byId) {
  const other = byId.get(row.review.transferId);
  return (
    row.review.kind === "transfer" &&
    other?.review.kind === "transfer" &&
    other.review.transferId === row.id &&
    other.currency === row.currency &&
    row.amountCents * other.amountCents < 0
  );
}
// Only the unmatched fee/excess crosses the boundary of the user's accounts.
function boundaryEntry(row, byId) {
  const transfer = isLinked(row, byId);
  const fee = transfer && row.amountCents < 0;
  const excess = transfer && row.amountCents > 0;
  const parts = !transfer
    ? categoryParts(row)
    : [
        {
          id: fee ? TRANSFER_FEES : TRANSFER_EXCESS,
          cents: fee
            ? row.review.transferFeeCents || 0
            : row.review.transferExcessCents || 0,
        },
      ];
  return {
    row,
    transfer,
    fee,
    excess,
    parts,
    cents: sum(parts, (p) => p.cents),
  };
}

export const endOfMonth = (month) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
export function availableMonths(records, currency = "CAD") {
  return [
    ...new Set(
      records
        .filter((t) => !t.deleted && t.currency === currency)
        .map((t) => t.date.slice(0, 7)),
    ),
  ].sort();
}
export function monthlyDashboard(
  records,
  entities,
  { year, currency = "CAD", categories = [], later = false, layer = "tags" },
) {
  const available = new Set(availableMonths(records, currency));
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return {
      month,
      available: available.has(month),
      model: available.has(month)
        ? dashboard(records, entities, {
            from: month + "-01",
            through: endOfMonth(month),
            currency,
            categories,
            later,
            layer,
          })
        : null,
    };
  });
}
export function vendorGroups(expenses) {
  const groups = new Map();
  for (const e of expenses) {
    const name = (e.fee ? "Transfer fee · " : "") + e.row.description;
    const key =
      (e.fee ? "fee:" : "") +
      (e.row.aliasId
        ? `alias:${e.row.aliasId}`
        : `name:${e.row.description.trim().toLocaleLowerCase()}`);
    if (!groups.has(key))
      groups.set(key, { key, name, gross: 0, repaid: 0, net: 0, rows: [] });
    const g = groups.get(key);
    g.gross += e.gross;
    g.repaid += e.repaid;
    g.net += e.net;
    g.rows.push(e);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      rows: g.rows.sort(
        (a, b) =>
          b.row.date.localeCompare(a.row.date) ||
          a.row.id.localeCompare(b.row.id),
      ),
    }))
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}

// Source balances are observations, never totals inferred from partial imports.
export function accountOverview(records, { from, through, currency = "CAD" }) {
  const active = records.filter(
    (t) => !t.deleted && !t.manual && t.currency === currency,
  );
  const byId = new Map(records.map((t) => [t.id, t]));
  const accounts = [...new Set(active.map((t) => t.accountId))].map((id) => {
    const rows = active.filter((t) => t.accountId === id);
    const period = rows.filter((t) => t.date >= from && t.date <= through);
    const boundary = period
      .map((row) => boundaryEntry(row, byId))
      .filter((t) => t.cents > 0);
    const dated = rows
      .filter((t) => Number.isSafeInteger(t.balanceCents))
      .sort((a, b) => b.date.localeCompare(a.date));
    const date = dated[0]?.date;
    const observations = dated.filter((t) => t.date === date);
    const values = [...new Set(observations.map((t) => t.balanceCents))];
    return {
      id,
      name: rows[0].account,
      color: rows[0].color,
      rows: boundary,
      cashIn: sum(
        boundary.filter((t) => t.row.amountCents > 0),
        (t) => t.cents,
      ),
      cashOut: sum(
        boundary.filter((t) => t.row.amountCents < 0),
        (t) => t.cents,
      ),
      balance: {
        date,
        value: values.length === 1 ? values[0] : null,
        observations,
        ambiguous: values.length > 1,
      },
    };
  });
  const routes = new Map();
  // Attribute a route once by its outgoing date, even if the credit is in another month.
  for (const out of active.filter(
    (t) => t.amountCents < 0 && t.date >= from && t.date <= through,
  )) {
    const inc = byId.get(out.review.transferId);
    if (
      out.review.kind !== "transfer" ||
      inc?.review.kind !== "transfer" ||
      inc.review.transferId !== out.id ||
      inc.amountCents <= 0 ||
      inc.currency !== currency
    )
      continue;
    const key = `${out.accountId}:${inc.accountId}`;
    if (!routes.has(key))
      routes.set(key, {
        key,
        fromId: out.accountId,
        toId: inc.accountId,
        from: out.account,
        to: inc.account + (inc.deleted ? " (hidden)" : ""),
        fromColor: out.color,
        toColor: inc.color,
        debit: 0,
        credit: 0,
        fees: 0,
        excess: 0,
        pairs: [],
      });
    const r = routes.get(key);
    r.debit -= out.amountCents;
    r.credit += inc.amountCents;
    r.fees += out.review.transferFeeCents || 0;
    r.excess += inc.review.transferExcessCents || 0;
    r.pairs.push({ row: out, other: inc });
  }
  return {
    accounts,
    routes: [...routes.values()].sort((a, b) => b.debit - a.debit),
  };
}

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
  {
    from,
    through,
    currency = "CAD",
    categories = [],
    later = false,
    layer = "tags",
  },
) {
  const byId = new Map(records.map((t) => [t.id, t]));
  const tags = entities.filter((e) => e.kind === "category");
  const buckets = entities.filter((e) => e.kind === "bucket");
  const bucketIds = new Set(buckets.map((e) => e.id));
  const selected = new Set(
    categories.flatMap((id) =>
      bucketIds.has(id)
        ? tags
            .filter((t) => t.parentId === id)
            .map((t) => t.id)
            .concat(id)
        : [id],
    ),
  );
  const rollup = (id) =>
    layer === "categories"
      ? tags.find((t) => t.id === id && bucketIds.has(t.parentId))?.parentId ||
        id
      : id;
  const portion = (parts) =>
    sum(parts, (p) => (!selected.size || selected.has(p.id) ? p.cents : 0));
  const inPeriod = (t) => t.date >= from && t.date <= through;
  const active = records.filter((t) => !t.deleted && t.currency === currency);
  const linked = (t) => isLinked(t, byId);
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
    .map((row) => boundaryEntry(row, byId))
    .map((entry) => ({ ...entry, cents: portion(entry.parts) }))
    .filter((t) => t.cents > 0);
  const cash = active
    .filter((t) => t.manual && inPeriod(t))
    .map((row) => ({ row, cents: portion(categoryParts(row)) }))
    .filter((t) => t.cents > 0);
  const inflow = bank.filter((t) => t.row.amountCents > 0),
    outflow = bank.filter((t) => t.row.amountCents < 0);
  const categoryMap = new Map();
  const categoryNames = new Map(
    entities
      .filter((e) => e.kind === "category" || e.kind === "bucket")
      .map((e) => [e.id, e]),
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
  categoryNames.set(TRANSFER_EXCESS, {
    id: TRANSFER_EXCESS,
    name: "Unexplained transfer extra",
    color: "#b9b2c7",
  });
  for (const e of expenses)
    for (const p of e.grossParts) {
      if (selected.size && !selected.has(p.id)) continue;
      const categoryId = rollup(p.id);
      if (!categoryMap.has(categoryId))
        categoryMap.set(categoryId, {
          ...(categoryNames.get(categoryId) || {
            id: p.id,
            name: "Archived category",
            color: "#b9b2c7",
          }),
          gross: 0,
          repaid: 0,
          net: 0,
          rows: [],
        });
      const c = categoryMap.get(categoryId),
        net = e.netParts.find((n) => n.id === p.id).cents;
      c.gross += p.cents;
      c.net += net;
      c.repaid += p.cents - net;
      if (!c.rows.some((r) => r.row.id === e.row.id)) c.rows.push(e);
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
    categoryOptions: [...categoryNames.values()].filter(
      (e) =>
        !e.kind ||
        (layer === "categories"
          ? e.kind === "bucket" ||
            (e.kind === "category" && !bucketIds.has(e.parentId))
          : e.kind === "category"),
    ),
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
        id: "transfer-extra",
        label: "Unexplained transfer extra",
        rows: inflow.filter((t) => t.excess),
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
        id: "transfer-fees",
        label: "Linked transfer fees",
        rows: outflow.filter((t) => t.fee),
      },
    ],
  };
}
