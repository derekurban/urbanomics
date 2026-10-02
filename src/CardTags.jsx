import {otherId} from '../electron/review/system-tags.mjs';
import React, {useMemo,useRef,useState} from 'react';
import {orderedTags,tagType} from '../electron/review/tag-model.mjs';
import {divider,sum} from './review-model.js';
import {allocationParts,savedAllocation,addAllocation,removeAllocation,editAllocation,equalAllocation} from './tag-allocation.js';
import {useTagDocking} from './tag-docking.js';

const formats=new Map();
export const cardMoney=(c,currency='CAD')=>{if(!formats.has(currency))formats.set(currency,new Intl.NumberFormat('en-CA',{style:'currency',currency}));return formats.get(currency).format(c/100);};

function TagAmount({part,name,disabled,onChange}){
 const [draft,setDraft]=useState(null),cancel=useRef(false);
 const commit=()=>{if(!cancel.current&&draft!==null&&/^\d+(\.\d{0,2})?$/.test(draft))onChange(Math.round(Number(draft)*100));cancel.current=false;setDraft(null);};
 return <input aria-label={`Amount for ${name}`} inputMode="decimal" disabled={disabled} value={draft??(part.cents/100).toFixed(2)} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){cancel.current=true;e.currentTarget.blur();}}}/>;
}

