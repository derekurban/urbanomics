// One way to show money and dates everywhere: a true minus sign for negatives, readable dates.
const formatters = new Map();
function currencyFormat(currency) {
  if (!formatters.has(currency)) {
    let f;
    try { f = new Intl.NumberFormat("en-CA", { style: "currency", currency }); }
    catch { f = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }); }
    formatters.set(currency, f);
  }
  return formatters.get(currency);
}
/** -1234 → "−$12.34" (true minus sign), currency from the record. */
export function money(cents, currency = "CAD") {
  return currencyFormat(currency || "CAD").format((cents || 0) / 100).replace(/^-/, "−");
}
/** Signed for direction: +$12.34 in, −$12.34 out. */
export function signedMoney(cents, currency = "CAD") {
  return (cents > 0 ? "+" : cents < 0 ? "−" : "") + money(Math.abs(cents || 0), currency);
}
const at = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`);
/** "2026-09-22" → "Sep 22, 2026" */
export function dayLabel(iso, { year = true } = {}) {
  if (!iso) return "";
  return at(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
}
/** "2026-09-22" → "Tue, Sep 22, 2026" */
export function weekdayLabel(iso) {
  if (!iso) return "";
  return at(iso).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
/** "2026-09" → "September 2026" (short: "Sep 2026") */
export function monthName(month, short = false) {
  return new Date(`${month}-15T12:00:00`).toLocaleDateString("en-CA", { month: short ? "short" : "long", year: "numeric" });
}
/** A range of ISO dates, collapsing the shared month and year: "Sep 1 – 30, 2026". */
export function rangeLabel(start, end) {
  if (!start || !end) return dayLabel(start || end);
  if (start === end) return dayLabel(start);
  const a = at(start), b = at(end);
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) return `${a.toLocaleDateString("en-CA", { month: "short" })} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`;
    return `${dayLabel(start, { year: false })} – ${dayLabel(end)}`;
  }
  return `${dayLabel(start)} – ${dayLabel(end)}`;
}
/** plural(1, "file") → "1 file"; plural(3, "person", "people") → "3 people". */
export function plural(n, one, many = one + "s") {
  return `${Number(n || 0).toLocaleString("en-CA")} ${n === 1 ? one : many}`;
}
