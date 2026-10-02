// Round three: Halves and Strip-is-the-editor, varied. The header line is the card's header, the strip
// is the tag editor, event / people / rule each have their own place, and the source is tucked away.
import React, {useState} from 'react';
import {Icon} from '@derekurban/design-system';
import {events, money, plain, person, event, gapOf} from './scenarios.mjs';
import {parts, signed, vt, Describe, Strip, Dot, RuleBlock, SplitRows, Status, Candidates} from './shared.jsx';

const Who = ({s, sub, onInfo, info}) => <span className="who"><Dot color={s.account.color} /><b style={vt(`name-${s.id}`)}>{s.name}</b><small>{sub}{onInfo && <button className={'info' + (info ? ' is-on' : '')} aria-label="Details" onClick={e => { e.stopPropagation(); onInfo(); }}><Icon name="info" size={13} /></button>}</small></span>;
const Amt = ({s}) => <span className={'row-amount' + (s.amount > 0 ? ' is-in' : '')} style={vt(`amount-${s.id}`)}>{signed(s)}</span>;
const Details = ({s}) => <div className="details-line"><span>{s.original}</span><span>{s.account.name}</span><span>{s.date}</span><button className="link">Original file ↗</button></div>;
const sub = s => `${s.account.name}${s.event ? ` · ${event(s.event).name}` : ''}`;

/* The three context facts. `mode` is rows (own lines), tiles (three quiet columns) or line (one sentence). */
function Facts({s, mode, panel, setPanel}) {
  const items = [];
  if (s.kind !== 'income') items.push({id: 'split', icon: 'users', label: 'Split', value: s.shares ? `${s.shares.people.map(p => person(p.id).name).join(', ')} · me ${money(s.shares.me)}` : 'Just you', action: s.shares ? 'Edit' : 'Share'});
  if (s.kind === 'income' && s.person) items.push({id: 'from', icon: 'user', label: 'From', value: person(s.person).name, action: gapOf(s) ? 'Apply more' : '', color: person(s.person).color});
  items.push({id: 'event', icon: 'calendar-days', label: 'Event', value: s.event ? event(s.event).name : 'None', action: s.event ? 'Change' : 'Add', color: s.event ? event(s.event).color : undefined});
  items.push({id: 'rule', icon: 'repeat', label: 'Rule', value: s.rule.state === 'none' ? 'None' : s.rule.state === 'exists' ? s.rule.name : `Suggested by ${s.rule.name}`, action: s.rule.state === 'none' ? 'Remember' : s.rule.state === 'suggested' ? 'Confirm' : 'Review', open: s.rule.state === 'suggested'});
  const toggle = id => setPanel(panel === id ? '' : id);
  if (mode === 'line') return <div className="facts-sentence">{items.map((f, i) => <React.Fragment key={f.id}>{i > 0 && <span className="sep">·</span>}<button className={'fact-text' + (panel === f.id ? ' is-on' : '') + (f.open ? ' is-attn' : '')} onClick={() => toggle(f.id)}><Icon name={f.icon} size={14} /><span>{f.label === 'Event' && s.event ? f.value : f.label === 'Split' && s.shares ? `Split with ${f.value}` : f.label === 'From' ? `From ${f.value}` : f.label === 'Rule' ? (s.rule.state === 'none' ? 'No rule' : s.rule.state === 'exists' ? 'Rule on' : 'Rule suggested') : f.label === 'Event' ? 'No event' : 'Just you'}</span></button></React.Fragment>)}</div>;
  if (mode === 'tiles') return <div className="facts-tiles">{items.map(f => <button key={f.id} className={'fact-tile' + (panel === f.id ? ' is-on' : '') + (f.open ? ' is-attn' : '')} onClick={() => toggle(f.id)}><small><Icon name={f.icon} size={14} /> {f.label}</small><b>{f.value}</b><span>{f.action}</span></button>)}</div>;
  return <div className="facts-rows">{items.map(f => <button key={f.id} className={'fact-row' + (panel === f.id ? ' is-on' : '') + (f.open ? ' is-attn' : '')} onClick={() => toggle(f.id)}><Icon name={f.icon} size={16} /><span><b>{f.label}</b><small>{f.value}</small></span><em>{f.action}</em></button>)}</div>;
}
function FactPanel({s, panel}) {
  if (panel === 'split') return <SplitRows s={s} dense />;
  if (panel === 'from') return <Candidates s={s} />;
  if (panel === 'event') return <div className="chips">{events.map(e => <span key={e.id} className={'chip is-event' + (s.event === e.id ? ' is-on' : '')} style={{'--c': e.color}}><Icon name="calendar-days" size={14} /><b>{e.name}</b></span>)}<span className="chip is-ghost"><Icon name="plus" size={14} /><b>New event</b></span></div>;
  if (panel === 'rule') return <RuleBlock s={s} layout="facts" />;
  return null;
}
function useCard() { const [panel, setPanel] = useState(''), [info, setInfo] = useState(false); return {panel, setPanel, info, toggleInfo: () => setInfo(v => !v)}; }
const Closed = ({s, onToggle, cls}) => <li className={'row ' + cls}><button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={sub(s)} /><span className="row-strip"><Strip s={s} name={`strip-${s.id}`} /></span><Amt s={s} /></button></li>;

export const R3 = {};

/* 1 · Halves, strip in place. Header unchanged; the strip grows in its own column and becomes the editor.
   Context rows under the name, repayment candidates or an opened fact panel under the strip, status under the amount. */
