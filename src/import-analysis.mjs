// What a batch of staged exports can prove about itself, from the cells rather than the headings.
// Pure functions shared by the Snapshots setup screens and their tests. Every finding carries the
// reason it was reached so the screen can say "Balance rises when Amount is positive" rather than
// just asserting. Whatever stays open becomes one question for the person. Nothing here guesses
// silently: the results are shown and confirmed before a layout or an account is saved.

const daysIn = (y, m) => new Date(y, m, 0).getDate();

/** A calendar date read in one order, or null. Accepts -, / and . as separators. */
export function parseDate(value, fmt) {
  const p = String(value || "").trim().split(/[-/.]/).map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = fmt === "ymd" ? p : fmt === "mdy" ? [p[2], p[0], p[1]] : [p[2], p[1], p[0]];
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export const formatLabel = { ymd: "year-month-day", mdy: "month-day-year", dmy: "day-month-year" };
export const roleLabel = { date: "Date", description: "Description", amount: "Amount", debit: "Money out", credit: "Money in", balance: "Balance" };

const num = (v) => {
  const t = String(v ?? "").trim().replace(/[,$\s]/g, "");
  return t === "" ? null : Number.isNaN(Number(t)) ? NaN : Number(t);
};

function columnStats(rows, i) {
  const vals = rows.map((r) => r[i]);
  const nums = vals.map(num);
  const numeric = nums.every((n) => n === null || !Number.isNaN(n)) && nums.some((n) => n !== null);
  const fits = ["ymd", "mdy", "dmy"].filter((f) => vals.length && vals.every((v) => parseDate(v, f)));
  const text = vals.map((v) => String(v ?? ""));
  return {
    numeric,
    fits,
    avgLen: text.reduce((n, t) => n + t.length, 0) / Math.max(text.length, 1),
    hasNeg: nums.some((n) => n < 0),
    hasPos: nums.some((n) => n > 0),
  };
}

const headingHints = [
  ["date", /date|posted/i],
  ["description", /desc|detail|merchant|memo|narrative|payee/i],
  ["debit", /debit|withdraw|\bout\b/i],
  ["credit", /credit|deposit|\bin\b/i],
  ["balance", /balance/i],
  ["amount", /^amount$|value|sum/i],
];
const hint = (h) => headingHints.find(([, re]) => re.test(h))?.[0];

/**
 * Analyze one kind: files that share a header row. `files` is [{name, rows}] where rows are the
 * sampled cells of each file in order. Returns the column roles ({index: role}), why each was
 * chosen, the sign of a single amount column when a running balance proves it, the open questions
 * and a suggested account name, type and recognition rule.
 */
export function analyzeKind({ headers: H, files }) {
  const rows = files.flatMap((f) => f.rows);
  const stats = H.map((_, i) => columnStats(rows, i));
  const roles = {}, because = {}, questions = [];
  const take = (i, role, why) => { roles[i] = role; because[role] = why; };

  // Date: a column where at least one calendar order fits every sampled value. Headings break ties.
  const dateCols = stats.map((s, i) => (s.fits.length ? i : -1)).filter((i) => i >= 0);
  const dateCol = dateCols.find((i) => hint(H[i]) === "date") ?? dateCols[0];
  let dateFits = [];
  if (dateCol != null) {
    dateFits = stats[dateCol].fits;
    take(dateCol, "date", dateFits.length === 1 ? `every value reads as a date only as ${formatLabel[dateFits[0]]}` : "every value reads as a calendar date");
  } else {
    // No column reads cleanly in one order. The column that looks most like dates is still the date
    // column; the import parser then names the record that does not fit instead of guessing.
    const mostly = H.map((h, i) => ({ i, share: rows.filter((r) => ["ymd", "mdy", "dmy"].some((f) => parseDate(r[i], f))).length / Math.max(rows.length, 1), hinted: hint(h) === "date" }))
      .filter((c) => c.share >= 0.5 || c.hinted).sort((x, y) => (y.hinted - x.hinted) || (y.share - x.share))[0];
    if (mostly) take(mostly.i, "date", "most values read as dates, but not all in one order");
    else questions.push({ id: "date", text: "No column reads as dates in every row." });
  }

  // Money. A pair of numeric columns where every row fills exactly one is money out and in. A column
  // whose row-to-row difference equals another column's value is the running balance, and that proves
  // which way the amount is signed. Otherwise the signed column is the amount and the sign is a question.
  const numCols = stats.map((s, i) => (s.numeric && i !== dateCol ? i : -1)).filter((i) => i >= 0);
  const pairs = [];
  for (const a of numCols) for (const b of numCols) if (a < b && rows.every((r) => (num(r[a]) !== null) !== (num(r[b]) !== null))) pairs.push([a, b]);
  let sign = null;
  if (pairs.length) {
    const [a, b] = pairs[0], ha = hint(H[a]), hb = hint(H[b]);
    const out = ha === "debit" || hb === "credit" ? a : hb === "debit" || ha === "credit" ? b : null;
    if (out != null) {
      const inn = out === a ? b : a;
      take(out, "debit", `only one of ${H[a]} and ${H[b]} is filled on each row, and the heading says this one is money out`);
      take(inn, "credit", "the other half of that pair");
    } else {
      take(a, "debit", `only one of ${H[a]} and ${H[b]} is filled on each row`);
      take(b, "credit", "the other half of that pair");
      questions.push({ id: "outIn", options: [a, b], text: `${H[a]} and ${H[b]} are a pair. Which one is money out?` });
    }
  } else {
    const rest = numCols.filter((i) => !roles[i]);
    let amountCol = null, balanceCol = null;
    for (const b of rest) for (const a of rest) if (a !== b) {
      let plus = 0, minus = 0, n = 0;
      for (const f of files) for (let r = 1; r < f.rows.length; r++) {
        const d = num(f.rows[r][b]) - num(f.rows[r - 1][b]), v = num(f.rows[r][a]);
        if (!v || Number.isNaN(d)) continue;
        n++;
        if (Math.abs(d - v) < 0.005) plus++; else if (Math.abs(d + v) < 0.005) minus++;
      }
      if (n && (plus === n || minus === n)) { balanceCol = b; amountCol = a; sign = plus === n ? 1 : -1; }
    }
    if (amountCol != null) {
      take(amountCol, "amount", `${H[balanceCol]} moves by exactly this value from row to row`);
      take(balanceCol, "balance", `it runs by the amounts in ${H[amountCol]}`);
      because.sign = `${H[balanceCol]} ${sign === 1 ? "rises" : "falls"} when ${H[amountCol]} is positive`;
    } else if (rest.length) {
      const mixed = rest.find((i) => stats[i].hasNeg && stats[i].hasPos) ?? rest.find((i) => hint(H[i]) === "amount") ?? rest[0];
      take(mixed, "amount", stats[mixed].hasNeg && stats[mixed].hasPos ? "the only column with both positive and negative values" : "the only money column");
      for (const i of rest) if (i !== mixed && hint(H[i]) === "balance") take(i, "balance", "the heading says so");
      questions.push({ id: "sign", text: `In ${H[mixed]}, do positive numbers mean money in or money out?` });
    } else questions.push({ id: "amount", text: "No column holds amounts in every row." });
  }

  // Description: the longest text column that is neither a date nor money.
  const textCols = H.map((_, i) => i).filter((i) => !roles[i] && !stats[i].numeric && !stats[i].fits.length);
  const descCol = textCols.find((i) => hint(H[i]) === "description") ?? [...textCols].sort((a, b) => stats[b].avgLen - stats[a].avgLen)[0];
  if (descCol != null) take(descCol, "description", textCols.length === 1 ? "the only text column" : "the text column with the most to say");
  else questions.push({ id: "description", text: "No text column is left for descriptions." });

  const names = files.map((f) => f.name), start = sharedStart(names);
  return { roles, because, sign, dateFits, questions, suggested: { name: suggestName(start || fileStem(names[0] || "")), type: suggestType(names, rows), rule: { mode: "starts", text: start } } };
}

/** An account type from the filenames (and a card statement's "payment, thank you" row). */
export function suggestType(names, rows = []) {
  const lower = names.join(" ").toLowerCase();
  return /credit|visa|mastercard|amex|card/.test(lower) || rows.some((r) => /payment.*thank/i.test(r.join(" "))) ? "Credit card" : /saving/.test(lower) ? "Savings" : /chequing|checking|everyday|daily|spending/.test(lower) ? "Chequing" : "";
}
/* An account name from the part of the filename that stays: sentence case, without words that describe the
   file rather than the account ("initial", "export", "statement"…). */
const fileWords = /\b(initial|exports?|transactions?|statements?|downloads?|activity|history|reports?|csv|data|files?)\b/gi;
export const suggestName = (start) => {
  const spaced = start.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const text = spaced.replace(fileWords, "").replace(/\s+/g, " ").trim() || spaced;
  return text.charAt(0).toUpperCase() + text.slice(1);
};
/** The part of one filename that stays the same from export to export: its stem without trailing numbers or months. */
export const fileStem = (name) => sharedStart([name]);

/** The longest start every filename shares, cut back to a word boundary with trailing numbers dropped. */
export function sharedStart(names) {
  const bases = names.map((n) => n.replace(/\.[^.]+$/, ""));
  if (!bases.length) return "";
  if (bases.length === 1) return stem(bases[0]);
  const first = bases[0].toLowerCase();
  let i = 0;
  while (i < first.length && bases.every((n) => n.toLowerCase()[i] === first[i])) i++;
  let common = bases[0].slice(0, i);
  if (i < first.length && !/[\s_\-(]$/.test(common)) common = common.replace(/[^\s_\-(]*$/, "");
  common = common.replace(/[\s_\-(]+$/, "");
  // Two names with no real start in common share nothing worth matching on.
  return trimTail(common).length >= 3 ? trimTail(common) : "";
}
function stem(base) {
  const s = trimTail(base.split(/\d/)[0]);
  return s.length >= 3 && s.length < base.length ? s : trimTail(base);
}
/* Trailing numbers and month names change from export to export; they are not part of the name that stays. */
function trimTail(text) {
  let t = text.replace(/[\s_\-(]+$/, "");
  for (;;) {
    const next = t.replace(/[\s_\-(]+(\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/i, "").replace(/[\s_\-(]+$/, "");
    if (next === t || next.length < 3) return t;
    t = next;
  }
}
export const titleCase = (text) => text.replace(/\b\w/g, (c) => c.toUpperCase());

/* ---------- plain-language recognition rules ---------- */
export const ruleModes = [
  { id: "starts", label: "starts with" },
  { id: "contains", label: "contains" },
  { id: "ends", label: "ends with" },
  { id: "exact", label: "is exactly" },
];
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unescapeRegex = (text) => text.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");

/** The anchored RE2 the app stores for a sentence. The matcher wraps it in ^(?:…) and ignores case. */
export function compileRule(rule) {
  const e = escapeRegex((rule?.text || "").trim());
  if (!e) return "";
  switch (rule.mode) {
    case "contains": return `^.*${e}.*`;
    case "ends": return `^.*${e}(\\.[^.]+)?$`;
    case "exact": return `^${e}(\\.[^.]+)?$`;
    case "custom": return rule.text.trim();
    default: return `^${e}.*`;
  }
}
/** The sentence a stored pattern came from, or a custom rule carrying the pattern as it is. */
export function decompileRule(pattern) {
  const p = (pattern || "").trim();
  if (!p) return { mode: "starts", text: "" };
  let m;
  if ((m = /^\^\.\*((?:\\.|[^\\.*+?^${}()|[\]])+)\(\\\.\[\^\.\]\+\)\?\$$/.exec(p))) return { mode: "ends", text: unescapeRegex(m[1]) };
  if ((m = /^\^((?:\\.|[^\\.*+?^${}()|[\]])+)\(\\\.\[\^\.\]\+\)\?\$$/.exec(p))) return { mode: "exact", text: unescapeRegex(m[1]) };
  if ((m = /^\^\.\*((?:\\.|[^\\.*+?^${}()|[\]])+)\.\*$/.exec(p))) return { mode: "contains", text: unescapeRegex(m[1]) };
  if ((m = /^\^((?:\\.|[^\\.*+?^${}()|[\]])+)\.\*$/.exec(p))) return { mode: "starts", text: unescapeRegex(m[1]) };
  return { mode: "custom", text: p };
}
/** Whether a filename matches a rule, the same way the app's matcher reads the compiled pattern. */
export function ruleMatches(rule, filename) {
  const pattern = compileRule(rule);
  if (!pattern) return false;
  try { return new RegExp(`^(?:${pattern})`, "iu").test(filename); } catch { return false; }
}
export function patternMatches(pattern, filename) {
  if (!pattern?.trim()) return false;
  try { return new RegExp(`^(?:${pattern.trim()})`, "iu").test(filename); } catch { return false; }
}
export const describeRule = (rule) => rule.mode === "custom" ? `matches the pattern ${rule.text}` : `${ruleModes.find((m) => m.id === rule.mode)?.label || "starts with"} “${rule.text}”`;

/* ---------- between column roles and the app's layout mapping ---------- */
export function toMapping(roles, { dateFormat, sign, currency = "CAD", delimiter = "," }) {
  const idx = (role) => { const k = Object.keys(roles).find((x) => roles[x] === role); return k == null ? null : Number(k); };
  const separate = idx("amount") == null && idx("debit") != null && idx("credit") != null;
  return {
    date: idx("date"), description: idx("description"), amount: idx("amount"), debit: idx("debit"), credit: idx("credit"), balance: idx("balance"),
    dateFormat: dateFormat || "", amountMode: separate ? "separate" : "signed", sign: separate ? 1 : sign ?? null, currency, delimiter,
  };
}
export function fromMapping(mapping) {
  const roles = {};
  for (const role of ["date", "description", "amount", "debit", "credit", "balance"]) if (Number.isInteger(mapping?.[role])) roles[mapping[role]] = role;
  return roles;
}
export const rolesComplete = (roles) => {
  const v = Object.values(roles);
  return v.includes("date") && v.includes("description") && (v.includes("amount") || (v.includes("debit") && v.includes("credit")));
};

/** How sampled rows read under roles: date, text and signed cents (negative is money out). */
export function readRows(rows, roles, { sign = 1, dateFormat = null } = {}) {
  const idx = (role) => { const k = Object.keys(roles).find((x) => roles[x] === role); return k == null ? -1 : Number(k); };
  const d = idx("date"), t = idx("description"), a = idx("amount"), o = idx("debit"), i = idx("credit");
  const cents = (v) => Math.round((num(v) || 0) * 100);
  return rows.map((r) => ({
    date: dateFormat ? parseDate(r[d], dateFormat) || r[d] : r[d],
    text: r[t],
    cents: a >= 0 ? cents(r[a]) * (sign === 1 ? 1 : -1) : cents(r[i]) - cents(r[o]),
  }));
}
export function monthsCovered(rows, roles, dateFormat) {
  const d = Number(Object.keys(roles).find((k) => roles[k] === "date") ?? -1);
  if (d < 0 || !dateFormat) return [];
  return [...new Set(rows.map((r) => parseDate(r[d], dateFormat)?.slice(0, 7)).filter(Boolean))].sort();
}

/* ---------- plain-language rules for bank descriptions (aliases and transaction rules) ----------
   Description patterns are searched anywhere in the text, ignoring case (RE2 "iu"), so the sentence
   compiles without the filename forms' trailing wildcard. Anything else stays a custom pattern. */
export function compileTextRule(rule) {
  const e = escapeRegex((rule?.text || "").trim());
  if (!e) return "";
  switch (rule.mode) {
    case "contains": return e;
    case "ends": return `${e}$`;
    case "exact": return `^${e}$`;
    case "custom": return rule.text.trim();
    default: return `^${e}`;
  }
}
export function decompileTextRule(pattern) {
  const p = (pattern || "").trim();
  if (!p) return { mode: "starts", text: "" };
  let m;
  if ((m = /^\^((?:\\.|[^\\.*+?^${}()|[\]])+)\$$/.exec(p))) return { mode: "exact", text: unescapeRegex(m[1]) };
  if ((m = /^\^((?:\\.|[^\\.*+?^${}()|[\]])+)$/.exec(p))) return { mode: "starts", text: unescapeRegex(m[1]) };
  if ((m = /^((?:\\.|[^\\.*+?^${}()|[\]])+)\$$/.exec(p))) return { mode: "ends", text: unescapeRegex(m[1]) };
  if ((m = /^((?:\\.|[^\\.*+?^${}()|[\]])+)$/.exec(p))) return { mode: "contains", text: unescapeRegex(m[1]) };
  return { mode: "custom", text: p };
}
export function textMatches(pattern, text) {
  if (!pattern?.trim()) return false;
  try { return new RegExp(pattern.trim(), "iu").test(text || ""); } catch { return false; }
}
