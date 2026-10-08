// Organize desk: the ledger is the workspace. One cross-account list; a row opens in place as a
// parts-first card. One box answers "what is this?" in the terms that fit the line: a tag makes a
// Spend or Receive part, a person on money in settles what they owe (an Offset part, attributed to
// their oldest open shares first), an account pairs a Move. Split, event and rule keep fixed slots.
// Changes apply at once and persist through a serial queue against the row's latest version.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Icon, Switch} from '@derekurban/design-system';
import {categoryColors} from './category-colors.js';
import {find, money, total, rest, segments, cap, add, resize, remove, repayment, paired, mapRecords, templateWeights} from './allocation-model.js';
import {tagType, orderedTags} from '../electron/review/tag-model.mjs';
import {isOther} from '../electron/review/system-tags.mjs';
import {pendingTransfers, withinBand, transferPairBand} from '../electron/review/transfer-model.mjs';
import {splitShares} from '../electron/review/share-model.mjs';
import {TransactionRuleReuse} from './TransactionRuleReuse.jsx';
import {TransactionTemplateEditor} from './TransactionTemplateEditor.jsx';
import {notify} from './toast.jsx';
import {Alert} from './ui.jsx';
import {dayLabel, rangeLabel, plural as count} from './format.js';
import {useCodex, readiness, saveCodexSettings, seconds} from './codex.js';
import './codex.css';
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
/* Whether a Codex suggestion is already on the row (so it is shown as applied, and doesn't keep a row's star green). */
const suggestionApplied = (row, s) => s.kind === 'new-tag' ? row.layers.some(l => l.kind === 'tag' && l.name.toLowerCase() === s.name.toLowerCase()) : s.kind === 'tag' ? row.layers.some(l => l.id === 'tag:' + s.id) : s.kind === 'twin' ? isLinked(row) : s.kind === 'event' ? row.groups.includes(s.id) : s.kind === 'share' ? sharedWith(row).includes(s.id) : s.kind === 'payee' ? row.raw.review.assignedPersonId === s.id : s.kind === 'settle' ? row.person === s.id && row.layers.some(l => l.kind === 'expense') : false;
const natureOf = (row, l) => l.kind === 'tag' ? (row.amount > 0 ? 'Receive' : 'Spend') : l.kind === 'expense' ? 'Offset' : l.kind === 'transfer' || l.kind === 'principal' ? 'Move' : l.kind === 'fee' ? 'Fee' : l.kind === 'excess' ? 'Extra' : '';

