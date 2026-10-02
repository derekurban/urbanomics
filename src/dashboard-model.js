import { orderedTags as alphabetical, tagType } from "../electron/review/tag-model.mjs";
import { categoryColors } from "./category-colors.js";
import { systemPalette } from "../electron/review/palette.mjs";
export const UNCATEGORIZED = "dashboard:uncategorized";
export const UNGROUPED = "dashboard:ungrouped";
export const TRANSFER_FEES = "dashboard:transfer-fees";
export const TRANSFER_EXCESS = "dashboard:transfer-excess";
export const CONNECTED_REPAYMENTS = "dashboard:connected-repayments";
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
export function boundaryEntry(row, byId) {
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
  {
    year,
    currency = "CAD",
    categories = [],
    later = false,
    layer = "tags",
    incomeTags = [],
  },
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
            incomeTags,
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
  if(row.review.allocationMode==='layers'){
    const parts=row.review.tags.map(p=>({...p}));
    const repayment=row.amountCents>0&&row.review.kind==='repayment'?sum(row.review.allocations,p=>p.cents):0;
    if(repayment)parts.push({id:CONNECTED_REPAYMENTS,cents:repayment});
    const left=Math.abs(row.amountCents)-sum(parts,p=>p.cents);
    if(left>0)parts.push({id:UNCATEGORIZED,cents:left});
    return parts;
  }
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
    incomeTags = [],
  },
) {
  entities = categoryColors(entities);
  const byId = new Map(records.map((t) => [t.id, t]));
  const tags = entities.filter((e) => e.kind === "category");
  const buckets = entities.filter((e) => e.kind === "bucket");
  const bucketIds = new Set(buckets.map((e) => e.id));
  const selected = new Set(
    categories.flatMap((id) =>
      id === UNGROUPED
        ? tags
            .filter(
              (t) => tagType(t) === "expense" && !bucketIds.has(t.parentId),
            )
            .map((t) => t.id)
            .concat(id)
        : bucketIds.has(id)
          ? tags
              .filter((t) => t.parentId === id && tagType(t) === "expense")
              .map((t) => t.id)
              .concat(id)
          : [id],
    ),
  );
  const rollup = (id) => {
    const tag = tags.find((t) => t.id === id);
    return layer === "categories" && tag && tagType(tag) === "expense"
      ? bucketIds.has(tag.parentId)
        ? tag.parentId
        : UNGROUPED
      : id;
  };
  const incomingSelection = new Set(incomeTags);
  const portion = (parts, incoming = false) => {
    const selection = incoming ? incomingSelection : selected;
    return sum(parts, (p) =>
      !selection.size || selection.has(p.id) ? p.cents : 0,
    );
  };
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
    .map((entry) => ({
      ...entry,
      cents: portion(entry.parts, entry.row.amountCents > 0),
    }))
    .filter((t) => t.cents > 0);
  const cash = active
    .filter((t) => t.manual && inPeriod(t))
    .map((row) => ({ row, cents: portion(categoryParts(row), true) }))
    .filter((t) => t.cents > 0);
  const inflow = bank.filter((t) => t.row.amountCents > 0),
    outflow = bank.filter((t) => t.row.amountCents < 0);
  const flowRows = type => inflow.flatMap(entry=>{
    if(entry.row.review.allocationMode!=='layers'||entry.transfer){
      const k=entry.row.review.kind;
      return (type==='income'?k==='income':type==='repayment'?k==='repayment':!entry.transfer&&!['income','repayment'].includes(k))?[entry]:[];
    }
    const parts=entry.parts.filter(p=>(!incomingSelection.size||incomingSelection.has(p.id))&&(type==='income'?![CONNECTED_REPAYMENTS,UNCATEGORIZED].includes(p.id):type==='repayment'?p.id===CONNECTED_REPAYMENTS:p.id===UNCATEGORIZED));
    const cents=sum(parts,p=>p.cents);return cents?[{...entry,parts,cents}]:[];
  });
  const incomeRows=flowRows('income'),repaymentRows=flowRows('repayment'),unassignedRows=flowRows('unassigned');
  const categoryMap = new Map();
  const categoryNames = new Map(
    entities
      .filter((e) => e.kind === "category" || e.kind === "bucket")
      .map((e) => [e.id, e]),
  );
  categoryNames.set(UNCATEGORIZED, {
    id: UNCATEGORIZED,
    name: "Unallocated",
    color: "#b9b2c7",
  });
  categoryNames.set(CONNECTED_REPAYMENTS,{id:CONNECTED_REPAYMENTS,name:'Connected repayments',color:'#b6cbd0'});
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
  categoryNames.set(UNGROUPED, {
    ...systemPalette(entities, "ungrouped"),
    id: UNGROUPED,
    kind: "bucket",
    name: "Ungrouped tags",
  });
  const expenseUsed = new Set(
    expenses.flatMap((e) => e.grossParts.map((p) => p.id)),
  );
  const incomeUsed = new Set(inflow.flatMap((e) => e.parts.map((p) => p.id)));
  const definition = (id, lens) => {
    const entity = categoryNames.get(id);
    if (!entity) return { id, name: "Archived tag", color: "#b9b2c7" };
    return entity.kind === "category" && tagType(entity) !== lens
      ? { ...entity, name: `${entity.name} (legacy ${tagType(entity)} tag)` }
      : entity;
  };
  const incomeMap = new Map();
  for (const entry of inflow)
    for (const part of entry.parts) {
      if (incomingSelection.size && !incomingSelection.has(part.id)) continue;
      if (!part.cents) continue;
      if (!incomeMap.has(part.id))
        incomeMap.set(part.id, {
          ...definition(part.id, "income"),
          cents: 0,
          rows: [],
        });
      const group = incomeMap.get(part.id);
      group.cents += part.cents;
      group.rows.push({ ...entry, cents: part.cents });
    }
  for (const e of expenses)
    for (const p of e.grossParts) {
      if (selected.size && !selected.has(p.id)) continue;
      const categoryId = rollup(p.id);
      if (!categoryMap.has(categoryId))
        categoryMap.set(categoryId, {
          ...(definition(categoryId, "expense") || {
            id: p.id,
            name: "Archived tag",
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
    categories:
      layer === "tags"
        ? alphabetical([...categoryMap.values()])
        : [...categoryMap.values()].sort((a, b) => b.net - a.net),
    categoryOptions: alphabetical(
      [
        ...new Set([
          ...tags
            .filter((t) => tagType(t) === "expense")
            .map((t) => rollup(t.id)),
          ...(layer === "categories" ? buckets.map((b) => b.id) : []),
          ...[...expenseUsed].map(rollup),
          UNCATEGORIZED,
          TRANSFER_FEES,
        ]),
      ].map((id) => definition(id, "expense")),
    ),
    incomeOptions: alphabetical(
      [
        ...new Set([
          ...tags.filter((t) => tagType(t) === "income").map((t) => t.id),
          ...incomeUsed,
          UNCATEGORIZED,
          TRANSFER_EXCESS,
        ]),
      ].map((id) => definition(id, "income")),
    ),
    incomeBreakdown: alphabetical([...incomeMap.values()]),
    incomeReceived: sum(incomeRows,t=>t.cents),
    repaymentReceived: sum(repaymentRows,t=>t.cents),
    otherReceived: sum(unassignedRows,t=>t.cents)+sum(inflow.filter(t=>t.excess),t=>t.cents),
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
        label: "Income",
        rows: incomeRows,
      },
      {
        id: "repayment",
        label: "Repayments received",
        rows: repaymentRows,
      },
      {
        id: "transfer-extra",
        label: "Unexplained transfer extra",
        rows: inflow.filter((t) => t.excess),
      },
      {
        id: "unassigned",
        label: "Other / unassigned inflow",
        rows: unassignedRows,
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
