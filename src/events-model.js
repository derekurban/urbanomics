import { shiftDate } from "../electron/review/event-model.mjs";

export const eventStart = (e) => e.startDate || e.endDate || "";
// Money in from one of the event's people, on or after its first day, that isn't applied to it yet.
// Suggestions only: the person decides on the Organize desk.
export function eventPaymentSuggestions(event, records, people) {
  const start = eventStart(event);
  if (!start || !event.participants?.length) return [];
  const until = shiftDate(event.endDate || start, 90);
  const members = new Set(records.filter((t) => t.review.groups.includes(event.id)).map((t) => t.id));
  const who = people.filter((p) => event.participants.includes(p.id));
  return records
    .filter((t) => !t.deleted && t.amountCents > 0 && t.review.kind !== "transfer" && !members.has(t.id) && t.date >= start && t.date <= until)
    .filter((t) => !(t.review.allocations || []).some((a) => members.has(a.id)))
    .map((t) => {
      const person = who.find((p) => [t.review.personId, t.review.assignedPersonId].includes(p.id)) ||
        who.find((p) => p.name && ` ${`${t.description} ${t.originalDescription || ""}`.toLowerCase()} `.includes(` ${p.name.toLowerCase()} `));
      return person ? { row: t, person } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.row.date.localeCompare(b.row.date) || a.row.id.localeCompare(b.row.id));
}
