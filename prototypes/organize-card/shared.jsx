import React, {useState} from 'react';
import {Icon} from '@derekurban/design-system';
import {people, events, tags, money, plain, person, event, partView, gapOf} from './scenarios.mjs';

export const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
export const ink = hex => lum(hex) > 0.62 ? '#1b1b1b' : '#fafafa';
export const parts = s => s.parts.map(partView);
export const total = s => Math.abs(s.amount);
export const signed = s => (s.amount < 0 ? '−' : '+') + money(s.amount);
export const sorted = s => gapOf(s) === 0 && !s.suggested;
export const vt = name => ({viewTransitionName: name});

export function Describe({s, compact, autoFocus}) {
  const ph = s.kind === 'income' ? 'Tag, who paid you back, event or account…' : s.kind === 'transfer' ? 'Event…' : 'Tag, shared with someone, event or account…';
  return <div className={'describe' + (compact ? ' is-compact' : '')}><Icon name="search" size={16} /><input placeholder={ph} aria-label="Describe this transaction" readOnly autoFocus={autoFocus} /><kbd>Enter</kbd></div>;
}
/* The strip. `editable` puts an amount field inside each segment so the strip itself is the editor. */
export function Strip({s, height = 20, labels = true, amounts = false, handles = false, editable = false, name}) {
  const ps = parts(s), gap = gapOf(s), ref = React.useRef(null), [pos, setPos] = useState([]);
  const segs = [...ps, ...(gap > 0 ? [{name: 'Unsorted', cents: gap, gap: true}] : [])];
  React.useLayoutEffect(() => {
    if (!handles || !ref.current) return;
    const measure = () => { const t = ref.current; if (!t) return; const b = t.getBoundingClientRect(), r = [...t.querySelectorAll('.seg')].map(e => e.getBoundingClientRect()); setPos(r.slice(0, -1).map((a, i) => (a.right + r[i + 1].left) / 2 - b.left)); };
    measure(); const ro = new ResizeObserver(measure); ro.observe(ref.current); return () => ro.disconnect();
  }, [handles, s.id, segs.length, height]);
  return <div ref={ref} className={'strip' + (segs.length === 1 && segs[0].gap ? ' is-empty' : '') + (editable ? ' is-editable' : '')} style={{height, ...(name ? vt(name) : {})}}>
    {segs.map((p, i) => <div key={i} className={'seg' + (p.gap ? ' is-gap' : '')} style={p.gap ? {flexGrow: p.cents} : {flexGrow: p.cents, background: p.color, color: ink(p.color)}}>
      {labels && <span className="seg-label">{p.name}</span>}
      {editable && !p.gap ? <input className="seg-input" defaultValue={plain(p.cents)} aria-label={`Amount for ${p.name}`} /> : amounts && <span className="seg-amount">{plain(p.cents)}</span>}
      {editable && !p.gap && <button className="seg-x" aria-label={`Remove ${p.name}`}><Icon name="x" size={12} /></button>}
    </div>)}
    {handles && pos.map((left, i) => <span key={'h' + i} className="handle" style={{left}} />)}
  </div>;
}
export function Amount({cents, label}) { return <input className="amount" defaultValue={plain(cents)} aria-label={label} readOnly={label === undefined} />; }
export function Chip({p, onRemove, dot = true}) {
  return <span className="chip" style={{'--c': p.color}}>{dot && <i />}<b>{p.name}</b><Amount cents={p.cents} label={p.name} />{onRemove && <button aria-label={`Remove ${p.name}`}><Icon name="x" size={14} /></button>}</span>;
}
export function GapChip({s}) { const g = gapOf(s); return g > 0 ? <span className="chip is-gap"><i /><b>Unsorted</b><span className="amount static">{plain(g)}</span></span> : null; }
export function Dot({color}) { return <i className="dot" style={{background: color}} />; }

