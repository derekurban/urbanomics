// Organize desk: the ledger is the workspace. One cross-account list; a row opens in place as a
// parts-first card. One box answers "what is this?" in the terms that fit the line: a tag makes a
// Spend or Receive part, a person on money in settles what they owe (an Offset part, attributed to
// their oldest open shares first), an account pairs a Move. Split, event and rule keep fixed slots.
// Changes apply at once and persist through a serial queue against the row's latest version.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Icon} from '@derekurban/design-system';
import {categoryColors} from './category-colors.js';
import {find, money, total, rest, segments, cap, add, resize, remove, repayment, paired, mapRecords, templateWeights} from './allocation-model.js';
import {tagType, orderedTags} from '../electron/review/tag-model.mjs';
import {isOther} from '../electron/review/system-tags.mjs';
import {pendingTransfers, withinBand, transferPairBand} from '../electron/review/transfer-model.mjs';
import {splitShares} from '../electron/review/share-model.mjs';
import {TransactionRuleReuse} from './TransactionRuleReuse.jsx';
import {TransactionTemplateEditor} from './TransactionTemplateEditor.jsx';
import './organize-desk.css';

const api = () => window.urbanomics;
const PAGE = 150;
const plain = cents => (Math.abs(cents) / 100).toFixed(2);
const signed = (cents, currency) => (cents < 0 ? '−' : '+') + money(Math.abs(cents), currency);
const weekday = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'}) : iso;
const dayGap = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000;
const luminance = color => { if (!/^#[0-9a-f]{6}$/i.test(color || '')) return 0.5; const n = parseInt(color.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const cloneRow = row => ({...row, layers: row.layers.map(l => ({...l})), groups: [...row.groups], shares: row.shares ? {...row.shares} : row.shares});
const clone = state => state.map(cloneRow);

const isLinked = row => !!row && (row.raw.review.kind === 'transfer' || row.layers.some(l => l.kind === 'transfer'));
const unsorted = row => !isLinked(row) && (rest(row) > 0 || row.raw.review.templateReview === 'pending');
const sharedWith = row => Object.entries(row.shares || {}).filter(([id, cents]) => id !== 'me' && cents > 0).map(([id]) => id);
const natureOf = (row, l) => l.kind === 'tag' ? (row.amount > 0 ? 'Receive' : 'Spend') : l.kind === 'expense' ? 'Offset' : l.kind === 'transfer' || l.kind === 'principal' ? 'Move' : l.kind === 'fee' ? 'Fee' : l.kind === 'excess' ? 'Extra' : '';

/* Parts of one row's amount, colored for the strip. Repayments take the person's color. */
function parts(state, row, entities) {
  const person = entities.find(e => e.id === row.person);
  return segments(state, row).map(l => l.kind === 'expense' ? {...l, color: person?.color || l.color, name: `${person?.name || 'Repayment'} · ${l.name}`} : l.kind === 'default' ? {...l, name: 'Unsorted'} : l);
}
/* What a person still owes you, oldest expense first. */
function owedBy(state, personId, except) {
  return state.filter(t => t.amount < 0 && !isLinked(t) && sharedWith(t).includes(personId)).sort((a, b) => a.date.localeCompare(b.date))
    .map(t => ({row: t, share: t.shares[personId], paid: repayment(state, t.id, personId, except), left: Math.max(0, t.shares[personId] - repayment(state, t.id, personId, except))}));
}
const balanceOf = (state, personId, except) => owedBy(state, personId, except).reduce((n, o) => n + o.left, 0);

function Shape({row, shown, currency}) {
  return <div className={'od-shape' + (shown.length === 1 && shown[0].kind === 'default' ? ' is-empty' : '')} role="img" aria-label={shown.map(s => `${s.name} ${money(s.cents, currency)}`).join(', ')}>
    {shown.map(s => <div key={s.id} className={'od-seg' + (s.kind === 'default' ? ' is-gap' : '')} style={s.kind === 'default' ? {flexGrow: s.cents} : {flexGrow: s.cents, background: s.color, color: luminance(s.color) > 0.62 ? '#1b1b1b' : '#fafafa'}} title={`${s.name} · ${money(s.cents, currency)}`}><span className="od-seg-label">{s.name}</span></div>)}
  </div>;
}
function Amount({value, label, onCommit}) {
  const [text, setText] = useState(plain(value)), cancel = useRef(false);
  useEffect(() => setText(plain(value)), [value]);
  return <input className="od-amount" inputMode="decimal" aria-label={label} value={text} onChange={e => setText(e.target.value)}
    onFocus={e => { cancel.current = false; e.target.select(); }}
    onBlur={() => { if (!cancel.current && /^\d+(\.\d{0,2})?$/.test(text) && Math.round(Number(text) * 100) !== value) onCommit(Math.round(Number(text) * 100)); else setText(plain(value)); }}
    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { cancel.current = true; e.target.blur(); } }} />;
}
/* One box. Its answers are grouped by what the line can be. */
function Describe({options, onPick, inputRef, placeholder}) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [cursor, setCursor] = useState(0);
  const groups = [['twin', 'Same money'], ['person', 'Settles up'], ['share', 'Shared with'], ['payee', 'Paid a person'], ['tag', 'Tags'], ['event', 'Events'], ['account', 'Own accounts']];
  const shown = useMemo(() => { const all = options(query); return groups.flatMap(([g]) => all.filter(o => o.kind === g)); }, [options, query]);
  useEffect(() => setCursor(0), [query]);
  function pick(o) { if (o.disabled) return; onPick(o); setQuery(''); setOpen(false); }
  let flat = -1;
  return (
    <div className="od-describe">
      <div className="od-describe-field">
        <Icon name="search" size={16} />
        <input ref={inputRef} value={query} placeholder={placeholder} aria-label="Describe this transaction" role="combobox" aria-expanded={open && shown.length > 0} aria-autocomplete="list"
          onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(shown.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
            else if (e.key === 'Enter' && open && shown[cursor]) { e.preventDefault(); pick(shown[cursor]); }
            else if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); }
          }} />
        <kbd>Enter</kbd>
      </div>
      {open && shown.length > 0 && (
        <div className="od-menu" role="listbox" aria-label="Suggestions">
          {groups.map(([g, title]) => {
            const items = shown.filter(o => o.kind === g); if (!items.length) return null;
            return <div key={g} className="od-menu-group"><small>{title}</small>
              {items.map(o => { const i = ++flat; return (
                <button key={o.kind + o.id} type="button" role="option" aria-selected={i === cursor} aria-disabled={o.disabled || undefined} className={(i === cursor ? 'is-cursor' : '') + (o.disabled ? ' is-disabled' : '')} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setCursor(i)} onClick={() => pick(o)}>
                  <i style={{background: o.color}} /><span><b>{o.label}</b><small>{o.hint}</small></span>{o.on && <Icon name="check" size={14} />}
                </button>); })}
            </div>;
          })}
        </div>
      )}
    </div>
  );
}

