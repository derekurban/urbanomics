// Round four: a playable model of the four natures. Move (own accounts), Spend (tags, split, event, payee),
// Receive (income tags, event), Offset (a person or vendor reversing earlier spending). People carry a
// balance: shares they owe minus what they have settled. Synthetic and in memory; nothing saves.
import {people, events, tags} from './scenarios.mjs';
export {people, events, tags};

export const accounts = [
  {id: 'mc', name: 'Mastercard', color: '#c8a06d'},
  {id: 'chq', name: 'Chequing', color: '#658e83'},
  {id: 'sav', name: 'Savings', color: '#8fa6cb'},
  {id: 'ws', name: 'Wealthsimple', color: '#9fb4d6', untracked: true},
];
const r = (id, date, account, name, original, amount, extra = {}) => ({id, date, account, name, original, amount, parts: [], shares: null, event: null, nature: null, payee: null, rule: {state: 'none', pattern: '^' + original.split(' ').slice(0, 2).join(' '), matches: 3}, ...extra});

export function initialRows() {
  return [
    r('coffee', '2026-09-30', 'mc', 'Ritual coffee', 'RITUAL COFFEE ROASTERS', -575, {parts: [{kind: 'tag', id: 'restaurants', cents: 575}], nature: 'spend', suggested: true, rule: {state: 'suggested', name: 'Auto tag → Restaurants', pattern: '^RITUAL COFFEE', matches: 22}}),
    r('pay-mc', '2026-09-29', 'chq', 'Payment to Mastercard', 'PAYMENT TO MASTERCARD ****4821', -124000),
    r('pay-thanks', '2026-09-28', 'mc', 'Payment, thank you', 'PAYMENT - THANK YOU', 124000),
    r('ws', '2026-09-26', 'chq', 'Wealthsimple', 'WEALTHSIMPLE INVESTMENTS', -30000),
    r('gift', '2026-09-23', 'chq', 'Birthday gift', 'INTERAC E-TRANSFER FROM MOM', 15000),
    r('from-sam', '2026-09-22', 'chq', 'e-Transfer from Sam', 'INTERAC E-TRANSFER FROM SAM T', 7500, {rule: {state: 'exists', name: 'Auto person → Sam', pattern: '^INTERAC E-TRANSFER FROM SAM', matches: 14}}),
    r('from-jo', '2026-09-22', 'chq', 'e-Transfer from Jo', 'INTERAC E-TRANSFER FROM JO K', 13750),
    r('sav-in', '2026-09-21', 'sav', 'Transfer from chequing', 'TRANSFER IN', 49800),
    r('sav-out', '2026-09-20', 'chq', 'Transfer to savings', 'TRANSFER TO SAVINGS', -50000),
    r('petro', '2026-09-19', 'mc', 'Petro station', 'PETRO-CANADA 4471', -5520),
    r('cabin', '2026-09-18', 'mc', 'Mountain cabin', 'MTN CABIN RENTALS LTD', -41250, {parts: [{kind: 'tag', id: 'lodging', cents: 20725}, {kind: 'tag', id: 'fuel', cents: 5420}], nature: 'spend', event: 'cabin', shares: {source: 'event', me: 13750, people: [{id: 'sam', cents: 13750}, {id: 'pal', cents: 13750}]}}),
    r('trail', '2026-09-18', 'mc', 'Trailhead grocery', 'TRAILHEAD GROCERY', -6430, {parts: [{kind: 'tag', id: 'groceries', cents: 6430}], nature: 'spend', event: 'cabin', shares: {source: 'event', me: 2144, people: [{id: 'sam', cents: 2143}, {id: 'pal', cents: 2143}]}}),
    r('utility', '2026-08-18', 'mc', 'City Utilities', 'CITY UTILITIES', -18450, {history: 'utilities'}),
  ];
}
export const money = n => new Intl.NumberFormat('en-CA', {style: 'currency', currency: 'CAD'}).format(Math.abs(n) / 100);
export const plain = n => (Math.abs(n) / 100).toFixed(2);
export const acct = id => accounts.find(a => a.id === id);
export const person = id => people.find(p => p.id === id);
export const event = id => events.find(e => e.id === id);
export const total = row => Math.abs(row.amount);
export const assigned = row => row.parts.reduce((n, p) => n + p.cents, 0);
export const gap = row => total(row) - assigned(row);
export const find = (rows, id) => rows.find(x => x.id === id);
export const linked = row => row.parts.some(p => p.kind === 'move');

