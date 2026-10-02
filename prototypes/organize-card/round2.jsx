// Round two: the closed row is the open card's header. Name, amount and strip keep one identity
// (view-transition names) so opening a row moves them rather than repeating them.
import React, {useState} from 'react';
import {Icon} from '@derekurban/design-system';
import {events, money, plain, person, event, gapOf} from './scenarios.mjs';
import {parts, total, signed, ink, vt, Describe, Strip, Chip, GapChip, Dot, RuleBlock, SplitRows, Meta, Status, EventChip, Candidates, ContextRows, RowHead} from './shared.jsx';

const Who = ({s, sub}) => <span className="who"><Dot color={s.account.color} /><b style={vt(`name-${s.id}`)}>{s.name}</b><small>{sub ?? `${s.account.name} · ${s.date} · ${s.original}`}</small></span>;
const Amt = ({s, big}) => <span className={'row-amount' + (s.amount > 0 ? ' is-in' : '') + (big ? ' is-big' : '')} style={vt(`amount-${s.id}`)}>{signed(s)}</span>;
const PartTable = ({s}) => <table className="partlist"><tbody>{parts(s).map((p, i) => <tr key={i}><td><Dot color={p.color} />{p.name}<small>{p.sub}</small></td><td className="num"><input className="amount" defaultValue={plain(p.cents)} aria-label={p.name} /></td><td><button className="icon" aria-label="Remove"><Icon name="x" size={14} /></button></td></tr>)}{gapOf(s) > 0 && <tr className="gap"><td>Unsorted</td><td className="num">{plain(gapOf(s))}</td><td /></tr>}</tbody></table>;

export const R2 = {};

/* 1 · Strip grows. Baseline, deduplicated: the header keeps name and amount, the row's own strip drops
   under them and grows into the editor; original and date fold into the header subtitle. */
R2[1] = {title: 'Strip grows', note: 'Baseline without the repeats. The row\'s strip is the editor strip: it drops under the name and grows. Original and date move into the subtitle, so the side column goes away.',
  Row: ({s, open, onToggle}) => <li className={'row r1' + (open ? ' is-open' : '')}>
    {!open ? <button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={`${s.account.name}${s.event ? ` · ${event(s.event).name}` : ''}`} /><span className="row-strip"><Strip s={s} name={`strip-${s.id}`} /></span><Amt s={s} /></button>
    : <div className="open">
      <button className="row-main as-button is-head" onClick={onToggle}><span className="check" /><Who s={s} /><span /><Amt s={s} /></button>
      <div className="body"><Strip s={s} height={44} handles name={`strip-${s.id}`} /><Describe s={s} /><div className="chips">{parts(s).map((p, i) => <Chip key={i} p={p} onRemove />)}<GapChip s={s} /><EventChip s={s} /></div><SplitRows s={s} /><Candidates s={s} /><RuleBlock s={s} /><div className="foot"><button className="link">Original file ↗</button><Status s={s} /></div></div>
    </div>}
  </li>};

/* 2 · Band. Focus header without a second header: the row itself becomes the band. */
R2[2] = {title: 'Band', note: 'Focus header, but the row is the band. The strip swells to fill the row behind the name and amount; tiles and part rows hang beneath. Nothing is drawn twice.',
  Row: ({s, open, onToggle}) => <li className={'row r2' + (open ? ' is-open' : '')}>
    {!open ? <button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={`${s.account.name}${s.event ? ` · ${event(s.event).name}` : ''}`} /><span className="row-strip"><Strip s={s} name={`strip-${s.id}`} /></span><Amt s={s} /></button>
    : <div className="open">
      <button className="band-row as-button" onClick={onToggle}><Strip s={s} height={64} name={`strip-${s.id}`} /><span className="plate"><Who s={s} sub={`${s.account.name} · ${s.date}`} /></span><span className="plate is-amount"><Amt s={s} big /></span></button>
      <div className="body"><Describe s={s} /><div className="tiles"><div className="tile"><small><Icon name="users" size={14} /> {s.kind === 'income' ? 'From' : 'Split'}</small><b>{s.shares ? `${s.shares.people.length + 1} ways` : s.person ? person(s.person).name : 'Just you'}</b><span>{s.shares ? `me ${money(s.shares.me)} · ${s.shares.people.filter(p => p.repaid < p.cents).length} still owe` : s.kind === 'expense' ? 'Share it' : ''}</span></div><div className="tile"><small><Icon name="calendar-days" size={14} /> Event</small><b>{s.event ? event(s.event).name : 'None'}</b><span>{s.event ? `${event(s.event).start} to ${event(s.event).end}` : 'Add context'}</span></div><div className="tile"><small><Icon name="repeat" size={14} /> Rule</small><b>{s.rule.state === 'none' ? 'None' : s.rule.state === 'exists' ? 'On' : 'Suggested'}</b><span>{s.rule.state === 'none' ? 'Remember these settings' : s.rule.name}</span></div></div><PartTable s={s} /><Candidates s={s} /><div className="foot"><small>{s.original}</small><button className="link">Original file ↗</button></div></div>
    </div>}
  </li>};

