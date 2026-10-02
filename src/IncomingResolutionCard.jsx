import React, {useLayoutEffect,useRef,useState} from 'react';
import {captureTransferTile,animateTransferHero} from './transfer-hero.js';
import {CardTags,cardMoney} from './CardTags.jsx';
import {capacity,distribute,sum} from './review-model.js';
import {incomingTransferCandidates,transferPairBand} from '../electron/review/transfer-model.mjs';

export const amount=(c,currency='CAD')=>cardMoney(Math.abs(c),currency);
export function initialResolution(row,edge){
  if(edge)return {kind:'transfer',outgoing:edge.outgoing,feeOkay:false};
  if(['income','repayment'].includes(row.review.kind))return {...row.review,tags:[...row.review.tags]};
  return {kind:'choose',tags:[...row.review.tags]};
}
export function resolutionValid(row,draft){
  if(draft.kind==='transfer')return !!draft.outgoing&&(Math.abs(draft.outgoing.amountCents)===row.amountCents||draft.feeOkay);
  if(draft.kind==='income')return !!draft.tags?.length&&sum(draft.tags)===row.amountCents;
  if(draft.kind==='repayment')return !!draft.personId&&sum(draft.allocations||[])>0&&sum(draft.allocations||[])<=row.amountCents;
  return false;
}
function Receipt({row,outgoing=false,onRemove,active}){
  return <div className={`ex-receipt ${outgoing?'from':'to'}`} style={{'--account-color':row.color||'var(--muted)'}}>
    {onRemove&&<button className="ex-remove" aria-label="Remove suggested transfer" disabled={!active} onClick={onRemove}>×</button>}
    <div className="ex-receipt-main"><strong className="ex-receipt-title" title={row.originalDescription||row.description}>{row.description}</strong><b>{outgoing?'−':'+'}{amount(row.amountCents,row.currency)} <small>{row.currency}</small></b></div>
    <div className="ex-receipt-meta"><span><i/>{row.account}</span><time>{row.date}</time></div>
  </div>;
}