export function OrganizeDesk({data, run, onSource, target, onSettings}) {
  const [state, setState] = useState([]), [entities, setEntities] = useState([]), [config, setConfig] = useState(null), [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(null), [selected, setSelected] = useState([]), [anchor, setAnchor] = useState(null);
  const [filter, setFilter] = useState('all'), [accountFilter, setAccountFilter] = useState([]), [query, setQuery] = useState(''), [limit, setLimit] = useState(PAGE), [flow, setFlow] = useState(true);
  const [saving, setSaving] = useState(0), [toast, setToast] = useState(null), [history, setHistory] = useState([]), [template, setTemplate] = useState(null), [ruleRevision, setRuleRevision] = useState(0), [batchQuery, setBatchQuery] = useState('');
  const generation = useRef(0), stateRef = useRef(state), listRef = useRef(null);
  const serverRows = useRef([]), pendingDesired = useRef(new Map()), queue = useRef(Promise.resolve());
  stateRef.current = state;
  const busy = saving > 0;

  const desiredOf = row => ({layers: row.layers.map(l => ({...l})), groups: [...row.groups], person: row.person, shares: row.shares ? {...row.shares} : row.shares});
  const applyDesired = (row, d) => ({...row, layers: d.layers.map(l => ({...l})), groups: [...d.groups], person: d.person, shares: d.shares ? {...d.shares} : d.shares});
  function publish(rows) { const merged = rows.map(r => pendingDesired.current.has(r.id) ? applyDesired(r, pendingDesired.current.get(r.id)) : r); stateRef.current = merged; setState(merged); }
  async function load(withConfig = false) {
    const seq = ++generation.current;
    const [result, lab] = await Promise.all([api().reviewState(), withConfig || !config ? api().transferLabState().catch(() => null) : null]);
    if (seq !== generation.current) return null;
    const colors = categoryColors(result.entities);
    setEntities(colors); if (lab) setConfig(lab.config); setRuleRevision(n => n + 1);
    const rows = mapRecords(result.records, colors).filter(r => !r.deleted);
    serverRows.current = rows; publish(rows); return rows;
  }
  useEffect(() => { load(true).catch(e => setLoadError(e.message)); }, [data]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const accounts = useMemo(() => [...new Map(state.map(r => [r.accountId, {id: r.accountId, name: r.account, color: r.color}])).values()], [state]);
  const people = entities.filter(e => e.kind === 'person'), events = entities.filter(e => e.kind === 'group');
  const tagChoices = useMemo(() => orderedTags(entities.filter(t => t.kind === 'category' && !isOther(t.id, entities))), [entities]);
  const bucketName = id => entities.find(e => e.id === id)?.name;
  const basisPoints = config?.basisPoints ?? 0, maxDays = config?.maxDays ?? 1, routes = config?.routes || [];
  const onRoute = (out, inc) => routes.some(r => r.from === out.accountId && r.to === inc.accountId);
  const pending = useMemo(() => pendingTransfers(state.map(r => r.raw)), [state]);
  function twins(row) {
    if (!row || !row.canTransfer || row.manual) return [];
    const out = row.amount < 0;
    return pending.filter(t => t.id !== row.id && t.accountId !== row.accountId && t.currency === row.currency && (out ? t.amountCents > 0 && withinBand(row.amount, t.amountCents, basisPoints) : t.amountCents < 0 && withinBand(t.amountCents, row.amount, basisPoints)) && dayGap(t.date, row.date) <= maxDays)
      .map(t => find(state, t.id)).filter(Boolean)
      .sort((a, b) => (onRoute(out ? row : b, out ? b : row) - onRoute(out ? row : a, out ? a : row)) || Math.abs(Math.abs(a.amount) - total(row)) - Math.abs(Math.abs(b.amount) - total(row)) || dayGap(a.date, row.date) - dayGap(b.date, row.date));
  }

  /* Background persistence: one step at a time, each against the row's latest server version. */
  function enqueue(step) { setSaving(n => n + 1); const run = queue.current.then(step).catch(() => false).finally(() => setSaving(n => n - 1)); queue.current = run; return run; }
  function snapshot(row) { return {id: row.id, layers: row.layers.map(l => ({...l})), groups: [...row.groups], person: row.person, shares: row.shares ? {...row.shares} : row.shares, payee: row.raw.review.assignedPersonId || '', linked: isLinked(row), other: row.raw.review.transferId || paired(stateRef.current, row.id)?.id || row.layers.find(l => l.kind === 'transfer')?.target || null}; }
  const sharesList = row => row.shares && Object.keys(row.shares).length ? Object.entries(row.shares).map(([id, cents]) => ({id, cents})) : null;
  function saveRow(row, version) {
    if (row.raw.review.kind === 'transfer') return api().organize([{id: row.id, version, groups: row.groups}]);
    return api().saveAllocation(row.id, version, {tags: row.layers.filter(l => l.kind === 'tag').map(l => ({id: l.target, cents: l.cents})), allocations: row.layers.filter(l => l.kind === 'expense' && l.cents > 0).map(l => ({id: l.target, cents: l.cents})), personId: row.person || '', groups: row.groups});
  }
  const saveShares = (row, version) => api().saveFinancial(row.id, version, {kind: 'expense', reviewed: true, shares: sharesList(row), personId: '', allocations: [], remainder: 0, transferId: ''});
  function commit(id, next, message, persistWith = saveRow) {
    const live = find(stateRef.current, id), row = find(next, id); if (!live || !row) return Promise.resolve(false);
    const desired = desiredOf(row), undoEntry = {rows: [snapshot(live)]};
    pendingDesired.current.set(id, desired); stateRef.current = next; setState(next);
    if (message) setToast({message}); setHistory(h => [...h.slice(-29), undoEntry]);
    return enqueue(async () => {
      const server = find(serverRows.current, id); if (!server) return false;
      try { await persistWith(applyDesired(server, desired), server.version); }
      catch (e) { setToast({message: e.message, error: true}); if (pendingDesired.current.get(id) === desired) pendingDesired.current.delete(id); setHistory(h => h.filter(x => x !== undoEntry)); await load().catch(() => {}); return false; }
      if (pendingDesired.current.get(id) === desired) pendingDesired.current.delete(id);
      await load().catch(() => {}); return true;
    });
  }
  function change(id, mutate, message, persistWith) {
    let next; try { next = clone(stateRef.current); mutate(next); } catch (e) { setToast({message: e.message, error: true}); return Promise.resolve(false); }
    return commit(id, next, message, persistWith);
  }
  function linkPair(aId, bId) {
    return enqueue(async () => {
      const a = find(serverRows.current, aId), b = find(serverRows.current, bId); if (!a || !b) return false;
      const out = a.amount < 0 ? a : b, inc = a.amount < 0 ? b : a, fee = total(out) - total(inc), entry = {rows: [snapshot(out), snapshot(inc)]};
      try { await api().linkTransfer(out.id, out.version, inc.id, inc.version, transferPairBand(out.raw, inc.raw), inc.groups); setHistory(h => [...h.slice(-29), entry]); setToast({message: `Moved between accounts${fee > 0 ? ` · ${money(fee, out.currency)} fee` : fee < 0 ? ` · ${money(-fee, out.currency)} extra received` : ''}`}); }
      catch (e) { setToast({message: e.message, error: true}); }
      await load().catch(() => {}); return true;
    });
  }
  function unlinkRow(id) {
    return enqueue(async () => {
      const row = find(serverRows.current, id); if (!row) return false;
      const other = find(serverRows.current, row.raw.review.transferId) || paired(serverRows.current, row.id) || find(serverRows.current, row.layers.find(l => l.kind === 'transfer')?.target); if (!other) return false;
      const entry = {rows: [snapshot(row), snapshot(other)]};
      try { await api().unlinkTransfer(row.id, row.version, other.version); setHistory(h => [...h.slice(-29), entry]); setToast({message: 'No longer a move'}); }
      catch (e) { setToast({message: e.message, error: true}); }
      await load().catch(() => {}); return true;
    });
  }
  function setPayee(row, personId) {
    const current = row.raw.review.assignedPersonId || '', next = current === personId ? '' : personId, name = people.find(p => p.id === personId)?.name || 'person';
    return enqueue(async () => { const server = find(serverRows.current, row.id); if (!server) return false; try { await api().assignTransactionPerson(server.id, server.version, next); setHistory(h => [...h.slice(-29), {rows: [snapshot(server)]}]); setToast({message: next ? `Paid ${name}` : `No longer paid to ${name}`}); } catch (e) { setToast({message: e.message, error: true}); } await load().catch(() => {}); return true; });
  }
  function followEvent(row) {
    return enqueue(async () => { const server = find(serverRows.current, row.id); if (!server) return false; try { await api().followEventSplit(server.id, server.version); setHistory(h => [...h.slice(-29), {rows: [snapshot(server)]}]); setToast({message: `Following ${events.find(e => e.id === row.groups[0])?.name || 'the event'} again`}); } catch (e) { setToast({message: e.message, error: true}); } await load().catch(() => {}); return true; });
  }
  function undo() {
    const entry = history.at(-1); if (!entry) return;
    setHistory(h => h.slice(0, -1));
    enqueue(async () => {
      try {
        for (const s of entry.rows) {
          let row = find(serverRows.current, s.id); if (!row) continue;
          if (s.linked && !isLinked(row)) { const other = find(serverRows.current, s.other); if (!other || isLinked(other)) continue; const out = row.amount < 0 ? row : other, inc = row.amount < 0 ? other : row; await api().linkTransfer(out.id, out.version, inc.id, inc.version, transferPairBand(out.raw, inc.raw), s.groups); await load(); continue; }
          if (!s.linked && isLinked(row)) { const other = find(serverRows.current, row.raw.review.transferId) || paired(serverRows.current, row.id); if (!other) continue; await api().unlinkTransfer(row.id, row.version, other.version); await load(); row = find(serverRows.current, s.id); if (!row) continue; }
          if (isLinked(row)) continue;
          if ((row.raw.review.assignedPersonId || '') !== s.payee) { await api().assignTransactionPerson(row.id, row.version, s.payee); await load(); row = find(serverRows.current, s.id); if (!row) continue; }
          if (JSON.stringify(sharesList(row)) !== JSON.stringify(sharesList(s))) { await saveShares({...row, shares: s.shares}, row.version); await load(); row = find(serverRows.current, s.id); if (!row) continue; }
          await saveRow({...row, layers: s.layers.filter(l => l.kind !== 'transfer' && l.kind !== 'fee'), groups: s.groups, person: s.person}, row.version);
          await load();
        }
        setToast({message: 'Undone'});
      } catch (e) { setToast({message: e.message, error: true}); await load().catch(() => {}); }
      return true;
    });
  }

  /* Ledger view */
  const twinFilter = useMemo(() => filter === 'transfers' ? new Set(state.filter(r => isLinked(r) || twins(r).length).map(r => r.id)) : null, [filter, state, pending, basisPoints, maxDays]);
  const visible = useMemo(() => state.filter(r => r.amount !== 0
    && (filter === 'all' || filter === 'unsorted' && unsorted(r) || filter === 'in' && r.amount > 0 && !isLinked(r) || filter === 'out' && r.amount < 0 && !isLinked(r) || filter === 'transfers' && twinFilter?.has(r.id))
    && (!accountFilter.length || accountFilter.includes(r.accountId))
    && `${r.name} ${r.raw.originalDescription || ''} ${r.account}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || a.account.localeCompare(b.account) || a.id.localeCompare(b.id)), [state, filter, twinFilter, accountFilter, query]);
  useEffect(() => { setLimit(PAGE); }, [filter, accountFilter, query]);
  useEffect(() => {
    if (!target?.id || !state.length) return;
    const index = visible.findIndex(r => r.id === target.id);
    if (index < 0) { setFilter('all'); setAccountFilter([]); setQuery(''); }
    const all = index < 0 ? state.findIndex(r => r.id === target.id) : index;
    if (all >= limit) setLimit(Math.ceil((all + 1) / PAGE) * PAGE);
    setOpen(target.id); setSelected([]);
    requestAnimationFrame(() => document.querySelector(`[data-row="${target.id}"]`)?.scrollIntoView({block: 'center'}));
  }, [target?.key, state.length > 0]);
  useEffect(() => { if (target && !target.id && target.mode === 'transfers') setFilter('transfers'); }, [target?.key]);
  const unsortedCount = useMemo(() => state.filter(r => r.amount !== 0 && unsorted(r)).length, [state]);
  const shownRows = visible.slice(0, limit), openRow = open ? find(state, open) : null, twinIds = openRow ? twins(openRow).map(t => t.id) : [];
  const days = []; for (const r of shownRows) { const g = days.at(-1); if (g && g.date === r.date) g.rows.push(r); else days.push({date: r.date, rows: [r]}); }

  function closeEditor(advance) {
    const current = open;
    if (advance && flow) {
      const after = visible.slice(visible.findIndex(x => x.id === current) + 1).find(r => r.id !== current && unsorted(r)) || visible.find(r => r.id !== current && unsorted(r));
      setOpen(after?.id || null);
      if (after) requestAnimationFrame(() => document.querySelector(`[data-row="${after.id}"]`)?.scrollIntoView({block: 'nearest'}));
    } else { setOpen(null); requestAnimationFrame(() => document.querySelector(`[data-row="${current}"] .od-row-main`)?.focus()); }
  }
  function select(id, range) {
    setSelected(sel => { if (range && anchor) { const ids = visible.map(r => r.id), a = ids.indexOf(anchor), b = ids.indexOf(id); return ids.slice(Math.min(a, b), Math.max(a, b) + 1); } return sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; });
    if (!range) setAnchor(id); setOpen(null);
  }
  function keys(e) {
    if (e.target.closest('input, textarea, select, .od-editor, dialog')) return;
    const mains = [...(listRef.current?.querySelectorAll('.od-row-main') || [])], i = mains.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); (mains[i + 1] || mains[0])?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); (mains[i - 1] || mains.at(-1))?.focus(); }
    else if (e.key === 'n') { e.preventDefault(); const next = visible.find(r => unsorted(r) && r.id !== open); if (next) { setOpen(next.id); requestAnimationFrame(() => document.querySelector(`[data-row="${next.id}"]`)?.scrollIntoView({block: 'nearest'})); } }
    else if (e.key === 'Escape') { setOpen(null); setSelected([]); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  }

  /* Row-level operations */
  function toggleTag(row, tag) {
    const present = row.layers.some(l => l.id === 'tag:' + tag.id), first = !row.layers.length, completes = first && rest(row) > 0;
    const ok = change(row.id, rows => {
      if (present) { remove(rows, row.id, 'tag:' + tag.id); return; }
      const r = find(rows, row.id); let cents = rest(r);
      if (!cents) { const largest = r.layers.filter(l => l.kind === 'tag').sort((a, b) => b.cents - a.cents)[0]; if (!largest || largest.cents < 2) throw Error('Lower another part to make room for a tag.'); cents = Math.floor(largest.cents / 2); largest.cents -= cents; }
      add(rows, row.id, 'tag', tag.id, cents, tag);
    }, `${present ? 'Removed' : 'Tagged'} ${tag.name}`);
    if (!present && completes && flow && find(stateRef.current, row.id) && rest(find(stateRef.current, row.id)) === 0) closeEditor(true);
    return ok;
  }
  const toggleEvent = (row, event) => change(row.id, rows => { const r = find(rows, row.id); r.groups = r.groups.includes(event.id) ? [] : [event.id]; }, row.groups.includes(event.id) ? `Removed from ${event.name}` : row.groups.length ? `Moved to ${event.name}` : `Added to ${event.name}`);
  function evenShares(rows, row, personIds) { const paid = Object.fromEntries(personIds.map(id => [id, repayment(rows, row.id, id)])); return Object.fromEntries(splitShares(total(row), personIds, paid).map(s => [s.id, s.cents])); }
  const personName = id => people.find(p => p.id === id)?.name || 'someone';
  const repayersOf = (rows, id) => [...new Set(rows.filter(x => x.layers.some(l => l.kind === 'expense' && l.target === id && l.cents > 0)).map(x => x.person).filter(Boolean))];
  function toggleShare(row, person) {
    const repayers = repayersOf(state, row.id), current = [...new Set([...sharedWith(row), ...repayers])], removing = current.includes(person.id);
    if (removing && repayers.includes(person.id)) { setToast({message: `${person.name} has settled ${money(repayment(state, row.id, person.id), row.currency)} of this. Move that settlement before removing them.`, error: true}); return Promise.resolve(false); }
    const next = removing ? current.filter(id => id !== person.id) : [...current, person.id];
    return change(row.id, rows => { find(rows, row.id).shares = next.length ? evenShares(rows, row, next) : null; }, removing ? `No longer shared with ${person.name}` : `Shared with ${next.map(personName).join(', ')}`, saveShares);
  }
  function splitEvenly(row) { return change(row.id, rows => { find(rows, row.id).shares = evenShares(rows, row, sharedWith(row)); }, 'Split evenly', saveShares); }
  function setShare(row, personId, cents) {
    return change(row.id, rows => { const r = find(rows, row.id), others = sharedWith(r).filter(id => id !== personId).reduce((n, id) => n + r.shares[id], 0); if (cents + others > total(r)) throw Error(`Shares cannot exceed ${money(total(r), r.currency)}.`); const paid = repayment(rows, r.id, personId); if (cents < paid) throw Error(`${personName(personId)} has already settled ${money(paid, r.currency)}.`); r.shares = {...r.shares, [personId]: cents, me: total(r) - others - cents}; }, 'Share changed', saveShares);
  }
  /* Settling: a person's money in draws down what they owe, oldest open share first. */
  function settle(receipt, personId, cents) {
    const open = owedBy(stateRef.current, personId, receipt.id).filter(o => o.left > 0), owed = open.reduce((n, o) => n + o.left, 0), name = personName(personId);
    if (!owed) { setToast({message: `${name} owes nothing right now. Share an expense with ${name} first.`, error: true}); return Promise.resolve(false); }
    let left = Math.min(cents ?? rest(receipt), rest(receipt), owed); if (left <= 0) { setToast({message: 'Nothing left on this receipt to settle.', error: true}); return Promise.resolve(false); }
    const amount = left, lines = [];
    for (const o of open) { const take = Math.min(o.left, left); if (take > 0) lines.push({id: o.row.id, cents: take, name: o.row.name}); left -= take; if (!left) break; }
    return change(receipt.id, rows => { const r = find(rows, receipt.id); r.person = personId; for (const l of lines) { const existing = r.layers.find(x => x.kind === 'expense' && x.target === l.id); if (existing) existing.cents += l.cents; else add(rows, receipt.id, 'expense', l.id, l.cents, {color: people.find(p => p.id === personId)?.color}); } }, `${money(amount, receipt.currency)} settled with ${name} · ${lines.length === 1 ? lines[0].name : `${lines.length} expenses`} · ${money(owed - amount, receipt.currency)} still owed`);
  }
  function describeOptions(row) {
    const flowKind = row.amount > 0 ? 'income' : 'expense', locked = isLinked(row);
    const history = [...new Map(state.filter(t => t.id !== row.id && t.name === row.name).flatMap(t => t.layers.filter(l => l.kind === 'tag')).map(l => [l.target, l])).keys()].map(id => tagChoices.find(t => t.id === id)).filter(Boolean).slice(0, 2);
    const guess = people.find(p => (row.raw.originalDescription || row.name).toUpperCase().includes(p.name.toUpperCase().split(' ')[0]));
    return q => {
      const query = q.trim().toLowerCase(), hit = s => !query || (s || '').toLowerCase().includes(query), out = [];
      if (!locked) for (const t of twins(row)) if (!query || hit(t.account) || hit('move') || hit('transfer')) out.push({kind: 'twin', id: t.id, label: `${row.amount < 0 ? 'To' : 'From'} ${t.account}`, hint: `${t.name} · ${t.date} · ${signed(t.amount, t.currency)}`, color: t.color});
      if (!locked && row.amount > 0 && !row.manual) for (const p of people) { const owed = balanceOf(state, p.id, row.id); if ((!query && (owed > 0 || p.id === guess?.id)) || (query && (hit(p.name) || hit('settle') || hit('repay') || hit('paid')))) out.push({kind: 'person', id: p.id, label: `${p.name} settles up`, hint: owed > 0 ? `owes you ${money(owed, row.currency)}${rest(row) < owed ? ` · ${money(rest(row), row.currency)} of it here` : ''}` : 'owes nothing · share an expense first', color: p.color, disabled: !owed}); }
      if (!locked && row.amount < 0) for (const p of people) if (query && (hit(p.name) || hit('paid') || hit('back'))) out.push({kind: 'payee', id: p.id, label: `Paid ${p.name} back`, hint: 'Your cost, routed through a person', color: p.color, on: row.raw.review.assignedPersonId === p.id});
      if (!locked && row.amount < 0) for (const p of people) if (query && (hit(p.name) || hit('shared') || hit('split') || hit('owes'))) { const on = sharedWith(row).includes(p.id), paid = repayment(state, row.id, p.id); out.push({kind: 'share', id: p.id, label: `Shared with ${p.name}`, hint: on ? `${p.name} owes ${money(row.shares[p.id], row.currency)}${paid ? ` · ${money(paid, row.currency)} settled` : ''}` : paid ? `Has settled ${money(paid, row.currency)} · joins the split` : 'Even split by default', color: p.color, on}); }
      if (!locked) { if (!query) for (const t of history) out.push({kind: 'tag', id: t.id, label: t.name, hint: 'Used before for this name', color: t.color, on: row.layers.some(l => l.id === 'tag:' + t.id)});
        for (const t of tagChoices) if (tagType(t) === flowKind && (hit(t.name) || hit(bucketName(t.parentId))) && !(!query && history.includes(t))) out.push({kind: 'tag', id: t.id, label: t.name, hint: t.parentId ? bucketName(t.parentId) : flowKind === 'income' ? 'Income' : 'Ungrouped', color: t.color, on: row.layers.some(l => l.id === 'tag:' + t.id)}); }
      for (const e of events) if (hit(e.name) || hit('event')) out.push({kind: 'event', id: e.id, label: e.name, hint: e.startDate && e.endDate ? `${e.startDate} to ${e.endDate}${e.participants?.length ? ` · split with ${e.participants.map(personName).join(', ')}` : ''}` : 'Dates required', color: e.color, on: row.groups.includes(e.id)});
      if (!locked && query) for (const a of accounts) if (a.id !== row.accountId && (hit(a.name) || hit('transfer') || hit('move')) && !out.some(o => o.kind === 'twin' && find(state, o.id)?.accountId === a.id)) out.push({kind: 'account', id: a.id, label: `${row.amount < 0 ? 'To' : 'From'} ${a.name}`, hint: 'No matching entry within your transfer settings', color: a.color, disabled: true});
      return out.slice(0, 14);
    };
  }
  function pickFor(row) {
    return o => {
      if (o.kind === 'tag') toggleTag(row, entities.find(e => e.id === o.id));
      else if (o.kind === 'event') toggleEvent(row, entities.find(e => e.id === o.id));
      else if (o.kind === 'share') toggleShare(row, people.find(p => p.id === o.id));
      else if (o.kind === 'payee') setPayee(row, o.id);
      else if (o.kind === 'twin') linkPair(row.id, o.id);
      else if (o.kind === 'person') settle(row, o.id);
    };
  }
  function captureTemplate(r) {
    try { const portions = templateWeights(total(r), r.layers.filter(l => l.kind === 'tag').map(l => ({id: l.target, cents: l.cents}))); return {name: r.name.slice(0, 70) + ' template', matchType: r.raw.aliasId ? 'aliases' : 'regex', aliasIds: r.raw.aliasId ? [r.raw.aliasId] : [], pattern: '^' + (r.raw.originalDescription || r.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), direction: r.amount > 0 ? 'in' : 'out', categoryId: '', personId: r.raw.review.assignedPersonId || r.person || '', enabled: true, template: {tags: portions, groups: [], autoReview: false}}; }
    catch { return null; }
  }
  const batchFlow = selected.length > 1 ? (find(state, selected[0])?.amount > 0 ? 'income' : 'expense') : null;
  const batchTags = batchFlow ? tagChoices.filter(t => tagType(t) === batchFlow && t.name.toLowerCase().includes(batchQuery.toLowerCase())) : [];
  function batchTag(tag) {
    const ids = selected.filter(id => { const r = find(stateRef.current, id); return r && !isLinked(r) && (r.amount > 0) === (batchFlow === 'income') && !r.layers.some(l => l.id === 'tag:' + tag.id); });
    const next = clone(stateRef.current), done = [];
    for (const id of ids) { const r = find(next, id); let cents = rest(r); if (!cents) { const largest = r.layers.filter(l => l.kind === 'tag').sort((a, b) => b.cents - a.cents)[0]; if (!largest || largest.cents < 2) continue; cents = Math.floor(largest.cents / 2); largest.cents -= cents; } try { add(next, id, 'tag', tag.id, cents, tag); done.push(id); } catch {} }
    if (!done.length) return;
    const entry = {rows: done.map(id => snapshot(find(stateRef.current, id)))}, desired = new Map(done.map(id => [id, desiredOf(find(next, id))]));
    for (const [id, d] of desired) pendingDesired.current.set(id, d);
    stateRef.current = next; setState(next); setSelected([]); setBatchQuery(''); setToast({message: `Tagged ${done.length} ${done.length === 1 ? 'row' : 'rows'} ${tag.name}`}); setHistory(h => [...h.slice(-29), entry]);
    enqueue(async () => { for (const [id, d] of desired) { const server = find(serverRows.current, id); if (!server) continue; try { await saveRow(applyDesired(server, d), server.version); } catch (e) { setToast({message: e.message, error: true}); } if (pendingDesired.current.get(id) === d) pendingDesired.current.delete(id); } await load().catch(() => {}); return true; });
  }

  if (loadError && !state.length) return <section className="organize-desk workspace-page"><div className="workspace-heading"><div><h1>Organize</h1></div></div><p role="alert" className="dr-error-text">{loadError}</p></section>;
  return (
    <section className="organize-desk workspace-page" data-busy={busy || undefined} onKeyDown={keys}>
      <div className="workspace-heading"><div><h1>Organize</h1><p className="od-lede">Every account in one list, newest first. Open a row and say what it is: a tag, who settled up or who you paid, an event, or the account it moved to. Each change saves at once.</p></div>
        <div className="workspace-actions"><label className="od-flow"><input type="checkbox" checked={flow} onChange={e => setFlow(e.target.checked)} />Move to the next unsorted row after tagging</label></div></div>
      <div className="od-filters">
        <div className="od-chips" role="group" aria-label="Show">
          {[['all', 'All'], ['unsorted', 'Unsorted'], ['in', 'Money in'], ['out', 'Money out'], ['transfers', 'Between accounts']].map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}{id === 'unsorted' && <span className="od-count">{unsortedCount}</span>}</button>)}
        </div>
        {accounts.length > 1 && <div className="od-chips" role="group" aria-label="Accounts">
          {accounts.map(a => <button key={a.id} type="button" aria-pressed={accountFilter.includes(a.id)} onClick={() => setAccountFilter(f => f.includes(a.id) ? f.filter(x => x !== a.id) : [...f, a.id])}><i className="od-dot" style={{background: a.color}} />{a.name}</button>)}
        </div>}
        <label className="od-search"><Icon name="search" size={16} /><input type="search" placeholder="Find a transaction…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find a transaction" /></label>
      </div>
      {loadError && <p role="alert" className="dr-error-text">{loadError}</p>}
      <div className="od-head" aria-hidden="true"><span /><span>Transaction</span><span>Shape</span><span>Amount</span></div>
      <ol className="od-ledger" aria-label="Ledger" ref={listRef}>
        {days.map(g => (
          <li key={g.date} className="od-day"><h2>{weekday(g.date)}</h2>
            <ol>{g.rows.map(r => {
              const shown = parts(state, r, entities), linked = isLinked(r), isOpen = open === r.id, twinOf = twinIds.includes(r.id) ? open : null, person = people.find(p => p.id === r.person), payee = people.find(p => p.id === r.raw.review.assignedPersonId), shared = sharedWith(r).map(id => people.find(p => p.id === id)?.name).filter(Boolean);
              return (
                <li key={r.id} data-row={r.id} className={'od-row' + (isOpen ? ' is-open' : '') + (selected.includes(r.id) ? ' is-selected' : '') + (unsorted(r) && !isOpen ? ' is-unsorted' : '') + (twinOf ? ' is-twin' : '')}>
                  <div className="od-row-main" role="button" tabIndex={0} aria-expanded={isOpen} aria-label={`${r.name}, ${signed(r.amount, r.currency)}`}
                    onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) select(r.id, e.shiftKey); else { setOpen(isOpen ? null : r.id); setSelected([]); } }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : r.id); setSelected([]); } }}>
                    <span className="od-check" aria-hidden="true">{selected.includes(r.id) ? <Icon name="check" size={14} /> : null}</span>
                    <span className="od-who"><i className="od-dot" style={{background: r.color}} /><b>{r.name}</b><small>{isOpen ? `${r.account} · ${r.date}${r.raw.originalDescription && r.raw.originalDescription !== r.name ? ` · ${r.raw.originalDescription}` : ''}` : <>{r.account}{person ? ` · ${person.name}` : ''}{payee && !person ? ` · paid ${payee.name}` : ''}{shared.length ? ` · shared with ${shared.join(', ')}` : ''}{r.groups.length ? ` · ${r.groups.map(id => events.find(e => e.id === id)?.name).filter(Boolean).join(', ')}` : ''}{r.raw.review.templateReview === 'pending' ? ' · Suggested by a rule' : ''}</>}</small></span>
                    <span className="od-row-shape">{linked && <Icon name="arrow-left-right" size={14} />}<Shape row={r} shown={shown} currency={r.currency} /></span>
                    <span className={'od-row-amount' + (r.amount > 0 ? ' is-in' : '')}>{signed(r.amount, r.currency)}</span>
                    {twinOf && <button type="button" className="od-twin" disabled={busy} onClick={e => { e.stopPropagation(); linkPair(twinOf, r.id); }}><Icon name="link-2" size={14} /> Same money</button>}
                  </div>
                  {isOpen && <Editor row={r} shown={shown} state={state} entities={entities} people={people} events={events} busy={busy} config={config} onSettings={onSettings} onSource={onSource}
                    describe={describeOptions(r)} onPick={pickFor(r)} onEvent={ev => toggleEvent(r, ev)} onShare={p => toggleShare(r, p)} onShareAmount={(pid, cents) => setShare(r, pid, cents)} onSplitEvenly={() => splitEvenly(r)} onFollowEvent={() => followEvent(r)} onPayee={pid => setPayee(r, pid)} onUnlink={() => unlinkRow(r.id)} onClose={closeEditor}
                    onAmount={(layerId, cents) => change(r.id, rows => resize(rows, r.id, layerId, cents), 'Amount changed')}
                    onSettleAmount={(personId, cents) => { const current = r.layers.filter(l => l.kind === 'expense').reduce((n, l) => n + l.cents, 0); if (cents > current) settle(r, personId, cents - current); else change(r.id, rows => { const x = find(rows, r.id); let cut = current - cents; for (const l of [...x.layers].reverse()) { if (l.kind !== 'expense' || !cut) continue; const take = Math.min(cut, l.cents); l.cents -= take; cut -= take; } x.layers = x.layers.filter(l => l.kind !== 'expense' || l.cents > 0); }, 'Settlement changed'); }}
                    onRemove={layer => layer.kind === 'transfer' || layer.kind === 'fee' || layer.kind === 'principal' ? unlinkRow(r.id) : change(r.id, rows => remove(rows, r.id, layer.id), 'Part removed')}
                    onRemoveSettlement={() => change(r.id, rows => { const x = find(rows, r.id); x.layers = x.layers.filter(l => l.kind !== 'expense'); }, 'Settlement removed')}
                    onConfirm={() => change(r.id, () => {}, 'Confirmed')}
                    capture={() => captureTemplate(r)} onTemplate={setTemplate} ruleRevision={ruleRevision} />}
                </li>);
            })}</ol>
          </li>
        ))}
        {!visible.length && state.length > 0 && <li className="od-empty">Nothing here. Change the filter or the search.</li>}
        {!state.length && !loadError && <li className="od-empty">No transactions yet. Import an account to get started.</li>}
      </ol>
      {visible.length > limit && <div className="od-more"><button type="button" onClick={() => setLimit(n => n + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more</button><small>{limit} of {visible.length}</small></div>}
      <p className="od-keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · type to describe · <kbd>n</kbd> next unsorted · <kbd>Ctrl</kbd>+click to select several · <kbd>Ctrl</kbd><kbd>Z</kbd> undo</p>
      {selected.length > 1 && (
        <div className="od-batch" role="region" aria-label="Selected rows">
          <b>{selected.length} rows selected</b>
          <label className="od-describe-field"><Icon name="search" size={16} /><input placeholder="Tag all of them…" value={batchQuery} onChange={e => setBatchQuery(e.target.value)} aria-label="Tag selected rows" /></label>
          <div className="od-batch-tags">{batchTags.slice(0, 6).map(t => <button key={t.id} type="button" onClick={() => batchTag(t)}><i className="od-dot" style={{background: t.color}} />{t.name}</button>)}</div>
          <button type="button" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}
      {template && <TransactionTemplateEditor rule={template} entities={entities} onClose={() => setTemplate(null)} onSaved={async () => { setToast({message: 'Rule saved. Manage it in Settings → Rules.'}); setRuleRevision(n => n + 1); await run(async () => true); }} />}
      <div className={'od-toast' + (toast ? ' is-on' : '') + (toast?.error ? ' is-error' : '')} role="status" aria-live="polite">
        {toast && <>{!toast.error && <Icon name="check" size={16} />}<span>{toast.message}</span>{!toast.error && history.length > 0 && <button type="button" onClick={undo}><Icon name="undo-2" size={14} /> Undo</button>}</>}
      </div>
    </section>
  );
}

/* The parts-first card: the box, the typed part rows with amount boxes, and fixed slots at the right. */
function Editor({row, shown, state, entities, people, events, busy, config, onSettings, onSource, describe, onPick, onEvent, onShare, onShareAmount, onSplitEvenly, onFollowEvent, onPayee, onUnlink, onClose, onAmount, onSettleAmount, onRemove, onRemoveSettlement, onConfirm, capture, onTemplate, ruleRevision}) {
  const inputRef = useRef(null), [showDetails, setShowDetails] = useState(false);
  useEffect(() => { if (unsorted(row)) inputRef.current?.focus(); }, [row.id]);
  const gap = rest(row), linked = isLinked(row), received = row.amount < 0 ? repayment(state, row.id) : 0;
  const other = linked ? (find(state, row.raw.review.transferId) || paired(state, row.id) || find(state, row.layers.find(l => l.kind === 'transfer')?.target)) : null;
  const settler = people.find(p => p.id === row.person), settled = row.layers.filter(l => l.kind === 'expense'), settledTotal = settled.reduce((n, l) => n + l.cents, 0);
  const owed = settler ? balanceOf(state, settler.id, row.id) : 0;
  const event = events.find(e => e.id === row.groups[0]), source = row.raw.review.sharesSource, followsEvent = event && source === 'event:' + event.id, canFollow = event && event.participants?.length > 0 && !followsEvent;
  const shares = sharedWith(row).map(id => ({person: people.find(p => p.id === id), cents: row.shares[id], repaid: repayment(state, row.id, id)})).filter(s => s.person);
  const payee = people.find(p => p.id === row.raw.review.assignedPersonId);
  const nearEvents = [...events].sort((a, b) => dayGap(a.startDate || row.date, row.date) - dayGap(b.startDate || row.date, row.date)).filter((e, i) => i < 4 || row.groups.includes(e.id));
  const partRows = shown.filter(p => p.kind !== 'default' && p.kind !== 'expense');
  return (
    <div className="od-editor od-card" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(false); } }}>
      <div className="od-card-main">
        {!linked && <Describe options={describe} onPick={onPick} inputRef={inputRef} placeholder={row.amount > 0 ? 'Tag, who settled up, event or account…' : 'Tag, who you paid, shared with, event or account…'} />}
        {row.raw.review.templateReview === 'pending' && <p className="od-note od-note-rule">A rule suggested these settings. <button type="button" onClick={onConfirm}>Confirm</button></p>}
        {row.legacyScaling && <p className="od-note">This receipt has older tags covering its full amount. Changing it here applies those tags proportionally to the remainder after its deductions.</p>}
        <div className="od-partlist">
          {partRows.map(p => <div key={p.id} className="od-part-row" style={{'--part': p.color}}>
            <span className="od-nature">{natureOf(row, p)}</span><i /><b>{p.name}</b>
            {linked ? <span className="od-amount is-static">{plain(p.cents)}</span> : <Amount value={p.cents} label={`Amount for ${p.name}`} onCommit={c => onAmount(p.id, c)} />}
            {p.kind !== 'fee' && p.kind !== 'excess' && <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p)}><Icon name="x" size={14} /></button>}
          </div>)}
          {settler && settled.length > 0 && <div className="od-part-row is-settle" style={{'--part': settler.color}}>
            <span className="od-nature">Offset</span><i /><b>{settler.name} settled</b><small>owed {money(owed + settledTotal, row.currency)} → {money(owed, row.currency)}</small>
            <Amount value={settledTotal} label={`Settled by ${settler.name}`} onCommit={c => onSettleAmount(settler.id, c)} />
            <button type="button" aria-label="Remove settlement" onClick={onRemoveSettlement}><Icon name="x" size={14} /></button>
            <div className="od-alloc">{settled.map(l => <span key={l.id}><span>{find(state, l.target)?.name || 'Expense'}<small> · {find(state, l.target)?.date}</small></span><span className="num">{plain(l.cents)}</span></span>)}</div>
          </div>}
          {!linked && gap > 0 && <div className="od-part-row is-gap"><span className="od-nature" /><i /><b>Unsorted</b><span className="od-amount is-static">{plain(gap)}</span></div>}
          {linked && other && <p className="od-linked"><Icon name="link-2" size={16} /><span>Moved {row.amount < 0 ? 'to' : 'from'} <b>{other.account}</b> · {other.name} on {other.date}.</span><button type="button" disabled={busy} onClick={onUnlink}>Unlink</button></p>}
          {!linked && !partRows.length && !settled.length && <p className="od-quiet">{row.amount > 0 ? 'Nothing yet. A tag makes it income; a person settles what they owe; an account makes it a move.' : 'Nothing yet. A tag makes it spending; an account makes it a move.'}</p>}
        </div>
        {received > 0 && <p className="od-note">{money(received, row.currency)} settled so far · {money(total(row) - received, row.currency)} still fronted.</p>}
      </div>
      <div className="od-card-side">
        {row.amount < 0 && !linked && <div className="od-slot"><div className="od-slot-head"><b>Split</b><small>{shares.length ? `me ${money(row.shares.me || 0, row.currency)}${followsEvent ? ` · follows ${event.name}` : source === 'recorded' ? ' · recorded' : canFollow ? ' · custom' : ''}` : payee ? `paid ${payee.name} · your cost` : 'just you'}</small></div>
          <div className="od-people">{people.map(p => { const s = shares.find(x => x.person.id === p.id); return <span key={p.id} className={'od-person' + (s ? ' is-on' : '')} style={{'--part': p.color}}><button type="button" aria-pressed={!!s} onClick={() => onShare(p)}><i />{p.name}</button>{s && <Amount value={s.cents} label={`Share for ${p.name}`} onCommit={c => onShareAmount(p.id, c)} />}{s && s.repaid > 0 && <small>{s.repaid >= s.cents ? 'settled' : `${money(s.cents - s.repaid, row.currency)} owed`}</small>}</span>; })}</div>
          {(canFollow || shares.length > 1) && <div className="od-slot-actions">{canFollow && <button type="button" className="od-link" onClick={onFollowEvent}>Follow {event.name} again</button>}{shares.length > 1 && !followsEvent && <button type="button" className="od-link" onClick={onSplitEvenly}>Split evenly</button>}</div>}
        </div>}
        <div className="od-slot"><div className="od-slot-head"><b>Event</b>{event?.startDate && <small>{event.startDate} to {event.endDate}</small>}</div>
          <div className="od-chips-wrap">{nearEvents.map(e => <button key={e.id} type="button" className={'od-event' + (row.groups.includes(e.id) ? ' is-on' : '')} style={{'--part': e.color}} aria-pressed={row.groups.includes(e.id)} onClick={() => onEvent(e)}><Icon name="calendar-days" size={14} />{e.name}</button>)}{!events.length && <small className="od-quiet">No events yet. Create one under Events.</small>}</div>
        </div>
        {!linked && <div className="od-slot"><div className="od-slot-head"><b>Rule</b></div>{row.layers.some(l => l.kind === 'tag') ? <TransactionRuleReuse transaction={row} entities={entities} capture={capture} onEdit={onTemplate} revision={ruleRevision} /> : <small className="od-quiet">Tag it, then remember the settings for next time.</small>}</div>}
        <div className="od-slot is-quiet"><button type="button" className="od-link" onClick={() => setShowDetails(v => !v)}>{showDetails ? 'Hide details' : 'Details'}</button>{showDetails && <div className="od-details"><span>{row.raw.originalDescription || row.name}</span><span>{row.account}</span><span>{row.date}</span><button type="button" className="od-link" onClick={() => onSource(row.id)}>Original file ↗</button>{config && <span>Moves match within ±{config.basisPoints / 100}% and {config.maxDays} {config.maxDays === 1 ? 'day' : 'days'}. {onSettings && <button type="button" className="od-link" onClick={onSettings}>Change</button>}</span>}</div>}</div>
      </div>
    </div>
  );
}
