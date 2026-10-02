import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@derekurban/design-system/styles.css';
import './icons.js';
import {Icon} from '@derekurban/design-system';
import './style.css';
import {
  accounts, tags, people, events, sampleRecords, money, plain, find, byId, total, unsorted, isLinked,
  partName, partColor, partKey, capacity, openExpenses, twins, toggleTag, setAmount, removePart, moveBoundary,
  link, unlink, repay, setPerson, toggleEvent, describe, repaid,
} from './model.mjs';

const weekday = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {weekday: 'short', month: 'short', day: 'numeric'});

/* The shape of an amount: its parts as one strip. Small in the list, large and draggable when open. */
const luminance = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
function Shape({record, state, large, onBoundary, onBoundaryEnd}) {
  const gap = unsorted(record), sum = total(record), track = useRef(null), drag = useRef(null);
  const segments = [...record.parts.map((p, i) => ({key: partKey(p), name: partName(p, state), color: partColor(p), cents: p.cents, index: i})), ...(gap > 0 ? [{key: 'gap', name: 'Unsorted', cents: gap, gap: true}] : [])];
  const handles = large && !isLinked(record) ? record.parts.map((p, i) => ({index: i, at: record.parts.slice(0, i + 1).reduce((n, x) => n + x.cents, 0) / sum})).filter((h, i) => i < record.parts.length - 1 || gap > 0) : [];
  function down(e, index) {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {index, x: e.clientX, base: state, moved: false};
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const width = track.current.getBoundingClientRect().width;
    const delta = Math.round((e.clientX - d.x) / width * sum);
    d.moved = true; onBoundary(d.base, d.index, delta);
  }
  function up() { const d = drag.current; drag.current = null; if (d?.moved) onBoundaryEnd(); }
  return (
    <div className={'shape' + (large ? ' is-large' : '') + (segments.length === 1 && segments[0].gap ? ' is-empty' : '')} ref={track} role="img" aria-label={segments.map(s => `${s.name} ${money(s.cents)}`).join(', ')}>
      {segments.map(s => (
        <div key={s.key} className={'shape-seg' + (s.gap ? ' is-gap' : '')} style={{flexGrow: s.cents, background: s.gap ? undefined : s.color, color: s.gap ? undefined : luminance(s.color) > 0.62 ? '#1b1b1b' : '#fafafa'}} title={`${s.name} · ${money(s.cents)}`}>
          <span className="shape-label">{s.name}</span>
          {large && <span className="shape-amount">{plain(s.cents)}</span>}
        </div>
      ))}
      {handles.map(h => (
        <button key={h.index} className="shape-handle" style={{left: `calc(${h.at * 100}% - ${h.at * (segments.length - 1) * 3}px + ${(h.index + 0.5) * 3}px)`}} aria-label={`Boundary after ${partName(record.parts[h.index], state)}`}
          onPointerDown={e => down(e, h.index)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onBoundary(state, h.index, (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 100)); onBoundaryEnd(); } }} />
      ))}
    </div>
  );
}

function Amount({value, label, onCommit}) {
  const [text, setText] = useState(plain(value)), cancel = useRef(false);
  useEffect(() => setText(plain(value)), [value]);
  return <input className="amount" inputMode="decimal" aria-label={label} value={text} onChange={e => setText(e.target.value)}
    onFocus={e => { cancel.current = false; e.target.select(); }}
    onBlur={() => { if (!cancel.current && /^\d+(\.\d{0,2})?$/.test(text)) onCommit(Math.round(Number(text) * 100)); setText(plain(value)); }}
    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { cancel.current = true; e.target.blur(); } }} />;
}