export function IncomingResolutionCard({row,draft,onDraft,active,records,entities,band,dayRange,onSave,onSkip}){
  const root=useRef(null),heroOrigin=useRef(null);
  const [heroBusy,setHeroBusy]=useState(false);
  const patch=changes=>onDraft({...draft,...changes});
  const choose=kind=>onDraft({kind,tags:draft.tags||row.review.tags,personId:row.review.assignedPersonId||'',allocations:[],query:'',transferDays:draft.transferDays??Math.min(7,dayRange??1),transferBasisPoints:draft.transferBasisPoints??Math.min(1000,band)});
  const people=entities.filter(e=>e.kind==='person'),groups=entities.filter(e=>e.kind==='group');
  const outgoing=draft.kind==='transfer'?draft.outgoing:null;
  useLayoutEffect(()=>{
    const source=heroOrigin.current;heroOrigin.current=null;
    if(!source||source.id!==outgoing?.id||!active||matchMedia('(prefers-reduced-motion: reduce)').matches){setHeroBusy(false);return;}
    const target=root.current.querySelector('.ex-receipt.from');
    setHeroBusy(true);
    return animateTransferHero(root.current,target,source,()=>setHeroBusy(false));
  },[outgoing?.id,active]);
  const selectTransfer=(t,tile)=>{
    if(!active||heroBusy)return;
    heroOrigin.current=captureTransferTile(tile,t.id);
    patch({outgoing:t,feeOkay:false,linkBasisPoints:transferPairBand(t,row)});
  };
  const difference=outgoing?Math.abs(outgoing.amountCents)-row.amountCents:0;
  const targets=(draft.allocations||[]).map(p=>p.id),allocated=sum(draft.allocations||[]),remainder=row.amountCents-allocated;
  const expenses=draft.kind==='repayment'?records.filter(t=>!t.deleted&&t.amountCents<0&&['unreviewed','expense'].includes(t.review.kind)&&t.currency===row.currency):[];
  const capacities=Object.fromEntries(expenses.map(t=>[t.id,capacity(t,records,row.id,draft.personId)]));
  const changeTargets=ids=>patch({allocations:distribute(row.amountCents,[...new Set(ids)],capacities).filter(p=>p.id!=='remainder')});
  const matches=t=>`${t.description||t.name} ${t.account||''} ${t.date||''}`.toLowerCase().includes((draft.query||'').toLowerCase());
  const configuringTransfer=draft.kind==='transfer'&&!outgoing;
  const financialEditor=draft.kind==='income'||draft.kind==='repayment';
  const decisionReady=resolutionValid(row,draft);
  const connectionEmpty=draft.kind==='choose'||configuringTransfer||(financialEditor&&!decisionReady);
  const guidance=draft.kind==='income'
    ? !draft.tags?.length?'Choose at least one income tag.':`${amount(row.amountCents,row.currency)} will be recorded as income.`
    : !draft.personId?'Choose who contributed.':allocated===0?'Choose an event or expenses to reduce.':`${amount(allocated,row.currency)} will reduce these expenses; ${amount(remainder,row.currency)} stays unassigned.`;
  const transferDays=draft.transferDays??Math.min(7,dayRange??1);
  const transferBasisPoints=draft.transferBasisPoints??Math.min(1000,band);
  const candidates=configuringTransfer?incomingTransferCandidates(row,records,transferDays,transferBasisPoints):[];
  const close=<button className="ex-remove" disabled={!active} aria-label="Back to resolution choices" onClick={()=>choose('choose')}>×</button>;
  return <div ref={root} className={`card-inner ex-resolution ${connectionEmpty?'is-connection-empty':''} ${financialEditor?'is-financial-editor':''} ${draft.kind==='income'?'is-income-editor':''}`} >
    <div className="ex-resolution-source" data-roll-control={outgoing||draft.kind==='choose'?undefined:true}>
      <div className="ex-state-content" key={outgoing?.id||draft.kind}>
      {outgoing?<Receipt row={outgoing} outgoing active={active&&!heroBusy} onRemove={()=>choose('choose')}/>:
      draft.kind==='choose'?<div className="ex-resolve-choices"><div>{[['transfer','Transfer'],['repayment','Deduction'],['income','Income']].map(([kind,label])=><button key={kind} disabled={!active||(kind==='transfer'&&row.manual)} onClick={()=>choose(kind)} aria-label={`Choose ${label.toLowerCase()}`}><b>+</b><strong>{label}</strong><small>{kind==='transfer'?'Between accounts':kind==='repayment'?'Reduce shared costs':'Earned or received'}</small></button>)}</div></div>:
      <div className={`ex-source-editor ${configuringTransfer?'ex-transfer-picker':''} ${draft.kind==='income'?'ct-income-editor':''}`} >
        <div className="ex-source-title"><strong>{draft.kind==='transfer'?'Choose an outgoing payment':draft.kind==='repayment'?'Choose a person and expenses':'Tag this income'}</strong>{close}</div>
        {configuringTransfer&&<div className="ex-transfer-picker-body">
          <div className="ex-transfer-results" role="region" aria-label="Matching outgoing payments" tabIndex={active?0:-1}>
            <div className="ex-match-count" role="status" title="Eligible payments from other accounts in the same currency. Manual selection can override automatic account routes.">{candidates.length} possible {candidates.length===1?'match':'matches'}</div>
            <div className="ex-transfer-choices">{candidates.map(t=><button key={t.id} disabled={!active} onClick={e=>selectTransfer(t,e.currentTarget)}><i style={{background:t.color}}/><span><strong>{t.description}</strong><small><span className="ex-candidate-account">{t.account}</span><span aria-hidden="true"> · </span><time>{t.date}</time></small></span><b>−{amount(t.amountCents,t.currency)}</b></button>)}</div>
            {!candidates.length&&<p className="ex-editor-hint ex-no-matches">No matches in this range.<br/>Try widening either slider.</p>}
          </div>
          <aside className="ex-transfer-ranges" aria-label="Match ranges">
            <label><span>Day range <output>±{transferDays} {transferDays===1?'day':'days'}</output></span><input type="range" aria-label="Transfer day range" aria-valuetext={`Plus or minus ${transferDays} days`} min="0" max="7" step="1" value={transferDays} disabled={!active} onChange={e=>patch({transferDays:Number(e.target.value)})}/><small><span>Same day</span><span>±7 days</span></small></label>
            <label><span>Amount difference <output>±{transferBasisPoints/100}%</output></span><input type="range" aria-label="Transfer amount difference" aria-valuetext={`Plus or minus ${transferBasisPoints/100} percent`} min="0" max="10" step="0.1" value={transferBasisPoints/100} disabled={!active} onChange={e=>patch({transferBasisPoints:Math.round(Number(e.target.value)*100)})}/><small><span>Exact</span><span>±10%</span></small></label>
          </aside>
        </div>}
        {financialEditor&&draft.kind!=='income'&&<p className="ex-next-step" role="status">{guidance}</p>}
        {draft.kind==='income'&&<>
          <CardTags entities={entities} lens="income" total={row.amountCents} currency={row.currency} parts={draft.tags||[]} onChange={(tags,tagView=draft.tagView)=>patch({tags,tagView})} disabled={!active} view={draft.tagView} onView={tagView=>patch({tagView})}/>

        </>}
        {draft.kind==='repayment'&&<>
          <div className="ex-person-choices">{people.map(p=><button key={p.id} aria-pressed={draft.personId===p.id} disabled={!active} onClick={()=>patch({personId:p.id,allocations:[]})}><i aria-hidden="true" style={{'--person-color':p.color}}>{p.name.split(/\s+/).map(n=>n[0]).slice(0,2).join('')}</i>{p.name}</button>)}</div>
          {!people.length&&<p>Add a person in Organize to assign a repayment.</p>}
          {!!draft.personId&&<>
            <input aria-label="Find deduction expenses" placeholder="Find expenses or events…" value={draft.query||''} onChange={e=>patch({query:e.target.value})}/>
            <div className="ex-deduction-targets">{groups.filter(matches).map(group=>{
              const members=expenses.filter(t=>t.review.groups.includes(group.id)&&capacities[t.id]>0).map(t=>t.id);
              const count=members.filter(id=>targets.includes(id)).length;
              return members.length>0&&<label key={group.id}><input type="checkbox" disabled={!active} checked={count===members.length} ref={el=>{if(el)el.indeterminate=count>0&&count<members.length;}} onChange={()=>changeTargets(count===members.length?targets.filter(id=>!members.includes(id)):[...targets,...members])}/><span>{group.name}<small>Event · {members.length} expenses</small></span></label>;
            })}{expenses.filter(t=>matches(t)&&(capacities[t.id]>0||targets.includes(t.id))).map(t=><label key={t.id}><input type="checkbox" disabled={!active} checked={targets.includes(t.id)} onChange={e=>changeTargets(e.target.checked?[...targets,t.id]:targets.filter(id=>id!==t.id))}/><span>{t.description}<small>{t.date} · {t.account}</small></span><small>{amount(capacities[t.id],t.currency)} available</small></label>)}</div>
            {!!targets.length&&<div className="ex-deduction-amounts">{draft.allocations.map(p=><label key={p.id}><span>{expenses.find(t=>t.id===p.id)?.description||'Expense'}</span><input aria-label={`Deduction for ${expenses.find(t=>t.id===p.id)?.description||p.id}`} type="number" min="0" step="0.01" max={Math.min(capacities[p.id]||0,p.cents+remainder)/100} value={p.cents/100} disabled={!active} onChange={e=>{const cents=Math.round(Number(e.target.value)*100);if(Number.isSafeInteger(cents)&&cents>=0&&cents<=Math.min(capacities[p.id]||0,p.cents+remainder))patch({allocations:draft.allocations.map(a=>a.id===p.id?{...a,cents}:a)});}}/></label>)}</div>}
          </>}
        </>}
      </div>}
      </div>
    </div>
    <div className="ex-resolution-seam" aria-hidden={connectionEmpty}><span aria-hidden="true">{outgoing?'↓':draft.kind==='repayment'?'↗':'↓'}</span>{outgoing&&difference!==0?<label><input type="checkbox" disabled={!active} checked={!!draft.feeOkay} onChange={e=>patch({feeOkay:e.target.checked})}/>{difference>0?`Record ${amount(difference,row.currency)} difference as a fee`:'Keep the extra received separately identified'}</label>:<small>{outgoing?(difference===0?'Amounts match':`${amount(difference,row.currency)} ${difference>0?'difference':'extra received'}`):draft.kind==='repayment'?`${amount(allocated,row.currency)} applied · ${amount(remainder,row.currency)} unassigned`:draft.kind==='income'?`${amount(row.amountCents,row.currency)} as income`:'Choose a connection above'}</small>}</div>
    <Receipt row={row}/>
    <footer className="ex-resolution-actions" aria-hidden={connectionEmpty} inert={connectionEmpty?true:undefined}>
      <div className="ex-resolution-buttons">{!financialEditor&&<button disabled={!active||connectionEmpty||heroBusy} onClick={onSkip}>Skip for now</button>}<button className="primary ex-confirm" disabled={!active||heroBusy||!resolutionValid(row,draft)} onClick={()=>onSave(draft)}>{draft.kind==='transfer'?'Link transfer':draft.kind==='repayment'?'Save deduction':draft.kind==='income'?'Save income':'Save & continue'} <span aria-hidden="true">✓</span></button></div>
    </footer>
  </div>;
}
