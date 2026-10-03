import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@derekurban/design-system/styles.css';
import './icons.js';
import {Icon} from '@derekurban/design-system';
import './style.css';
import {files, palette, roles, guessMapping, kindsOf, sharedStart, modes, matches, suggestRule, suggestName, mappingComplete, read, money} from './data.mjs';
import {analyze, monthsCovered, monthLabel, parseDate, formatLabel} from './analyze.mjs';

const kinds = kindsOf(files);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const uid = (() => { let n = 0; return p => `${p}${++n}`; })();

/* ---------- shared pieces ---------- */

function Stage({title, lede, step, steps, onBack, next, nextLabel = 'Continue', nextDisabled, children, wide}) {
  return <section className={'stage' + (wide ? ' is-wide' : '')} aria-label={title}>
    <header className="stage-head">
      <div><p className="stage-step">{steps ? `Step ${step} of ${steps}` : ' '}</p><h2>{title}</h2>{lede && <p className="stage-lede">{lede}</p>}</div>
      {steps && <ol className="dots" aria-hidden="true">{Array.from({length: steps}, (_, i) => <li key={i} className={i + 1 < step ? 'is-done' : i + 1 === step ? 'is-now' : ''} />)}</ol>}
    </header>
    <div className="stage-body" key={title}>{children}</div>
    <footer className="stage-foot">
      {onBack ? <button onClick={onBack}><Icon name="arrow-left" size={15} /> Back</button> : <span />}
      {next && <button className="primary" disabled={nextDisabled} onClick={next}>{nextLabel} <Icon name="arrow-right" size={15} /></button>}
    </footer>
  </section>;
}

function FileRow({f, right}) { return <li className="file"><Icon name="file-text" size={15} /><span className="file-name">{f.name}</span><small>{plural(f.rows.length, 'row', 'rows')}</small>{right}</li>; }

function Swatches({value, onChange}) {
  return <div className="swatches" role="group" aria-label="Colour">{palette.map(c => <button key={c} type="button" aria-pressed={value === c} aria-label={c} style={{'--c': c}} onClick={() => onChange(c)}>{value === c && <Icon name="check" size={12} />}</button>)}</div>;
}