/* One box that accepts a tag, a person, an event or an account. */
function Describe({record, state, onPick, inputRef, placeholder}) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [cursor, setCursor] = useState(0);
  const options = useMemo(() => describe(state, record, query), [state, record, query]);
  useEffect(() => setCursor(0), [query]);
  function pick(o) { if (o.disabled) return; onPick(o); setQuery(''); setOpen(false); }
  const groups = ['twin', 'person', 'tag', 'event', 'account'], titles = {twin: 'Same money', person: 'Repayment', tag: record.cents > 0 ? 'Income tags' : 'Tags', event: 'Events', account: 'Transfers'};
  let flat = 0;
  return (
    <div className="describe">
      <div className="describe-field">
        <Icon name="search" size={16} />
        <input ref={inputRef} value={query} placeholder={placeholder} aria-label="Describe this transaction" role="combobox" aria-expanded={open}
          onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(options.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
            else if (e.key === 'Enter' && open && options[cursor]) { e.preventDefault(); pick(options[cursor]); }
            else if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); }
          }} />
        <kbd>Enter</kbd>
      </div>
      {open && options.length > 0 && (
        <div className="describe-menu" role="listbox">
          {groups.map(g => {
            const items = options.filter(o => o.kind === g); if (!items.length) return null;
            return <div key={g} className="describe-group"><small>{titles[g]}</small>
              {items.map(o => { const i = flat++; return (
                <button key={o.kind + o.id} role="option" aria-selected={i === cursor} className={(i === cursor ? 'is-cursor' : '') + (o.disabled ? ' is-disabled' : '')} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setCursor(i)} onClick={() => pick(o)}>
                  <i style={{background: o.color}} /><span><b>{o.label}</b><small>{o.hint}</small></span>{o.on && <Icon name="check" size={14} />}
                </button>); })}
            </div>;
          })}
        </div>
      )}
    </div>
  );
}

function Editor({record, state, apply, setDraft, commitDraft, onLink, onClose, personPending, setPersonPending, flow}) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, [record.id]);
  const gap = unsorted(record), linked = isLinked(record), received = repaid(state, record.id);
  const candidates = personPending ? openExpenses(state, record.id, personPending) : [];
  function pick(o) {
    if (o.kind === 'tag') { const first = unsorted(record) === total(record); const done = apply(s => toggleTag(s, record.id, o.id), `${o.on ? 'Removed' : 'Tagged'} ${o.label}`); if (done && first && unsorted(find(done, record.id)) === 0 && flow) onClose(true); }
    else if (o.kind === 'event') apply(s => toggleEvent(s, record.id, o.id), `${o.on ? 'Removed from' : 'Added to'} ${o.label}`);
    else if (o.kind === 'twin') onLink(record.id, o.id);
    else if (o.kind === 'person') { setPersonPending(o.id); apply(s => setPerson(s, record.id, o.id), `${byId(people, o.id).name} noted`, true); }
  }
  const other = linked ? find(state, record.parts.find(p => p.kind === 'transfer').target) : null;
  return (
    <div className="editor" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(false); } }}>
      <div className="editor-left">
        {!linked && <Describe record={record} state={state} onPick={pick} inputRef={inputRef} placeholder={record.cents > 0 ? 'Tag, who paid you back, event or account…' : 'Tag, event or account…'} />}
        {linked && <p className="editor-linked"><Icon name="link-2" size={16} /> Internal transfer with <b>{other.description}</b> in {byId(accounts, other.account).name} on {other.date}. <button onClick={() => apply(s => unlink(s, record.id), 'Transfer unlinked')}>Unlink</button></p>}
        <Shape record={record} state={state} large onBoundary={(base, i, d) => setDraft(moveBoundary(base, record.id, i, d))} onBoundaryEnd={() => commitDraft('Boundary moved')} />
        <div className="parts">
          {record.parts.map((p, i) => (
            <span key={partKey(p)} className="part" style={{'--part': partColor(p)}}>
              <i /><b>{partName(p, state)}</b>
              {p.kind === 'transfer' || p.kind === 'fee' ? <span className="amount is-static">{plain(p.cents)}</span> : <Amount value={p.cents} label={`Amount for ${partName(p, state)}`} onCommit={c => apply(s => setAmount(s, record.id, i, c), 'Amount changed')} />}
              {p.kind !== 'fee' && <button aria-label={`Remove ${partName(p, state)}`} onClick={() => apply(s => removePart(s, record.id, i), p.kind === 'transfer' ? 'Transfer unlinked' : 'Part removed')}><Icon name="x" size={14} /></button>}
            </span>
          ))}
          {gap > 0 && <span className="part is-gap"><i /><b>Unsorted</b><span className="amount is-static">{plain(gap)}</span></span>}
          {record.events.map(id => { const e = byId(events, id); return <span key={id} className="part is-event" style={{'--part': e.color}}><Icon name="calendar-days" size={14} /><b>{e.name}</b><button aria-label={`Remove ${e.name}`} onClick={() => apply(s => toggleEvent(s, record.id, id), `Removed from ${e.name}`)}><Icon name="x" size={14} /></button></span>; })}
          {record.person && !record.parts.some(p => p.kind === 'repay') && <span className="part is-event" style={{'--part': byId(people, record.person).color}}><Icon name="user" size={14} />{byId(people, record.person).name}</span>}
        </div>
        {personPending && (
          <div className="suggest">
            <div className="suggest-head"><b>{byId(people, personPending).name} paid you back for…</b><small>{gap ? `${money(gap)} still unsorted on this receipt` : 'Nothing left to apply on this receipt'}</small></div>
            {candidates.slice(0, 8).map(x => { const room = capacity(state, x, record.id), amount = Math.min(room, gap); return (
              <button key={x.id} className="suggest-row" disabled={!amount} onClick={() => { apply(s => repay(s, record.id, personPending, x.id, amount), `${money(amount)} applied to ${x.description}`); setPersonPending(''); }}>
                <i style={{background: byId(accounts, x.account).color}} /><span><b>{x.description}</b><small>{x.date} · {byId(accounts, x.account).name} · {money(room)} still fronted</small></span><strong>Apply {money(amount)}</strong>
              </button>); })}
            {!candidates.length && <p>No expenses left to repay.</p>}
            <button className="suggest-dismiss" onClick={() => setPersonPending('')}>Never mind</button>
          </div>
        )}
        {record.cents < 0 && received > 0 && <p className="editor-note">{money(received)} repaid so far · {money(total(record) - received)} still fronted. The parts above still describe the original purchase.</p>}
      </div>
      <div className="editor-right">
        <dl>
          <dt>Original</dt><dd>{record.original}</dd>
          <dt>Account</dt><dd><i className="dot" style={{background: byId(accounts, record.account).color}} />{byId(accounts, record.account).name}</dd>
          <dt>Imported</dt><dd>{record.account === 'mc' ? 'mastercard-2026-09.csv' : record.account === 'sav' ? 'savings-2026-09.csv' : 'chequing-2026-09.csv'}</dd>
        </dl>
        <small>Each change saves to this transaction right away. Undo is in the corner.</small>
      </div>
    </div>
  );
}

