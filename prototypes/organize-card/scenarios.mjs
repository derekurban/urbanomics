// Synthetic rows for the open-card study. Nothing here touches the application.
export const people = [
  {id: 'sam', name: 'Sam', color: '#ca8d86'},
  {id: 'pal', name: 'Jo', color: '#af8eb5'},
  {id: 'mom', name: 'Mom', color: '#8fa6cb'},
];
export const events = [
  {id: 'cabin', name: 'Cabin weekend', color: '#af8eb5', start: '2026-09-18', end: '2026-09-20', participants: ['sam', 'pal']},
  {id: 'bday', name: 'Birthday dinner', color: '#c8a06d', start: '2026-09-26', end: '2026-09-26', participants: []},
];
export const tags = {
  utilities: {name: 'Utilities', group: 'Home', color: '#9fb4d6'},
  rent: {name: 'Rent', group: 'Home', color: '#5f7fb3'},
  groceries: {name: 'Groceries', group: 'Food', color: '#5f9a72'},
  restaurants: {name: 'Restaurants', group: 'Food', color: '#8bb98a'},
  lodging: {name: 'Lodging', group: 'Travel', color: '#b5793a'},
  fuel: {name: 'Fuel', group: 'Travel', color: '#d8ae78'},
  gift: {name: 'Gift', group: 'Income', color: '#6f84b5'},
  paycheck: {name: 'Paycheck', group: 'Income', color: '#4f8f86'},
};
const acct = {mc: {name: 'Credit card', color: '#c8a06d'}, chq: {name: 'Chequing', color: '#658e83'}, sav: {name: 'Savings', color: '#8fa6cb'}};

export const scenarios = [
  {
    id: 'untagged', label: 'Untagged expense',
    name: 'City Power', original: 'CITY POWER', account: acct.mc, date: '2026-08-13', amount: -24816, kind: 'expense',
    parts: [], shares: null, event: null, repaid: [],
    history: ['utilities'],
    rule: {state: 'none', pattern: '^CITY POWER', direction: 'out', matches: 6},
  },
  {
    id: 'split', label: 'Split expense in an event',
    name: 'Mountain cabin', original: 'MTN CABIN RENTALS LTD', account: acct.mc, date: '2026-09-18', amount: -41250, kind: 'expense',
    parts: [{kind: 'tag', id: 'lodging', cents: 20725}, {kind: 'tag', id: 'fuel', cents: 5420}],
    shares: {source: 'event', me: 13750, people: [{id: 'sam', cents: 13750, repaid: 6000}, {id: 'pal', cents: 13750, repaid: 13750}]},
    event: 'cabin', repaid: [{id: 'sam', name: 'e-Transfer from Sam', cents: 6000}, {id: 'pal', name: 'e-Transfer from Jo', cents: 13750}],
    history: [],
    rule: {state: 'none', pattern: '^MTN CABIN RENTALS', direction: 'out', matches: 1},
  },
  {
    id: 'repay', label: 'Money in · repayment',
    name: 'e-Transfer from Sam', original: 'INTERAC E-TRANSFER FROM SAM T', account: acct.chq, date: '2026-09-22', amount: 7500, kind: 'income',
    parts: [{kind: 'repay', person: 'sam', target: 'Mountain cabin', cents: 4000}, {kind: 'tag', id: 'gift', cents: 2000}],
    shares: null, event: null, repaid: [], person: 'sam',
    candidates: [{name: 'Mountain cabin', date: '2026-09-18', left: 7750, fits: false}, {name: 'Trailhead grocery', date: '2026-09-18', left: 2143, fits: false}],
    history: [],
    rule: {state: 'exists', name: 'Auto person → Sam', pattern: '^INTERAC E-TRANSFER FROM SAM', direction: 'in', person: 'sam', matches: 14},
  },
  {
    id: 'transfer', label: 'Linked transfer',
    name: 'Transfer to savings', original: 'TRANSFER TO SAVINGS', account: acct.chq, date: '2026-09-20', amount: -50000, kind: 'transfer',
    parts: [{kind: 'transfer', name: 'Transfer to Savings', cents: 49800}, {kind: 'fee', name: 'Transfer fee', cents: 200}],
    other: {name: 'Transfer from chequing', account: acct.sav, date: '2026-09-21'},
    shares: null, event: null, repaid: [], history: [],
    rule: {state: 'none', pattern: '^TRANSFER TO SAVINGS', direction: 'out', matches: 9},
  },
  {
    id: 'suggested', label: 'Rule-suggested expense',
    name: 'Ritual coffee', original: 'RITUAL COFFEE ROASTERS', account: acct.mc, date: '2026-09-30', amount: -575, kind: 'expense',
    parts: [{kind: 'tag', id: 'restaurants', cents: 575}], suggested: true,
    shares: null, event: null, repaid: [], history: ['restaurants'],
    rule: {state: 'suggested', name: 'Auto tag → Restaurants', pattern: '^RITUAL COFFEE', direction: 'out', matches: 22},
  },
];
export const money = n => new Intl.NumberFormat('en-CA', {style: 'currency', currency: 'CAD'}).format(Math.abs(n) / 100);
export const plain = n => (Math.abs(n) / 100).toFixed(2);
export const person = id => people.find(p => p.id === id);
export const event = id => events.find(e => e.id === id);
export function partView(p) {
  if (p.kind === 'tag') return {name: tags[p.id].name, color: tags[p.id].color, cents: p.cents, kind: 'tag', sub: tags[p.id].group};
  if (p.kind === 'repay') return {name: `${person(p.person).name} · ${p.target}`, color: person(p.person).color, cents: p.cents, kind: 'repay', sub: 'Repayment'};
  if (p.kind === 'transfer') return {name: p.name, color: '#7a7a7a', cents: p.cents, kind: 'transfer', sub: 'Internal'};
  return {name: p.name, color: '#a8a8a8', cents: p.cents, kind: 'fee', sub: 'External cost'};
}
export const gapOf = s => Math.abs(s.amount) - s.parts.reduce((n, p) => n + p.cents, 0);
