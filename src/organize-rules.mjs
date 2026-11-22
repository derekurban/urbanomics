// Pure rules for the Organize desk, kept apart from the page so they can be tested on their own:
// what the describe box offers first (and what Enter takes), what Claude may apply without review,
// and which row comes next.

/* The describe box. Each option carries its kind and, from the desk, why it might be the answer:
   `twin` (a likely other half of a transfer), `history` (a tag used before for this name), `guess`
   (a person the description names), `same` (the choice just made on a row with the same name).
   With nothing typed, the list leads with those, then tags, then everyone else who owes money,
   then events; Enter takes only a lead. A wrong default is worse than none, so when nothing leads,
   nothing is highlighted. With text typed, the old grouping stands and Enter takes the top match. */
export const DESCRIBE_TITLES = {same: 'Same as last', twin: 'Same money', history: 'Used before for this name', reduce: 'Reduce expenses', person: 'Settles up', share: 'Shared with', payee: 'Paid a person', tag: 'Tags', event: 'Events', account: 'Own accounts', create: 'New tag'};
const TYPED = ['twin', 'reduce', 'person', 'share', 'payee', 'tag', 'event', 'account', 'create'];

export function groupOf(option) {
  if (option.same) return 'same';
  if (option.kind === 'tag' && option.history) return 'history';
  return option.kind;
}
/** { list, cursor }: options in display order, each with its `group`, and the index Enter takes (-1 for none). */
export function orderDescribe(options, query = '') {
  const typed = !!query.trim(), withGroup = options.map(o => ({...o, group: groupOf(o)}));
  if (typed) {
    const plain = withGroup.map(o => ({...o, group: o.kind}));
    const list = [...TYPED.flatMap(g => plain.filter(o => o.group === g)), ...plain.filter(o => !TYPED.includes(o.group))];
    return {list, cursor: list.findIndex(o => !o.disabled)};
  }
  const rank = o => o.group === 'same' ? 0 : o.group === 'twin' ? 1 : o.group === 'history' ? 2
    : o.guess && o.kind === 'payee' ? 3 : o.guess && o.kind === 'share' ? 4 : o.guess && o.kind === 'person' ? 5
    : o.kind === 'tag' ? 6 : o.kind === 'person' ? 7 : o.kind === 'event' ? 8 : 9;
  const list = withGroup.map((o, i) => ({o, i})).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map(x => x.o);
  const lead = o => !o.disabled && (o.group === 'same' || o.group === 'twin' || o.group === 'history' || (o.guess && ['payee', 'share', 'person'].includes(o.kind)));
  return {list, cursor: list.findIndex(lead)};
}
/** Runs of options under one heading, in display order. A heading may appear twice when its options are split by rank. */
export function describeSections(list) {
  const out = [];
  list.forEach((o, i) => { const last = out.at(-1); if (last && last.group === o.group) last.items.push({o, i}); else out.push({group: o.group, title: DESCRIBE_TITLES[o.group] || '', items: [{o, i}]}); });
  return out;
}

/* Apply automatically. Amount and date cannot prove who someone is or what a payment was for, so
   without review Claude may only add tags you already have, link a transfer that has one clear other
   half, and add an event that carries no split. Everything else waits on the row with its star. */
export function canApplyUnreviewed(s, {twinIsUnique = () => false, eventHasParticipants = () => true} = {}) {
  if (!s || s.confidence === 'low') return false;
  if (s.kind === 'tag') return true;
  if (s.kind === 'twin') return s.confidence === 'high' && twinIsUnique(s.id);
  if (s.kind === 'event') return !eventHasParticipants(s.id);
  return false;
}
/** { apply, hold }: what may be applied without review, and what waits. */
export function splitForAutoApply(suggestions, context) {
  const apply = [], hold = [];
  for (const s of suggestions || []) (canApplyUnreviewed(s, context) ? apply : hold).push(s);
  // A move stands alone: on a linked transfer, tags would be dropped anyway.
  if (apply.some(s => s.kind === 'twin')) { for (const s of apply.filter(s => s.kind === 'tag')) { hold.push(s); apply.splice(apply.indexOf(s), 1); } }
  return {apply, hold};
}
/** Whether `id` and its one candidate point only at each other. */
export function mutuallyUnique(id, candidatesOf) {
  const mine = candidatesOf(id);
  if (mine.length !== 1) return false;
  const theirs = candidatesOf(mine[0]);
  return theirs.length === 1 && theirs[0] === id;
}

/* Moving through the list. `rows` are in display order; `after` is the row to start after (it may have
   left the list since); `before(a, b)` is the list's own order. The search wraps to the top. */
export function nextRow(rows, after, isCandidate, before) {
  if (!rows.length) return null;
  let start = 0;
  if (after) { const at = rows.findIndex(r => r.id === after.id); start = at >= 0 ? at + 1 : rows.findIndex(r => before(after, r)); if (start < 0) start = rows.length; }
  for (let k = 0; k < rows.length; k++) { const r = rows[(start + k) % rows.length]; if ((!after || r.id !== after.id) && isCandidate(r)) return r; }
  return null;
}

/* Same again: other rows that look like this one and have nothing on them yet. */
export function sameUntouched(rows, row, {untouched}) {
  const out = row.amount < 0;
  return rows.filter(r => r.id !== row.id && r.name === row.name && (r.amount < 0) === out && r.amount !== 0 && untouched(r));
}