function Row({record, state, open, selected, twinOf, onOpen, onSelect, onLink, children}) {
  const gap = unsorted(record), linked = isLinked(record), account = byId(accounts, record.account);
  return (
    <li className={'row' + (open ? ' is-open' : '') + (selected ? ' is-selected' : '') + (gap > 0 && !open ? ' is-unsorted' : '') + (twinOf ? ' is-twin' : '')} data-id={record.id}>
      <div className="row-main" role="button" tabIndex={0} aria-expanded={open} aria-label={`${record.description}, ${money(record.cents, true)}`}
        onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) onSelect(record.id, e.shiftKey); else onOpen(open ? null : record.id); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(open ? null : record.id); } }}>
        <span className="row-check" aria-hidden="true">{selected ? <Icon name="check" size={14} /> : null}</span>
        <span className="row-who"><i className="dot" style={{background: account.color}} /><b>{record.description}</b><small>{account.name}{record.person ? ` · ${byId(people, record.person).name}` : ''}{record.events.length ? ` · ${record.events.map(id => byId(events, id).name).join(', ')}` : ''}</small></span>
        <span className="row-shape">{linked && <Icon name="arrow-left-right" size={14} />}<Shape record={record} state={state} /></span>
        <span className={'row-amount' + (record.cents > 0 ? ' is-in' : '')}>{money(record.cents, true)}</span>
        {twinOf && <button className="row-twin" onClick={e => { e.stopPropagation(); onLink(twinOf, record.id); }}><Icon name="link-2" size={14} /> Same money</button>}
      </div>
      {children}
    </li>
  );
}

