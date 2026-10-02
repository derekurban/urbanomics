import React,{useState} from 'react';
import {receipts,transferCases,incomeTags,expenseGroups} from './practice.mjs';
const money=cents=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
const cents=value=>Math.round(Math.abs(value)*100);
const evenly=(tags,total)=>tags.map((tag,i)=>({tag,cents:Math.floor(total/tags.length)+(i<total%tags.length?1:0)}));

export function DecisionPanel({mode,id,ready,busy,onSave}){
  const [candidate,setCandidate]=useState(null),[acknowledged,setAcknowledged]=useState(false);
  const [group,setGroup]=useState('Food'),[query,setQuery]=useState(''),[parts,setParts]=useState([]);
  const [drafts,setDrafts]=useState({});
  const r=receipts[id];
  if(id===null||!r)return <aside className="decision-panel empty-decision"><span className="panel-kicker">A LITTLE BREATHING ROOM</span><h2>This queue is clear.</h2><p>Choose another queue, adjust your filters, or reset the practice to try again.</p></aside>;
  const total=cents(r[2]),income=mode==='income';
  if(mode==='transfers'){
    const candidates=transferCases.get(id)||[],source=candidate===null?null:receipts[candidate];
    const difference=source?cents(source[2])-total:0;
    return <aside className="decision-panel transfer-decision" aria-label="Validate transfer">
      <span className="panel-kicker">01 / VALIDATE A TRANSFER</span><h2>Same money, different account?</h2>
      <p className="decision-context">{candidates.length>1?'Two payments look similar. Compare their dates before choosing.':'A payment from another account could explain this receipt.'}</p>
      <div className="receiving"><span>TO · {r[4]}</span><strong>+{money(total)}</strong><small>{r[3]} · incoming card</small></div>
      <div className="match-label">Choose the outgoing payment <span>↓</span></div>
      <div className="candidate-list">{candidates.map(target=>{const outgoing=receipts[target],difference=cents(outgoing[2])-total;return <button key={target} className="candidate" disabled={busy} aria-pressed={target===candidate} onClick={()=>{setCandidate(target);setAcknowledged(false);}}>
        <span className="candidate-check">{target===candidate?'✓':'○'}</span><span><strong>{outgoing[4]}</strong><small>{outgoing[3]} · {outgoing[1]}</small></span><span className="candidate-amount">−{money(cents(outgoing[2]))}<small>{difference===0?'Exact amount':`${money(Math.abs(difference))} difference`}</small></span>
      </button>;})}</div>
      {source&&<div className={`transfer-explanation ${difference?'has-difference':''}`}>
        {difference===0?<p><strong>Exact match.</strong> Linking removes both sides from income and expense tagging.</p>:<><p><strong>{money(Math.abs(difference))} {difference>0?'less arrived':'extra received'}.</strong> {difference>0?'Record the shortfall as a transfer fee.':'Keep the extra separate as an unexplained difference.'}</p><label><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} disabled={busy}/>{difference>0?'Confirm this difference is a fee':'Acknowledge the unexplained difference'}</label></>}
      </div>}
      <button className="decision-save" disabled={!ready||candidate===null||(difference!==0&&!acknowledged)} onClick={()=>onSave({id,type:'link',target:candidate,acknowledged})}>{busy?'Working…':'Link transfer'} <span>↗</span></button>
      <button className="decision-secondary" disabled={!ready} onClick={()=>onSave({id,type:'dismiss'})}>Not a transfer</button>
      <p className="decision-footnote">Not a transfer returns these records to tagging. Later leaves this question pending.</p>
    </aside>;
  }
  const available=income?incomeTags:query?Object.values(expenseGroups).flat():expenseGroups[group];
  const choices=available.filter(tag=>tag.toLowerCase().includes(query.toLowerCase()));
  const assigned=parts.reduce((sum,p)=>sum+p.cents,0),valid=parts.length>0&&parts.every(p=>Number.isInteger(p.cents)&&p.cents>0)&&assigned===total&&!Object.values(drafts).some(v=>!/^\d+(\.\d{0,2})?$/.test(v));
  function toggle(tag){const tags=parts.some(p=>p.tag===tag)?parts.filter(p=>p.tag!==tag).map(p=>p.tag):[...parts.map(p=>p.tag),tag];setParts(evenly(tags,total));setDrafts({});}
  const formatInput=n=>(n/100).toFixed(2);
  return <aside className={`decision-panel ${income?'income':'expense'}-decision`} aria-label={income?'Tag income':'Tag expense'}>
    <span className="panel-kicker">{income?'02 / TAG INCOME':'03 / TAG AN EXPENSE'}</span><h2>{income?'What kind of money came in?':'What did this go toward?'}</h2>
    <p className="decision-context">{income?'Choose the label that will make this receipt useful later.':'Pick a category, then a tag. Mixed purchase? Choose more than one.'}</p>
    <div className="decision-receipt"><span>{r[0]}</span><strong>{income?'+':'−'}{money(total)}</strong></div>
    {!income&&<div className="category-tabs" aria-label="Expense categories">{Object.keys(expenseGroups).map(name=><button key={name} aria-pressed={group===name} disabled={busy} onClick={()=>{setGroup(name);setQuery('');}}>{name}</button>)}</div>}
    <input className="tag-search" type="search" aria-label="Search tags" placeholder={income?'Find an income tag':'Find a tag across categories'} value={query} disabled={busy} onChange={e=>setQuery(e.target.value)}/>
    <div className="tag-options">{choices.map((tag,i)=><button key={tag} className="tag-choice" style={{'--tag-hue':income?'106':group==='Food'?'29':group==='Home'?'190':group==='Personal'?'290':'65','--tag-light':`${83-i*3}%`}} aria-pressed={parts.some(p=>p.tag===tag)} disabled={busy} onClick={()=>toggle(tag)}><span>{tag}</span><b>{parts.some(p=>p.tag===tag)?'✓':'+'}</b></button>)}{!choices.length&&<p>No tags match. Try another word.</p>}</div>
    {parts.length>0&&<div className="tag-allocation"><div className="allocation-heading"><strong>{parts.length===1?'All of this transaction':'Split this transaction'}</strong>{parts.length>1&&<button disabled={busy} onClick={()=>{setParts(evenly(parts.map(p=>p.tag),total));setDrafts({});}}>Split evenly</button>}</div>
      {parts.map(part=><div className="allocation-row" key={part.tag}><button disabled={busy} onClick={()=>toggle(part.tag)} aria-label={`Remove ${part.tag}`}>×</button><span>{part.tag}</span>{parts.length===1?<strong>{money(total)}</strong>:<label><span className="sr-only">Amount for {part.tag}</span><input inputMode="decimal" disabled={busy} value={drafts[part.tag]??formatInput(part.cents)} onChange={e=>{const value=e.target.value;setDrafts({...drafts,[part.tag]:value});const parsed=/^\d+(\.\d{0,2})?$/.test(value)?Math.round(Number(value)*100):0;setParts(parts.map(p=>p.tag===part.tag?{...p,cents:parsed}:p));}}/></label>}</div>)}
      {parts.length===2&&<input className="split-slider" type="range" min="0" max={total} value={parts[0].cents} step="1" aria-label={`Split between ${parts[0].tag} and ${parts[1].tag}`} disabled={busy} onChange={e=>{const first=Number(e.target.value);setParts([{...parts[0],cents:first},{...parts[1],cents:total-first}]);setDrafts({});}}/>}
      {assigned!==total&&<p className="allocation-warning">{assigned>total?`${money(assigned-total)} over the total`:`${money(total-assigned)} left to assign`}</p>}
    </div>}
    {income&&parts.some(p=>['Reimbursement','Refund'].includes(p.tag))&&<p className="scope-note">This labels the receipt only. Matching it to an expense and reducing that expense’s cost is a separate decision.</p>}
    <button className="decision-save" disabled={!ready||!valid} onClick={()=>onSave({id,type:'tag',parts})}>{busy?'Working…':parts.length>1?'Save split & next':'Save tag & next'} <span>↗</span></button>
    <p className="decision-footnote">{parts.length>1?'All amounts must add up to the transaction total.':'Choose a tag to save. You can undo the last decision.'}</p>
  </aside>;
}