/* Plain-language recognition. The sentence is the rule; the chips underneath are the proof. */
function Recognize({rule, onChange, candidates, compact}) {
  const hits = candidates.filter(f => matches(rule, f.name));
  return <div className={'recognize' + (compact ? ' is-compact' : '')}>
    <div className="sentence">
      <span>Recognize files whose name</span>
      <select aria-label="How to match" value={rule.mode} onChange={e => onChange({...rule, mode: e.target.value})}>{modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
      <input aria-label="Text to match" value={rule.text} onChange={e => onChange({...rule, text: e.target.value})} spellCheck={false} />
    </div>
    <div className="proof">
      <small className={hits.length ? '' : 'is-warn'}>{hits.length ? `Matches ${plural(hits.length, 'file', 'files')} here` : 'Matches none of the files here'}</small>
      <div className="chips">{candidates.map(f => <span key={f.id} className={'chip' + (matches(rule, f.name) ? ' is-on' : '')}>{matches(rule, f.name) ? <Icon name="check" size={12} /> : <Icon name="circle-dashed" size={12} />}{f.name}</span>)}</div>
    </div>
  </div>;
}

/* Table-first column mapping: click a header, choose what it is. Guesses are marked until confirmed. */
function Mapper({kind, mapping, onChange, guessed, only, onPick}) {
  const [open, setOpen] = useState(null);
  const label = i => roles.find(r => r.id === mapping[i])?.label;
  const set = (i, role) => { const next = {...mapping}; for (const k of Object.keys(next)) if (next[k] === role) delete next[k]; if (role) next[i] = role; else delete next[i]; onChange(next); setOpen(null); onPick?.(i, role); };
  const show = only ? roles.filter(r => only.includes(r.id)) : roles;
  return <div className="mapper">
    <table>
      <thead><tr>{kind.headers.map((h, i) => <th key={i} className={mapping[i] ? 'is-set' : ''}>
        <button type="button" className={'col' + (open === i ? ' is-open' : '')} aria-expanded={open === i} onClick={() => only ? set(i, only[0]) : setOpen(open === i ? null : i)}>
          <span className="col-role">{label(i) ? <>{guessed?.[i] && <Icon name="sparkles" size={12} />}{label(i)}</> : <em>{only ? 'Choose' : 'What is this?'}</em>}</span>
          <span className="col-name">{h}</span>
        </button>
        {open === i && <div className="menu" role="menu">{show.map(r => <button key={r.id} type="button" role="menuitem" aria-pressed={mapping[i] === r.id} onClick={() => set(i, r.id)}>{r.label}</button>)}<button type="button" role="menuitem" className="quiet" onClick={() => set(i, null)}>Skip this column</button></div>}
      </th>)}</tr></thead>
      <tbody>{kind.files[0].rows.map((r, ri) => <tr key={ri}>{r.map((v, i) => <td key={i} className={mapping[i] ? 'is-set' : ''}>{v || <span className="blank">—</span>}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

function Preview({kind, mapping, sign}) {
  const rows = read(kind.files[0], mapping, sign).slice(0, 3);
  return <table className="preview"><caption>How the first rows will be recorded</caption><thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.text}</td><td className={'num ' + (r.cents < 0 ? 'is-out' : 'is-in')}>{money(r.cents)}</td></tr>)}</tbody></table>;
}

function SignChoice({mapping, sign, onChange}) {
  if (!Object.values(mapping).includes('amount')) return null;
  return <div className="sign"><span>In the Amount column, positive numbers are</span><div className="segc"><button type="button" aria-pressed={sign === 1} onClick={() => onChange(1)}>money in</button><button type="button" aria-pressed={sign === -1} onClick={() => onChange(-1)}>money out</button></div></div>;
}

function Results({plan, onDone}) {
  const rows = plan.reduce((n, p) => n + p.file.rows.length, 0);
  return <section className="stage is-results" aria-label="Imported">
    <div className="stage-body">
      <div className="done-mark"><Icon name="circle-check" size={28} /></div>
      <h2>Filed.</h2>
      <p className="stage-lede">{plural(plan.length, 'file', 'files')} read, {plural(rows, 'transaction', 'transactions')} added across {new Set(plan.map(p => p.account.name)).size} accounts. Next time, files with these names are recognized on their own.</p>
      <ul className="plan">{plan.map(p => <li key={p.file.id}><i className="dot" style={{background: p.account.color}} /><span>{p.file.name}</span><small>{p.account.name} · {plural(p.file.rows.length, 'row', 'rows')}</small></li>)}</ul>
    </div>
    <footer className="stage-foot"><span /><button className="primary" onClick={onDone}>Back to snapshots</button></footer>
  </section>;
}

/* ---------- state shared by the flows ---------- */
function useStudy({guess = true} = {}) {
  const [accounts, setAccounts] = useState([]);
  const [maps, setMaps] = useState(() => Object.fromEntries(kinds.map(k => [k.id, {mapping: guess ? guessMapping(k.headers) : {}, guessed: guess ? guessMapping(k.headers) : {}, confirmed: false, sign: 1}])));
  const [manual, setManual] = useState({});
  const addAccount = (patch = {}) => { const a = {id: uid('a'), name: '', color: palette[accounts.length % palette.length], rule: {mode: 'starts', text: ''}, ...patch}; setAccounts(v => [...v, a]); return a.id; };
  const update = (id, patch) => setAccounts(v => v.map(a => a.id === id ? {...a, ...patch} : a));
  const remove = id => setAccounts(v => v.filter(a => a.id !== id));
  const accountFor = f => accounts.find(a => a.id === manual[f.id]) || accounts.find(a => matches(a.rule, f.name)) || null;
  const setMap = (id, patch) => setMaps(v => ({...v, [id]: {...v[id], ...patch}}));
  const plan = files.map(f => ({file: f, account: accountFor(f), kind: kinds.find(k => k.files.includes(f))})).filter(p => p.account);
  return {accounts, addAccount, update, remove, accountFor, manual, setManual, maps, setMap, plan};
}

/* ---------- Flow A: accounts first ---------- */
function FlowA({onDone}) {
  const s = useStudy(); const [step, setStep] = useState(1); const [kindIx, setKindIx] = useState(0);
  const unresolved = files.filter(f => !s.accountFor(f));
  if (step === 4) return <Results plan={s.plan} onDone={onDone} />;
  if (step === 1) return <Stage title="Your accounts" lede="Add each account these exports came from, and say how to recognize its files. Everything on the right updates as you type." step={1} steps={3} next={() => setStep(2)} nextDisabled={!s.accounts.length || s.accounts.some(a => !a.name.trim()) || unresolved.length > 0} wide>
    <div className="two">
      <div className="col">
        {s.accounts.map(a => <article key={a.id} className="card account" style={{'--c': a.color}}>
          <div className="row"><input aria-label="Account name" placeholder="Account name, e.g. Everyday chequing" value={a.name} onChange={e => s.update(a.id, {name: e.target.value})} autoFocus /><button className="icon" aria-label="Remove account" onClick={() => s.remove(a.id)}><Icon name="x" size={14} /></button></div>
          <Swatches value={a.color} onChange={color => s.update(a.id, {color})} />
          <Recognize rule={a.rule} onChange={rule => s.update(a.id, {rule})} candidates={files} compact />
        </article>)}
        <button className="ghost" onClick={() => s.addAccount()}><Icon name="plus" size={15} /> {s.accounts.length ? 'Another account' : 'Add an account'}</button>
      </div>
      <div className="col">
        <h4>Your {plural(files.length, 'file', 'files')}</h4>
        <ul className="files">{files.map(f => { const a = s.accountFor(f); return <FileRow key={f.id} f={f} right={a ? <span className="tag" style={{'--c': a.color}}><i className="dot" />{a.name || 'Unnamed'}</span> : <span className="tag is-warn"><Icon name="circle-dashed" size={12} /> No account yet</span>} />; })}</ul>
        {unresolved.length > 0 && s.accounts.length > 0 && <p className="hint">{plural(unresolved.length, 'file is', 'files are')} not recognized by any rule yet. Adjust a rule, or add the account they belong to.</p>}
      </div>
    </div>
  </Stage>;
  if (step === 2) { const k = kinds[kindIx], m = s.maps[k.id]; const allDone = kinds.every(x => s.maps[x.id].confirmed);
    return <Stage title="How each kind of file is read" lede={`Files with the same columns are read the same way. ${plural(kinds.length, 'kind', 'kinds')} here. Click a column heading to say what it holds.`} step={2} steps={3} onBack={() => setStep(1)} next={() => setStep(3)} nextDisabled={!allDone} wide>
      <div className="kind-tabs" role="tablist">{kinds.map((x, i) => <button key={x.id} role="tab" aria-selected={i === kindIx} className={s.maps[x.id].confirmed ? 'is-done' : ''} onClick={() => setKindIx(i)}>{s.maps[x.id].confirmed ? <Icon name="circle-check" size={14} /> : <Icon name="circle-dashed" size={14} />}{plural(x.files.length, 'file', 'files')} · {x.headers.slice(0, 3).join(', ')}{x.headers.length > 3 ? '…' : ''}</button>)}</div>
      <p className="hint"><Icon name="sparkles" size={13} /> Columns marked with a spark were guessed from their headings. Check them, then confirm.</p>
      <Mapper kind={k} mapping={m.mapping} guessed={m.guessed} onChange={mapping => s.setMap(k.id, {mapping, guessed: {}, confirmed: false})} />
      <SignChoice mapping={m.mapping} sign={m.sign} onChange={sign => s.setMap(k.id, {sign})} />
      {mappingComplete(m.mapping) && <Preview kind={k} mapping={m.mapping} sign={m.sign} />}
      <div className="row end">{m.confirmed ? <span className="ok"><Icon name="check" size={14} /> Confirmed for {plural(k.files.length, 'file', 'files')}</span> : <button className="primary" disabled={!mappingComplete(m.mapping)} onClick={() => { s.setMap(k.id, {confirmed: true}); if (kindIx < kinds.length - 1) setKindIx(kindIx + 1); }}>Looks right</button>}</div>
    </Stage>; }
  return <Check s={s} step={3} steps={3} onBack={() => setStep(2)} onImport={() => setStep(4)} />;
}

function Check({s, step, steps, onBack, onImport}) {
  return <Stage title="Ready to import" lede="Nothing has been imported yet. Each row is filed by its own date; rows already recorded are matched, not added again." step={step} steps={steps} onBack={onBack} next={onImport} nextLabel={`Import ${plural(s.plan.length, 'file', 'files')}`}>
    <ul className="plan">{s.plan.map(p => <li key={p.file.id}><i className="dot" style={{background: p.account.color}} /><span>{p.file.name}</span><small>{p.account.name} · {plural(p.file.rows.length, 'row', 'rows')}</small><span className="ok"><Icon name="check" size={13} /></span></li>)}</ul>
  </Stage>;
}

/* ---------- Flow B: files first, grouped into kinds ---------- */
function FlowB({onDone}) {
  const s = useStudy(); const [step, setStep] = useState(1); const [openKind, setOpenKind] = useState(kinds[0].id); const [naming, setNaming] = useState({});
  const kindAccount = k => s.accountFor(k.files[0]);
  const kindDone = k => kindAccount(k) && s.maps[k.id].confirmed;
  if (step === 3) return <Results plan={s.plan} onDone={onDone} />;
  if (step === 1) return <Stage title={`${plural(files.length, 'file', 'files')}, ${plural(kinds.length, 'kind', 'kinds')} of export`} lede="Files with the same columns are one kind. Set each kind up once: which account it is, and a quick check of its columns." step={1} steps={2} next={() => setStep(2)} nextDisabled={!kinds.every(kindDone)} wide>
    <div className="kinds">{kinds.map(k => { const a = kindAccount(k), m = s.maps[k.id], open = openKind === k.id, name = naming[k.id] ?? suggestName(k);
      return <article key={k.id} className={'card kind' + (open ? ' is-open' : '') + (kindDone(k) ? ' is-done' : '')} style={{'--c': a?.color}}>
        <button className="kind-head" aria-expanded={open} onClick={() => setOpenKind(open ? null : k.id)}>
          <span className="kind-status">{kindDone(k) ? <Icon name="circle-check" size={18} /> : <Icon name="circle-dashed" size={18} />}</span>
          <span className="kind-title"><b>{a ? a.name : name}</b><small>{plural(k.files.length, 'file', 'files')} · columns {k.headers.join(', ')}</small></span>
          <span className="kind-files">{k.files.map(f => <span key={f.id} className="chip is-on">{f.name}</span>)}</span>
          <Icon name="chevron-down" size={16} />
        </button>
        {open && <div className="kind-body">
          <section>
            <h4>1 · Which account are these from?</h4>
            {a ? <div className="row"><span className="tag" style={{'--c': a.color}}><i className="dot" />{a.name}</span><small>Recognized because the name {modes.find(m => m.id === a.rule.mode).label} “{a.rule.text}”.</small><button className="link" onClick={() => s.remove(a.id)}>Change</button></div>
              : <div className="row wrap">{s.accounts.map(x => <button key={x.id} className="pick" style={{'--c': x.color}} onClick={() => k.files.forEach(f => s.setManual(v => ({...v, [f.id]: x.id})))}><i className="dot" />{x.name}</button>)}
                <div className="newacct"><input aria-label="New account name" value={name} onChange={e => setNaming(v => ({...v, [k.id]: e.target.value}))} /><button className="primary small" disabled={!name.trim()} onClick={() => s.addAccount({name: name.trim(), rule: suggestRule(k)})}>Create</button><small>We’ll recognize future files whose name starts with “{sharedStart(k)}”.</small></div></div>}
          </section>
          <section>
            <h4>2 · Check the columns</h4>
            <Mapper kind={k} mapping={m.mapping} guessed={m.guessed} onChange={mapping => s.setMap(k.id, {mapping, guessed: {}, confirmed: false})} />
            <SignChoice mapping={m.mapping} sign={m.sign} onChange={sign => s.setMap(k.id, {sign})} />
            {mappingComplete(m.mapping) && <Preview kind={k} mapping={m.mapping} sign={m.sign} />}
            <div className="row end">{m.confirmed ? <span className="ok"><Icon name="check" size={14} /> Looks right</span> : <button className="primary" disabled={!mappingComplete(m.mapping)} onClick={() => { s.setMap(k.id, {confirmed: true}); const next = kinds.find(x => x.id !== k.id && !kindDone(x)); setOpenKind(next ? next.id : null); }}>Looks right</button>}</div>
          </section>
        </div>}
      </article>; })}</div>
  </Stage>;
  return <Check s={s} step={2} steps={2} onBack={() => setStep(1)} onImport={() => setStep(3)} />;
}

/* ---------- Flow C: one question at a time ---------- */
function FlowC({onDone}) {
  const s = useStudy({guess: false});
  const questions = useMemo(() => { const q = [{t: 'intro'}]; for (const k of kinds) { q.push({t: 'account', k}); q.push({t: 'date', k}); q.push({t: 'description', k}); q.push({t: 'amount', k}); q.push({t: 'confirm', k}); } q.push({t: 'check'}); return q; }, []);
  const [ix, setIx] = useState(0); const q = questions[ix]; const total = questions.length;
  const [names, setNames] = useState({}); const [split, setSplit] = useState({});
  const next = () => setIx(i => Math.min(i + 1, total)); const back = () => setIx(i => Math.max(i - 1, 0));
  if (ix >= total) return <Results plan={s.plan} onDone={onDone} />;
  const k = q.k, m = k && s.maps[k.id], a = k && s.accountFor(k.files[0]);
  const has = role => m && Object.values(m.mapping).includes(role);
  const kindNo = k ? kinds.indexOf(k) + 1 : 0;
  const common = {step: ix + 1, steps: total, onBack: ix ? back : null};
  if (q.t === 'intro') return <Stage title={`We found ${plural(files.length, 'file', 'files')}.`} lede={`They come in ${plural(kinds.length, 'kind', 'kinds')}, by the columns inside. We’ll set each kind up with a few quick questions, then import everything at once.`} {...common} next={next} nextLabel="Let’s go">
    <div className="kinds-grid">{kinds.map((x, i) => <div key={x.id} className="card"><h4>Kind {i + 1} · {plural(x.files.length, 'file', 'files')}</h4><ul className="files">{x.files.map(f => <FileRow key={f.id} f={f} />)}</ul><small>Columns: {x.headers.join(', ')}</small></div>)}</div>
  </Stage>;
  if (q.t === 'account') { const name = names[k.id] ?? suggestName(k);
    return <Stage title={`Kind ${kindNo}: which account ${k.files.length > 1 ? 'are these from' : 'is this from'}?`} lede="Pick an account you already have, or name a new one." {...common} next={next} nextDisabled={!a}>
      <ul className="files inline">{k.files.map(f => <FileRow key={f.id} f={f} />)}</ul>
      <div className="row wrap">{s.accounts.map(x => <button key={x.id} className="pick" aria-pressed={a?.id === x.id} style={{'--c': x.color}} onClick={() => k.files.forEach(f => s.setManual(v => ({...v, [f.id]: x.id})))}><i className="dot" />{x.name}</button>)}</div>
      {!a && <div className="newacct big"><label>New account<input value={name} onChange={e => setNames(v => ({...v, [k.id]: e.target.value}))} /></label><button className="primary" disabled={!name.trim()} onClick={() => s.addAccount({name: name.trim(), rule: suggestRule(k)})}>Use “{name.trim() || '…'}”</button></div>}
      {a && <p className="hint"><Icon name="sparkles" size={13} /> From now on, files whose name starts with “{sharedStart(k)}” go to {a.name} on their own. <button className="link">Change that</button></p>}
    </Stage>; }
  if (q.t === 'date' || q.t === 'description') { const role = q.t;
    return <Stage title={`Kind ${kindNo}: which column holds the ${role}?`} lede="Click the column." {...common} next={next} nextDisabled={!has(role)}>
      <Mapper kind={k} mapping={m.mapping} only={[role]} onChange={mapping => s.setMap(k.id, {mapping, guessed: {}})} />
    </Stage>; }
  if (q.t === 'amount') { const two = split[k.id] ?? (!has('amount') && (has('debit') || has('credit')));
    return <Stage title={`Kind ${kindNo}: where is the amount?`} lede={two ? 'Click the money-out column, then the money-in column.' : 'Click the column with the amount.'} {...common} next={next} nextDisabled={two ? !(has('debit') && has('credit')) : !has('amount')}>
      <div className="segc"><button type="button" aria-pressed={!two} onClick={() => setSplit(v => ({...v, [k.id]: false}))}>One column, signed</button><button type="button" aria-pressed={!!two} onClick={() => setSplit(v => ({...v, [k.id]: true}))}>Two columns, out and in</button></div>
      {two ? <Mapper kind={k} mapping={m.mapping} only={has('debit') ? ['credit'] : ['debit']} onChange={mapping => s.setMap(k.id, {mapping, guessed: {}})} />
        : <><Mapper kind={k} mapping={m.mapping} only={['amount']} onChange={mapping => s.setMap(k.id, {mapping, guessed: {}})} /><SignChoice mapping={m.mapping} sign={m.sign} onChange={sign => s.setMap(k.id, {sign})} /></>}
    </Stage>; }
  if (q.t === 'confirm') return <Stage title={`Kind ${kindNo}: does this look right?`} lede={`This is how ${a?.name || 'this account'}’s rows will be recorded.`} {...common} next={() => { s.setMap(k.id, {confirmed: true}); next(); }} nextLabel={kindNo < kinds.length ? 'Yes, next kind' : 'Yes'}>
    {mappingComplete(m.mapping) ? <Preview kind={k} mapping={m.mapping} sign={m.sign} /> : <p className="hint is-warn">Something is missing. Go back and choose the columns.</p>}
  </Stage>;
  return <Check s={s} step={total} steps={total} onBack={back} onImport={() => setIx(total)} />;
}

/* ---------- Flow D: guided, with everything the files can prove already done ---------- */
const readable = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', {month: 'short', day: 'numeric', year: 'numeric'}) : '';

function Fact({ok, children, why}) {
  return <li className={'fact' + (ok ? ' is-ok' : ' is-open')}><span className="fact-mark">{ok ? <Icon name="check" size={13} /> : '?'}</span><div><div className="fact-text">{children}</div>{why && <small>{why}</small>}</div></li>;
}

function Guided({onDone, returning}) {
  const existing = useMemo(() => returning ? [{id: 'x1', name: 'Everyday chequing', color: palette[0], rule: {mode: 'starts', text: 'Bank_everyday'}, matches: n => matches({mode: 'starts', text: 'Bank_everyday'}, n)}] : [], [returning]);
  const findings = useMemo(() => kinds.map(k => ({kind: k, ...analyze(k, existing)})), [existing]);
  const [state, setState] = useState(() => Object.fromEntries(findings.map((f, i) => [f.kind.id, {
    mapping: f.mapping, dateFormat: f.dateFormat, sign: f.sign, outIn: null, columns: false, confirmed: !!f.existing,
    account: f.existing ? {name: f.existing.name, color: f.existing.color, rule: f.existing.rule, existing: true} : {name: f.suggested.name, type: f.suggested.type, color: palette[i % palette.length], rule: f.suggested.rule},
  }])));
  const todo = findings.filter(f => !f.existing);
  const screens = ['intro', ...todo.map(f => f.kind.id), 'check'];
  const [ix, setIx] = useState(0);
  const upd = (id, patch) => setState(v => ({...v, [id]: {...v[id], ...patch}}));
  const open = f => { const st = state[f.kind.id]; return f.questions.filter(q => q.id === 'dateFormat' ? !st.dateFormat : q.id === 'sign' ? st.sign == null : !st.outIn); };
  const totalOpen = todo.reduce((n, f) => n + open(f).length, 0);
  const steps = screens.length, step = ix + 1;
  const plan = findings.flatMap(f => f.kind.files.map(file => ({file, account: state[f.kind.id].account, kind: f.kind})));
  if (ix >= steps) return <Results plan={plan} onDone={onDone} />;
  const id = screens[ix];

  if (id === 'intro') return <Stage title={`We found ${plural(files.length, 'file', 'files')}.`} lede={`${plural(kinds.length, 'kind', 'kinds')} of export. We worked out how to read ${todo.length === kinds.length ? 'all of them' : 'the new ones'} from the cells inside; ${totalOpen ? `${plural(totalOpen, 'thing', 'things')} still ${totalOpen === 1 ? 'needs' : 'need'} your call.` : 'nothing needs your call.'}`} step={step} steps={steps} next={() => setIx(1)} nextLabel={todo.length ? 'Walk me through it' : 'Check and import'}>
    <ul className="found">{findings.map(f => { const st = state[f.kind.id], months = monthsCovered(f.kind, st.mapping, st.dateFormat), q = open(f).length;
      return <li key={f.kind.id} className={f.existing ? 'is-known' : ''} style={{'--c': st.account.color}}>
        <span className="found-mark">{f.existing ? <Icon name="circle-check" size={18} /> : <Icon name="circle-dashed" size={18} />}</span>
        <div className="found-main"><b>{f.existing ? f.existing.name : `${st.account.name}${st.account.type ? ` · ${st.account.type.toLowerCase()}` : ''}`}</b><small>{plural(f.kind.files.length, 'file', 'files')}{months.length ? ` · ${months.length === 1 ? monthLabel(months[0]) : `${monthLabel(months[0])} to ${monthLabel(months.at(-1))}`}` : ''}</small></div>
        <div className="found-files">{f.kind.files.map(x => <span key={x.id} className="chip is-on">{x.name}</span>)}</div>
        <span className={'found-status' + (q ? ' is-open' : '')}>{f.existing ? 'Already yours, recognized by name' : q ? `${plural(q, 'question', 'questions')} for you` : 'Columns, dates and signs worked out'}</span>
      </li>; })}</ul>
  </Stage>;

  if (id === 'check') return <Stage title="Ready to import" lede="Nothing has been imported yet. Each row is filed by its own date; rows already recorded are matched, not added again." step={step} steps={steps} onBack={() => setIx(ix - 1)} next={() => setIx(steps)} nextLabel={`Import ${plural(files.length, 'file', 'files')}`}>
    <ul className="plan">{plan.map(p => <li key={p.file.id}><i className="dot" style={{background: p.account.color}} /><span>{p.file.name}</span><small>{p.account.name} · {plural(p.file.rows.length, 'row', 'rows')}</small><span className="ok"><Icon name="check" size={13} /></span></li>)}</ul>
  </Stage>;

  const f = findings.find(x => x.kind.id === id), st = state[id], k = f.kind, H = k.headers, n = todo.indexOf(f) + 1;
  const col = role => { const i = Object.keys(st.mapping).find(x => st.mapping[x] === role); return i == null ? null : H[i]; };
  const qs = open(f), dateQ = f.questions.find(q => q.id === 'dateFormat'), signQ = f.questions.find(q => q.id === 'sign'), pairQ = f.questions.find(q => q.id === 'outIn');
  const firstDate = k.files[0].rows[0][Object.keys(st.mapping).find(x => st.mapping[x] === 'date')];
  const complete = mappingComplete(st.mapping) && st.dateFormat && (Object.values(st.mapping).includes('amount') ? st.sign != null : true);
  const sampleRows = read(k.files[0], st.mapping, st.sign ?? 1).slice(0, 2);
  return <Stage title={`${todo.length > 1 ? `${n} of ${todo.length}: ` : ''}${k.files.length === 1 ? 'one file on its own' : `${k.files.length} files that look alike`}`} lede={qs.length ? `Almost everything is worked out. ${plural(qs.length, 'thing', 'things')} below ${qs.length === 1 ? 'needs' : 'need'} your call.` : 'Everything here is worked out from the files. Change anything that is not right.'} step={step} steps={steps} onBack={() => setIx(ix - 1)} next={() => { upd(id, {confirmed: true}); setIx(ix + 1); }} nextLabel={n < todo.length ? 'Looks right, next' : 'Looks right'} nextDisabled={!complete || !st.account.name.trim()} wide>
    <div className="two guided">
      <div className="col">
        <section className="block">
          <h4>The account</h4>
          <div className="row"><input aria-label="Account name" value={st.account.name} onChange={e => upd(id, {account: {...st.account, name: e.target.value}})} /><input aria-label="Account type" className="type" placeholder="type, optional" value={st.account.type || ''} onChange={e => upd(id, {account: {...st.account, type: e.target.value}})} /></div>
          <Swatches value={st.account.color} onChange={color => upd(id, {account: {...st.account, color}})} />
          <Recognize rule={st.account.rule} onChange={rule => upd(id, {account: {...st.account, rule}})} candidates={files} compact />
          <small>Next time, files matching this go to {st.account.name || 'this account'} on their own.</small>
        </section>
      </div>
      <div className="col">
        <section className="block">
          <h4>How it is read</h4>
          <ul className="facts">
            {col('date') && <Fact ok={!!st.dateFormat} why={st.dateFormat ? f.because.date : undefined}>Dates in <b>{col('date')}</b>{st.dateFormat ? <>, written {formatLabel[st.dateFormat]}</> : null}
              {dateQ && !st.dateFormat && <div className="choice">{dateQ.options.map(o => <button key={o} type="button" onClick={() => upd(id, {dateFormat: o})}><b>{formatLabel[o]}</b><small>{firstDate} → {readable(parseDate(firstDate, o))}</small></button>)}</div>}
            </Fact>}
            {col('description') && <Fact ok why={f.because.description}>Descriptions in <b>{col('description')}</b></Fact>}
            {col('amount') && <Fact ok={st.sign != null} why={st.sign != null ? (f.because.sign || f.because.amount) : f.because.amount}>Amounts in <b>{col('amount')}</b>{st.sign != null ? <>; positive means <b>{st.sign === 1 ? 'money in' : 'money out'}</b></> : null}
              {signQ && st.sign == null && <div className="choice">{[1, -1].map(sgn => <button key={sgn} type="button" onClick={() => upd(id, {sign: sgn})}><b>Positive is money {sgn === 1 ? 'in' : 'out'}</b><small>{read(k.files[0], st.mapping, sgn).slice(0, 2).map(r => `${r.text} ${money(r.cents)}`).join(' · ')}</small></button>)}</div>}
            </Fact>}
            {col('debit') && <Fact ok={!pairQ || !!st.outIn} why={f.because.debit}>Money out in <b>{col('debit')}</b>, money in in <b>{col('credit')}</b>
              {pairQ && !st.outIn && <div className="choice">{pairQ.options.map(o => <button key={o} type="button" onClick={() => { const other = pairQ.options.find(x => x !== o); upd(id, {outIn: o, mapping: {...st.mapping, [o]: 'debit', [other]: 'credit'}}); }}><b>{H[o]} is money out</b></button>)}</div>}
            </Fact>}
            {col('balance') && <Fact ok why={f.because.balance}>Running balance in <b>{col('balance')}</b></Fact>}
            {H.filter((_, i) => !st.mapping[i]).length > 0 && <Fact ok>Ignored: {H.filter((_, i) => !st.mapping[i]).join(', ')}</Fact>}
          </ul>
          <button className="link" onClick={() => upd(id, {columns: !st.columns})}>{st.columns ? 'Hide the columns' : 'Not right? Change the columns'}</button>
          {st.columns && <Mapper kind={k} mapping={st.mapping} onChange={mapping => upd(id, {mapping})} />}
        </section>
        {complete && <Preview kind={k} mapping={st.mapping} sign={st.sign ?? 1} />}
      </div>
    </div>
  </Stage>;
}

/* ---------- the study page ---------- */
const flows = {
  d: {title: 'Guided', note: 'Accounts first and one question at a time, combined. The files are read first: which column is the date, which is the amount, which way is money in, which month each file covers, what to call the account and how to recognize its files. Each kind gets one screen that states all of that in plain words and asks only about what the cells could not prove.', C: Guided},
  a: {title: 'Accounts first', note: 'What the user suggested: define the accounts and how to recognize their files, watch the file list resolve, then check how each kind of file is read, then import. Rules are plain sentences, never regex.', C: FlowA},
  b: {title: 'Files first, grouped', note: 'The files are the hero. They are grouped by their columns into kinds; each kind gets an account and a column check in one card. Recognition rules are made for you from the filename and shown as a sentence.', C: FlowB},
  c: {title: 'One question at a time', note: 'Hand-holding. Each screen asks one thing with one way to answer it: pick an account, click the date column, click the amount column, confirm the preview. Longest path, least thinking.', C: FlowC},
};

function App() {
  const params = new URLSearchParams(location.search);
  const [flow, setFlow] = useState(params.get('flow') || 'd');
  const [returning, setReturning] = useState(params.get('returning') === '1');
  const [run, setRun] = useState(0);
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { const u = new URL(location.href); u.searchParams.set('flow', flow); history.replaceState(null, '', u); }, [flow]);
  const F = flows[flow].C;
  return <div className="page">
    <div className="top">
      <div><p className="crumb">Import flow study · synthetic files · nothing saves</p><h1>{flows[flow].title}</h1><p className="note">{flows[flow].note}</p></div>
      <div className="tools"><div className="segc" role="tablist">{Object.entries(flows).map(([id, f]) => <button key={id} role="tab" aria-selected={flow === id} aria-pressed={flow === id} onClick={() => { setFlow(id); setRun(r => r + 1); }}>{f.title}</button>)}</div><button className="icon" aria-label="Toggle theme" onClick={() => setDark(d => !d)}><Icon name={dark ? 'sun' : 'moon'} size={16} /></button><button onClick={() => setRun(r => r + 1)}>Start over</button>{flow === 'd' && <button aria-pressed={returning} onClick={() => { setReturning(v => !v); setRun(r => r + 1); }}>Returning user</button>}</div>
    </div>
    <F key={flow + run + returning} onDone={() => setRun(r => r + 1)} returning={returning} />
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
