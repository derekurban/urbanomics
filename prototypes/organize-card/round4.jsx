// Round four: three playable approaches to the four-nature model, over the same in-memory ledger.
import React, {useEffect, useRef, useState} from 'react';
import {Icon} from '@derekurban/design-system';
import * as M from './model4.mjs';
const {money, plain, acct, person, event, total, gap, find, linked, tags, people, events, accounts, natureLabel} = M;

const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const ink = hex => lum(hex) > 0.62 ? '#1b1b1b' : '#fafafa';
const vt = name => ({viewTransitionName: name});
const signed = row => (row.amount < 0 ? '−' : '+') + money(row.amount);
const Dot = ({color}) => <i className="dot" style={{background: color}} />;
const sub = row => `${acct(row.account).name}${row.event ? ` · ${event(row.event).name}` : ''}${row.payee ? ` · paid ${person(row.payee).name}` : ''}`;

function Strip({rows, row, height = 20, name}) {
  const segs = [...row.parts.map(p => M.partView(rows, p)), ...(gap(row) > 0 ? [{name: 'Unsorted', cents: gap(row), gap: true}] : [])];
  return <div className={'strip' + (segs.length === 1 && segs[0].gap ? ' is-empty' : '')} style={{height, ...(name ? vt(name) : {})}}>{segs.map((s, i) => <div key={i} className={'seg' + (s.gap ? ' is-gap' : '')} style={s.gap ? {flexGrow: s.cents} : {flexGrow: s.cents, background: s.color, color: ink(s.color)}}><span className="seg-label">{s.name}</span></div>)}</div>;
}
function AmountBox({cents, onCommit, label}) {
  const [text, setText] = useState(plain(cents)); useEffect(() => setText(plain(cents)), [cents]);
  return <input className="amount" value={text} aria-label={label} onChange={e => setText(e.target.value)} onBlur={() => { if (/^\d+(\.\d{0,2})?$/.test(text)) onCommit(Math.round(Number(text) * 100)); else setText(plain(cents)); }} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />;
}
/* A working picker: type, pick with Enter or a click. Options come from the caller. */
function Picker({placeholder, options, onPick, compact, autoFocus}) {
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), list = options(q).slice(0, 9), ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const pick = o => { onPick(o); setQ(''); setOpen(false); };
  return <div className="picker"><div className={'describe' + (compact ? ' is-compact' : '')}><Icon name="search" size={16} /><input ref={ref} value={q} placeholder={placeholder} aria-label={placeholder} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={e => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); pick(list[0]); } if (e.key === 'Escape') setQ(''); }} /><kbd>Enter</kbd></div>
    {open && list.length > 0 && <div className="picker-menu">{list.map((o, i) => <button key={o.key} type="button" className={i === 0 ? 'is-first' : ''} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}><i style={{background: o.color}} /><span><b>{o.label}</b><small>{o.hint}</small></span>{o.on && <Icon name="check" size={14} />}</button>)}</div>}
  </div>;
}
const hit = (q, ...s) => !q || s.some(x => (x || '').toLowerCase().includes(q.toLowerCase()));
const tagOptions = (row, q) => Object.entries(tags).filter(([, t]) => (row.amount > 0) === (t.group === 'Income') && hit(q, t.name, t.group)).map(([id, t]) => ({key: 't' + id, kind: 'tag', id, label: t.name, hint: t.group, color: t.color, on: row.parts.some(p => p.kind === 'tag' && p.id === id)}));
const peopleOptions = (rows, row, q, verb) => people.filter(p => hit(q, p.name)).map(p => ({key: 'p' + p.id, kind: 'person', id: p.id, label: `${p.name}${verb ? ` ${verb}` : ''}`, hint: M.balance(rows, p.id) > 0 ? `owes you ${money(M.balance(rows, p.id))}` : 'nothing owed', color: p.color}));
const eventOptions = (row, q) => events.filter(e => hit(q, e.name, 'event')).map(e => ({key: 'e' + e.id, kind: 'event', id: e.id, label: e.name, hint: `${e.start} to ${e.end}${e.participants.length ? ` · split with ${e.participants.map(id => person(id).name).join(', ')}` : ''}`, color: e.color, on: row.event === e.id}));
const accountOptions = (rows, row, q) => accounts.filter(a => a.id !== row.account && hit(q, a.name, 'transfer', 'move')).map(a => { const twin = M.twins(rows, row).find(t => t.account === a.id); return {key: 'a' + a.id, kind: twin ? 'twin' : a.untracked ? 'untracked' : 'account', id: twin ? twin.id : a.id, label: `${row.amount < 0 ? 'To' : 'From'} ${a.name}`, hint: twin ? `${twin.name} · ${twin.date} · ${signed(twin)}` : a.untracked ? 'Own account, not imported' : 'No matching entry imported', color: a.color, disabled: !twin && !a.untracked}; });

