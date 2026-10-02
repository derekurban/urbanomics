// Synthetic ledger and the pure operations behind the Organize desk study.
// Nothing here touches the application, its APIs or any real data.

export const accounts = [
  {id: 'chq', name: 'Chequing', color: '#658e83'},
  {id: 'sav', name: 'Savings', color: '#8fa6cb'},
  {id: 'mc', name: 'Mastercard', color: '#c8a06d'},
];
export const tags = [
  {id: 'groceries', name: 'Groceries', group: 'Food', color: '#5f9a72', flow: 'out'},
  {id: 'restaurants', name: 'Restaurants', group: 'Food', color: '#8bb98a', flow: 'out'},
  {id: 'coffee', name: 'Coffee', group: 'Food', color: '#b7d3a3', flow: 'out'},
  {id: 'lodging', name: 'Lodging', group: 'Travel', color: '#b5793a', flow: 'out'},
  {id: 'fuel', name: 'Fuel', group: 'Travel', color: '#d8ae78', flow: 'out'},
  {id: 'rent', name: 'Rent', group: 'Home', color: '#5f7fb3', flow: 'out'},
  {id: 'utilities', name: 'Utilities', group: 'Home', color: '#9fb4d6', flow: 'out'},
  {id: 'fitness', name: 'Fitness', group: 'Personal', color: '#a58cb8', flow: 'out'},
  {id: 'gifts-given', name: 'Gifts given', group: 'Personal', color: '#c9a7d1', flow: 'out'},
  {id: 'paycheck', name: 'Paycheck', group: 'Income', color: '#4f8f86', flow: 'in'},
  {id: 'interest', name: 'Interest', group: 'Income', color: '#86b7b0', flow: 'in'},
  {id: 'gift', name: 'Gift', group: 'Income', color: '#6f84b5', flow: 'in'},
  {id: 'refund', name: 'Refund', group: 'Income', color: '#a3b2d4', flow: 'in'},
];
export const people = [
  {id: 'sam', name: 'Sam', color: '#ca8d86'},
  {id: 'jo', name: 'Jo', color: '#af8eb5'},
];
export const events = [
  {id: 'cabin', name: 'Cabin weekend', start: '2026-09-18', end: '2026-09-20', color: '#af8eb5'},
  {id: 'bday', name: 'Birthday dinner', start: '2026-09-26', end: '2026-09-26', color: '#c8a06d'},
];

const tagPart = (id, cents) => ({kind: 'tag', id, cents});
let seq = 0;
function rec(date, account, description, dollars, parts = [], extra = {}) {
  return {id: 'r' + (++seq), date, account, description, original: extra.original || description.toUpperCase(), cents: Math.round(dollars * 100), parts, events: extra.events || [], person: extra.person || ''};
}
export function sampleRecords() {
  seq = 0;
  const rows = [
    rec('2026-10-01', 'chq', 'Corner grocer', -46.1, [tagPart('groceries', 4610)]),
    rec('2026-09-30', 'sav', 'Interest paid', 3.12),
    rec('2026-09-30', 'mc', 'Ritual coffee', -5.75),
    rec('2026-09-29', 'chq', 'Payment to Mastercard', -1240, [], {original: 'PAYMENT TO MASTERCARD ****4821'}),
    rec('2026-09-28', 'mc', 'Payment, thank you', 1240, [], {original: 'PAYMENT - THANK YOU'}),
    rec('2026-09-27', 'mc', 'Green market', -82.4),
    rec('2026-09-26', 'mc', 'Juniper dinner', -186, [tagPart('restaurants', 18600)], {events: ['bday'], person: 'jo'}),
    rec('2026-09-26', 'chq', 'E-transfer from Jo', 62, []),
    rec('2026-09-25', 'chq', 'Hydro bill', -96.4),
    rec('2026-09-24', 'mc', 'Ritual coffee', -5.75, [tagPart('coffee', 575)]),
    rec('2026-09-23', 'chq', 'Birthday gift', 150),
    rec('2026-09-22', 'chq', 'E-transfer from Sam', 60),
    rec('2026-09-21', 'sav', 'Transfer from chequing', 498),
    rec('2026-09-20', 'chq', 'Transfer to savings', -500),
    rec('2026-09-19', 'mc', 'Petro station', -55.2),
    rec('2026-09-18', 'mc', 'Mountain cabin', -412.5, [], {original: 'MTN CABIN RENTALS LTD'}),
    rec('2026-09-18', 'mc', 'Trailhead grocery', -64.3, [tagPart('groceries', 6430)], {events: ['cabin']}),
    rec('2026-09-17', 'mc', 'Ritual coffee', -5.75, [tagPart('coffee', 575)]),
    rec('2026-09-15', 'chq', 'Acme payroll', 2400, [tagPart('paycheck', 240000)]),
    rec('2026-09-15', 'chq', 'Climb gym', -72, [tagPart('fitness', 7200)]),
    rec('2026-09-14', 'mc', 'Local foods', -31.9, [tagPart('groceries', 3190)]),
    rec('2026-09-12', 'chq', 'Online return', 38.5),
    rec('2026-09-11', 'mc', 'Bookshop', -42.75),
    rec('2026-09-10', 'chq', 'Rent', -1650, [tagPart('rent', 165000)]),
  ];
  return rows;
}

