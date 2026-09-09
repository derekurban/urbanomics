const { parse } = require("csv-parse/sync");
const { createHash } = require("node:crypto");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const layouts = {
  eq: ["Transfer date", "Description", "Amount", "Balance"],
  pc: ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
  simplii: ["Date", "Transaction Details", "Funds Out", "Funds In"],
};
function cents(value, allowEmpty = false) {
  const raw = String(value).trim();
  if (!raw && allowEmpty) return 0;
  if (!/^[+-]?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw))
    throw new Error("An amount is missing or is not valid dollars and cents.");
  const s = raw.replace(/[$,]/g, "");
  const [whole, fraction = ""] = s.replace(/^[+-]/, "").split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount))
    throw new Error("Amount exceeds supported precision.");
  return s.startsWith("-") ? -amount : amount;
}
function parseDate(value, iso) {
  const s = value.trim();
  const pattern = iso
    ? /^(\d{4})-(\d{2})-(\d{2})$/
    : /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const m = s.match(pattern);
  if (!m) throw new Error("Unrecognized date format.");
  const [y, month, d] = iso ? [m[1], m[2], m[3]] : [m[3], m[1], m[2]];
  const key = `${y}-${month}-${d}`;
  const date = new Date(`${key}T12:00:00Z`);
  if (
    Number(y) < 1900 ||
    Number(y) > 2200 ||
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== key
  )
    throw new Error("Invalid calendar date.");
  return key;
}
function parseExport(bytes) {
  if (!bytes.length) throw new Error("This CSV is empty.");
  if (bytes.length > 20 * 1024 * 1024)
    throw new Error("CSV exceeds the 20 MB import limit.");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Save this export as UTF-8 CSV before importing.");
  }
  let table;
  try {
    table = parse(text, { bom: true, relax_column_count: false });
  } catch {
    throw new Error("Malformed CSV. Check its quoting and column counts.");
  }
  const header = table.shift();
  const schema = Object.keys(layouts).find(
    (k) =>
      JSON.stringify(layouts[k]) ===
      JSON.stringify(header?.map((h) => h.trim())),
  );
  if (!schema)
    throw new Error(
      "Unrecognized CSV layout. Supported: PC Financial, EQ Bank, and Simplii.",
    );
  const rows = table.map((raw, index) => {
    try {
      const date = parseDate(raw[schema === "pc" ? 3 : 0], schema === "eq");
      const description = raw[schema === "pc" ? 0 : 1].trim();
      if (!description) throw new Error("Missing description.");
      const time = schema === "pc" ? raw[4].trim() : "";
      if (time && !/^(0?[1-9]|1[0-2]):[0-5]\d\s(?:AM|PM)$/i.test(time))
        throw new Error("Unrecognized transaction time.");
      const amountCents =
        schema === "pc"
          ? cents(raw[5])
          : schema === "eq"
            ? cents(raw[2])
            : cents(raw[3], true) - cents(raw[2], true);
      if (
        schema === "simplii" &&
        raw[2].trim() &&
        raw[3].trim() &&
        cents(raw[2]) !== 0 &&
        cents(raw[3]) !== 0
      )
        throw new Error("Both funds in and funds out are populated.");
      const balanceCents = schema === "eq" ? cents(raw[3]) : null;
      const type = schema === "pc" ? raw[1].trim() : "";
      const holder = schema === "pc" ? raw[2].trim() : "";
      const fingerprint = hash(
        JSON.stringify([
          date,
          time,
          description,
          type,
          holder,
          amountCents,
          balanceCents,
          "CAD",
        ]),
      );
      return {
        record: index + 2,
        date,
        month: date.slice(0, 7),
        time,
        description,
        amountCents,
        balanceCents,
        type,
        holder,
        currency: "CAD",
        fingerprint,
        raw,
      };
    } catch (error) {
      throw new Error(`Record ${index + 2}: ${error.message}`);
    }
  });
  const canonicalHash = hash(
    JSON.stringify([schema, rows.map((r) => r.fingerprint).sort()]),
  );
  return { schema, header, rows, canonicalHash, hash: hash(bytes) };
}
function routingKey(filename) {
  return filename
    .toLowerCase()
    .replace(/\.csv$/, "")
    .replace(/[_-](?:initial|\d{4}-\d{2})$/, "");
}
function monthValid(month) {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
}
function csv(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((x) => '"' + String(x ?? "").replace(/"/g, '""') + '"')
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
module.exports = { parseExport, cents, hash, routingKey, monthValid, csv };