/* 3 · Halves. Money and context aligned to the row's own halves: context grows under the name,
   the parts grow under the strip, the status sits under the amount. The header line never changes. */
R2[3] = {title: 'Halves', note: 'Money and context, aligned to the row. The header line stays exactly as it was; context grows under the name, the parts list grows under the strip, status under the amount.',
  Row: ({s, open, onToggle}) => <li className={'row r3' + (open ? ' is-open' : '')}>
    <button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={`${s.account.name}${s.event ? ` · ${event(s.event).name}` : ''}`} /><span className="row-strip"><Strip s={s} height={open ? 36 : 20} handles={open} name={`strip-${s.id}`} /></span><Amt s={s} /></button>
    {open && <div className="halves"><span /><div><Describe s={s} /><ContextRows s={s} /></div><div><PartTable s={s} /><Candidates s={s} /></div><div className="status-col"><Status s={s} /><small>{gapOf(s) ? 'Type a tag above or drag a boundary.' : 'Saved'}</small></div></div>}
  </li>};

/* 4 · Lift. Inspector, but the row's name, amount and strip lift into the panel; the list keeps a slim marker. */
R2[4] = {title: 'Lift', note: 'Inspector without the copy. The row\'s name, amount and strip lift into the docked panel; what stays in the list is a slim marker, so the list and the panel never show the same thing.',
  Row: ({s, open, onToggle}) => <li className={'row r4' + (open ? ' is-lifted' : '')}>
    <button className="row-main as-button" onClick={onToggle}><span className="check" />{open ? <span className="who"><Dot color={s.account.color} /><small>{s.name} · editing in the panel</small></span> : <Who s={s} sub={`${s.account.name}${s.event ? ` · ${event(s.event).name}` : ''}`} />}<span className="row-strip">{!open && <Strip s={s} name={`strip-${s.id}`} />}</span>{!open && <Amt s={s} />}{open && <span className="row-amount"><Icon name="chevron-right" size={16} /></span>}</button>
  </li>,
  Panel: ({s, onClose}) => <Panel s={s} onClose={onClose} />};
function Panel({s, onClose}) {
  const [tab, setTab] = useState('amount');
  const tabs = [['amount', 'Amount'], [ 'context', 'Context'], ['rule', 'Rule']];
  return <aside className="inspector r4-panel"><header><Who s={s} sub={`${s.account.name} · ${s.date}`} /><Amt s={s} big /><button className="icon" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></header>
    <Strip s={s} height={40} handles name={`strip-${s.id}`} /><Describe s={s} />
    <nav className="tabs">{tabs.map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'amount' && <><div className="chips">{parts(s).map((p, i) => <Chip key={i} p={p} onRemove />)}<GapChip s={s} /></div><Candidates s={s} /></>}
    {tab === 'context' && <><ContextRows s={s} compact /><SplitRows s={s} dense /></>}
    {tab === 'rule' && <RuleBlock s={s} layout="inspector" />}
    <footer><Status s={s} /><small>{s.original}</small></footer></aside>;
}