export const money = (cents, sign = false) => {
  const text = new Intl.NumberFormat('en-CA', {style: 'currency', currency: 'CAD'}).format(Math.abs(cents) / 100);
  return sign ? (cents < 0 ? '−' : '+') + text : text;
};
export const plain = cents => (Math.abs(cents) / 100).toFixed(2);
export const find = (state, id) => state.find(r => r.id === id);
export const byId = (list, id) => list.find(x => x.id === id);
export const total = r => Math.abs(r.cents);
export const assigned = r => r.parts.reduce((n, p) => n + p.cents, 0);
export const unsorted = r => total(r) - assigned(r);
export const isLinked = r => r.parts.some(p => p.kind === 'transfer');
export const partName = (p, state) => p.kind === 'tag' ? byId(tags, p.id)?.name : p.kind === 'repay' ? `${byId(people, p.person)?.name} repaid ${find(state, p.target)?.description}` : p.kind === 'fee' ? 'Transfer fee' : `Transfer ${find(state, p.target)?.cents > 0 ? 'to' : 'from'} ${byId(accounts, find(state, p.target)?.account)?.name}`;
export const partColor = p => p.kind === 'tag' ? byId(tags, p.id)?.color : p.kind === 'repay' ? byId(people, p.person)?.color : p.kind === 'fee' ? '#a8a8a8' : '#7a7a7a';
export const partKey = p => p.kind + ':' + (p.id || p.target || '');

// Money already repaid against an expense, optionally excluding one receipt.
export function repaid(state, expenseId, except) {
  return state.filter(r => r.id !== except).reduce((n, r) => n + r.parts.filter(p => p.kind === 'repay' && p.target === expenseId).reduce((a, p) => a + p.cents, 0), 0);
}
export const capacity = (state, expense, except) => Math.max(0, total(expense) - repaid(state, expense.id, except));

// Expenses a person could still be repaying: outgoing, not a transfer, with room left. Newest first.
// Ranked for a receipt: the person's own expenses first, then those paid before the receipt, nearest first.
export function openExpenses(state, except, personId) {
  const receipt = find(state, except), rank = r => (r.person === personId ? 0 : 1) * 1000 + (receipt && r.date > receipt.date ? 500 : 0) + (receipt ? days(r.date, receipt.date) : 0);
  return state.filter(r => r.cents < 0 && !isLinked(r) && r.id !== except && !twins(state, r).length && capacity(state, r, except) > 0).sort((a, b) => rank(a) - rank(b));
}
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
// Likely other half of a transfer: opposite direction, another account, within 2% and 3 days, unlinked.
export function twins(state, r) {
  if (isLinked(r)) return [];
  return state.filter(t => t.id !== r.id && t.account !== r.account && Math.sign(t.cents) === -Math.sign(r.cents) && !isLinked(t) && days(t.date, r.date) <= 3 && Math.abs(total(t) - total(r)) <= Math.max(total(t), total(r)) * 0.02)
    .sort((a, b) => days(a.date, r.date) - days(b.date, r.date));
}
// Tags previously used for the same description.
export function vendorHistory(state, r) {
  const seen = new Map();
  for (const t of state) if (t.id !== r.id && t.description === r.description) for (const p of t.parts) if (p.kind === 'tag') seen.set(p.id, (seen.get(p.id) || 0) + 1);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => byId(tags, id));
}

function clone(state) { return structuredClone(state); }
function check(cents) { if (!Number.isSafeInteger(cents) || cents < 0) throw Error('Use a positive amount with at most two decimals.'); }

