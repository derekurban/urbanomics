// Bank dates are calendar dates. UTC arithmetic avoids shifting them with the
// computer's timezone; the explicit buffer widens suggestions, never the ledger.
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "0001-01-01" &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function shiftDate(value, days) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function eventDates(values) {
  const startDate = values.startDate ?? "",
    endDate = values.endDate ?? "";
  if (
    (startDate !== "" && !validDate(startDate)) ||
    (endDate !== "" && !validDate(endDate))
  )
    throw new Error("Enter valid event dates.");
  if (startDate && endDate && startDate > endDate)
    throw new Error("Event end date must be on or after its start date.");
  return { startDate, endDate };
}
export function nearEvent(date, event, buffer = 1) {
  if (!validDate(date) || (!event.startDate && !event.endDate)) return false;
  // A single supplied endpoint means a single dated occasion, not an infinite range.
  const start = event.startDate || event.endDate,
    end = event.endDate || event.startDate;
  return date >= shiftDate(start, -buffer) && date <= shiftDate(end, buffer);
}
export function eventDateLabel(event) {
  if (!event.startDate && !event.endDate) return "No dates set";
  return event.startDate && event.endDate && event.startDate !== event.endDate
    ? `${event.startDate} – ${event.endDate}`
    : event.startDate || event.endDate;
}

export function costBreakdown(expenses, records) {
  const unique = [
    ...new Map(
      expenses
        .filter(
          (t) =>
            t.amountCents < 0 &&
            ["expense", "unreviewed"].includes(t.review.kind),
        )
        .map((t) => [t.id, t]),
    ).values(),
  ];
  const currencies = [...new Set(unique.map((t) => t.currency))];
  return currencies.map((currency) => {
    const rows = unique
      .filter((t) => t.currency === currency)
      .map((expense) => {
        const payments = records
          .filter(
            (t) => t.currency === currency && t.review.kind === "repayment",
          )
          .flatMap((t) =>
            t.review.allocations
              .filter((a) => a.id === expense.id && a.cents > 0)
              .map((a) => ({ ...t, applied: a.cents })),
          );
        const repaid = payments.reduce((n, p) => n + p.applied, 0);
        const gross = -expense.amountCents;
        const shares = expense.review.shares;
        const owed = shares
          ? shares
              .filter((s) => s.id !== "me")
              .reduce(
                (n, s) =>
                  n +
                  Math.max(
                    0,
                    s.cents -
                      payments
                        .filter((p) => p.review.personId === s.id)
                        .reduce((v, p) => v + p.applied, 0),
                  ),
                0,
              )
          : null;
        return {
          ...expense,
          gross,
          repaid,
          fronted: gross - repaid,
          own: shares ? shares.find((s) => s.id === "me")?.cents || 0 : null,
          owed,
          payments,
        };
      });
    const total = (key) => rows.reduce((n, r) => n + (r[key] || 0), 0);
    return {
      currency,
      rows,
      gross: total("gross"),
      repaid: total("repaid"),
      fronted: total("fronted"),
      own: total("own"),
      owed: total("owed"),
      unknown: rows.filter((r) => r.own === null).length,
    };
  });
}
