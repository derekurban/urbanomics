// Independent facts, derived from saved assignments rather than review completion.
export function transactionState(row, records) {
  const r = row.review;
  const allocated =
    r.kind === "repayment" ? r.allocations.reduce((n, p) => n + p.cents, 0) : 0;
  const deducted = records.reduce(
    (n, t) =>
      n +
      (t.review.kind === "repayment"
        ? t.review.allocations
            .filter((p) => p.id === row.id)
            .reduce((s, p) => s + p.cents, 0)
        : 0),
    0,
  );
  const transfer = r.kind === "transfer" && !!r.transferId;
  const income = r.kind === "income" && !!r.incomeType;
  const unassigned =
    row.amountCents > 0 && !transfer && !income
      ? row.amountCents - allocated
      : 0;
  return {
    categorized: r.tags.length > 0,
    uncategorized: !r.tags.length,
    deducted: deducted > 0,
    deductedCents: deducted,
    allocated: allocated > 0,
    allocatedCents: allocated,
    transfer,
    income,
    unassigned: unassigned > 0,
    unassignedCents: unassigned,
    events: r.groups.length > 0,
    shared:
      r.kind === "expense" &&
      !!r.shares?.some((p) => p.id !== "me" && p.cents > 0),
  };
}
export function transactionLabels(row, facts) {
  return [
    facts.categorized ? "Categorized" : "Uncategorized",
    facts.transfer && "Transfer linked",
    facts.income && `Income · ${row.review.incomeType}`,
    facts.allocated && "Allocated to expenses",
    facts.deducted && "Has deductions",
    facts.shared && "Shared expense",
    facts.events && "In event",
    facts.unassigned && "Unassigned money in",
  ].filter(Boolean);
}