function App() {
  const [state, setState] = useState(sampleRecords), [history, setHistory] = useState([]), [toast, setToast] = useState(null);
  const [open, setOpen] = useState(null), [selected, setSelected] = useState([]), [anchor, setAnchor] = useState(null), [personPending, setPersonPending] = useState('');
  const [filter, setFilter] = useState('all'), [accountFilter, setAccountFilter] = useState([]), [query, setQuery] = useState(''), [flow, setFlow] = useState(true), [theme, setTheme] = useState('light');
  const [batchQuery, setBatchQuery] = useState('');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { setPersonPending(''); }, [open]);

  // Every change commits at once and can be undone.
  function apply(fn, message, quiet = false) {
    try { const next = fn(state); if (next === state && !message.startsWith('Boundary')) return next; setHistory(h => [...h.slice(-49), state]); setState(next); if (!quiet) setToast({message}); return next; }
    catch (e) { setToast({message: e.message, error: true}); return null; }
  }
  const draftBase = useRef(null);
  function setDraft(next) { if (!draftBase.current) draftBase.current = state; setState(next); }
  function commitDraft(message) { if (!draftBase.current) return; setHistory(h => [...h.slice(-49), draftBase.current]); draftBase.current = null; setToast({message}); }
  function undo() { const prev = history.at(-1); if (!prev) return; setHistory(h => h.slice(0, -1)); setState(prev); setToast({message: 'Undone'}); }
  function doLink(aId, bId) { const a = find(state, aId), b = find(state, bId); const fee = Math.abs(total(a) - total(b)); apply(s => link(s, aId, bId), `Linked as one transfer${fee ? ` · ${money(fee)} fee` : ''}`); }
  function closeEditor(advance) {
    if (advance && flow) { const next = visible.find(r => r.id !== open && unsorted(r) > 0 && visible.indexOf(r) > visible.findIndex(x => x.id === open)) || visible.find(r => r.id !== open && unsorted(r) > 0); setOpen(next?.id || null); if (next) requestAnimationFrame(() => document.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({block: 'nearest'})); }
    else { setOpen(null); requestAnimationFrame(() => document.querySelector(`[data-id="${open}"] .row-main`)?.focus()); }
  }
  function select(id, range) {
    setSelected(sel => {
      if (range && anchor) { const ids = visible.map(r => r.id), a = ids.indexOf(anchor), b = ids.indexOf(id); return ids.slice(Math.min(a, b), Math.max(a, b) + 1); }
      return sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
    });
    if (!range) setAnchor(id); setOpen(null);
  }
  const visible = useMemo(() => state.filter(r => (filter === 'all' || filter === 'unsorted' && unsorted(r) > 0 || filter === 'in' && r.cents > 0 && !isLinked(r) || filter === 'out' && r.cents < 0 && !isLinked(r) || filter === 'transfers' && (isLinked(r) || twins(state, r).length > 0))
    && (!accountFilter.length || accountFilter.includes(r.account)) && `${r.description} ${r.original}`.toLowerCase().includes(query.toLowerCase())), [state, filter, accountFilter, query]);
  const unsortedCount = state.filter(r => unsorted(r) > 0).length, openRecord = open ? find(state, open) : null;
  const twinIds = openRecord ? twins(state, openRecord).map(t => t.id) : [];
  const groups = []; for (const r of visible) { const g = groups.at(-1); if (g && g.date === r.date) g.rows.push(r); else groups.push({date: r.date, rows: [r]}); }
  function ledgerKeys(e) {
    if (e.target.closest('input, .editor')) return;
    const mains = [...document.querySelectorAll('.row-main')], i = mains.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); (mains[i + 1] || mains[0])?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); (mains[i - 1] || mains.at(-1))?.focus(); }
    else if (e.key === 'n') { e.preventDefault(); const next = visible.find(r => unsorted(r) > 0 && r.id !== open); if (next) setOpen(next.id); }
    else if (e.key === 'Escape') { setOpen(null); setSelected([]); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  }
  const batchTags = selected.length > 1 ? tags.filter(t => t.flow === (find(state, selected[0]).cents > 0 ? 'in' : 'out') && t.name.toLowerCase().includes(batchQuery.toLowerCase())) : [];
  return (
    <div className="desk" onKeyDown={ledgerKeys}>
      <header className="desk-top">
        <div><p className="crumb">Workspace / Organize</p><h1>Organize</h1><p>Every account in one list, newest first. Open a row and describe it. Study with synthetic data.</p></div>
        <div className="desk-tools">
          <label className="flow"><input type="checkbox" checked={flow} onChange={e => setFlow(e.target.checked)} />Move to the next unsorted row after tagging</label>
          <div className="seg" role="group" aria-label="Theme"><button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Icon name="sun" size={16} /></button><button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Icon name="moon" size={16} /></button></div>
        </div>
      </header>
      <div className="filters">
        <div className="chips" role="group" aria-label="Show">
          {[['all', 'All'], ['unsorted', `Unsorted`], ['in', 'Money in'], ['out', 'Money out'], ['transfers', 'Between accounts']].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}{id === 'unsorted' && <span className="count">{unsortedCount}</span>}</button>)}
        </div>
        <div className="chips" role="group" aria-label="Accounts">
          {accounts.map(a => <button key={a.id} aria-pressed={accountFilter.includes(a.id)} onClick={() => setAccountFilter(f => f.includes(a.id) ? f.filter(x => x !== a.id) : [...f, a.id])}><i className="dot" style={{background: a.color}} />{a.name}</button>)}
        </div>
        <label className="search"><Icon name="search" size={16} /><input placeholder="Find a transaction…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find a transaction" /></label>
      </div>
      <div className="ledger-head"><span /><span>Transaction</span><span>Shape</span><span>Amount</span></div>
      <ol className="ledger" aria-label="Ledger">
        {groups.map(g => (
          <li key={g.date} className="day"><h2>{weekday(g.date)}</h2>
            <ol>{g.rows.map(r => (
              <Row key={r.id} record={r} state={state} open={open === r.id} selected={selected.includes(r.id)} twinOf={twinIds.includes(r.id) ? open : null} onOpen={id => { setOpen(id); setSelected([]); }} onSelect={select} onLink={doLink}>
                {open === r.id && <Editor record={r} state={state} apply={apply} setDraft={setDraft} commitDraft={commitDraft} onLink={doLink} onClose={closeEditor} personPending={personPending} setPersonPending={setPersonPending} flow={flow} />}
              </Row>))}</ol>
          </li>
        ))}
        {!visible.length && <li className="empty">Nothing here. Change the filter or the search.</li>}
      </ol>
      <p className="keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · type to describe · <kbd>n</kbd> next unsorted · <kbd>Ctrl</kbd>+click to select several · <kbd>Ctrl</kbd><kbd>Z</kbd> undo</p>
      {selected.length > 1 && (
        <div className="batch" role="region" aria-label="Selected rows">
          <b>{selected.length} rows selected</b>
          <label className="describe-field"><Icon name="search" size={16} /><input placeholder="Tag all of them…" value={batchQuery} onChange={e => setBatchQuery(e.target.value)} aria-label="Tag selected rows" /></label>
          <div className="batch-tags">{batchTags.slice(0, 6).map(t => <button key={t.id} onClick={() => { apply(s => selected.reduce((acc, id) => { try { return isLinked(find(acc, id)) || find(acc, id).parts.some(p => p.kind === 'tag' && p.id === t.id) ? acc : toggleTag(acc, id, t.id); } catch { return acc; } }, s), `Tagged ${selected.length} rows ${t.name}`); setSelected([]); setBatchQuery(''); }}><i style={{background: t.color}} />{t.name}</button>)}</div>
          <button onClick={() => setSelected([])}>Clear</button>
        </div>
      )}
      <div className={'toast' + (toast ? ' is-on' : '') + (toast?.error ? ' is-error' : '')} role="status">
        {toast && <>{toast.error ? null : <Icon name="check" size={16} />}<span>{toast.message}</span>{!toast.error && history.length > 0 && <button onClick={undo}><Icon name="undo-2" size={14} /> Undo</button>}</>}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