// Toggling a tag: a present tag leaves; a new one takes the unsorted remainder, or half of the largest tag.
export function toggleTag(state, id, tagId) {
  const next = clone(state), r = find(next, id);
  if (isLinked(r)) throw Error('Unlink the transfer first.');
  const existing = r.parts.findIndex(p => p.kind === 'tag' && p.id === tagId);
  if (existing >= 0) { r.parts.splice(existing, 1); return next; }
  let cents = unsorted(r);
  if (!cents) {
    const largest = r.parts.filter(p => p.kind === 'tag').sort((a, b) => b.cents - a.cents)[0];
    if (!largest || largest.cents < 2) throw Error('Lower another part to make room.');
    cents = Math.floor(largest.cents / 2); largest.cents -= cents;
  }
  r.parts.push(tagPart(tagId, cents));
  return next;
}
export function setAmount(state, id, index, cents) {
  check(cents);
  const next = clone(state), r = find(next, id), p = r.parts[index];
  if (!p || p.kind === 'transfer' || p.kind === 'fee') throw Error('Unlink the transfer to change it.');
  if (cents > p.cents + unsorted(r)) throw Error(`Only ${money(p.cents + unsorted(r))} is available.`);
  if (p.kind === 'repay' && cents > capacity(state, find(state, p.target), id)) throw Error('That is more than the expense has left.');
  p.cents = cents; return next;
}
export function removePart(state, id, index) {
  const next = clone(state), r = find(next, id);
  if (r.parts[index]?.kind === 'transfer') return unlink(state, id);
  r.parts.splice(index, 1); return next;
}
// Move the boundary after part i by delta cents, trading only with the next part (or the unsorted gap).
export function moveBoundary(state, id, i, delta) {
  const next = clone(state), r = find(next, id), a = r.parts[i], b = r.parts[i + 1];
  if (!a || a.kind === 'transfer' || a.kind === 'fee' || b?.kind === 'transfer') return state;
  let low = -a.cents, high = b ? b.cents : unsorted(r);
  if (a.kind === 'repay') high = Math.min(high, capacity(state, find(state, a.target), id) - a.cents);
  if (b?.kind === 'repay') low = Math.max(low, b.cents - capacity(state, find(state, b.target), id));
  const d = Math.max(low, Math.min(high, delta));
  if (!d) return state;
  a.cents += d; if (b) b.cents -= d;
  return next;
}
export function link(state, aId, bId) {
  const next = clone(state), a = find(next, aId), b = find(next, bId);
  const out = a.cents < 0 ? a : b, inc = a.cents < 0 ? b : a;
  if (out.cents >= 0 || inc.cents <= 0 || out.account === inc.account) throw Error('A transfer needs money out of one account and into another.');
  if (isLinked(out) || isLinked(inc)) throw Error('One side is already linked.');
  const principal = Math.min(total(out), total(inc));
  out.parts = [{kind: 'transfer', target: inc.id, cents: principal}];
  if (total(out) > principal) out.parts.push({kind: 'fee', cents: total(out) - principal});
  inc.parts = [{kind: 'transfer', target: out.id, cents: principal}];
  return next;
}
export function unlink(state, id) {
  const next = clone(state), r = find(next, id), other = find(next, r.parts.find(p => p.kind === 'transfer')?.target);
  r.parts = []; if (other) other.parts = [];
  return next;
}
export function repay(state, id, personId, expenseId, cents) {
  check(cents);
  const next = clone(state), r = find(next, id), expense = find(next, expenseId);
  if (r.cents <= 0) throw Error('Only money in can repay an expense.');
  if (isLinked(r)) throw Error('Unlink the transfer first.');
  if (cents === 0 || cents > unsorted(r)) throw Error(`Only ${money(unsorted(r))} is still unsorted on this receipt.`);
  if (cents > capacity(state, expense, id)) throw Error('That is more than the expense has left.');
  const existing = r.parts.find(p => p.kind === 'repay' && p.target === expenseId);
  if (existing) existing.cents += cents; else r.parts.push({kind: 'repay', person: personId, target: expenseId, cents});
  r.person = personId; return next;
}
export function setPerson(state, id, personId) { const next = clone(state); find(next, id).person = personId; return next; }
export function toggleEvent(state, id, eventId) {
  const next = clone(state), r = find(next, id);
  r.events = r.events.includes(eventId) ? r.events.filter(e => e !== eventId) : [...r.events, eventId];
  return next;
}

// What the describe box offers for a query on one record. Grouped, most useful first.
export function describe(state, r, query) {
  const q = query.trim().toLowerCase(), hit = s => !q || s.toLowerCase().includes(q);
  const flow = r.cents > 0 ? 'in' : 'out', out = [];
  const history = vendorHistory(state, r);
  if (!q) for (const t of history.slice(0, 2)) out.push({kind: 'tag', id: t.id, label: t.name, hint: 'Used before for this vendor', color: t.color});
  if (!isLinked(r)) for (const t of twins(state, r)) if (hit(byId(accounts, t.account).name) || hit('transfer') || !q) out.push({kind: 'twin', id: t.id, label: `Transfer ${r.cents < 0 ? 'to' : 'from'} ${byId(accounts, t.account).name}`, hint: `${t.description} · ${t.date} · ${money(t.cents, true)}`, color: byId(accounts, t.account).color});
  if (r.cents > 0 && !isLinked(r)) for (const p of people) if (hit(p.name) || hit('repay') || hit('paid')) out.push({kind: 'person', id: p.id, label: `${p.name} paid you back`, hint: 'Choose which expense', color: p.color});
  for (const t of tags) if (t.flow === flow && (hit(t.name) || hit(t.group)) && !(!q && history.includes(t))) out.push({kind: 'tag', id: t.id, label: t.name, hint: t.group, color: t.color, on: r.parts.some(p => p.kind === 'tag' && p.id === t.id)});
  for (const e of events) if (hit(e.name) || hit('event')) out.push({kind: 'event', id: e.id, label: e.name, hint: `${e.start} to ${e.end}`, color: e.color, on: r.events.includes(e.id)});
  if (!isLinked(r)) for (const a of accounts) if (a.id !== r.account && q && (hit(a.name) || hit('transfer')) && !out.some(o => o.kind === 'twin' && find(state, o.id).account === a.id)) out.push({kind: 'account', id: a.id, label: `Transfer ${r.cents < 0 ? 'to' : 'from'} ${a.name}`, hint: 'No matching entry imported yet', color: a.color, disabled: true});
  return out.slice(0, 12);
}
