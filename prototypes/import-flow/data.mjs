// Synthetic bank exports for the import-flow study. Invented banks, merchants and amounts.
export const files = [
  {id: 'f1', name: 'Bank_everyday_2026-07.csv', headers: ['Transfer date', 'Description', 'Amount', 'Balance'], rows: [['2026-07-03', 'PAYROLL DEPOSIT', '2450.00', '3210.44'], ['2026-07-05', 'FRESHCO #221', '-58.12', '3152.32'], ['2026-07-09', 'E-TRANSFER SENT', '-120.00', '3032.32']]},
  {id: 'f2', name: 'Bank_everyday_2026-08.csv', headers: ['Transfer date', 'Description', 'Amount', 'Balance'], rows: [['2026-08-01', 'PAYROLL DEPOSIT', '2450.00', '5482.32'], ['2026-08-06', 'CITY POWER', '-91.40', '5390.92'], ['2026-08-18', 'RITUAL COFFEE', '-4.75', '5386.17']]},
  {id: 'f3', name: 'Bank_everyday_2026-09.csv', headers: ['Transfer date', 'Description', 'Amount', 'Balance'], rows: [['2026-09-02', 'PAYROLL DEPOSIT', '2450.00', '7836.17'], ['2026-09-03', 'RENT', '-1650.00', '6186.17'], ['2026-09-12', 'FRESHCO #221', '-73.20', '6112.97']]},
  {id: 'f4', name: 'creditcard-statement-aug.csv', headers: ['Posted', 'Merchant', 'Debit', 'Credit'], rows: [['08/02/2026', 'NORTHSIDE BOOKS', '25.15', ''], ['08/14/2026', 'PAYMENT - THANK YOU', '', '400.00'], ['08/20/2026', 'CAFE JUNO', '6.40', '']]},
  {id: 'f5', name: 'creditcard-statement-sep.csv', headers: ['Posted', 'Merchant', 'Debit', 'Credit'], rows: [['09/01/2026', 'MOUNTAIN CABIN CO', '310.00', ''], ['09/09/2026', 'PAYMENT - THANK YOU', '', '340.00'], ['09/21/2026', 'NORTHSIDE BOOKS', '18.90', '']]},
  {id: 'f6', name: 'savings export (1).csv', headers: ['Date', 'Details', 'Amount'], rows: [['03/04/2026', 'Interest', '4.21'], ['05/06/2026', 'Transfer from chequing', '500.00'], ['08/09/2026', 'Interest', '4.60']]},
];

export const palette = ['#427A64', '#5B6FB5', '#B8744F', '#8C6BB1', '#C25B7C', '#4C9A9A', '#A6873B', '#5F6B7A'];

export const roles = [
  {id: 'date', label: 'Date'},
  {id: 'description', label: 'Description'},
  {id: 'amount', label: 'Amount'},
  {id: 'debit', label: 'Money out'},
  {id: 'credit', label: 'Money in'},
  {id: 'balance', label: 'Balance'},
];

const guessers = [
  ['date', /date|posted/i],
  ['description', /desc|detail|merchant|memo|narrative|payee/i],
  ['debit', /debit|withdraw|out\b/i],
  ['credit', /credit|deposit|\bin\b/i],
  ['balance', /balance/i],
  ['amount', /^amount$|value|sum/i],
];

/* A guess per header, from its name. Guesses are offered, never applied without a look. */
export function guessMapping(headers) {
  const used = new Set(), mapping = {};
  headers.forEach((h, i) => {
    const hit = guessers.find(([role, re]) => !used.has(role) && re.test(h));
    if (hit) { mapping[i] = hit[0]; used.add(hit[0]); }
  });
  return mapping;
}

export const kindKey = f => f.headers.join('|');
export function kindsOf(list) {
  const map = new Map();
  for (const f of list) { const k = kindKey(f); if (!map.has(k)) map.set(k, {id: 'k' + (map.size + 1), headers: f.headers, files: []}); map.get(k).files.push(f); }
  return [...map.values()];
}

/* The part of a filename that stays the same from month to month. */
export function stem(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const s = base.split(/\d/)[0].replace(/[\s_\-(]+$/, '');
  return s.length >= 3 && s.length < base.length ? s : base;
}
export function prettyStem(name) { return stem(name).replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').replace(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/i, '').trim(); }
export function titleCase(text) { return text.replace(/\b\w/g, c => c.toUpperCase()); }

/* Plain-language recognition rules. Case-insensitive, like the filenames banks produce. */
export const modes = [
  {id: 'starts', label: 'starts with'},
  {id: 'contains', label: 'contains'},
  {id: 'ends', label: 'ends with'},
  {id: 'exact', label: 'is exactly'},
];
export function matches(rule, name) {
  if (!rule?.text) return false;
  const a = name.toLowerCase(), b = rule.text.toLowerCase();
  return rule.mode === 'starts' ? a.startsWith(b) : rule.mode === 'contains' ? a.includes(b) : rule.mode === 'ends' ? a.replace(/\.csv$/, '').endsWith(b) : a === b || a === b + '.csv';
}
/* The longest start every file in the kind shares, cut back to a word boundary; one file falls back to its stem. */
export function sharedStart(kind) {
  const names = kind.files.map(f => f.name.replace(/\.[^.]+$/, ''));
  if (names.length === 1) return stem(kind.files[0].name);
  let i = 0; const first = names[0].toLowerCase();
  while (i < first.length && names.every(n => n.toLowerCase()[i] === first[i])) i++;
  let common = names[0].slice(0, i);
  if (i < first.length && !/[\s_\-(]$/.test(common)) common = common.replace(/[^\s_\-(]*$/, '');
  common = common.replace(/[\s_\-(]+$/, '');
  // A trailing year or number is not part of the name that stays the same.
  while (/[\s_\-(]+\d+$/.test(common)) common = common.replace(/[\s_\-(]+\d+$/, '');
  return common.length >= 3 ? common : stem(kind.files[0].name);
}
export function suggestRule(kind) { return {mode: 'starts', text: sharedStart(kind)}; }
export function suggestName(kind) { return titleCase(sharedStart(kind).replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()); }

export const mappingComplete = m => {
  const vals = Object.values(m);
  return vals.includes('date') && vals.includes('description') && (vals.includes('amount') || (vals.includes('debit') && vals.includes('credit')));
};

/* What a row becomes under a mapping: a date, a description and a signed amount (negative = money out). */
export function read(file, mapping, sign = -1) {
  const idx = role => { const k = Object.keys(mapping).find(k => mapping[k] === role); return k == null ? -1 : Number(k); };
  const d = idx('date'), t = idx('description'), a = idx('amount'), o = idx('debit'), i = idx('credit');
  const num = v => Math.round(parseFloat(String(v || '0').replace(/,/g, '')) * 100) || 0;
  return file.rows.map(r => ({date: r[d], text: r[t], cents: a >= 0 ? num(r[a]) * (sign === 1 ? 1 : -1) : num(r[i]) - num(r[o])}));
}
export const money = c => (c < 0 ? '−$' : '$') + (Math.abs(c) / 100).toLocaleString('en-CA', {minimumFractionDigits: 2});
