// What a batch of exports can prove about itself, from the cells rather than the headings.
// Every finding carries how it was reached, so the screen can say "the Balance column confirms it"
// instead of just asserting. Anything that stays open becomes one question for the person.
import {sharedStart, titleCase} from './data.mjs';

const days = (y, m) => new Date(y, m, 0).getDate();
export function parseDate(value, fmt) {
  const p = String(value || '').trim().split(/[-/.]/).map(Number);
  if (p.length !== 3 || p.some(n => Number.isNaN(n))) return null;
  const [y, m, d] = fmt === 'ymd' ? p : fmt === 'mdy' ? [p[2], p[0], p[1]] : [p[2], p[1], p[0]];
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > days(y, m)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export const formatLabel = {ymd: 'year-month-day', mdy: 'month-day-year', dmy: 'day-month-year'};
const num = v => { const t = String(v ?? '').trim().replace(/[,$\s]/g, ''); return t === '' ? null : Number.isNaN(Number(t)) ? NaN : Number(t); };

function columnStats(rows, i) {
  const vals = rows.map(r => r[i]);
  const nums = vals.map(num);
  const numeric = nums.every(n => n === null || !Number.isNaN(n)) && nums.some(n => n !== null);
  const blanks = nums.filter(n => n === null).length;
  const fits = ['ymd', 'mdy', 'dmy'].filter(f => vals.every(v => parseDate(v, f)));
  const text = vals.map(v => String(v ?? ''));
  return {numeric, blanks, nums, fits, avgLen: text.reduce((n, t) => n + t.length, 0) / text.length, unique: new Set(text).size / text.length, hasNeg: nums.some(n => n < 0), hasPos: nums.some(n => n > 0)};
}

const headingHints = [['date', /date|posted/i], ['description', /desc|detail|merchant|memo|narrative|payee/i], ['debit', /debit|withdraw|\bout\b/i], ['credit', /credit|deposit|\bin\b/i], ['balance', /balance/i], ['amount', /^amount$|value|sum/i]];
const hint = h => headingHints.find(([, re]) => re.test(h))?.[0];

/* Analyze one kind (files sharing a header row). Returns the mapping, how each role was found,
   the sign convention, the date order, the months covered and the open questions. */
export function analyze(kind, existingAccounts = []) {
  const rows = kind.files.flatMap(f => f.rows), H = kind.headers;
  const stats = H.map((_, i) => columnStats(rows, i));
  const mapping = {}, because = {}, questions = [];
  const take = (i, role, why) => { mapping[i] = role; because[role] = why; };

  // Date: a column where at least one calendar order fits every value. The heading only breaks ties.
  const dateCols = stats.map((s, i) => s.fits.length ? i : -1).filter(i => i >= 0);
  const dateCol = dateCols.find(i => hint(H[i]) === 'date') ?? dateCols[0];
  let dateFormat = null;
  if (dateCol != null) {
    const fits = stats[dateCol].fits;
    take(dateCol, 'date', fits.length === 1 ? `every value reads as a date only as ${formatLabel[fits[0]]}` : `every value reads as a date`);
    if (fits.length === 1) dateFormat = fits[0];
    else questions.push({id: 'dateFormat', options: fits, text: `Dates in ${H[dateCol]} could be read ${fits.map(f => formatLabel[f]).join(' or ')}.`});
  }

  // Money: numeric columns. A pair where each row fills exactly one is out and in; a column whose
  // running difference equals another's values is the balance; what remains with mixed signs is the amount.
  const numCols = stats.map((s, i) => s.numeric && i !== dateCol ? i : -1).filter(i => i >= 0);
  const pairs = [];
  for (const a of numCols) for (const b of numCols) if (a < b && rows.every(r => (num(r[a]) !== null) !== (num(r[b]) !== null))) pairs.push([a, b]);
  let amountCol = null, balanceCol = null, sign = null;
  if (pairs.length) {
    const [a, b] = pairs[0];
    const ha = hint(H[a]), hb = hint(H[b]);
    const out = ha === 'debit' || hb === 'credit' ? a : hb === 'debit' || ha === 'credit' ? b : null;
    if (out != null) { const inn = out === a ? b : a; take(out, 'debit', `only one of ${H[a]} and ${H[b]} is filled on each row; the heading says which is money out`); take(inn, 'credit', 'the other half of that pair'); }
    else { take(a, 'debit', `only one of ${H[a]} and ${H[b]} is filled on each row`); take(b, 'credit', 'the other half of that pair'); questions.push({id: 'outIn', options: [a, b], text: `${H[a]} and ${H[b]} are a pair. Which one is money out?`}); }
  } else {
    const rest = numCols.filter(i => !mapping[i]);
    // Balance: for consecutive rows within a file, balance delta equals ± the amount in another column.
    for (const b of rest) for (const a of rest) if (a !== b) {
      let plus = 0, minus = 0, n = 0;
      for (const f of kind.files) for (let r = 1; r < f.rows.length; r++) {
        const d = num(f.rows[r][b]) - num(f.rows[r - 1][b]), v = num(f.rows[r][a]);
        if (!v) continue; n++;
        if (Math.abs(d - v) < 0.005) plus++; else if (Math.abs(d + v) < 0.005) minus++;
      }
      if (n && (plus === n || minus === n)) { balanceCol = b; amountCol = a; sign = plus === n ? 1 : -1; }
    }
    if (amountCol != null) {
      take(amountCol, 'amount', `${H[balanceCol]} moves by exactly this value from row to row`);
      take(balanceCol, 'balance', `it runs by the amounts in ${H[amountCol]}`);
      because.sign = `${H[balanceCol]} ${sign === 1 ? 'rises' : 'falls'} when ${H[amountCol]} is positive`;
    } else if (rest.length) {
      const mixed = rest.find(i => stats[i].hasNeg && stats[i].hasPos) ?? rest.find(i => hint(H[i]) === 'amount') ?? rest[0];
      take(mixed, 'amount', stats[mixed].hasNeg && stats[mixed].hasPos ? 'the only column with both positive and negative values' : 'the only money column');
      for (const i of rest) if (i !== mixed && hint(H[i]) === 'balance') take(i, 'balance', 'the heading says so');
      questions.push({id: 'sign', text: `In ${H[mixed]}, do positive numbers mean money in or money out?`});
    }
  }

  // Description: the longest-text column that is neither a date nor money.
  const textCols = H.map((_, i) => i).filter(i => !mapping[i] && !stats[i].numeric && !stats[i].fits.length);
  const descCol = textCols.find(i => hint(H[i]) === 'description') ?? textCols.sort((a, b) => stats[b].avgLen - stats[a].avgLen)[0];
  if (descCol != null) take(descCol, 'description', textCols.length === 1 ? 'the only text column' : 'the text column with the most to say');

  // The account: an existing rule that matches every file, otherwise a name from the shared filename.
  const existing = existingAccounts.find(a => kind.files.every(f => a.matches(f.name)));
  const start = sharedStart(kind), lower = kind.files.map(f => f.name).join(' ').toLowerCase();
  const type = /credit|visa|mastercard|amex|card/.test(lower) || rows.some(r => /payment.*thank/i.test(r.join(' '))) ? 'Credit card' : /saving/.test(lower) ? 'Savings' : /chequing|checking|everyday|daily/.test(lower) ? 'Chequing' : '';
  const name = titleCase(start.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim());
  return {mapping, because, sign, dateFormat, questions, existing, suggested: {name, type, rule: {mode: 'starts', text: start}}, stats};
}

export function monthsCovered(kind, mapping, dateFormat) {
  const d = Number(Object.keys(mapping).find(k => mapping[k] === 'date') ?? -1);
  if (d < 0 || !dateFormat) return [];
  const months = new Set(kind.files.flatMap(f => f.rows.map(r => parseDate(r[d], dateFormat)?.slice(0, 7)).filter(Boolean)));
  return [...months].sort();
}
export const monthLabel = m => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-CA', {month: 'short', year: 'numeric'});