/* 5 · Strip is the editor. The row's strip grows and its segments take amount fields; everything else is one facts line. */
R2[5] = {title: 'Strip is the editor', note: 'No parts list at all. The row\'s strip grows and each segment takes its own amount field and remove button. Under it, one line of facts: split, event, rule, source. Click a fact to open just that panel.',
  Row: ({s, open, onToggle}) => <StripEditor s={s} open={open} onToggle={onToggle} />};
function StripEditor({s, open, onToggle}) {
  const [panel, setPanel] = useState('');
  const fact = (id, icon, label, value, color) => <button key={id} className={'fact-chip' + (panel === id ? ' is-on' : '')} style={color ? {'--c': color} : undefined} onClick={() => setPanel(panel === id ? '' : id)}><Icon name={icon} size={14} /><b>{label}</b><span>{value}</span></button>;
  return <li className={'row r5' + (open ? ' is-open' : '')}>
    <button className={'row-main as-button' + (open ? ' is-stacked' : '')} onClick={onToggle}><span className="check" /><Who s={s} sub={open ? `${s.account.name} · ${s.date} · ${s.original}` : `${s.account.name}${s.event ? ` · ${event(s.event).name}` : ''}`} />{!open && <span className="row-strip"><Strip s={s} name={`strip-${s.id}`} /></span>}<Amt s={s} /></button>
    {open && <div className="body"><div onClick={e => e.stopPropagation()}><Strip s={s} height={48} editable handles name={`strip-${s.id}`} /></div><Describe s={s} /><div className="facts-line">
      {s.kind !== 'income' && fact('split', 'users', 'Split', s.shares ? `${s.shares.people.map(p => person(p.id).name).join(', ')} · me ${money(s.shares.me)}` : 'just you')}
      {s.kind === 'income' && s.person && fact('from', 'user', 'From', person(s.person).name, person(s.person).color)}
      {fact('event', 'calendar-days', 'Event', s.event ? event(s.event).name : 'none', s.event ? event(s.event).color : undefined)}
      {fact('rule', 'repeat', 'Rule', s.rule.state === 'none' ? 'none · remember' : s.rule.state === 'exists' ? 'on' : 'suggested · confirm')}
      <Status s={s} /></div>
      {panel === 'split' && <SplitRows s={s} dense />}{panel === 'event' && <div className="chips">{events.map(e => <span key={e.id} className={'chip is-event' + (s.event === e.id ? ' is-on' : '')} style={{'--c': e.color}}><Icon name="calendar-days" size={14} /><b>{e.name}</b></span>)}</div>}{panel === 'rule' && <RuleBlock s={s} layout="facts" />}{panel === 'from' && <Candidates s={s} />}
      {s.kind === 'income' && panel !== 'from' && <Candidates s={s} />}
    </div>}
  </li>;
}

/* 6 · Band with a rail. The band header from 2 and the context rail from 3 in one card. */
R2[6] = {title: 'Band with a rail', note: 'The band header from 2 with the context column from 3. Money under the band on the left, context as a rail on the right. The row is the band; nothing repeats.',
  Row: ({s, open, onToggle}) => <li className={'row r6' + (open ? ' is-open' : '')}>
    {!open ? <button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={`${s.account.name}${s.event ? ` · ${event(s.event).name}` : ''}`} /><span className="row-strip"><Strip s={s} name={`strip-${s.id}`} /></span><Amt s={s} /></button>
    : <div className="open">
      <button className="band-row as-button" onClick={onToggle}><Strip s={s} height={64} name={`strip-${s.id}`} /><span className="plate"><Who s={s} sub={`${s.account.name} · ${s.date}`} /></span><span className="plate is-amount"><Amt s={s} big /></span></button>
      <div className="rail"><div><Describe s={s} /><div className="chips">{parts(s).map((p, i) => <Chip key={i} p={p} onRemove />)}<GapChip s={s} /></div><Candidates s={s} /><SplitRows s={s} dense /></div><div className="ctx-rail"><ContextRows s={s} /><Status s={s} /></div></div>
    </div>}
  </li>};