export function CardTags({entities,lens,total,currency,parts,onChange,disabled,view={},onView}){
 const [precision,setPrecision]=useState(100),[dragging,setDragging]=useState(false);
 const root=useRef(null),rail=useRef(null),drag=useRef(null);
 const tags=useMemo(()=>orderedTags(entities.filter(e=>e.kind==='category'&&tagType(e)===lens)),[entities,lens]);
 const groups=useMemo(()=>[...entities.filter(e=>e.kind==='bucket'),{id:'ungrouped',name:'Ungrouped',color:'var(--ink-secondary)'}].filter(g=>tags.some(t=>(t.parentId||'ungrouped')===g.id)),[entities,tags]);
 const bucket=groups.some(g=>g.id===view.bucket)?view.bucket:groups[0]?.id,query=view.query||'';
 const other=otherId({amountCents:lens==='income'?total:-total},entities);
 const allocations=allocationParts(parts,other,total),selected=allocations.filter(p=>p.id!==other||p.cents>0||allocations.length===1);
 const visible=tags.filter(t=>!selected.some(p=>p.id===t.id)&&(lens==='income'||query||(t.parentId||'ungrouped')===bucket)&&t.name.toLowerCase().includes(query.trim().toLowerCase()));
 const byId=new Map(entities.map(t=>[t.id,t]));
 const capture=useTagDocking(root,disabled,JSON.stringify(selected.map(p=>p.id)));
 const patch=values=>onView({...view,...values});
 const change=(next,nextView=view)=>onChange(savedAllocation(next,other),nextView);
 function select(id,e){capture(id,e.detail===0);change(addAllocation(allocations,id,other));}
 function remove(id,e){capture(id,e.detail===0);const tag=byId.get(id);change(removeAllocation(allocations,id,other),{...view,query:'',bucket:tag?.parentId||'ungrouped'});}
 function start(e,index){if(disabled)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);drag.current={index,x:e.clientX,width:rail.current.getBoundingClientRect().width,parts:allocations,absolute:sum(allocations.slice(0,index+1))};setDragging(true);}
 function move(e){const d=drag.current;if(!d||disabled)return;change(divider(d.parts,d.index,d.absolute+(e.clientX-d.x)/d.width*total,precision));}
 function end(){drag.current=null;setDragging(false);}
 return <div ref={root} className={`ct-browser ct-mini ${dragging?'ct-dragging':''} ${lens==='income'?'ct-flat':''}`} data-roll-control>
  <div className="ct-mini-toolbar"><strong>{lens==='income'?'Income tags':'Split by tag'}</strong><div className="ct-mini-precision" aria-label="Divider precision">{[100,1].map(step=><button key={step} disabled={disabled} aria-pressed={precision===step} onClick={()=>setPrecision(step)}>{step===100?'$1':'$0.01'}</button>)}</div><button disabled={disabled||allocations.length<3} onClick={()=>change(equalAllocation(allocations,other))}>Split evenly</button></div>
  <div className="ct-mini-allocation">
   <div className="ct-mini-rail" ref={rail} aria-label="Tag allocation"><div className="ct-mini-segments">{allocations.map(p=><span key={p.id} style={{width:`${total?p.cents/total*100:0}%`,background:byId.get(p.id)?.color||'var(--data-neutral)'}} title={`${byId.get(p.id)?.name||'Existing tag'}: ${cardMoney(p.cents,currency)}`}/>)}</div>
    {allocations.slice(0,-1).map((p,i)=>{const before=sum(allocations.slice(0,i)),value=before+p.cents,max=value+allocations[i+1].cents;return <button key={p.id} className="ct-mini-divider" style={{left:`${total?value/total*100:0}%`}} disabled={disabled} role="slider" aria-label={`Divider after ${byId.get(p.id)?.name||'Existing tag'}`} aria-valuemin={before} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${cardMoney(p.cents,currency)} for ${byId.get(p.id)?.name}`} onPointerDown={e=>start(e,i)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={e=>{let target;if(['ArrowLeft','ArrowDown'].includes(e.key))target=value-precision*(e.shiftKey?10:1);if(['ArrowRight','ArrowUp'].includes(e.key))target=value+precision*(e.shiftKey?10:1);if(e.key==='Home')target=before;if(e.key==='End')target=max;if(target!==undefined){e.preventDefault();change(divider(allocations,i,target,precision));}}}><i/><i/></button>;})}
   </div>
   <div className="ct-mini-grid" aria-label="Selected tags">{selected.map(p=>{const t=byId.get(p.id),name=t?.name||'Existing tag';return <div className="ct-mini-slot" key={p.id} data-tag-tile={p.id} data-tag-name={name} style={{'--tag-color':t?.color||'var(--data-neutral)'}}><i/><span className="ct-mini-name" title={name}>{name}</span><TagAmount part={p} name={name} disabled={disabled} onChange={cents=>change(editAllocation(allocations,p.id,cents,other))}/>{p.id===other?<span className="ct-mini-auto" title="Unallocated remainder">Auto</span>:<button disabled={disabled} aria-label={`Remove ${name}`} onClick={e=>remove(p.id,e)}>×</button>}</div>;})}</div>
  </div>
  <div className="ct-mini-available"><div className="ct-tools"><strong>Available tags</strong><input aria-label={`Find ${lens} tags`} placeholder="Find a tag…" value={query} disabled={disabled} onChange={e=>patch({query:e.target.value})}/></div>
   <div className="ct-body"><div className="ct-browse-grid">
    {lens==='expense'&&!query&&<nav className="ct-categories" aria-label="Expense categories">{groups.map(g=><button key={g.id} disabled={disabled} aria-label={`Category ${g.name}`} aria-pressed={bucket===g.id} style={{'--tag-color':g.color}} onClick={()=>patch({bucket:g.id})}><i/>{g.name}</button>)}</nav>}
    <div className="ct-tag-list">{visible.map(t=><button className="ct-available-tag" key={t.id} data-tag-tile={t.id} data-tag-name={t.name} style={{'--tag-color':t.color}} disabled={disabled} aria-label={`Add ${t.name}`} onClick={e=>select(t.id,e)}><i className="ct-tag-dot"/><span>{t.name}</span><b aria-hidden="true">+</b></button>)}{!visible.length&&<p className="ct-empty">{query?'No available tags match.':'All tags here are selected.'}</p>}</div>
   </div></div>
  </div>
 </div>;
}

export function ExpenseResolutionCard({row,draft,onDraft,entities,active,onSave,onSettings}){
 const patch=values=>onDraft({...draft,...values}),parts=draft.tags||[],people=entities.filter(e=>e.kind==='person');
 const ready=parts.length>0&&sum(parts)===Math.abs(row.amountCents),person=people.find(p=>p.id===draft.assignedPersonId);
 return <div className={`card-inner expense-face ex-expense-resolution ${ready?'is-decided':''}`}>
  <header className="ct-receipt" style={{'--account-color':row.color}}><div><strong title={row.originalDescription||row.description}>{row.description}</strong><b>−{cardMoney(Math.abs(row.amountCents),row.currency)} <small>{row.currency}</small></b></div><div><span><i/>{row.account}</span><time>{row.date}</time></div></header>
  <div className="ct-expense-body" data-roll-control>
   <div className="ct-mode-tabs"><button aria-pressed={!draft.peopleOpen} disabled={!active} onClick={()=>patch({peopleOpen:false})}>Tags {parts.length>0&&<span>{parts.length}</span>}</button><button aria-pressed={!!draft.peopleOpen} disabled={!active} onClick={()=>patch({peopleOpen:true})}>{person?person.name:'Person'}<small>{person?'✓':'Optional'}</small></button><button className="ct-details" disabled={!active} onClick={onSettings} aria-label="Transaction settings">•••</button></div>
   {draft.peopleOpen?<div className="ct-people-panel"><strong>Who is this associated with?</strong><p>This labels the person. Cost shares and repayments are managed in Review.</p><div className="ct-people"><button disabled={!active} aria-pressed={!person} onClick={()=>patch({assignedPersonId:''})}><i>—</i><span>No person</span></button>{people.map(p=><button key={p.id} disabled={!active} aria-pressed={draft.assignedPersonId===p.id} onClick={()=>patch({assignedPersonId:p.id})}><i aria-hidden="true" style={{'--tag-color':p.color}}>{p.name.split(/\s+/).map(n=>n[0]).slice(0,2).join('')}</i><span>{p.name}</span></button>)}</div>{!people.length&&<p>Add people in Organize to associate them here.</p>}</div>:<CardTags entities={entities} lens="expense" total={Math.abs(row.amountCents)} currency={row.currency} parts={parts} onChange={(tags,tagView=draft.tagView)=>patch({tags,tagView})} disabled={!active} view={draft.tagView} onView={tagView=>patch({tagView})}/>}
  </div>
  <footer className="ct-expense-footer" aria-hidden={!ready} inert={!ready?true:undefined}><div><strong>{parts.length===1?'One tag':`${parts.length} tags`}{person?` · ${person.name}`:''}</strong><small>{cardMoney(Math.abs(row.amountCents),row.currency)} allocated · ready to file</small></div><button className="primary ex-confirm" disabled={!active||!ready} onClick={()=>onSave(draft)}>Save expense <span>✓</span></button></footer>
 </div>;
}