/* The nature the evidence suggests, before the user says otherwise. */
export function suggestNature(rows, row) {
  if (row.nature) return row.nature;
  if (linked(row)) return 'move';
  if (twins(rows, row).length) return 'move';
  if (row.amount > 0) { const who = guessPerson(row); if (who && balance(rows, who) > 0) return 'offset'; return 'receive'; }
  return 'spend';
}
export const naturesFor = row => row.amount < 0 ? ['spend', 'move'] : ['receive', 'offset', 'move'];
export const natureLabel = {move: 'Move', spend: 'Spend', receive: 'Receive', offset: 'Offset'};
export function guessPerson(row) { const m = /FROM ([A-Z]+)/.exec(row.original); if (!m) return null; return people.find(p => p.name.toUpperCase() === m[1])?.id || null; }

/* People: what they owe you, where it comes from, what they have settled. */
export function owedBy(rows, personId) {
  return rows.filter(x => x.shares && x.shares.people.some(p => p.id === personId && p.cents > 0)).sort((a, b) => a.date.localeCompare(b.date))
    .map(x => { const share = x.shares.people.find(p => p.id === personId).cents, paid = rows.reduce((n, y) => n + y.parts.filter(p => p.kind === 'offset' && p.person === personId).reduce((m, p) => m + (p.allocations.find(a => a.id === x.id)?.cents || 0), 0), 0); return {row: x, share, paid, left: share - paid}; });
}
export const balance = (rows, personId) => owedBy(rows, personId).reduce((n, o) => n + o.left, 0);

/* Likely other half of a move: opposite direction, another account, within 2% and 3 days, unlinked. */
export function twins(rows, row) {
  if (linked(row)) return [];
  return rows.filter(t => t.id !== row.id && t.account !== row.account && Math.sign(t.amount) === -Math.sign(row.amount) && !linked(t) && Math.abs(Date.parse(t.date) - Date.parse(row.date)) <= 3 * 86400000 && Math.abs(total(t) - total(row)) <= Math.max(total(t), total(row)) * 0.02);
}
export function partView(rows, p) {
  if (p.kind === 'tag') return {name: tags[p.id].name, color: tags[p.id].color, cents: p.cents, nature: p.cents && tags[p.id].group === 'Income' ? 'receive' : 'spend'};
  if (p.kind === 'offset') return {name: p.vendor ? `Refund · ${p.vendor}` : `${person(p.person).name} settled`, color: p.vendor ? '#a3b2d4' : person(p.person).color, cents: p.cents, nature: 'offset'};
  if (p.kind === 'move') { const t = find(rows, p.target); return {name: t ? `${t.amount < 0 ? 'From' : 'To'} ${acct(t.account).name}` : `To ${acct(p.account).name}`, color: '#7a7a7a', cents: p.cents, nature: 'move'}; }
  return {name: 'Transfer fee', color: '#a8a8a8', cents: p.cents, nature: 'fee'};
}

