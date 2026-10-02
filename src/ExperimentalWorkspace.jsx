import {savedTags} from '../electron/review/system-tags.mjs';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {TransactionRolodex} from './TransactionRolodex.jsx';
import {categoryColors} from './category-colors.js';
import {attentionQueues} from './experimental-model.js';
import {TransactionSettings} from './TransactionSettings.jsx';
import {WorkspaceModal} from './WorkspaceModal.jsx';
import {AccountRouteNetwork} from './AccountRouteNetwork.jsx';
import {IncomingResolutionCard,initialResolution,resolutionValid} from './IncomingResolutionCard.jsx';
import {ExpenseResolutionCard} from './CardTags.jsx';
import './experimental.css';
import './card-tags.css';

const api=window.urbanomics;
const blankSettings={routes:[],maxDays:1,basisPoints:0};

function MatchingSetup({state,onSave,onClose}) {
  const [draft,setDraft]=useState(state.config),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const valid=Number.isInteger(draft.maxDays)&&draft.maxDays>=0&&draft.maxDays<=31&&Number.isInteger(draft.basisPoints)&&draft.basisPoints>=0&&draft.basisPoints<=1000;
  return <WorkspaceModal title="Transfer matching" onClose={()=>!busy&&onClose()} footer={<div className="rv-modal-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!valid} onClick={async()=>{setBusy(true);try{await onSave(draft,state.config.version);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Save matching setup</button></div>}>
    <p>Suggestions follow these directed routes. Only a sole candidate for both entries is preselected. Linking still requires your confirmation.</p>
    <AccountRouteNetwork accounts={state.accounts} routes={draft.routes} onChange={routes=>setDraft({...draft,routes})} disabled={busy}/>
    <div className="ex-settings"><label>Date distance (days)<input type="number" min="0" max="31" value={draft.maxDays} onChange={e=>setDraft({...draft,maxDays:e.target.value===''?-1:Number(e.target.value)})}/></label><label>Amount tolerance (%)<input type="number" min="0" max="10" step="0.01" value={draft.basisPoints/100} onChange={e=>setDraft({...draft,basisPoints:e.target.value===''?-1:Math.round(Number(e.target.value)*100)})}/></label></div>
    {error&&<p role="alert">{error}</p>}
  </WorkspaceModal>;
}

export function ExperimentalWorkspace({data,run,onSource,onTransfers}) {
  const [state,setState]=useState(null),[matcher,setMatcher]=useState(null),[mode,setMode]=useState('transfers');
  const [focus,setFocus]=useState(null),[ready,setReady]=useState(false),[drafts,setDrafts]=useState({});
  const [locked,setLocked]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [skipped,setSkipped]=useState([]);
  const [editing,setEditing]=useState(null),[setup,setSetup]=useState(false),[undo,setUndo]=useState(null);
  const controller=useRef(null),locking=useRef(false),mounted=useRef(true),loadId=useRef(0);
  useEffect(()=>()=>{mounted.current=false;},[]);
  async function load(){const id=++loadId.current;const [next,matching]=await Promise.all([api.reviewState(),api.transferLabState()]);if(mounted.current&&id===loadId.current&&!locking.current){setState(next);setMatcher(matching);}}
  useEffect(()=>{if(!locking.current)load().catch(e=>setError(e.message));},[data]);
  const entities=useMemo(()=>categoryColors(state?.entities||[]),[state]);
  const queues=useMemo(()=>attentionQueues(state?.records||[],matcher?.config||blankSettings),[state,matcher]);
  const items=useMemo(()=>{const excluded=new Set(skipped);return queues[mode].filter(r=>!excluded.has(r.id)).map(row=>({...row,attentionMode:mode}));},[queues,mode,skipped]);
  const liveVersion=state?.records.find(r=>r.id===focus?.id)?.version;
  const stale=focus && (liveVersion!==focus.version || (drafts[focus.id]&&drafts[focus.id].version!==liveVersion));
  function onFocus(row,isReady){setFocus(old=>old?.id===row?.id&&old?.version===row?.version?old:row);setReady(isReady);}

  const lock=value=>{locking.current=value;setLocked(value);};
  async function afterSent(){lock(false);await load().catch(e=>setError(e.message));await run(async()=>true);}
  async function commit(save,description,undoFactory,advance=true){
    if(locking.current||!focus||!ready||stale)return false;
    let finishSave,started=false;
    const saved=new Promise(resolve=>{finishSave=resolve;});
    // Capture the enabled face and mount its paper before waiting on persistence.
    flushSync(()=>{
      if(advance)started=!!controller.current?.complete(focus.id,saved);
      lock(true);setError('');setNotice('');
    });
    try{
      await save();
      finishSave(true);
      // Each accepted write increments its starting version once. Undo must use
      // that exact version, never a later fetch that might include someone else's edit.
      setUndo(undoFactory?.()||null);setNotice(description);
      if(!advance){setFocus(null);await afterSent();controller.current?.filter();}
      else if(!started)await afterSent();
      return true;
    }catch(e){finishSave(false);setError(e.message);if(!started){lock(false);await load().catch(()=>{});}return false;}
  }
  const saveExpense=draft=>commit(()=>api.organize([{id:focus.id,version:focus.version,tags:draft.tags,assignedPersonId:draft.assignedPersonId||''}]),'Expense filed. Tags and person saved.',()=>({kind:'tags',id:focus.id,version:focus.version+1,tags:savedTags(focus),assignedPersonId:focus.review.assignedPersonId||''}));
  async function resolve(draft){
    if(!resolutionValid(focus,draft))return;
    if(draft.kind==='transfer'){
      const outgoing=draft.outgoing;
      return commit(()=>api.linkTransfer(outgoing.id,outgoing.version,focus.id,focus.version,draft.linkBasisPoints??matcher.config.basisPoints),'Transfer linked. Both entries leave income and expenses.',()=>({kind:'transfer',id:outgoing.id,incomingId:focus.id,outVersion:outgoing.version+1,inVersion:focus.version+1}));
    }
    const values={...draft,reviewed:true,shares:null,remainder:draft.kind==='repayment'?focus.amountCents-(draft.allocations||[]).reduce((n,p)=>n+p.cents,0):0};
    return commit(()=>api.saveFinancial(focus.id,focus.version,values),draft.kind==='income'?'Income saved.':'Deduction saved; the original transactions are preserved.',()=>({kind:'financial',id:focus.id,version:focus.version+1,review:{...focus.review,tags:savedTags(focus)}}));
  }
  async function undoLast(){if(!undo||locking.current)return;lock(true);setError('');try{
    if(undo.kind==='transfer')await api.unlinkTransfer(undo.id,undo.outVersion,undo.inVersion);
    else if(undo.kind==='financial')await api.saveFinancial(undo.id,undo.version,undo.review);
    else await api.organize([{id:undo.id,version:undo.version,tags:undo.tags,...(undo.assignedPersonId!==undefined?{assignedPersonId:undo.assignedPersonId}:{})}]);
    setDrafts(previous=>{const next={...previous};delete next[undo.id];if(undo.incomingId)delete next[undo.incomingId];return next;});
    setSkipped(ids=>ids.filter(id=>id!==undo.id));setUndo(null);setNotice('Last decision undone.');
  }catch(e){setError(e.message);}finally{await afterSent();}}
  if(!state||!matcher)return <section><h1>Experimental</h1><p role="status">{error||'Opening your transactions…'}</p></section>;
  const roll=<TransactionRolodex items={items} controller={controller} disabled={locked||!!editing||setup} onFocus={onFocus} onSent={afterSent} renderCard={(row,active)=>row.attentionMode!=='expenses'?<IncomingResolutionCard
    row={row} draft={drafts[row.id]?.value||initialResolution(row,queues.edges.find(e=>e.incoming.id===row.id&&e.unique))}
    onDraft={value=>setDrafts(previous=>({...previous,[row.id]:{version:row.version,value}}))}
    active={active&&ready&&!locked&&!stale} records={state.records} entities={entities} band={matcher.config.basisPoints} dayRange={matcher.config.maxDays}
    onSave={resolve} onSkip={()=>{setSkipped(ids=>[...ids,row.id]);setNotice('Skipped for this session. No financial assignment changed.');}}
    />:<ExpenseResolutionCard row={row} draft={drafts[row.id]?.value||{tags:row.review.tags,assignedPersonId:row.review.assignedPersonId||''}} onDraft={value=>setDrafts(previous=>({...previous,[row.id]:{version:row.version,value}}))} entities={entities} active={active&&ready&&!locked&&!stale} onSave={saveExpense} onSettings={()=>setEditing({...row,review:{...row.review,...drafts[row.id]?.value}})}/>}/>;
  return <section className={`experimental ex-${mode}`}>
    <div className="ex-heading"><div><h1>Experimental</h1><p>One decision at a time.</p></div><button disabled={locked} onClick={()=>{setSkipped([]);load().catch(e=>setError(e.message));}}>Refresh</button></div>
    <div className="ex-modes" role="navigation" aria-label="Experimental queues">{['transfers','income','expenses'].map(key=><button key={key} disabled={locked} aria-current={mode===key?'page':undefined} onClick={()=>{setMode(key);setError('');setFocus(null);setReady(false);}}>{key[0].toUpperCase()+key.slice(1)} <span>{queues[key].length}</span></button>)}</div>
    {error&&<div className="ex-message error" role="alert">{error}</div>}
    {stale&&<div className="ex-message" role="alert">This card changed on another screen. Your draft is preserved. <button disabled={locked} onClick={()=>{setDrafts(previous=>{const next={...previous};delete next[focus.id];return next;});setFocus(null);controller.current?.filter();}}>Reload card</button></div>}
    <div className="ex-workbench"><div className="ex-transfer-roll">{roll}</div></div>
    <div className="ex-message" role="status"><span>{notice||'Changes save to your desktop. Transfers with possible matches are held out of tagging.'}</span><button disabled={locked||!undo} onClick={undoLast}>Undo last decision</button></div>
    {editing&&<TransactionSettings row={editing} categories={entities.filter(e=>e.kind==='category')} people={entities.filter(e=>e.kind==='person')} onClose={()=>setEditing(null)} onSave={async changes=>{
      const saved=await commit(()=>api.organize(changes),'Tags saved to your transactions.',()=>({kind:'tags',id:editing.id,version:editing.version+1,tags:savedTags(focus),assignedPersonId:focus.review.assignedPersonId||''}),editing.amountCents<0&&changes[0].tags.length>0);
      if(saved&&editing.amountCents<0)setDrafts(previous=>{const next={...previous};delete next[editing.id];return next;});
      if(saved&&editing.amountCents>0)setDrafts(previous=>previous[editing.id]?{...previous,[editing.id]:{version:editing.version+1,value:{...previous[editing.id].value,tags:changes[0].tags}}}:previous);
      return saved;
    }}/>} 
    {setup&&<MatchingSetup state={matcher} onClose={()=>setSetup(false)} onSave={async(settings,version)=>{await api.saveTransferLab(settings,version);await load();await run(async()=>true);}}/>}
  </section>;
}
