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

/* Whether column `col` is a running balance that moves by valueOf(row) from row to row, in either file order
   (oldest first: each balance is the previous one plus this row; newest first: plus the row before). Returns 1
   when it moves with the value, -1 when against it, or null when it doesn't run or no row proves anything. */
function balanceSign(files, col, valueOf) {
  let plus = 0, minus = 0, n = 0;
  for (const f of files) {
    if (f.rows.length < 2) continue;
    const bal = f.rows.map((r) => num(r[col])), val = f.rows.map(valueOf);
    if (bal.some((v) => v === null || Number.isNaN(v)) || val.some((v) => v === null || Number.isNaN(v))) return null;
    const near = (x, y) => Math.abs(x - y) < 0.005;
    const fit = (s) => (forward) => f.rows.slice(1).every((_, k) => { const r = k + 1; return forward ? near(bal[r] - bal[r - 1], s * val[r]) : near(bal[r - 1] - bal[r], s * val[r - 1]); });
    const informative = val.some((v) => v !== 0);
    if (!informative) continue;
    n++;
    if (fit(1)(true) || fit(1)(false)) plus++;
    else if (fit(-1)(true) || fit(-1)(false)) minus++;
    else return null;
  }
  return n && plus === n ? 1 : n && minus === n ? -1 : null;
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
    // A running balance that moves by one column minus the other proves which is money in, whatever the headings say.
    const rest = numCols.filter((i) => i !== a && i !== b);
    let balanceCol = null, runs = null;
    for (const c of rest) {
      const s = balanceSign(files, c, (row) => (num(row[b]) || 0) - (num(row[a]) || 0));
      if (s) { balanceCol = c; runs = s; break; }
    }
    const out = runs ? (runs === 1 ? a : b) : ha === "debit" || hb === "credit" ? a : hb === "debit" || ha === "credit" ? b : null;
    if (out != null) {
      const inn = out === a ? b : a;
      take(out, "debit", runs
        ? `${H[balanceCol]} goes up by ${H[inn]} and down by ${H[out]} from row to row`
        : `only one of ${H[a]} and ${H[b]} is filled on each row, and the heading says this one is money out`);
      take(inn, "credit", "the other half of that pair");
    } else {
      take(a, "debit", `only one of ${H[a]} and ${H[b]} is filled on each row`);
      take(b, "credit", "the other half of that pair");
      questions.push({ id: "outIn", options: [a, b], text: `${H[a]} and ${H[b]} are a pair. Which one is money out?` });
    }
    if (balanceCol != null) take(balanceCol, "balance", `it moves by ${H[roles[a] === "credit" ? a : b]} minus ${H[roles[a] === "debit" ? a : b]} from row to row`);
    else { const named = rest.find((i) => hint(H[i]) === "balance"); if (named != null) take(named, "balance", "the heading says so"); }
  } else {
    const rest = numCols.filter((i) => !roles[i]);
    let amountCol = null, balanceCol = null;
    for (const b of rest) for (const a of rest) if (a !== b && amountCol == null) {
      const s = balanceSign(files, b, (row) => num(row[a]));
      if (s) { balanceCol = b; amountCol = a; sign = s; }
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

/* ---------- plain-language rules for bank descriptions (vendor matchers use the same forms) ----------
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

/* ---------- files that share a name ----------
   Many banks name every export the same, and the browser renames repeat downloads ("accountactivity (1).csv").
   Such names cannot tell accounts apart, so the cells have to: a running balance that carries on from one file
   to the next is one account; files that cover the same days with different balances are different accounts. */

/** A filename without its extension and any copy suffix a browser or the system adds: " (1)", "-1", " copy". */
export function copyBase(name) {
  let b = String(name || "").replace(/\.[^.]+$/, "").trim();
  for (;;) {
    const next = b.replace(/\s*\(\d+\)$/, "").replace(/\s*-?\s*copy(?:\s*\(?\d+\)?)?$/i, "").replace(/(?<=\D)-\d$/, "").trim();
    if (next === b || !next) return b.toLowerCase();
    b = next;
  }
}
/** Groups of indexes into `names` whose names differ only by a copy suffix (or not at all). */
export function sameNameSets(names) {
  const by = new Map();
  names.forEach((n, i) => { const k = copyBase(n); if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
  return [...by.values()].filter((set) => set.length > 1);
}

/* One file's run of balances in cents: where it starts and ends, and over which days. */
function fileRun(rows, roles, { sign, dateFormat }) {
  const col = (role) => { const k = Object.keys(roles).find((x) => roles[x] === role); return k == null ? -1 : Number(k); };
  const b = col("balance");
  if (b < 0 || !rows.length) return null;
  const read = readRows(rows, roles, { sign: sign ?? 1, dateFormat });
  const bal = rows.map((r) => num(r[b]));
  if (bal.some((v) => v === null || Number.isNaN(v))) return null;
  const c = bal.map((v) => Math.round(v * 100)), amt = read.map((r) => r.cents);
  const items = read.map((r, i) => `${r.date}|${amt[i]}|${c[i]}`);
  const dates = dateFormat ? read.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  const span = dates.length === rows.length ? { start: dates[0], end: dates.at(-1) } : null;
  const n = rows.length;
  const forward = c.slice(1).every((v, k) => v - c[k] === amt[k + 1]);
  const backward = c.slice(1).every((v, k) => c[k] - v === amt[k]);
  if (n > 1 && !forward && !backward) return { items, span, opening: null, closing: null };
  const newestFirst = n > 1 && !forward;
  return { items, span, opening: newestFirst ? c[n - 1] - amt[n - 1] : c[0] - amt[0], closing: newestFirst ? c[0] : c[n - 1] };
}

/**
 * What the balances say about files that share a name. `files` is [{name, rows}], read under `roles` with the
 * amount `sign` and `dateFormat` when known. Returns { verdict: "same" | "different" | "unknown", clusters, reason }:
 * clusters are groups of file indexes proven to be one account; the reason says which evidence was used.
 */
export function balanceEvidence(files, roles, { sign = null, dateFormat = null } = {}) {
  const named = (i) => files[i].name.replace(/\.[^.]+$/, "");
  const hasBalance = Object.values(roles).includes("balance");
  const signed = Object.values(roles).includes("amount");
  const unknown = (reason) => ({ verdict: "unknown", clusters: files.map((_, i) => [i]), reason, pairs: [] });
  if (files.length < 2) return { verdict: "same", clusters: [files.map((_, i) => i)], reason: "", pairs: [] };
  if (!hasBalance || (signed && sign == null)) return unknown("there is no running balance to tell them apart");
  const runs = files.map((f) => fileRun(f.rows, roles, { sign, dateFormat }));
  if (runs.some((r) => !r)) return unknown("there is no running balance to tell them apart");
  const pairs = [];
  for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
    const a = runs[i], b = runs[j];
    const before = (x, y) => !x.span || !y.span || x.span.end <= y.span.start;
    let rel = null, why = "";
    if (a.items.some((k) => b.items.includes(k))) { rel = "same"; why = `${named(i)} and ${named(j)} share rows`; }
    else if (a.closing != null && b.opening != null && a.closing === b.opening && before(a, b)) { rel = "same"; why = `${named(j)} starts at the balance ${named(i)} ends with`; }
    else if (b.closing != null && a.opening != null && b.closing === a.opening && before(b, a)) { rel = "same"; why = `${named(i)} starts at the balance ${named(j)} ends with`; }
    else if (a.span && b.span && a.span.start < b.span.end && b.span.start < a.span.end) { rel = "different"; why = `${named(i)} and ${named(j)} cover the same days with different balances`; }
    pairs.push({ i, j, rel, why });
  }
  // Files proven to be one account form a cluster.
  const root = files.map((_, i) => i);
  const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const p of pairs) if (p.rel === "same") root[find(p.i)] = find(p.j);
  const groups = new Map();
  files.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const clusters = [...groups.values()];
  const reasons = (rel) => pairs.filter((p) => p.rel === rel).map((p) => p.why);
  const join = (list) => listJoin(list.slice(0, 3)) + (list.length > 3 ? "…" : "");
  if (clusters.length === 1) return { verdict: "same", clusters, reason: join(reasons("same")), pairs };
  const apart = (x, y) => pairs.some((p) => p.rel === "different" && ((x.includes(p.i) && y.includes(p.j)) || (x.includes(p.j) && y.includes(p.i))));
  const allApart = clusters.every((x, m) => clusters.every((y, n) => m >= n || apart(x, y)));
  if (allApart) return { verdict: "different", clusters, reason: join([...reasons("different"), ...reasons("same")]), pairs };
  const known = [...reasons("different"), ...reasons("same")];
  return { verdict: "unknown", clusters, reason: known.length ? `${join(known)}, but the balances don't show where the rest belong` : "their balances don't show whether one carries on from another", pairs };
}

/** "A", "A and B", "A, B and C". */
export const listJoin = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** One row that is positive and one that is negative in the amount column, as the file writes them (cents). */
export function signExamples(rows, roles) {
  const k = Object.keys(roles).find((x) => roles[x] === "amount"), t = Object.keys(roles).find((x) => roles[x] === "description");
  if (k == null) return { pos: null, neg: null };
  const pick = (test) => { const r = rows.find((row) => { const v = num(row[k]); return v != null && !Number.isNaN(v) && test(v); }); return r ? { text: String(r[t] ?? "").trim(), cents: Math.round(num(r[k]) * 100) } : null; };
  return { pos: pick((v) => v > 0), neg: pick((v) => v < 0) };
}

/**
 * A saved layout's recognition in plain words. A layout made for several accounts stores the alternation of their
 * rules ("^(?:a.*|b.*)"); each part is named by the account whose rule it is, or said as its sentence.
 * `accounts` is [{name, prefixRegex}].
 */
export function describeLayoutRule(pattern, accounts = []) {
  const p = (pattern || "").trim();
  if (!p) return "Chosen by hand for each file";
  const alt = /^\^\(\?:(.*)\)$/.exec(p);
  const parts = alt ? alt[1].split(/(?<!\\)\|/).map((x) => (x.startsWith("^") ? x : `^${x}`)) : [p];
  const named = [], said = [];
  for (const part of parts) {
    const account = accounts.find((a) => (a.prefixRegex || "").trim() === part);
    if (account) named.push(account.name);
    else {
      const rule = decompileRule(part);
      if (rule.mode === "custom") return "Files that match a custom pattern";
      said.push(describeRule(rule));
    }
  }
  const orJoin = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`);
  if (!said.length) return `Files recognized by ${orJoin(named)}`;
  if (!named.length) return `Files whose name ${orJoin(said)}`;
  return `Files recognized by ${orJoin(named)}, or whose name ${orJoin(said)}`;
}