/* ---- fixed slots, shared by all three approaches ---- */
function TagsSlot({rows, row, act, withPicker = true, compact}) {
  return <div className="slot"><div className="slot-head"><b>{row.amount > 0 ? 'Income tags' : 'Tags'}</b>{gap(row) > 0 && <small>{money(gap(row))} unsorted</small>}</div>
    {withPicker && <Picker compact={compact} placeholder={row.amount > 0 ? 'Income tag…' : 'Tag…'} options={q => tagOptions(row, q)} onPick={o => act(r => M.addTag(r, row.id, o.id))} />}
    <div className="chips">{row.parts.map((p, i) => { const v = M.partView(rows, p); if (p.kind !== 'tag') return null; return <span key={i} className="chip" style={{'--c': v.color}}><i /><b>{v.name}</b><AmountBox cents={p.cents} label={v.name} onCommit={c => act(r => M.setAmount(r, row.id, i, c))} /><button aria-label={`Remove ${v.name}`} onClick={() => act(r => M.removePart(r, row.id, i))}><Icon name="x" size={14} /></button></span>; })}{!row.parts.some(p => p.kind === 'tag') && <small className="quiet">Nothing tagged yet.</small>}</div></div>;
}
function SplitSlot({rows, row, act}) {
  const ids = row.shares ? row.shares.people.map(p => p.id) : [];
  return <div className="slot"><div className="slot-head"><b>Split</b><small>{row.shares ? `${row.shares.source === 'event' ? `follows ${event(row.event).name}` : 'custom'} · me ${money(row.shares.me)}` : 'just you'}</small></div>
    <div className="people-row">{people.map(p => { const share = row.shares?.people.find(x => x.id === p.id); return <span key={p.id} className={'chip is-person' + (share ? ' is-on' : '')} style={{'--c': p.color}}><button className="chip-toggle" aria-pressed={!!share} onClick={() => act(r => M.toggleShare(r, row.id, p.id))}><i />{p.name}</button>{share && <AmountBox cents={share.cents} label={`Share for ${p.name}`} onCommit={c => act(r => M.setShare(r, row.id, p.id, c))} />}</span>; })}</div></div>;
}
function EventSlot({row, act}) {
  return <div className="slot"><div className="slot-head"><b>Event</b>{row.event && <small>{event(row.event).start} to {event(row.event).end}</small>}</div>
    <div className="chips">{events.map(e => <button key={e.id} className={'chip is-event as-toggle' + (row.event === e.id ? ' is-on' : '')} style={{'--c': e.color}} aria-pressed={row.event === e.id} onClick={() => act(r => M.setEvent(r, row.id, e.id))}><Icon name="calendar-days" size={14} /><b>{e.name}</b></button>)}<button className="chip is-ghost as-toggle"><Icon name="plus" size={14} /><b>New</b></button></div></div>;
}
function RuleSlot({row, act}) {
  const [open, setOpen] = useState(false), r = row.rule, tagParts = row.parts.filter(p => p.kind === 'tag');
  const then = tagParts.map(p => `${tags[p.id].name} ${Math.round(p.cents / total(row) * 1000) / 10}%`).join(' · ') || 'no tags yet';
  return <div className="slot"><div className="slot-head"><b>Rule</b><small>{r.state === 'none' ? 'none' : r.state === 'exists' ? r.name : 'suggested'}</small></div>
    {r.state === 'exists' && <p className="quiet"><Icon name="repeat" size={14} /> {r.name} · matches <code>{r.pattern.replace('^', '')}</code> · {r.matches} so far <button className="link">Review</button></p>}
    {r.state === 'suggested' && <p className="quiet is-attn"><Icon name="repeat" size={14} /> {r.name} tagged this. <button className="primary small" onClick={() => act(x => M.confirmRule(x, row.id))}>Confirm</button> <button className="link">Edit rule</button></p>}
    {r.state === 'none' && !open && <p className="quiet"><Icon name="repeat" size={14} /> {tagParts.length ? <>Next time, <code>{r.pattern.replace('^', '')}</code> could get {then}. <button className="link" onClick={() => setOpen(true)}>Remember</button></> : 'Tag it, then remember the settings.'}</p>}
    {r.state === 'none' && open && <div className="rule-preview"><div className="rule-when"><small>When</small><span>description starts with <code>{r.pattern.replace('^', '')}</code> and money goes {row.amount < 0 ? 'out' : 'in'}</span></div><div className="rule-then"><small>Then</small><span>{then}{row.event ? ` · event ${event(row.event).name}` : ''}{row.payee ? ` · paid ${person(row.payee).name}` : ''}</span></div><div className="rule-options"><label><input type="radio" name={'m' + row.id} defaultChecked /> Apply and leave for me to confirm</label><label><input type="radio" name={'m' + row.id} /> Apply automatically</label><label><input type="checkbox" /> Also apply to {r.matches} past matches</label></div><div className="rule-actions"><button className="primary" onClick={() => { act(x => M.remember(x, row.id)); setOpen(false); }}>Save rule</button><button onClick={() => setOpen(false)}>Cancel</button></div></div>}
  </div>;
}
function MoveSlot({rows, row, act}) {
  const mv = row.parts.find(p => p.kind === 'move'), fee = row.parts.find(p => p.kind === 'fee'), other = mv && find(rows, mv.target), tw = M.twins(rows, row);
  return <div className="slot"><div className="slot-head"><b>Other account</b>{fee && <small>{money(fee.cents)} fee stays external</small>}</div>
    {mv ? <p className="quiet"><Icon name="link-2" size={14} /> {other ? <>Paired with <b>{other.name}</b> in {acct(other.account).name} on {other.date}</> : <>Moved to <b>{acct(mv.account).name}</b>, which you don't import</>}. <button className="link" onClick={() => act(r => M.unlink(r, row.id))}>Unlink</button></p>
    : <>{tw.map(t => <button key={t.id} className="cand" onClick={() => act(r => M.link(r, row.id, t.id))}><Dot color={acct(t.account).color} /><span><b>{t.name}</b><small>{acct(t.account).name} · {t.date} · {Math.abs(total(t) - total(row)) ? `${money(Math.abs(total(t) - total(row)))} difference` : 'same amount'}</small></span><strong>Pair</strong></button>)}
      <Picker compact placeholder="Own account…" options={q => accountOptions(rows, row, q)} onPick={o => act(r => o.kind === 'twin' ? M.link(r, row.id, o.id) : o.kind === 'untracked' ? M.moveTo(r, row.id, o.id) : r)} /></>}
  </div>;
}
function SettleSlot({rows, row, act}) {
  const offsets = row.parts.map((p, i) => ({p, i})).filter(x => x.p.kind === 'offset');
  return <div className="slot"><div className="slot-head"><b>Who is settling</b>{gap(row) > 0 && <small>{money(gap(row))} still unsorted</small>}</div>
    <Picker compact placeholder="Person or vendor…" options={q => [...peopleOptions(rows, row, q, 'settles'), ...(q && 'refund'.includes(q.toLowerCase()) ? [{key: 'refund', kind: 'refund', label: 'Refund from a vendor', hint: 'Reverses a purchase', color: '#a3b2d4'}] : [])]} onPick={o => act(r => o.kind === 'refund' ? M.refund(r, row.id, 'Vendor') : M.settle(r, row.id, o.id))} />
    {offsets.map(({p, i}) => { const who = p.person && person(p.person), before = who ? M.balance(rows, who.id) + p.cents : 0; return <div key={i} className="settle"><div className="settle-head"><Dot color={who ? who.color : '#a3b2d4'} /><b>{who ? who.name : 'Refund'}</b>{who && <small>owed {money(before)} → {money(before - p.cents)}</small>}<AmountBox cents={p.cents} label={`Settled by ${who ? who.name : 'refund'}`} onCommit={c => act(r => M.setAmount(r, row.id, i, c))} /><button aria-label="Remove" onClick={() => act(r => M.removePart(r, row.id, i))}><Icon name="x" size={14} /></button></div>{p.allocations.map(a => { const x = find(rows, a.id); return <div key={a.id} className="alloc"><span>{x.name}<small> · {x.date}{x.event ? ` · ${event(x.event).name}` : ''}</small></span><span className="num">{plain(a.cents)}</span></div>; })}{who && !p.allocations.length && <small className="quiet">Nothing open to settle.</small>}</div>; })}
    {!offsets.length && <small className="quiet">{people.filter(p => M.balance(rows, p.id) > 0).map(p => `${p.name} owes ${money(M.balance(rows, p.id))}`).join(' · ') || 'Nobody owes you anything right now.'}</small>}
  </div>;
}
function Balances({rows}) {
  return <aside className="balances"><h4>People</h4>{people.map(p => { const list = M.owedBy(rows, p.id), left = list.reduce((n, o) => n + o.left, 0); return <div key={p.id} className="bal"><Dot color={p.color} /><span><b>{p.name}</b><small>{list.length ? `${list.length} shared · ${money(list.reduce((n, o) => n + o.paid, 0))} settled` : 'nothing shared'}</small></span><strong className={left > 0 ? 'is-owed' : ''}>{left > 0 ? `owes ${money(left)}` : 'settled'}</strong></div>; })}</aside>;
}
const Head = ({rows, row, onToggle, children, open}) => <button className="row-main as-button" onClick={onToggle}><span className="check" /><span className="who"><Dot color={acct(row.account).color} /><b style={vt(`name-${row.id}`)}>{row.name}</b><small>{open ? `${acct(row.account).name} · ${row.date} · ${row.original}` : sub(row)}</small></span><span className="row-strip"><Strip rows={rows} row={row} name={`strip-${row.id}`} /></span><span className={'row-amount' + (row.amount > 0 ? ' is-in' : '')} style={vt(`amount-${row.id}`)}>{signed(row)}</span>{children}</button>;
const StatusPill = ({row}) => { const g = gap(row); return <span className={'status ' + (row.suggested ? 'is-suggested' : g ? 'is-open' : 'is-done')}>{row.suggested ? 'Confirm' : g ? `${money(g)} unsorted` : linked(row) ? 'Moved' : 'Sorted'}</span>; };

/* ---- Approach A: nature first ---- */
function NatureFirst({rows, row, act, open, onToggle}) {
  const nature = M.suggestNature(rows, row), choices = M.naturesFor(row), auto = !row.nature;
  return <li className={'row r4a' + (open ? ' is-open' : '')}><Head rows={rows} row={row} onToggle={onToggle} open={open} />
    {open && <div className="body is-indented"><div className="nature-bar"><div className="segc" role="group" aria-label="Nature">{choices.map(n => <button key={n} aria-pressed={nature === n} onClick={() => act(r => M.setNature(r, row.id, n))}>{natureLabel[n]}</button>)}</div><small>{auto ? `Suggested from ${nature === 'move' ? 'a matching entry in another account' : nature === 'offset' ? 'who sent it and what they owe' : 'the direction'}.` : 'Chosen by you.'}</small><StatusPill row={row} /></div>
      <div className={'slots n-' + nature}>
        {nature === 'move' && <MoveSlot rows={rows} row={row} act={act} />}
        {nature === 'spend' && <><TagsSlot rows={rows} row={row} act={act} /><SplitSlot rows={rows} row={row} act={act} /><EventSlot row={row} act={act} /><RuleSlot row={row} act={act} /></>}
        {nature === 'receive' && <><TagsSlot rows={rows} row={row} act={act} /><EventSlot row={row} act={act} /><RuleSlot row={row} act={act} /></>}
        {nature === 'offset' && <><SettleSlot rows={rows} row={row} act={act} /><TagsSlot rows={rows} row={row} act={act} compact /><EventSlot row={row} act={act} /></>}
        {nature === 'move' && <EventSlot row={row} act={act} />}
      </div></div>}
  </li>;
}

/* ---- Approach B: parts first ---- */
function PartsFirst({rows, row, act, open, onToggle}) {
  const options = q => [...accountOptions(rows, row, q).filter(o => !o.disabled || q), ...(row.amount > 0 ? peopleOptions(rows, row, q, 'settles').filter(o => M.balance(rows, o.id) > 0 || q) : []), ...tagOptions(row, q), ...eventOptions(row, q)];
  const pick = o => act(r => o.kind === 'tag' ? M.addTag(r, row.id, o.id) : o.kind === 'person' ? M.settle(r, row.id, o.id) : o.kind === 'event' ? M.setEvent(r, row.id, o.id) : o.kind === 'twin' ? M.link(r, row.id, o.id) : o.kind === 'untracked' ? M.moveTo(r, row.id, o.id) : r);
  return <li className={'row r4b' + (open ? ' is-open' : '')}><Head rows={rows} row={row} onToggle={onToggle} open={open} />
    {open && <div className="body is-indented"><div className="parts-grid"><div>
      <Picker placeholder={row.amount > 0 ? 'Tag, who settled, event or account…' : 'Tag, event or account…'} options={options} onPick={pick} autoFocus />
      <div className="partlist-4">{row.parts.map((p, i) => { const v = M.partView(rows, p); return <div key={i} className="part-row"><span className={'nature-tag n-' + v.nature}>{natureLabel[v.nature] || 'Fee'}</span><Dot color={v.color} /><b>{v.name}</b>{p.kind === 'offset' && p.allocations?.length > 0 && <small>{p.allocations.map(a => find(rows, a.id).name).join(', ')}</small>}{p.kind === 'move' || p.kind === 'fee' ? <span className="amount static">{plain(p.cents)}</span> : <AmountBox cents={p.cents} label={v.name} onCommit={c => act(r => M.setAmount(r, row.id, i, c))} />}{p.kind !== 'fee' && <button aria-label="Remove" onClick={() => act(r => M.removePart(r, row.id, i))}><Icon name="x" size={14} /></button>}</div>; })}{gap(row) > 0 && <div className="part-row is-gap"><span className="nature-tag" /><i className="dot gapdot" /><b>Unsorted</b><span className="amount static">{plain(gap(row))}</span></div>}</div>
      </div><div className="ctx-stack">{row.amount < 0 && !linked(row) && <SplitSlot rows={rows} row={row} act={act} />}<EventSlot row={row} act={act} />{!linked(row) && <RuleSlot row={row} act={act} />}{linked(row) && <MoveSlot rows={rows} row={row} act={act} />}</div></div></div>}
  </li>;
}

/* ---- Approach C: who first ---- */
function WhoFirst({rows, row, act, open, onToggle}) {
  const mv = row.parts.find(p => p.kind === 'move'), offsetWho = row.parts.find(p => p.kind === 'offset')?.person, guess = M.guessPerson(row);
  const side = mv ? {kind: 'account', label: mv.target ? acct(find(rows, mv.target).account).name : acct(mv.account).name, color: '#7a7a7a'} : offsetWho ? {kind: 'person', id: offsetWho} : row.payee ? {kind: 'person', id: row.payee, payee: true} : {kind: 'vendor', label: row.name};
  const options = q => [...peopleOptions(rows, row, q, row.amount > 0 ? '' : '(paid them back)'), ...accountOptions(rows, row, q), {key: 'vendor', kind: 'vendor', label: row.name, hint: 'A vendor: tag it', color: 'var(--data-neutral)'}];
  const pick = o => act(r => o.kind === 'person' ? (row.amount > 0 ? M.settle(r, row.id, o.id) : M.setPayee(r, row.id, o.id)) : o.kind === 'twin' ? M.link(r, row.id, o.id) : o.kind === 'untracked' ? M.moveTo(r, row.id, o.id) : o.kind === 'vendor' ? (linked(row) ? M.unlink(r, row.id) : r) : r);
  return <li className={'row r4c' + (open ? ' is-open' : '')}><Head rows={rows} row={row} onToggle={onToggle} open={open} />
    {open && <div className="body is-indented"><div className="who-grid"><div className="slot"><div className="slot-head"><b>Other side</b><small>{side.kind === 'account' ? 'your own account · a move' : side.kind === 'person' ? (side.payee ? 'a person you paid · your cost' : 'a person settling up') : row.amount > 0 ? 'the world · income' : 'a vendor · your spending'}</small></div>
        <div className="side-now">{side.kind === 'person' ? <><Dot color={person(side.id).color} /><b>{person(side.id).name}</b><small>{M.balance(rows, side.id) > 0 ? `owes you ${money(M.balance(rows, side.id))}` : 'nothing owed'}</small></> : side.kind === 'account' ? <><Icon name="arrow-left-right" size={14} /><b>{side.label}</b></> : <><Dot color="var(--data-neutral)" /><b>{row.name}</b>{guess && row.amount > 0 && !offsetWho && <button className="link" onClick={() => act(r => M.settle(r, row.id, guess))}>Looks like {person(guess).name}</button>}{M.twins(rows, row).slice(0, 1).map(t => <button key={t.id} className="link" onClick={() => act(r => M.link(r, row.id, t.id))}>Looks like {acct(t.account).name}</button>)}</>}</div>
        <Picker compact placeholder="Change who…" options={options} onPick={pick} /></div>
        {side.kind === 'account' ? <MoveSlot rows={rows} row={row} act={act} /> : side.kind === 'person' && !side.payee ? <SettleSlot rows={rows} row={row} act={act} /> : null}
      </div>
      {side.kind !== 'account' && <div className="slots n-spend">{(side.kind !== 'person' || side.payee || gap(row) > 0) && <TagsSlot rows={rows} row={row} act={act} compact />}{row.amount < 0 && <SplitSlot rows={rows} row={row} act={act} />}<EventSlot row={row} act={act} /><RuleSlot row={row} act={act} /></div>}
      {side.kind === 'account' && <div className="slots"><EventSlot row={row} act={act} /></div>}
      <div className="foot"><StatusPill row={row} /></div></div>}
  </li>;
}

export const R4 = {
  1: {title: 'Nature first', note: 'You say what kind of line it is (or accept the suggestion), and the card takes that nature\'s fixed shape: Move, Spend, Receive or Offset. Every slot is visible; nothing hides behind a tap.', Row: NatureFirst},
  2: {title: 'Parts first', note: 'One box adds typed parts: a tag is a Spend part, a person is an Offset part that draws down their balance, an account is a Move. The nature is read off the parts. Split, event and rule stand to the right, always visible.', Row: PartsFirst},
  3: {title: 'Who first', note: 'The first question is who is on the other side: a vendor, a person or your own account. The answer decides the card. People keep a running balance, shown at the right of the list.', Row: WhoFirst, Balances},
};