/* ---- operations: each returns a new rows array ---- */
const clone = rows => rows.map(x => ({...x, parts: x.parts.map(p => ({...p, allocations: p.allocations ? p.allocations.map(a => ({...a})) : undefined})), shares: x.shares ? {...x.shares, people: x.shares.people.map(p => ({...p}))} : null, rule: {...x.rule}}));
export function addTag(rows, id, tagId) {
  const next = clone(rows), row = find(next, id);
  const i = row.parts.findIndex(p => p.kind === 'tag' && p.id === tagId);
  if (i >= 0) { row.parts.splice(i, 1); return next; }
  let cents = gap(row);
  if (!cents) { const big = row.parts.filter(p => p.kind === 'tag').sort((a, b) => b.cents - a.cents)[0]; if (!big || big.cents < 2) return rows; cents = Math.floor(big.cents / 2); big.cents -= cents; }
  row.parts.push({kind: 'tag', id: tagId, cents}); row.suggested = false;
  if (!row.nature || row.nature === 'move') row.nature = row.amount < 0 ? 'spend' : row.parts.some(p => p.kind === 'offset') ? 'offset' : 'receive';
  return next;
}
export function setAmount(rows, id, index, cents) {
  const next = clone(rows), row = find(next, id), p = row.parts[index]; if (!p || p.kind === 'move' || p.kind === 'fee') return rows;
  if (!Number.isInteger(cents) || cents < 0 || cents > p.cents + gap(row)) return rows;
  if (p.kind === 'offset' && cents > p.cents) { const extra = cents - p.cents, add = allocate(next, p.person, extra, p.allocations); if (!add.length) return rows; p.allocations.push(...add); }
  if (p.kind === 'offset' && cents < p.cents) { let cut = p.cents - cents; for (let i = p.allocations.length - 1; i >= 0 && cut > 0; i--) { const take = Math.min(cut, p.allocations[i].cents); p.allocations[i].cents -= take; cut -= take; } p.allocations = p.allocations.filter(a => a.cents > 0); }
  p.cents = cents; return next;
}
export function removePart(rows, id, index) { const next = clone(rows), row = find(next, id); if (row.parts[index]?.kind === 'move' || row.parts[index]?.kind === 'fee') return unlink(rows, id); row.parts.splice(index, 1); return next; }
/* Oldest open share first. */
function allocate(rows, personId, cents, already = []) {
  const out = []; let left = cents;
  for (const o of owedBy(rows, personId)) { const open = o.left - (already.find(a => a.id === o.row.id)?.cents || 0); if (open <= 0) continue; const take = Math.min(open, left); if (take > 0) { out.push({id: o.row.id, cents: take}); left -= take; } if (!left) break; }
  return left ? [] : out;
}
export function settle(rows, id, personId, cents) {
  const next = clone(rows), row = find(next, id); if (row.amount <= 0) return rows;
  const amount = Math.min(cents ?? gap(row), gap(row), balance(next, personId)); if (amount <= 0) return rows;
  const allocations = allocate(next, personId, amount); if (!allocations.length) return rows;
  const existing = row.parts.find(p => p.kind === 'offset' && p.person === personId);
  if (existing) { existing.cents += amount; existing.allocations.push(...allocations); } else row.parts.push({kind: 'offset', person: personId, cents: amount, allocations});
  row.nature = 'offset'; return next;
}
export function refund(rows, id, vendor, cents) { const next = clone(rows), row = find(next, id); const amount = Math.min(cents ?? gap(row), gap(row)); if (amount <= 0) return rows; row.parts.push({kind: 'offset', vendor, cents: amount, allocations: []}); row.nature = 'offset'; return next; }
export function link(rows, aId, bId) {
  const next = clone(rows), a = find(next, aId), b = find(next, bId); if (!a || !b || linked(a) || linked(b)) return rows;
  const out = a.amount < 0 ? a : b, inc = a.amount < 0 ? b : a, principal = Math.min(total(out), total(inc));
  out.parts = [{kind: 'move', target: inc.id, cents: principal}]; if (total(out) > principal) out.parts.push({kind: 'fee', cents: total(out) - principal});
  inc.parts = [{kind: 'move', target: out.id, cents: principal}]; out.nature = inc.nature = 'move'; out.shares = inc.shares = null; return next;
}
export function moveTo(rows, id, accountId) { const next = clone(rows), row = find(next, id); row.parts = [{kind: 'move', account: accountId, cents: total(row)}]; row.nature = 'move'; row.shares = null; return next; }
export function unlink(rows, id) { const next = clone(rows), row = find(next, id), other = find(next, row.parts.find(p => p.kind === 'move')?.target); row.parts = []; row.nature = null; if (other) { other.parts = []; other.nature = null; } return next; }
export function setNature(rows, id, nature) { const next = clone(rows), row = find(next, id); if (nature === row.nature) return rows; if (linked(row)) return unlink(rows, id); row.nature = nature; if (nature !== 'offset') row.parts = row.parts.filter(p => p.kind !== 'offset'); if (nature === 'offset') row.parts = row.parts.filter(p => p.kind !== 'tag' || tags[p.id].group === 'Income'); return next; }
export function setEvent(rows, id, eventId) {
  const next = clone(rows), row = find(next, id); row.event = row.event === eventId ? null : eventId;
  const ev = row.event && event(row.event);
  if (row.amount < 0 && ev?.participants.length && (!row.shares || row.shares.source === 'event')) row.shares = even(row, ev.participants, 'event');
  else if (!row.event && row.shares?.source === 'event') row.shares = null;
  return next;
}
export function even(row, ids, source = 'manual') { const n = ids.length + 1, each = Math.floor(total(row) / n); return {source, me: total(row) - each * ids.length, people: ids.map(id => ({id, cents: each}))}; }
export function toggleShare(rows, id, personId) { const next = clone(rows), row = find(next, id); const ids = row.shares ? row.shares.people.map(p => p.id) : []; const list = ids.includes(personId) ? ids.filter(x => x !== personId) : [...ids, personId]; row.shares = list.length ? even(row, list, 'manual') : null; return next; }
export function setShare(rows, id, personId, cents) { const next = clone(rows), row = find(next, id); if (!row.shares) return rows; const others = row.shares.people.filter(p => p.id !== personId).reduce((n, p) => n + p.cents, 0); if (cents < 0 || cents + others > total(row)) return rows; row.shares = {source: 'manual', me: total(row) - others - cents, people: row.shares.people.map(p => p.id === personId ? {...p, cents} : p)}; return next; }
export function setPayee(rows, id, personId) { const next = clone(rows), row = find(next, id); row.payee = row.payee === personId ? null : personId; return next; }
export function remember(rows, id) { const next = clone(rows), row = find(next, id); const tag = row.parts.find(p => p.kind === 'tag'); row.rule = {...row.rule, state: 'exists', name: `Auto tag → ${tag ? tags[tag.id].name : 'tags'}`}; return next; }
export function confirmRule(rows, id) { const next = clone(rows), row = find(next, id); row.suggested = false; row.rule = {...row.rule, state: 'exists'}; return next; }