/* Rule state: none, exists, suggested. "Remember" shows exactly what it would create. */
export function RuleBlock({s, layout = 'card'}) {
  const [open, setOpen] = useState(false);
  const r = s.rule, tagParts = s.parts.filter(p => p.kind === 'tag');
  const weights = tagParts.map(p => `${tags[p.id].name} ${Math.round(p.cents / Math.max(1, total(s)) * 1000) / 10}%`).join(' · ');
  const can = tagParts.length > 0 || s.person;
  const preview = <div className="rule-preview">
    <div className="rule-when"><small>When</small><span>description starts with <code>{r.pattern.replace('^', '')}</code> and money goes {r.direction}</span></div>
    <div className="rule-then"><small>Then</small><span>{weights || 'no tags yet'}{s.person ? ` · person ${person(s.person).name}` : ''}{s.event ? ` · event ${event(s.event).name}` : ''}</span></div>
    <div className="rule-options"><label><input type="radio" name={'mode' + layout} defaultChecked /> Apply and leave for me to confirm</label><label><input type="radio" name={'mode' + layout} /> Apply automatically</label><label><input type="checkbox" /> Also apply to {r.matches} past {r.matches === 1 ? 'match' : 'matches'}</label></div>
    <div className="rule-actions"><button className="primary">Save rule</button><button onClick={() => setOpen(false)}>Cancel</button></div>
  </div>;
  if (r.state === 'exists') return <div className={'rule rule-' + layout}><Icon name="repeat" size={14} /><span><b>{r.name}</b><small>Applies to new imports matching <code>{r.pattern.replace('^', '')}</code> · {r.matches} so far</small></span><button className="link">Review rule</button></div>;
  if (r.state === 'suggested') return <div className={'rule rule-' + layout + ' is-suggested'}><Icon name="repeat" size={14} /><span><b>Suggested by {r.name}</b><small>Confirm to keep it, or change the tags and the rule learns nothing.</small></span><button className="primary small">Confirm</button><button className="link">Edit rule</button></div>;
  return <div className={'rule rule-' + layout}>
    <Icon name="repeat" size={14} /><span><b>No rule for {s.name}</b><small>{can ? `${r.matches} past ${r.matches === 1 ? 'match' : 'matches'} would get these settings next time.` : 'Tag it first, then remember the settings.'}</small></span>
    {can && !open && <button className="link" onClick={() => setOpen(true)}>Remember</button>}
    {open && preview}
  </div>;
}
export function SplitRows({s, dense}) {
  if (!s.shares) return null;
  const ev = s.event && event(s.event);
  return <div className={'split' + (dense ? ' is-dense' : '')}>
    <div className="split-head"><b>Split</b><small>Your share {money(s.shares.me)}{s.shares.source === 'event' && ev ? ` · follows ${ev.name}` : ' · custom'}</small>{s.shares.source !== 'event' && <button className="link">Split evenly</button>}</div>
    {s.shares.people.map(p => { const who = person(p.id); return <div key={p.id} className="split-row"><Dot color={who.color} /><b>{who.name}</b><Amount cents={p.cents} label={`Share for ${who.name}`} /><small>{p.repaid >= p.cents ? `repaid ${money(p.repaid)} · settled` : p.repaid ? `repaid ${money(p.repaid)} · ${money(p.cents - p.repaid)} still owed` : 'nothing repaid yet'}</small><button aria-label={`Remove ${who.name}`}><Icon name="x" size={14} /></button></div>; })}
    <div className="split-row is-me"><Dot color="var(--data-neutral)" /><b>Me</b><span className="amount static">{plain(s.shares.me)}</span><small>your share</small></div>
  </div>;
}
export function Meta({s, inline, noOriginal}) {
  return <dl className={'meta' + (inline ? ' is-inline' : '')}>{!noOriginal && <><dt>Original</dt><dd>{s.original}</dd></>}<dt>Account</dt><dd><Dot color={s.account.color} />{s.account.name}</dd><dt>Date</dt><dd>{s.date}</dd><dd><button className="link">Original file ↗</button></dd></dl>;
}
export function Status({s}) {
  const g = gapOf(s);
  return <span className={'status ' + (s.suggested ? 'is-suggested' : g ? 'is-open' : 'is-done')}>{s.kind === 'transfer' ? 'Internal transfer' : s.suggested ? 'Suggested · confirm' : g ? `${money(g)} unsorted` : 'Sorted'}</span>;
}
export function EventChip({s}) { const ev = s.event && event(s.event); return ev ? <span className="chip is-event" style={{'--c': ev.color}}><Icon name="calendar-days" size={14} /><b>{ev.name}</b><button aria-label="Remove event"><Icon name="x" size={14} /></button></span> : null; }
export function Candidates({s}) {
  if (!s.candidates || !gapOf(s)) return null;
  return <div className="cands"><div className="split-head"><b>{person(s.person).name} paid you back for…</b><small>{money(gapOf(s))} still unsorted</small></div>{s.candidates.map(c => <button key={c.name} className="cand"><Dot color={s.account.color} /><span><b>{c.name}</b><small>{c.date} · {person(s.person).name}'s share · {money(c.left)} left</small></span><strong>Apply {money(Math.min(c.left, gapOf(s)))}</strong></button>)}<button className="link">Share another expense with {person(s.person).name}</button></div>;
}
/* Context rows: event, split, rule, source. Shared by the layouts that give context its own column. */
export function ContextRows({s, compact}) {
  const rows = [
    ['calendar-days', 'Event', s.event ? event(s.event).name : 'None', s.event ? 'Change' : 'Add'],
    ['users', s.kind === 'income' ? 'From' : 'Split', s.shares ? `${s.shares.people.map(p => `${person(p.id).name} ${money(p.cents)}`).join(' · ')} · me ${money(s.shares.me)}` : s.kind === 'expense' ? 'Just you' : s.person ? person(s.person).name : 'None', s.shares ? 'Edit' : s.kind === 'expense' ? 'Share' : ''],
    ['repeat', 'Rule', s.rule.state === 'none' ? `None for ${s.name}` : s.rule.state === 'exists' ? s.rule.name : `Suggested by ${s.rule.name}`, s.rule.state === 'none' ? 'Remember' : s.rule.state === 'suggested' ? 'Confirm' : 'Review'],
    ['file-text', 'Source', `${s.original} · ${s.date}`, 'Open'],
  ];
  return <div className={'ctxs' + (compact ? ' is-compact' : '')}>{rows.map(([icon, label, value, action]) => <div key={label} className="ctx"><Icon name={icon} size={16} /><span><b>{label}</b><small>{value}</small></span>{action && <button className="link">{action}</button>}</div>)}</div>;
}
export function RowHead({s, children, names}) {
  return <div className="row-main"><span className="check" /><span className="who"><Dot color={s.account.color} /><b style={names ? vt(`name-${s.id}`) : undefined}>{s.name}</b><small>{s.account.name}{s.event ? ` · ${event(s.event).name}` : ''}{s.shares ? ` · shared with ${s.shares.people.map(p => person(p.id).name).join(', ')}` : ''}</small></span><span className="row-strip"><Strip s={s} name={names ? `strip-${s.id}` : undefined} /></span><span className={'row-amount' + (s.amount > 0 ? ' is-in' : '')} style={names ? vt(`amount-${s.id}`) : undefined}>{signed(s)}</span>{children}</div>;
}
