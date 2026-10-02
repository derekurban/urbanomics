import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { InfoDot, PatternSegments, PatternLegend, palette } from "./snapshots-v2-atoms.jsx";
import { Icon } from "@derekurban/design-system";

const api = window.urbanomics;
export function AccountEditor({ account, layouts, history = [], busy, run, onClose, onSnapshots }) {
  const formId=useId(), filenameInput=useRef(null);
  const [showFiles,setShowFiles]=useState(false),[fileQuery,setFileQuery]=useState(""),[allAccounts,setAllAccounts]=useState(!account);
  const previousFiles=useMemo(()=>{
    const seen=new Set();
    return history.filter(item=>{
      const key=JSON.stringify([item.account_id,item.filename]);
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
  },[history]);
  const visibleFiles=previousFiles.filter(item=>(allAccounts||item.account_id===account?.id)&&`${item.filename} ${item.account||""}`.toLowerCase().includes(fileQuery.trim().toLowerCase()));
  const [name,setName]=useState(account?.name||""),[kind,setKind]=useState(account?.kind||"");
  const [schema,setSchema]=useState(layouts[0]?"custom:"+layouts[0].id:"");
  const [prefixRegex,setPrefix]=useState(account?.prefixRegex||""),[color,setColor]=useState(account?.color||palette[0]);
  const [filename,setFilename]=useState(""),[test,setTest]=useState(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;setTest(null);const timer=setTimeout(()=>api.testPrefix(prefixRegex,filename).then(result=>{if(active)setTest({valid:true,...result});}).catch(e=>{if(active)setTest({valid:false,error:e.message});}),180);return()=>{active=false;clearTimeout(timer);};},[prefixRegex,filename]);
  return <WorkspaceModal className="accounts-modal" title={account?"Edit account":"Add account"} onClose={onClose} footer={<><button disabled={busy} onClick={onClose}>Cancel</button><button form={formId} type="submit" className="primary" disabled={busy||!name.trim()||!test?.valid||(!account&&!schema)}>Save account</button></>}>
    <form id={formId} className="account-editor" onSubmit={async e=>{e.preventDefault();setError("");const values={name,kind,prefixRegex,color};const result=await run(async()=>{try{return account?await api.updateAccount(account.id,values):await api.addAccount(name,schema,kind,values);}catch(e){setError(e.message);throw e;}},"Account saved.");if(result!==false)onClose();}}>
      <div className="accounts-form-pair"><label>Account name<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Everyday account"/></label><label>Type (optional)<input maxLength={80} value={kind} onChange={e=>setKind(e.target.value)} placeholder="Chequing, savings, credit…"/></label></div>
      {!account&&(layouts.length?<label>Saved CSV layout<select aria-label="Saved CSV layout" value={schema} onChange={e=>setSchema(e.target.value)}>{layouts.map(t=><option key={t.id} value={"custom:"+t.id}>{t.name}</option>)}</select></label>:<div className="accounts-notice"><p>Create a CSV layout in Snapshots to connect your first account.</p><button type="button" onClick={()=>{onClose();onSnapshots();}}>Set up in Snapshots →</button></div>)}
      <fieldset><legend>Account color</legend><div className="account-colors">{palette.map(value=><button type="button" key={value} aria-label={`Color ${value}`} aria-pressed={color.toUpperCase()===value} style={{"--account-color":value}} onClick={()=>setColor(value)}>{color.toUpperCase()===value?<Icon name="check" size={14}/>:""}</button>)}<label className="custom-color">Custom<input type="color" aria-label="Custom account color" value={color} onChange={e=>setColor(e.target.value)}/></label></div></fieldset>
      <div className="accounts-field-title">Filename rule <InfoDot label="Account filename rule">Matches the start of filenames, ignoring capitalization. Use RE2 syntax without / delimiters. Leave blank to assign files manually. CSV layout rules are separate; previously imported files keep their account.</InfoDot></div>
      <label className="accounts-rule-label"><span className="sr-only">Filename prefix regex</span><input spellCheck={false} maxLength={256} value={prefixRegex} onChange={e=>setPrefix(e.target.value)} placeholder="^everyday_.*"/></label>
      <div className="accounts-filename-test">
        <div className="accounts-filename-heading"><label htmlFor={formId+"-filename"}>Try a filename</label><button type="button" aria-expanded={showFiles} aria-controls={formId+"-previous"} onClick={()=>setShowFiles(v=>!v)}>Previous files <span aria-hidden="true">{showFiles?"−":"+"}</span></button></div>
        <input ref={filenameInput} id={formId+"-filename"} spellCheck={false} maxLength={255} value={filename} onChange={e=>setFilename(e.target.value)} placeholder="everyday_2026.csv"/>
        {showFiles&&<div className="accounts-previous-files" id={formId+"-previous"} role="region" aria-label="Previous imported files">
          <div className="accounts-previous-toolbar">{account&&<div role="group" aria-label="File accounts"><button type="button" aria-pressed={!allAccounts} onClick={()=>setAllAccounts(false)}>This account</button><button type="button" aria-pressed={allAccounts} onClick={()=>setAllAccounts(true)}>All accounts</button></div>}<input aria-label="Search previous files" value={fileQuery} onChange={e=>setFileQuery(e.target.value)} placeholder="Find a filename or account…"/></div>
          <div className="accounts-previous-list">{visibleFiles.slice(0,50).map(item=><button type="button" key={JSON.stringify([item.account_id,item.filename])} aria-label={`Test ${item.filename} from ${item.account||"Unassigned"}`} onClick={()=>{setFilename(item.filename);setShowFiles(false);filenameInput.current?.focus();}}><span><strong>{item.filename}</strong><small>{item.account||"Unassigned"} · Imported {new Date(item.created).toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"})}</small></span><span aria-hidden="true">↗</span></button>)}</div>
          {!visibleFiles.length&&<p className="accounts-previous-empty">{fileQuery?"No files match your search.":!previousFiles.length?"No imported files yet.":"No imported files for this account. Try All accounts."}</p>}
          {visibleFiles.length>50&&<p className="accounts-previous-empty">Showing the newest 50 filenames. Search to narrow the list.</p>}
        </div>}
      </div>
      {filename&&test?.valid&&prefixRegex&&<div className="sv2-prefix"><PatternSegments result={test} filename={filename}/><PatternLegend/></div>}
      <p role="status" className="prefix-feedback">{!test?"Checking pattern…":test.error||(!prefixRegex.trim()?"Manual assignment":!filename?"Valid pattern":test.matches?"Matches this filename":"Does not match this filename")}</p>
      {error&&<p role="alert" className="dr-error-text">{error}</p>}
    </form>
  </WorkspaceModal>;
}

export function AccountDeleteDialog({account,data,busy,run,onClose}){
  const [error,setError]=useState("");
  return <WorkspaceModal className="accounts-modal" title="Delete account" onClose={onClose} footer={<><button disabled={busy} onClick={onClose}>Keep account</button><button className="danger" disabled={busy} onClick={async()=>{const result=await run(async()=>{try{return await api.deleteAccount(account.id);}catch(e){setError(e.message);throw e;}},"Account deleted. You can restore it from Deleted accounts.");if(result!==false)onClose();}}>Delete account</button></>}>
    <h3>{account.name}</h3><p>This hides the account and its {account.transactionCount} imported transactions from active views and stops routing uploads to it.</p><p>Originals, snapshots and upload history stay archived. Restore the account at any time from Deleted accounts.</p>
    {data.jobs.some(j=>j.accountId===account.id)&&<p>Waiting uploads will need an account selected again.</p>}{error&&<p role="alert">{error}</p>}
  </WorkspaceModal>;
}