/* Label contrast on user colors is chosen from the color itself (identity colors are data, design-system#7). */
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
    {shown.map(s => <div key={s.id} className={'od-seg' + (s.kind === 'default' ? ' is-gap' : '')} style={s.kind === 'default' ? {flexGrow: s.cents} : {flexGrow: s.cents, background: s.color, color: String(s.color).startsWith('var(') ? 'var(--ink)' : luminance(s.color) > 0.62 ? '#1b1b1b' : '#fafafa'}} title={`${s.name} · ${money(s.cents, currency)}`}><span className="od-seg-label">{s.name}</span></div>)}
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
  const listId = React.useId();
  const groups = [['twin', 'Same money'], ['person', 'Settles up'], ['share', 'Shared with'], ['payee', 'Paid a person'], ['tag', 'Tags'], ['event', 'Events'], ['account', 'Own accounts']];
  const shown = useMemo(() => { const all = options(query); return groups.flatMap(([g]) => all.filter(o => o.kind === g)); }, [options, query]);
  useEffect(() => setCursor(0), [query]);
  function pick(o) { if (o.disabled) return; onPick(o); setQuery(''); setOpen(false); }
  let flat = -1;
  return (
    <div className="od-describe">
      <div className="od-describe-field">
        <Icon name="search" size={16} />
        <input ref={inputRef} value={query} placeholder={placeholder} aria-label="Describe this transaction" role="combobox" aria-expanded={open && shown.length > 0} aria-autocomplete="list" aria-controls={listId} aria-activedescendant={open && shown[cursor] ? `${listId}-${cursor}` : undefined}
          onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(shown.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
            else if (e.key === 'Enter' && open && shown[cursor]) { e.preventDefault(); pick(shown[cursor]); }
            else if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); }
          }} />
        <kbd>Enter</kbd>
      </div>
      {open && query.trim() && !shown.length && <div className="od-menu is-empty" role="status">Nothing matches “{query.trim()}”. Try a tag, a person, an event or an account.</div>}
      {open && shown.length > 0 && (
        <div className="od-menu" role="listbox" id={listId} aria-label="Suggestions">
          {groups.map(([g, title]) => {
            const items = shown.filter(o => o.kind === g); if (!items.length) return null;
            return <div key={g} className="od-menu-group"><small>{title}</small>
              {items.map(o => { const i = ++flat; return (
                <button key={o.kind + o.id} id={`${listId}-${i}`} tabIndex={-1} type="button" role="option" aria-selected={i === cursor} aria-disabled={o.disabled || undefined} className={(i === cursor ? 'is-cursor' : '') + (o.disabled ? ' is-disabled' : '')} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setCursor(i)} onClick={() => pick(o)}>
                  <i style={{background: o.color}} /><span><b>{o.label}</b><small>{o.hint}</small></span>{o.on && <Icon name="check" size={16} />}
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
  const [saving, setSaving] = useState(0), [history, setHistory] = useState([]), [template, setTemplate] = useState(null), [ruleRevision, setRuleRevision] = useState(0), [batchQuery, setBatchQuery] = useState('');
  const generation = useRef(0), stateRef = useRef(state), listRef = useRef(null);
  const serverRows = useRef([]), pendingDesired = useRef(new Map()), queue = useRef(Promise.resolve());
  stateRef.current = state;
  const busy = saving > 0;
  // Smart organizing: Codex suggestions per row, kept for the session and fetched when a row opens.
  const codex = useCodex(), smart = !!codex.state?.settings.smartOrganize && readiness(codex.state).ok;
  const suggestions = useRef(new Map()), [suggestTick, setSuggestTick] = useState(0);
  const [batch, setBatch] = useState(null), batchRun = useRef(null);
  const autoApply = !!codex.state?.settings.autoApply, autoApplied = useRef(new Set()), createdTags = useRef(new Map()), quiet = useRef(0);
  // What Codex applies without review: everything it isn't unsure about.
  const trusted = result => (result?.suggestions || []).filter(s => s.confidence !== 'low');
  const batchLabel = b => b.waitUntil > Date.now() ? `Codex is busy, retrying in ${Math.ceil((b.waitUntil - Date.now()) / 1000)} s · ${b.done} of ${b.total} done` : b.auto ? `Organizing ${b.done} of ${b.total} · ${b.counts.applied} applied` : `Suggesting ${b.done} of ${b.total} · ${b.counts.review} ready`;
  const codexReady = readiness(codex.state).ok;
  /* A row's star: hidden once it's sorted; otherwise loading, ready (a suggestion is waiting) or idle. */
  const starOf = row => {
    if (!unsorted(row)) return null;
    const s = suggestions.current.get(row.id);
    if (s?.status === 'loading') return {state: 'loading', label: 'Codex is looking at this transaction'};
    if (s?.status === 'done' && s.result.suggestions.some(x => !suggestionApplied(row, x))) return {state: 'ready', label: 'Codex has a suggestion. Open the row to review it'};
    if (s?.status === 'done' && s.result.suggestions.length) return {state: 'idle', label: "Codex's suggestion is applied; part of the amount is still unsorted"};
    if (s?.status === 'done') return {state: 'idle', label: 'Codex found nothing to suggest'};
    if (s?.status === 'error') return {state: 'idle', label: `No suggestion: ${s.error}`};
    if (s?.status === 'dismissed') return {state: 'idle', label: 'Suggestion dismissed'};
    return {state: 'idle', label: 'No suggestion yet'};
  };

  const desiredOf = row => ({layers: row.layers.map(l => ({...l})), groups: [...row.groups], person: row.person, shares: row.shares ? {...row.shares} : row.shares});
  const applyDesired = (row, d) => ({...row, layers: d.layers.map(l => ({...l})), groups: [...d.groups], person: d.person, shares: d.shares ? {...d.shares} : d.shares});
  function publish(rows) { const merged = rows.map(r => pendingDesired.current.has(r.id) ? applyDesired(r, pendingDesired.current.get(r.id)) : r); stateRef.current = merged; setState(merged); }
  // A load overtaken by a newer one waits for it, so a queued save never reads versions older than the
  // ledger the newer load brings back (saves also trigger an app refresh, which reloads here too).
  const latestLoad = useRef(null);
  function load(withConfig = false) { const run = loadOnce(withConfig); latestLoad.current = run; return run; }
  async function loadOnce(withConfig) {
    const seq = ++generation.current;
    const [result, lab] = await Promise.all([api().reviewState(), withConfig || !config ? api().transferLabState().catch(() => null) : null]);
    if (seq !== generation.current) return latestLoad.current;
    const colors = categoryColors(result.entities);
    setEntities(colors); if (lab) setConfig(lab.config); setRuleRevision(n => n + 1);
    const rows = mapRecords(result.records, colors).filter(r => !r.deleted);
    serverRows.current = rows; publish(rows); return rows;
  }
  useEffect(() => { load(true).catch(e => setLoadError(e.message)); }, [data]);
  useEffect(() => () => { generation.current++; }, []);
  const undoRef = useRef(null);
  const setToast = ({message, error}) => (quiet.current && !error) ? null : notify({id: 'organize', title: message, tone: error ? 'danger' : 'success', duration: error ? 9000 : 6000, action: error ? undefined : {label: 'Undo', onClick: () => undoRef.current?.()}});

  const accounts = useMemo(() => [...new Map(state.map(r => [r.accountId, {id: r.accountId, name: r.account, color: r.color}])).values()], [state]);
  const people = entities.filter(e => e.kind === 'person'), events = entities.filter(e => e.kind === 'group');
  const tagChoices = useMemo(() => orderedTags(entities.filter(t => t.kind === 'category' && !isOther(t.id, entities))), [entities]);
  const bucketName = id => entities.find(e => e.id === id)?.name;
  const basisPoints = config?.basisPoints ?? 0, maxDays = config?.maxDays ?? 1, routes = config?.routes || [];
  const onRoute = (out, inc) => routes.some(r => r.from === out.accountId && r.to === inc.accountId);
  const pending = useMemo(() => pendingTransfers(state.map(r => r.raw)), [state]);
  function twins(row, view) {
    if (!row || !row.canTransfer || row.manual) return [];
    const out = row.amount < 0, rows = view?.rows || state, open = view?.pending || pending;
    return open.filter(t => !view?.claimed?.has(t.id) && t.id !== row.id && t.accountId !== row.accountId && t.currency === row.currency && (out ? t.amountCents > 0 && withinBand(row.amount, t.amountCents, basisPoints) : t.amountCents < 0 && withinBand(t.amountCents, row.amount, basisPoints)) && dayGap(t.date, row.date) <= maxDays)
      .map(t => find(rows, t.id)).filter(r => r && !isLinked(r))
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
  undoRef.current = () => undo();
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
    && (filter === 'all' || filter === 'unsorted' && unsorted(r) || filter === 'in' && r.amount > 0 && !isLinked(r) || filter === 'out' && r.amount < 0 && !isLinked(r) || filter === 'transfers' && twinFilter?.has(r.id) || filter === 'suggested' && starOf(r)?.state === 'ready' || filter === 'auto' && autoApplied.current.has(r.id))
    && (!accountFilter.length || accountFilter.includes(r.accountId))
    && `${r.name} ${r.raw.originalDescription || ''} ${r.account}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || a.account.localeCompare(b.account) || a.id.localeCompare(b.id)), [state, filter, twinFilter, accountFilter, query, (filter === 'suggested' || filter === 'auto') && suggestTick]);
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
  const readyCount = state.filter(r => r.amount !== 0 && starOf(r)?.state === 'ready').length;
  const starsOn = codexReady && (smart || !!batch || suggestions.current.size > 0);
  const shownRows = visible.slice(0, limit), openRow = open ? find(state, open) : null, twinIds = openRow ? twins(openRow).map(t => t.id) : [];
  const nextUnsorted = openRow ? (visible.slice(visible.findIndex(x => x.id === openRow.id) + 1).find(r => unsorted(r)) || null) : null;
  useEffect(() => {
    if (!smart || !openRow || !unsorted(openRow)) return;
    askCodex(openRow);
    // One row ahead, so moving on with flow finds its suggestion ready.
    const timer = setTimeout(() => { if (nextUnsorted) askCodex(nextUnsorted); }, 1500);
    return () => clearTimeout(timer);
  }, [open, smart, state.length > 0]);
  const openAnswer = openRow ? suggestions.current.get(openRow.id) : null;
  useEffect(() => {
    if (!autoApply || !openRow || !unsorted(openRow) || openAnswer?.status !== 'done' || autoApplied.current.has(openRow.id) || batchRun.current) return;
    const list = trusted(openAnswer.result); if (!list.length) return;
    autoApplied.current.add(openRow.id);
    applySuggestions(openRow, list, {advance: false});
  }, [openAnswer, autoApply]);
  const days = []; for (const r of shownRows) { const g = days.at(-1); if (g && g.date === r.date) g.rows.push(r); else days.push({date: r.date, rows: [r]}); }

  function closeEditor(advance, skip = []) {
    const current = open, next = r => r.id !== current && !skip.includes(r.id) && unsorted(r);
    if (advance && flow) {
      const after = visible.slice(visible.findIndex(x => x.id === current) + 1).find(next) || visible.find(next);
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
    else if (e.key === 'x' && i >= 0) { e.preventDefault(); const id = mains[i].closest('[data-row]')?.dataset.row; if (id) select(id, false); }
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
    const guess = people.find(p => { const first = p.name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return first.length > 1 && new RegExp(`\\b${first}\\b`, 'i').test(row.raw.originalDescription || row.name); });
    return q => {
      const query = q.trim().toLowerCase(), hit = s => !query || (s || '').toLowerCase().includes(query), out = [];
      if (!locked) for (const t of twins(row)) if (!query || hit(t.account) || hit('move') || hit('transfer')) out.push({kind: 'twin', id: t.id, label: `${row.amount < 0 ? 'To' : 'From'} ${t.account}`, hint: `${t.name} · ${dayLabel(t.date)} · ${signed(t.amount, t.currency)}`, color: t.color});
      if (!locked && row.amount > 0) for (const p of people) { const owed = balanceOf(state, p.id, row.id); if ((!query && (owed > 0 || p.id === guess?.id)) || (query && (hit(p.name) || hit('settle') || hit('repay') || hit('paid')))) out.push({kind: 'person', id: p.id, label: `${p.name} settles up`, hint: owed > 0 ? `owes you ${money(owed, row.currency)}${rest(row) < owed ? ` · ${money(rest(row), row.currency)} of it here` : ''}` : 'owes nothing · share an expense first', color: p.color, disabled: !owed}); }
      if (!locked && row.amount < 0) for (const p of people) if (query && (hit(p.name) || hit('paid') || hit('back'))) out.push({kind: 'payee', id: p.id, label: `Paid ${p.name} back`, hint: 'Your cost, routed through a person', color: p.color, on: row.raw.review.assignedPersonId === p.id});
      if (!locked && row.amount < 0) for (const p of people) if (query && (hit(p.name) || hit('shared') || hit('split') || hit('owes'))) { const on = sharedWith(row).includes(p.id), paid = repayment(state, row.id, p.id); out.push({kind: 'share', id: p.id, label: `Shared with ${p.name}`, hint: on ? `${p.name} owes ${money(row.shares[p.id], row.currency)}${paid ? ` · ${money(paid, row.currency)} settled` : ''}` : paid ? `Has settled ${money(paid, row.currency)} · joins the split` : 'Even split by default', color: p.color, on}); }
      if (!locked) { if (!query) for (const t of history) out.push({kind: 'tag', id: t.id, label: t.name, hint: 'Used before for this name', color: t.color, on: row.layers.some(l => l.id === 'tag:' + t.id)});
        for (const t of tagChoices) if (tagType(t) === flowKind && (hit(t.name) || hit(bucketName(t.parentId))) && !(!query && history.includes(t))) out.push({kind: 'tag', id: t.id, label: t.name, hint: t.parentId ? bucketName(t.parentId) : flowKind === 'income' ? 'Income' : 'Ungrouped', color: t.color, on: row.layers.some(l => l.id === 'tag:' + t.id)}); }
      for (const e of events) if (hit(e.name) || hit('event')) out.push({kind: 'event', id: e.id, label: e.name, hint: e.startDate && e.endDate ? `${rangeLabel(e.startDate, e.endDate)}${e.participants?.length ? ` · split with ${e.participants.map(personName).join(', ')}` : ''}` : 'Dates required', color: e.color, on: row.groups.includes(e.id)});
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
  /* What Codex sees for one row: the line, what it can be (the same candidates the describe box offers)
     and how similar lines were organized before. Built from the ledger as it is now, not as it was when a
     long batch started. */
  const entitiesRef = useRef(entities); entitiesRef.current = entities;
  function freshView(claimed) { const rows = stateRef.current; return {rows, pending: pendingTransfers(rows.map(r => r.raw)), ents: entitiesRef.current, claimed}; }
  function aiContext(row, view = freshView()) {
    const {rows, ents} = view, ppl = ents.filter(e => e.kind === 'person'), evs = ents.filter(e => e.kind === 'group');
    const choices = orderedTags(ents.filter(t => t.kind === 'category' && !isOther(t.id, ents))), nameOf = id => ents.find(e => e.id === id)?.name;
    const flowKind = row.amount > 0 ? 'income' : 'expense', personNameOf = id => ppl.find(p => p.id === id)?.name;
    const words = s => (s || '').toLowerCase().replace(/[^a-z ]+/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ');
    const key = words(row.raw.originalDescription || row.name);
    const same = rows.filter(t => t.id !== row.id && t.name === row.name), similar = key ? rows.filter(t => t.id !== row.id && t.name !== row.name && words(t.raw.originalDescription || t.name) === key) : [];
    const history = [...same, ...similar].filter(t => t.layers.length || isLinked(t) || sharedWith(t).length || t.groups.length || t.raw.review.assignedPersonId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25).map(t => {
      const other = isLinked(t) ? (find(rows, t.raw.review.transferId) || paired(rows, t.id)) : null;
      return {name: t.name, date: t.date, amountCents: t.amount, tags: t.layers.filter(l => l.kind === 'tag').map(l => l.name), sharedWith: sharedWith(t).map(personNameOf).filter(Boolean), event: t.groups.map(nameOf).filter(Boolean)[0] || '', payee: personNameOf(t.raw.review.assignedPersonId) || '', settledBy: t.layers.some(l => l.kind === 'expense') ? personNameOf(t.person) || '' : '', movedTo: other?.account || ''};
    });
    const near = evs.filter(e => e.startDate && e.endDate).sort((a, b) => dayGap(a.startDate, row.date) - dayGap(b.startDate, row.date)).slice(0, 30);
    return {
      transaction: {id: row.id, name: row.name, original: row.raw.originalDescription || '', amountCents: row.amount, currency: row.currency, date: row.date, account: row.account, unsortedCents: rest(row), parts: parts(rows, row, ents).filter(p => p.kind !== 'default').map(p => p.name)},
      candidates: {
        tags: choices.filter(t => tagType(t) === flowKind).map(t => ({id: t.id, name: t.name, group: t.parentId ? nameOf(t.parentId) : ''})),
        people: ppl.map(p => ({id: p.id, name: p.name, owesCents: row.amount > 0 ? balanceOf(rows, p.id, row.id) : 0})),
        categories: ents.filter(e => e.kind === 'bucket').map(b => ({id: b.id, name: b.name})),
        events: near.map(e => ({id: e.id, name: e.name, start: e.startDate, end: e.endDate, participants: (e.participants || []).map(personNameOf).filter(Boolean)})),
        twins: isLinked(row) ? [] : twins(row, view).slice(0, 10).map(t => ({id: t.id, account: t.account, date: t.date, amountCents: t.amount, name: t.name})),
      },
      history,
    };
  }
  function askCodex(row, force = false) {
    if (!row || !readiness(codex.state).ok) return Promise.resolve();
    const known = suggestions.current.get(row.id);
    if (known && !force && known.status !== 'error') return known.promise || Promise.resolve();
    const promise = api().suggestOrganize(aiContext(row))
      .then(result => { suggestions.current.set(row.id, {status: 'done', result}); })
      .catch(e => { suggestions.current.set(row.id, {status: 'error', error: e.message}); })
      .finally(() => setSuggestTick(n => n + 1));
    suggestions.current.set(row.id, {status: 'loading', promise}); setSuggestTick(n => n + 1);
    return promise;
  }
  /* Every unsorted row, newest first, three at a time (the server's limit). Rows sorted meanwhile are skipped;
     rows already answered keep their answer. Stop leaves the rest unasked. */
  /* Every unsorted row, newest first, through a pool of slots: each slot sends its next few rows to Codex
     and, the moment its answer is in, takes the next few from the queue, so one slow run never holds the rest.
     A row that has been sorted meanwhile, or that is the other half of a transfer this run just linked, is
     skipped. A failed or skipped answer goes to the back of the queue once more. Every row ends in exactly
     one outcome, so the counts add up to the total. */
  async function suggestAll() {
    if (!readiness(codex.state).ok) { notify({id: 'codex-setup', title: "Codex isn't ready", description: readiness(codex.state).reason, tone: 'warning'}); return; }
    const settings = codex.state.settings, slots = settings.organizeSlots || 4, size = settings.organizeBatch || 5;
    const queued = stateRef.current.filter(r => r.amount !== 0 && unsorted(r) && (!suggestions.current.get(r.id) || ['error', 'dismissed'].includes(suggestions.current.get(r.id).status) || (autoApply && suggestions.current.get(r.id).status === 'done')))
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).map(r => r.id);
    if (!queued.length) { setToast({message: 'Every unsorted row already has a suggestion.'}); return; }
    const run = {stop: false, auto: autoApply, total: queued.length, done: 0, active: 0, slots, counts: {applied: 0, review: 0, nothing: 0, skipped: 0, failed: 0}, claimed: new Set(), retried: new Set(), appliedIds: new Set(), attempts: new Map(), backoff: 0, waitUntil: 0, limit: '', lastError: '', capacity: slots, clean: 0, inFlight: 0};
    const show = () => { if (batchRun.current === run) setBatch({total: run.total, done: run.done, active: run.active, slots, auto: run.auto, counts: {...run.counts}, waitUntil: run.waitUntil, capacity: run.capacity, inFlight: run.inFlight, size}); };
    // Codex's service sometimes turns runs away under load (403, 429, 5xx, dropped streams); those rows go back
    // to the front of the queue and every slot pauses, longer each time, before trying again. A usage limit stops the run.
    const transient = msg => /\b(403|429|5\d\d)\b|reconnecting|rate limit|too many requests|overloaded|temporar|stream (disconnected|error|closed)|took too long|econnreset|network/i.test(msg);
    const exhausted = msg => /usage limit|limit reached|quota|purchase more credits/i.test(msg);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const settleRow = (id, outcome) => { run.counts[outcome]++; run.done++; };
    batchRun.current = run; show();
    // A row the run can't use any more: sorted since it was queued, or claimed by a link from its other half.
    const gone = id => { const live = find(stateRef.current, id); return !live || !unsorted(live) || run.claimed.has(id); };
    const take = () => {
      const rows = [];
      while (rows.length < size && queued.length) { const id = queued.shift(); if (gone(id)) settleRow(id, 'skipped'); else rows.push(find(stateRef.current, id)); }
      return rows;
    };
    const slot = async () => {
      while (!run.stop) {
        // Paused after a refusal, or eased down to fewer slots until Codex has answered cleanly a few times.
        while (!run.stop && (Date.now() < run.waitUntil || run.active >= run.capacity)) { show(); await sleep(500); }
        if (run.stop) return;
        const rows = take(); show();
        if (!rows.length) return;
        run.active++; run.inFlight += rows.length;
        for (const r of rows) suggestions.current.set(r.id, {status: 'loading'});
        setSuggestTick(n => n + 1); show();
        let answers;
        try { const view = freshView(run.claimed); answers = await api().suggestOrganizeBatch(rows.map(r => aiContext(r, view))); }
        catch (e) {
          // A refusal that has nothing to do with load (consent off, signed out, Codex missing) stops the run with its reason.
          if (!transient(e.message) && !exhausted(e.message)) { run.fatal = e.message; run.stop = true; run.active--; run.inFlight -= rows.length; for (const r of rows) suggestions.current.delete(r.id); setSuggestTick(n => n + 1); return; }
          answers = rows.map(() => ({failed: e.message}));
        }
        run.active--; run.inFlight -= rows.length;
        const error = answers.find(a => a?.failed)?.failed;
        if (error && exhausted(error)) {
          run.limit = error; run.stop = true;
          for (const r of rows) suggestions.current.delete(r.id);
          setSuggestTick(n => n + 1); show(); return;
        }
        if (error && transient(error)) {
          run.lastError = error; run.clean = 0; run.capacity = Math.max(1, run.capacity - 1);
          run.backoff = Math.min(30000, run.backoff ? run.backoff * 2 : 5000); run.waitUntil = Date.now() + run.backoff;
          for (const r of [...rows].reverse()) {
            const tries = (run.attempts.get(r.id) || 0) + 1; run.attempts.set(r.id, tries);
            if (tries < 3) { suggestions.current.delete(r.id); queued.unshift(r.id); }
            else { suggestions.current.set(r.id, {status: 'error', error}); settleRow(r.id, 'failed'); }
          }
          setSuggestTick(n => n + 1); show(); continue;
        }
        if (!error) { run.backoff = 0; if (++run.clean >= 3 && run.capacity < slots) { run.capacity++; run.clean = 0; } }
        for (const [i, row] of rows.entries()) {
          const answer = answers[i] || {missing: true};
          if (run.stop) { suggestions.current.delete(row.id); continue; }
          if (answer.missing || answer.failed) {
            const reason = answer.failed || 'Codex skipped this one.';
            if (!run.retried.has(row.id)) { run.retried.add(row.id); suggestions.current.delete(row.id); queued.push(row.id); continue; }
            suggestions.current.set(row.id, {status: 'error', error: reason}); settleRow(row.id, 'failed'); continue;
          }
          suggestions.current.set(row.id, {status: 'done', result: answer});
          if (!answer.suggestions.length) { settleRow(row.id, 'nothing'); continue; }
          if (!run.auto) { settleRow(row.id, 'review'); continue; }
          if (gone(row.id)) { settleRow(row.id, 'skipped'); continue; }
          // A move is only applied while both halves are still free; the other half is then claimed and skipped.
          const list = trusted(answer).filter(s => s.kind !== 'twin' || !gone(s.id));
          if (!list.length) { settleRow(row.id, 'review'); continue; }
          const twin = list.find(s => s.kind === 'twin');
          if (twin) { run.claimed.add(twin.id); run.claimed.add(row.id); }
          if (await applySuggestions(find(stateRef.current, row.id), list, {advance: false})) { autoApplied.current.add(row.id); run.appliedIds.add(row.id); settleRow(row.id, 'applied'); }
          else settleRow(row.id, 'review');
        }
        setSuggestTick(n => n + 1); show();
      }
    };
    if (run.auto) quiet.current++;
    try { await Promise.all(Array.from({length: slots}, slot)); }
    finally { if (run.auto) { await queue.current.catch(() => {}); quiet.current--; } }
    if (batchRun.current !== run) return;
    batchRun.current = null; setBatch(null);
    const unreached = run.total - run.done;
    if (run.fatal) {
      notify({id: 'codex-batch', title: "Codex couldn't run", description: `${run.fatal} Nothing was changed for the ${count(run.total - run.done, 'row', 'rows')} not reached.`, tone: 'danger', duration: 15000});
      return;
    }
    if (run.limit) {
      notify({id: 'codex-batch', title: 'Codex reached your usage limit', description: `${count(run.counts.applied, 'row', 'rows')} organized before it stopped; ${count(unreached, 'row', 'rows')} not reached yet. Run it again when your limit resets. Codex said: ${run.limit}`, tone: 'warning', duration: 15000, action: run.counts.applied && run.auto ? {label: 'Review them', onClick: () => setFilter('auto')} : undefined});
      return;
    }
    const c = run.counts, partial = [...run.appliedIds].filter(id => { const r = find(stateRef.current, id); return r && unsorted(r); }).length;
    const lines = [c.applied && `${count(c.applied, 'row', 'rows')} organized${run.auto && partial ? ` (${partial} still ${partial === 1 ? 'has an unsorted part' : 'have unsorted parts'})` : ''}`, c.review && `${c.review} ${c.review === 1 ? 'waits' : 'wait'} for review`, c.nothing && `${c.nothing} had nothing to suggest`, c.skipped && `${c.skipped} already sorted or linked`, c.failed && `${c.failed} failed after three tries`].filter(Boolean);
    notify({id: 'codex-batch', title: run.auto ? `Codex went through ${count(run.total, 'row', 'rows')}` : c.review ? `Suggestions ready for ${count(c.review, 'row', 'rows')}` : 'Codex had nothing to suggest', description: lines.join(' · ') + (c.failed ? `. Run it again to retry them${run.lastError ? ` (Codex said: ${run.lastError.slice(0, 160)})` : ''}.` : '.'), tone: c.failed ? 'warning' : c.applied || c.review ? 'success' : 'neutral', duration: 12000,
      action: run.auto && c.applied ? {label: 'Review them', onClick: () => setFilter('auto')} : !run.auto && c.review ? {label: 'Show them', onClick: () => setFilter('suggested')} : undefined});
  }
  function stopBatch() {
    const run = batchRun.current; if (!run) return;
    run.stop = true; batchRun.current = null; setBatch(null);
    notify({id: 'codex-batch', title: `Stopped after ${run.done} of ${run.total}`, description: run.auto ? `${count(run.counts.applied, 'row', 'rows')} organized. Rows already answered keep their suggestions.` : 'Rows already answered keep their suggestions.', tone: 'neutral'});
  }
  /* Approved suggestions go through the same gestures as the describe box, in an order that keeps cents
     adding up: a move alone, otherwise settling first, then tags over what is left, the event, the split. */
  async function applySuggestions(row, list, {advance = true} = {}) {
    const live = () => find(stateRef.current, row.id), wasUnsorted = unsorted(live() || row);
    // A new tag is created first (once, even when several rows in a batch suggest it), then applied like any other.
    const fresh = list.find(s => s.kind === 'new-tag'), flowType = row.amount > 0 ? 'income' : 'expense';
    if (fresh) {
      const key = flowType + ':' + fresh.name.toLowerCase(), known = entities.find(e => e.kind === 'category' && tagType(e) === flowType && e.name.toLowerCase() === fresh.name.toLowerCase());
      try {
        if (!createdTags.current.has(key)) createdTags.current.set(key, known ? {id: known.id, name: known.name, color: known.color} : api().saveEntity('category', {name: fresh.name, flowType, parentId: fresh.categoryId || '', color: '#9aa993'}).then(id => ({id, name: fresh.name, color: 'var(--data-neutral)'})));
        const tag = await createdTags.current.get(key);
        createdTags.current.set(key, tag); list = list.map(s => s === fresh ? {...s, kind: 'tag', id: tag.id} : s);
      } catch (e) { createdTags.current.delete(key); setToast({message: e.message, error: true}); list = list.filter(s => s !== fresh); }
    }
    const made = new Map([...createdTags.current.values()].filter(t => t && t.id).map(t => [t.id, t]));
    const entity = id => entities.find(e => e.id === id) || made.get(id);
    if (!live()) return false;
    let did = false;
    const twin = list.find(s => s.kind === 'twin'), event = list.find(s => s.kind === 'event');
    if (twin) { linkPair(row.id, twin.id); did = true; }
    const settleWith = twin ? null : list.find(s => s.kind === 'settle');
    if (settleWith) { settle(live(), settleWith.id, settleWith.cents || undefined); did = true; }
    const tags = twin ? [] : list.filter(s => s.kind === 'tag' && !live().layers.some(l => l.id === 'tag:' + s.id));
    // Tags and the event share one save; on a move the event follows the link.
    const joins = event && !live().groups.includes(event.id) ? entity(event.id) : null;
    if (tags.length || (joins && !twin)) did = true;
    if (tags.length || (joins && !twin)) change(row.id, rows => {
      const r = find(rows, row.id); let room = rest(r);
      tags.forEach((s, i) => { const cents = i === tags.length - 1 ? room : Math.min(s.cents || room, room); if (cents > 0) { add(rows, row.id, 'tag', s.id, cents, entity(s.id)); room -= cents; } });
      if (joins && !twin) r.groups = [joins.id];
    }, [tags.length ? `Tagged ${tags.map(s => entity(s.id)?.name).join(', ')}` : '', joins && !twin ? `added to ${joins.name}` : ''].filter(Boolean).join(', '));
    if (joins && twin) { toggleEvent(live(), joins); did = true; }
    const shareWith = twin ? [] : list.filter(s => s.kind === 'share' && !sharedWith(live()).includes(s.id)).map(s => s.id);
    if (shareWith.length) { did = true; const next = [...new Set([...sharedWith(live()), ...repayersOf(stateRef.current, row.id), ...shareWith])]; change(row.id, rows => { find(rows, row.id).shares = evenShares(rows, find(rows, row.id), next); }, `Shared with ${next.map(personName).join(', ')}`, saveShares); }
    const payee = twin ? null : list.find(s => s.kind === 'payee');
    if (payee && live().raw.review.assignedPersonId !== payee.id) { setPayee(live(), payee.id); did = true; }
    if (list.length > 1) setToast({message: `Applied ${count(list.length, 'suggestion', 'suggestions')}`});
    const after = live();
    // A linked twin is sorted too, so the desk moves past it.
    if (advance && flow && wasUnsorted && (twin || (after && !unsorted(after)))) closeEditor(true, twin ? [twin.id] : []);
    return did;
  }
  function setAutoApply(on) {
    if (on && !readiness(codex.state).ok) { notify({id: 'codex-setup', title: "Codex isn't ready", description: readiness(codex.state).reason, tone: 'warning'}); return; }
    saveCodexSettings({autoApply: on}).catch(e => setToast({message: e.message, error: true}));
  }
  function setSmart(on) {
    if (on && !readiness(codex.state).ok) { notify({id: 'codex-setup', title: "Codex isn't ready", description: readiness(codex.state).reason, tone: 'warning'}); return; }
    saveCodexSettings({smartOrganize: on}).catch(e => setToast({message: e.message, error: true}));
  }
  function captureTemplate(r) {
    try { const portions = templateWeights(total(r), r.layers.filter(l => l.kind === 'tag').map(l => ({id: l.target, cents: l.cents}))); return {sample: r.raw.originalDescription || r.name, name: r.name.slice(0, 70), matchType: r.raw.aliasId ? 'aliases' : 'regex', aliasIds: r.raw.aliasId ? [r.raw.aliasId] : [], pattern: '^' + (r.raw.originalDescription || r.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), direction: r.amount > 0 ? 'in' : 'out', categoryId: '', personId: r.raw.review.assignedPersonId || r.person || '', enabled: true, template: {tags: portions, groups: [], autoReview: false}}; }
    catch { return null; }
  }
  const batchFlow = selected.length > 1 ? (find(state, selected[0])?.amount > 0 ? 'income' : 'expense') : null;
  const batchTags = batchFlow ? tagChoices.filter(t => tagType(t) === batchFlow && t.name.toLowerCase().includes(batchQuery.toLowerCase())) : [];
  function batchTag(tag) {
    const ids = selected.filter(id => { const r = find(stateRef.current, id); return r && !isLinked(r) && (r.amount > 0) === (batchFlow === 'income') && !r.layers.some(l => l.id === 'tag:' + tag.id); });
    const next = clone(stateRef.current), done = [];
    for (const id of ids) { const r = find(next, id); let cents = rest(r); if (!cents) { const largest = r.layers.filter(l => l.kind === 'tag').sort((a, b) => b.cents - a.cents)[0]; if (!largest || largest.cents < 2) continue; cents = Math.floor(largest.cents / 2); largest.cents -= cents; } try { add(next, id, 'tag', tag.id, cents, tag); done.push(id); } catch {} }
    const skipped = selected.length - done.length;
    if (!done.length) { setToast({message: `None of the selected rows can take ${tag.name}. ${batchFlow === 'income' ? 'It is an income tag; the rows are money out or already tagged.' : 'It is an expense tag; the rows are money in or already tagged.'}`, error: true}); return; }
    const entry = {rows: done.map(id => snapshot(find(stateRef.current, id)))}, desired = new Map(done.map(id => [id, desiredOf(find(next, id))]));
    for (const [id, d] of desired) pendingDesired.current.set(id, d);
    stateRef.current = next; setState(next); setSelected([]); setBatchQuery(''); setToast({message: `Tagged ${count(done.length, 'row', 'rows')} ${tag.name}${skipped ? ` · ${skipped} skipped (${batchFlow === 'income' ? 'money out' : 'money in'}, transfers or already tagged)` : ''}`}); setHistory(h => [...h.slice(-29), entry]);
    enqueue(async () => { for (const [id, d] of desired) { const server = find(serverRows.current, id); if (!server) continue; try { await saveRow(applyDesired(server, d), server.version); } catch (e) { setToast({message: e.message, error: true}); } if (pendingDesired.current.get(id) === d) pendingDesired.current.delete(id); } await load().catch(() => {}); return true; });
  }

  if (loadError && !state.length) return <section className="organize-desk workspace-page"><div className="page-heading"><div><h1>Organize</h1></div></div><Alert>{loadError}</Alert></section>;
  return (
    <section className="organize-desk workspace-page" data-busy={busy || undefined} onKeyDown={keys}>
      <div className="page-heading"><div><h1>Organize</h1><p>Every account in one list, newest first. Open a row and say what it is: a tag, who settled up or who you paid, an event, or the account it moved to. Each change saves at once, and Undo is always one step away.</p></div>
        <div className="page-heading-actions">{batch
          ? <span className="od-batch-run" role="status"><Icon name="sparkles" size={16} className="od-star-pulse" />{batchLabel(batch)}<small className="od-batch-slots">{count(batch.inFlight, 'transaction', 'transactions')} with Codex · {count(batch.active, 'run', 'runs')} of up to {batch.size} each{batch.capacity < batch.slots ? ` · eased to ${batch.capacity} of ${batch.slots} runs` : ''}</small><button type="button" className="sm ghost" onClick={stopBatch}>Stop</button></span>
          : <button type="button" className="sm" disabled={!unsortedCount} onClick={suggestAll} title={autoApply ? 'Ask Codex about every unsorted row and apply what it is sure about.' : 'Ask Codex about every unsorted row. Nothing changes until you apply a suggestion.'}><Icon name="sparkles" size={16} />{autoApply ? 'Organize all unsorted' : 'Suggest for all unsorted'}</button>}
          <span className="du-host od-smart"><Switch label="Smart organizing" checked={!!codex.state?.settings.smartOrganize} onChange={setSmart} /></span>
          <span className="du-host od-smart" title="Apply Codex's suggestions as they arrive, without review. Suggestions it is unsure about still wait for you."><Switch label="Apply automatically" checked={autoApply} onChange={setAutoApply} /></span><label className="od-flow"><input type="checkbox" checked={flow} onChange={e => setFlow(e.target.checked)} />Go to the next unsorted row after tagging</label></div></div>
      <div className="od-filters">
        <div className="od-chips" role="group" aria-label="Show">
          {[['all', 'All'], ['unsorted', 'Unsorted'], ...(readyCount || filter === 'suggested' ? [['suggested', 'Suggested']] : []), ...(autoApplied.current.size || filter === 'auto' ? [['auto', 'Auto-applied']] : []), ['in', 'Money in'], ['out', 'Money out'], ['transfers', 'Transfers']].map(([id, label]) => <button key={id} type="button" className="sm" aria-pressed={filter === id} onClick={() => setFilter(id)}>{id === 'suggested' && <Icon name="sparkles" size={16} />}{label}{id === 'unsorted' && <span className="od-count" aria-label={`${unsortedCount} unsorted`}>{unsortedCount}</span>}{id === 'suggested' && <span className="od-count" aria-label={`${readyCount} with a suggestion`}>{readyCount}</span>}{id === 'auto' && <span className="od-count" aria-label={`${autoApplied.current.size} applied by Codex`}>{autoApplied.current.size}</span>}</button>)}
        </div>
        {accounts.length > 1 && <div className="od-chips" role="group" aria-label="Accounts">
          {accounts.map(a => <button key={a.id} type="button" className="sm" aria-pressed={accountFilter.includes(a.id)} onClick={() => setAccountFilter(f => f.includes(a.id) ? f.filter(x => x !== a.id) : [...f, a.id])}><i className="od-dot" style={{background: a.color}} />{a.name}</button>)}
        </div>}
        <label className="od-search"><Icon name="search" size={16} /><input type="search" placeholder="Find a transaction" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find a transaction" /></label>
      </div>
      {loadError && <Alert>{loadError}</Alert>}
      <div className="od-head" aria-hidden="true"><span /><span>Transaction</span><span>Shape</span><span>Amount</span></div>
      <ol className="od-ledger" aria-label="Ledger" ref={listRef}>
        {days.map(g => (
          <li key={g.date} className="od-day"><h2>{weekday(g.date)}</h2>
            <ol>{g.rows.map(r => {
              const shown = parts(state, r, entities), linked = isLinked(r), isOpen = open === r.id, twinOf = twinIds.includes(r.id) ? open : null, person = people.find(p => p.id === r.person), payee = people.find(p => p.id === r.raw.review.assignedPersonId), shared = sharedWith(r).map(id => people.find(p => p.id === id)?.name).filter(Boolean);
              return (
                <li key={r.id} data-row={r.id} className={'od-row' + (isOpen ? ' is-open' : '') + (selected.includes(r.id) ? ' is-selected' : '') + (unsorted(r) && !isOpen ? ' is-unsorted' : '') + (twinOf ? ' is-twin' : '')}>
                  <input type="checkbox" className="od-check" checked={selected.includes(r.id)} aria-label={`Select ${r.name}`} onChange={() => select(r.id, false)} onClick={e => { if (e.shiftKey) { e.preventDefault(); select(r.id, true); } }} />
                  <div className="od-row-main" role="button" tabIndex={0} aria-expanded={isOpen} aria-label={`${r.name}, ${signed(r.amount, r.currency)}`}
                    onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) select(r.id, e.shiftKey); else { setOpen(isOpen ? null : r.id); setSelected([]); } }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : r.id); setSelected([]); } }}>
                    <span className="od-who"><i className="od-dot" style={{background: r.color}} /><b>{r.name}</b><small>{isOpen ? `${r.account} · ${dayLabel(r.date)}${r.raw.originalDescription && r.raw.originalDescription !== r.name ? ` · ${r.raw.originalDescription}` : ''}` : <>{r.account}{person ? ` · ${person.name}` : ''}{payee && !person ? ` · paid ${payee.name}` : ''}{shared.length ? ` · shared with ${shared.join(', ')}` : ''}{r.groups.length ? ` · ${r.groups.map(id => events.find(e => e.id === id)?.name).filter(Boolean).join(', ')}` : ''}{r.raw.review.templateReview === 'pending' ? ' · suggested by a rule' : ''}</>}</small></span>
                    <span className="od-row-shape">{starsOn ? <span className="od-star-slot">{linked ? <Icon name="arrow-left-right" size={16} /> : (() => { const star = starOf(r); return star && <span className={'od-star is-' + star.state} title={star.label}><Icon name="sparkles" size={16} label={star.label} /></span>; })()}</span> : linked && <Icon name="arrow-left-right" size={16} />}<Shape row={r} shown={shown} currency={r.currency} /></span>
                    <span className="od-row-amount">{signed(r.amount, r.currency)}</span>
                  </div>
                  {twinOf && <button type="button" className="od-twin sm" disabled={busy} onClick={() => linkPair(twinOf, r.id)}><Icon name="link-2" size={16} />Same money</button>}
                  {isOpen && <Editor row={r} shown={shown} state={state} entities={entities} people={people} events={events} busy={busy} config={config} onSettings={onSettings} onSource={onSource}
                    describe={describeOptions(r)} onPick={pickFor(r)} onEvent={ev => toggleEvent(r, ev)} onShare={p => toggleShare(r, p)} onShareAmount={(pid, cents) => setShare(r, pid, cents)} onSplitEvenly={() => splitEvenly(r)} onFollowEvent={() => followEvent(r)} onPayee={pid => setPayee(r, pid)} onUnlink={() => unlinkRow(r.id)} onClose={closeEditor}
                    onAmount={(layerId, cents) => change(r.id, rows => resize(rows, r.id, layerId, cents), 'Amount changed')}
                    onSettleAmount={(personId, cents) => { const current = r.layers.filter(l => l.kind === 'expense').reduce((n, l) => n + l.cents, 0); if (cents > current) settle(r, personId, cents - current); else change(r.id, rows => { const x = find(rows, r.id); let cut = current - cents; for (const l of [...x.layers].reverse()) { if (l.kind !== 'expense' || !cut) continue; const take = Math.min(cut, l.cents); l.cents -= take; cut -= take; } x.layers = x.layers.filter(l => l.kind !== 'expense' || l.cents > 0); }, 'Settlement changed'); }}
                    onRemove={layer => layer.kind === 'transfer' || layer.kind === 'fee' || layer.kind === 'principal' ? unlinkRow(r.id) : change(r.id, rows => remove(rows, r.id, layer.id), 'Part removed')}
                    onRemoveSettlement={() => change(r.id, rows => { const x = find(rows, r.id); x.layers = x.layers.filter(l => l.kind !== 'expense'); }, 'Settlement removed')}
                    onConfirm={() => change(r.id, () => {}, 'Confirmed')}
                    capture={() => captureTemplate(r)} onTemplate={setTemplate} ruleRevision={ruleRevision}
                    smart={codexReady && (smart || !!suggestions.current.get(r.id))} suggestion={suggestions.current.get(r.id) || null} onAsk={() => askCodex(r, true)} onApplySuggestions={list => applySuggestions(r, list)} onDismissSuggestions={() => { suggestions.current.set(r.id, {status: 'dismissed'}); setSuggestTick(n => n + 1); }} />}
                </li>);
            })}</ol>
          </li>
        ))}
        {!visible.length && state.length > 0 && <li className="od-empty">Nothing here. Change the filter or the search.</li>}
        {!state.length && !loadError && <li className="od-empty">No transactions yet. Add a bank export in Snapshots.</li>}
      </ol>
      {visible.length > limit && <div className="od-more"><button type="button" onClick={() => setLimit(n => n + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more</button><small>{limit.toLocaleString('en-CA')} of {visible.length.toLocaleString('en-CA')}</small></div>}
      <p className="od-keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open, then type what it is · <kbd>n</kbd> next unsorted · <kbd>x</kbd> or the checkbox selects several · <kbd>Ctrl</kbd><kbd>Z</kbd> undo</p>
      {selected.length > 1 && (
        <div className="od-batch" role="region" aria-label="Selected rows">
          <b>{selected.length} rows selected</b>
          <label className="od-describe-field"><Icon name="search" size={16} /><input placeholder="Tag all of them" value={batchQuery} onChange={e => setBatchQuery(e.target.value)} aria-label="Tag selected rows" /></label>
          <div className="od-batch-tags">{batchTags.slice(0, 6).map(t => <button key={t.id} type="button" className="sm" onClick={() => batchTag(t)}><i className="od-dot" style={{background: t.color}} />{t.name}</button>)}</div>
          <button type="button" className="sm ghost" onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      {template && <TransactionTemplateEditor rule={template} entities={entities} onClose={() => setTemplate(null)} onSaved={async () => { notify({title: 'Rule saved', description: 'Manage it under Settings, Rules.', tone: 'success'}); setRuleRevision(n => n + 1); await run(async () => true); }} />}
    </section>
  );
}

/* The parts-first card: the box, the typed part rows with amount boxes, and fixed slots at the right. */
function Editor({row, shown, state, entities, people, events, busy, config, onSettings, onSource, describe, onPick, onEvent, onShare, onShareAmount, onSplitEvenly, onFollowEvent, onPayee, onUnlink, onClose, onAmount, onSettleAmount, onRemove, onRemoveSettlement, onConfirm, capture, onTemplate, ruleRevision, smart, suggestion, onAsk, onApplySuggestions, onDismissSuggestions}) {
  const inputRef = useRef(null), [showDetails, setShowDetails] = useState(false), detailsId = React.useId();
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
        {smart && !linked && <Suggestions row={row} state={state} entities={entities} people={people} events={events} busy={busy} suggestion={suggestion} onAsk={onAsk} onApply={onApplySuggestions} onDismiss={onDismissSuggestions} />}
        {!linked && <Describe options={describe} onPick={onPick} inputRef={inputRef} placeholder={row.amount > 0 ? 'Tag, who settled up, event or account…' : 'Tag, who you paid, shared with, event or account…'} />}
        {row.raw.review.templateReview === 'pending' && <p className="od-note od-note-rule">A rule suggested these settings. <button type="button" className="sm" onClick={onConfirm}>Keep them</button></p>}
        {row.legacyScaling && <p className="od-note">This receipt has older tags covering its full amount. Changing it here applies those tags proportionally to the remainder after its deductions.</p>}
        <div className="od-partlist">
          {partRows.map(p => <div key={p.id} className="od-part-row" style={{'--part': p.color}}>
            <span className="od-nature">{natureOf(row, p)}</span><i /><b>{p.name}</b>
            {linked ? <span className="od-amount is-static">{plain(p.cents)}</span> : <Amount value={p.cents} label={`Amount for ${p.name}`} onCommit={c => onAmount(p.id, c)} />}
            {!linked && p.kind !== 'fee' && p.kind !== 'excess' ? <button type="button" className="icon ghost sm" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p)}><Icon name="x" size={16} /></button> : <span />}
          </div>)}
          {settler && settled.length > 0 && <div className="od-part-row is-settle" style={{'--part': settler.color}}>
            <span className="od-nature">Offset</span><i /><b>{settler.name} settled</b><small>owed {money(owed, row.currency)}, now {money(Math.max(0, owed - settledTotal), row.currency)}</small>
            <Amount value={settledTotal} label={`Settled by ${settler.name}`} onCommit={c => onSettleAmount(settler.id, c)} />
            <button type="button" className="icon ghost sm" aria-label="Remove settlement" onClick={onRemoveSettlement}><Icon name="x" size={16} /></button>
            <div className="od-alloc">{settled.map(l => <span key={l.id}><span>{find(state, l.target)?.name || 'Expense'}<small> · {dayLabel(find(state, l.target)?.date)}</small></span><span className="num">{plain(l.cents)}</span></span>)}</div>
          </div>}
          {!linked && gap > 0 && <div className="od-part-row is-gap"><span className="od-nature" /><i /><b>Unsorted</b><span className="od-amount is-static">{plain(gap)}</span></div>}
          {linked && other && <p className="od-linked"><Icon name="link-2" size={16} /><span>Moved {row.amount < 0 ? 'to' : 'from'} <b>{other.account}</b> · {other.name} on {dayLabel(other.date)}.</span><button type="button" className="sm" disabled={busy} onClick={onUnlink}><Icon name="unlink" size={16} />Unlink</button></p>}
          {!linked && !partRows.length && !settled.length && <p className="od-quiet">{row.amount > 0 ? (row.manual ? 'Nothing yet. A tag makes it income; a person settles what they owe.' : 'Nothing yet. A tag makes it income; a person settles what they owe; an account makes it a move.') : 'Nothing yet. A tag makes it spending; an account makes it a move.'}</p>}
        </div>
        {received > 0 && <p className="od-note">{money(received, row.currency)} paid back so far · {money(total(row) - received, row.currency)} still yours to recover.</p>}
      </div>
      <div className="od-card-side">
        {row.amount < 0 && !linked && <div className="od-slot"><div className="od-slot-head"><b>Split</b><small>{shares.length ? `Your share ${money(row.shares.me || 0, row.currency)}${followsEvent ? ` · as ${event.name}` : canFollow ? ' · your own split' : ''}` : payee ? `Paid ${payee.name} · your cost` : 'Just you'}</small></div>
          <div className="od-people">{people.map(p => { const s = shares.find(x => x.person.id === p.id); return <span key={p.id} className={'od-person' + (s ? ' is-on' : '')} style={{'--part': p.color}}><button type="button" aria-pressed={!!s} onClick={() => onShare(p)}><i />{p.name}</button>{s && <Amount value={s.cents} label={`Share for ${p.name}`} onCommit={c => onShareAmount(p.id, c)} />}{s && s.repaid > 0 && <small>{s.repaid >= s.cents ? 'Settled' : `${money(s.cents - s.repaid, row.currency)} owed`}</small>}</span>; })}</div>
          {(canFollow || shares.length > 1) && <div className="od-slot-actions">{canFollow && <button type="button" className="link" onClick={onFollowEvent}>Split like {event.name}</button>}{shares.length > 1 && !followsEvent && <button type="button" className="link" onClick={onSplitEvenly}>Split evenly</button>}</div>}
        </div>}
        <div className="od-slot"><div className="od-slot-head"><b>Event</b>{event?.startDate && <small>{rangeLabel(event.startDate, event.endDate)}</small>}</div>
          <div className="od-chips-wrap">{nearEvents.map(e => <button key={e.id} type="button" className={'od-event' + (row.groups.includes(e.id) ? ' is-on' : '')} style={{'--part': e.color}} aria-pressed={row.groups.includes(e.id)} onClick={() => onEvent(e)}><Icon name="calendar-days" size={16} />{e.name}</button>)}{!events.length && <small className="od-quiet">No events yet. Create one on the Events page.</small>}</div>
        </div>
        {!linked && <div className="od-slot"><div className="od-slot-head"><b>Rule</b></div>{row.layers.some(l => l.kind === 'tag') ? <TransactionRuleReuse transaction={row} entities={entities} capture={capture} onEdit={onTemplate} revision={ruleRevision} /> : <small className="od-quiet">Tag it, then remember the settings for next time.</small>}</div>}
        <div className="od-slot is-quiet"><button type="button" className="link" aria-expanded={showDetails} aria-controls={detailsId} onClick={() => setShowDetails(v => !v)}>{showDetails ? 'Hide details' : 'Details'}</button>{showDetails && <div className="od-details" id={detailsId}><span>{row.raw.originalDescription || row.name}</span><span>{row.account}</span><span>{dayLabel(row.date)}</span>{!row.manual && <button type="button" className="link" onClick={() => onSource(row.id)}>Original record</button>}{config && <span>Transfers match within ±{config.basisPoints / 100}% and {count(config.maxDays, 'day', 'days')}. {onSettings && <button type="button" className="link" onClick={onSettings}>Change</button>}</span>}</div>}</div>
      </div>
    </div>
  );
}

/* Smart organizing on the open card: what Codex suggests, each with its reason and a checkbox, applied
   together with one button. Suggestions already on the row show as applied. */
function Suggestions({row, state, entities, people, events, busy, suggestion, onAsk, onApply, onDismiss}) {
  const [off, setOff] = useState({});
  useEffect(() => setOff({}), [suggestion?.result]);
  if (!suggestion) return unsorted(row) ? null : <div className="od-suggest-actions"><button type="button" className="link" onClick={onAsk}><Icon name="sparkles" size={16} />Ask Codex what this is</button></div>;
  if (suggestion.status === 'dismissed') return <div className="od-suggest-actions"><button type="button" className="link" onClick={onAsk}><Icon name="sparkles" size={16} />Ask Codex again</button></div>;
  if (suggestion.status === 'loading') return <div className="od-suggest is-loading" role="status"><div className="od-suggest-head"><Icon name="loader-circle" size={16} /><b>Codex is looking at this transaction…</b></div></div>;
  if (suggestion.status === 'error') return <div className="od-suggest" role="alert"><div className="od-suggest-head"><Icon name="circle-alert" size={16} /><b>No suggestion this time.</b></div><p className="od-suggest-summary">{suggestion.error}</p><div className="od-suggest-actions"><button type="button" className="sm" onClick={onAsk}>Try again</button></div></div>;
  const {result} = suggestion, person = id => people.find(p => p.id === id), entity = id => entities.find(e => e.id === id);
  const applied = s => suggestionApplied(row, s);
  const describe = s => {
    if (s.kind === 'tag') { const t = entity(s.id); return {nature: row.amount > 0 ? 'Receive' : 'Spend', label: t?.name || 'Tag', color: t?.color, amount: s.cents}; }
    if (s.kind === 'new-tag') return {nature: 'New tag', label: s.name, color: 'var(--data-neutral)', amount: s.cents, hint: row.amount > 0 ? 'income tag' : s.categoryId ? `in ${entity(s.categoryId)?.name || 'a category'}` : 'ungrouped'};
    if (s.kind === 'twin') { const t = find(state, s.id); return {nature: 'Move', label: `${row.amount < 0 ? 'To' : 'From'} ${t?.account || 'another account'}`, color: t?.color, hint: t ? `${t.name} · ${dayLabel(t.date)}` : ''}; }
    if (s.kind === 'settle') return {nature: 'Offset', label: `${person(s.id)?.name} settles up`, color: person(s.id)?.color, amount: s.cents};
    if (s.kind === 'share') return {nature: 'Split', label: `Shared with ${person(s.id)?.name}`, color: person(s.id)?.color};
    if (s.kind === 'payee') return {nature: 'Person', label: `Paid ${person(s.id)?.name}`, color: person(s.id)?.color};
    const e = events.find(x => x.id === s.id); return {nature: 'Event', label: e?.name || 'Event', color: e?.color, hint: e?.startDate ? rangeLabel(e.startDate, e.endDate) : ''};
  };
  // A suggested new tag that has since been created is offered as that tag.
  const named = name => entities.find(e => e.kind === 'category' && e.name.toLowerCase() === name.toLowerCase());
  const list = result.suggestions.filter(s => s.kind !== 'event' || events.some(e => e.id === s.id)).map(s => s.kind === 'new-tag' && named(s.name) ? {...s, kind: 'tag', id: named(s.name).id} : s);
  const keyOf = s => s.kind + (s.id || s.name);
  const pending = list.filter(s => !applied(s)), chosen = pending.filter(s => !(off[keyOf(s)] ?? s.confidence === 'low'));
  return (
    <div className="od-suggest" aria-label="Codex suggestions">
      <div className="od-suggest-head"><Icon name="sparkles" size={16} /><b>{list.length ? 'Suggested' : 'Nothing to suggest'}</b><small>{result.run?.model || 'Codex'}{result.cached ? '' : ` · ${seconds(result.run?.ms || 0)}`}</small></div>
      {result.summary && <p className="od-suggest-summary">{result.summary}</p>}
      {list.length > 0 && <div className="od-suggest-list">
        {list.map(s => { const d = describe(s), done = applied(s), key = keyOf(s), on = done || !(off[key] ?? s.confidence === 'low'); return (
          <label key={key} className={'od-suggest-item' + (done ? ' is-applied' : '')} style={{'--part': d.color}} title={s.reason}>
            <input type="checkbox" checked={on} disabled={done || busy} aria-label={`${d.label}: ${s.reason}`} onChange={e => setOff(o => ({...o, [key]: !e.target.checked}))} />
            <i />
            <span><b>{d.label}</b><small>{done ? 'Applied' : `${d.nature} · ${s.reason}`}{d.hint ? ` · ${d.hint}` : ''}</small></span>
            <span className="num">{d.amount ? plain(d.amount) : s.confidence === 'high' ? '' : s.confidence === 'medium' ? 'Likely' : 'Maybe'}</span>
          </label>); })}
      </div>}
      <div className="od-suggest-actions">
        {chosen.length > 0 && <button type="button" className="sm primary" disabled={busy} onClick={() => onApply(chosen)}><Icon name="check" size={16} />{chosen.length === pending.length && chosen.length > 1 ? 'Apply all' : `Apply ${count(chosen.length, 'suggestion', 'suggestions')}`}</button>}
        {pending.length > 0 && <button type="button" className="sm ghost" onClick={onDismiss}>Dismiss</button>}
        <button type="button" className="link" onClick={onAsk}>Ask again</button>
      </div>
    </div>
  );
}