R3[1] = {title: 'Halves, strip in place', note: 'The header line does not move. The strip grows inside its own column and becomes the editor. Under the name: the describe box and three context rows. Under the strip: whatever you open. Source behind the info mark.',
  Row: ({s, open, onToggle}) => { const c = useCard(); if (!open) return <Closed s={s} onToggle={onToggle} cls="r31" />; return <li className="row r31 is-open">
    <button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={sub(s)} onInfo={c.toggleInfo} info={c.info} /><span className="row-strip"><Strip s={s} height={44} editable handles name={`strip-${s.id}`} /></span><Amt s={s} /></button>
    <div className="halves halves-3"><span /><div><Describe s={s} /><Facts s={s} mode="rows" panel={c.panel} setPanel={c.setPanel} /></div><div className="under-strip"><FactPanel s={s} panel={c.panel} />{!c.panel && s.kind === 'income' && <Candidates s={s} />}{!c.panel && s.kind !== 'income' && <p className="quiet">{gapOf(s) ? `${money(gapOf(s))} still unsorted. Type a tag, or drag a boundary.` : 'Sorted.'}</p>}</div><div className="status-col"><Status s={s} /></div></div>
    {c.info && <Details s={s} />}
  </li>; }};

/* 2 · Strip wide, three facts. The strip drops under the header full width as the editor; the describe box;
   then split, event and rule as three quiet columns that open a panel beneath. */
R3[2] = {title: 'Strip wide, three facts', note: 'Strip-is-the-editor with context as three quiet columns instead of chips: split, event, rule. Each opens its panel beneath. No boxes around anything until you open something.',
  Row: ({s, open, onToggle}) => { const c = useCard(); if (!open) return <Closed s={s} onToggle={onToggle} cls="r32" />; return <li className="row r32 is-open">
    <button className="row-main as-button is-head" onClick={onToggle}><span className="check" /><Who s={s} sub={`${s.account.name} · ${s.date}`} onInfo={c.toggleInfo} info={c.info} /><span /><Amt s={s} /></button>
    <div className="body"><Strip s={s} height={48} editable handles name={`strip-${s.id}`} /><Describe s={s} /><Facts s={s} mode="tiles" panel={c.panel} setPanel={c.setPanel} /><FactPanel s={s} panel={c.panel} />{!c.panel && s.kind === 'income' && <Candidates s={s} />}<div className="foot"><Status s={s} />{c.info && <Details s={s} />}</div></div>
  </li>; }};

/* 3 · Strip wide, one line. Strip-is-the-editor as before, with the facts as a single sentence of plain text links. */
R3[3] = {title: 'Strip wide, one line', note: 'The quietest wide version. Under the describe box, one sentence: split with Sam, Jo · Cabin weekend · no rule. Each phrase is a link that opens its panel. Status at the end.',
  Row: ({s, open, onToggle}) => { const c = useCard(); if (!open) return <Closed s={s} onToggle={onToggle} cls="r33" />; return <li className="row r33 is-open">
    <button className="row-main as-button is-head" onClick={onToggle}><span className="check" /><Who s={s} sub={`${s.account.name} · ${s.date}`} onInfo={c.toggleInfo} info={c.info} /><span /><Amt s={s} /></button>
    <div className="body"><Strip s={s} height={48} editable handles name={`strip-${s.id}`} /><Describe s={s} /><div className="line-wrap"><Facts s={s} mode="line" panel={c.panel} setPanel={c.setPanel} /><Status s={s} /></div><FactPanel s={s} panel={c.panel} />{!c.panel && s.kind === 'income' && <Candidates s={s} />}{c.info && <Details s={s} />}</div>
  </li>; }};

/* 4 · Strip in place, one line. The header stays; the strip grows in its column; beneath it only the describe box and the one-line facts. */
R3[4] = {title: 'Strip in place, one line', note: 'The header line stays and the strip grows in its column, like 1, but the facts are the single sentence from 3. Two extra lines in total when nothing is open.',
  Row: ({s, open, onToggle}) => { const c = useCard(); if (!open) return <Closed s={s} onToggle={onToggle} cls="r34" />; return <li className="row r34 is-open">
    <button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={sub(s)} onInfo={c.toggleInfo} info={c.info} /><span className="row-strip"><Strip s={s} height={44} editable handles name={`strip-${s.id}`} /></span><Amt s={s} /></button>
    <div className="body is-indented"><Describe s={s} /><div className="line-wrap"><Facts s={s} mode="line" panel={c.panel} setPanel={c.setPanel} /><Status s={s} /></div><FactPanel s={s} panel={c.panel} />{!c.panel && s.kind === 'income' && <Candidates s={s} />}{c.info && <Details s={s} />}</div>
  </li>; }};

/* 5 · Describe and facts on one row. The strip grows in its column; the describe box and the facts share the next line;
   anything opened appears under them. The smallest open state of the set. */
R3[5] = {title: 'Describe and facts together', note: 'One extra line. The describe box takes the left of it, the facts sentence the right, status at the end. The strip grows in its column. Open anything and it appears under that line.',
  Row: ({s, open, onToggle}) => { const c = useCard(); if (!open) return <Closed s={s} onToggle={onToggle} cls="r35" />; return <li className="row r35 is-open">
    <button className="row-main as-button" onClick={onToggle}><span className="check" /><Who s={s} sub={sub(s)} onInfo={c.toggleInfo} info={c.info} /><span className="row-strip"><Strip s={s} height={44} editable handles name={`strip-${s.id}`} /></span><Amt s={s} /></button>
    <div className="body is-indented"><div className="one-row"><Describe s={s} compact /><Facts s={s} mode="line" panel={c.panel} setPanel={c.setPanel} /><Status s={s} /></div><FactPanel s={s} panel={c.panel} />{!c.panel && s.kind === 'income' && gapOf(s) > 0 && <Candidates s={s} />}{c.info && <Details s={s} />}</div>
  </li>; }};
