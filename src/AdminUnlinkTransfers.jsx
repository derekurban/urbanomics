import React, {useEffect, useRef, useState} from 'react';
import {WorkspaceModal} from './WorkspaceModal.jsx';
const api=window.urbanomics;
export function AdminUnlinkTransfers({data,act,busy}) {
  const [preview,setPreview]=useState(null),[confirmation,setConfirmation]=useState(null),[working,setWorking]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const saving=useRef(false);
  useEffect(()=>{let live=true;api.previewUnlinkAll().then(value=>{if(live)setPreview(value);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[data]);
  const close=()=>{if(!saving.current){setConfirmation(null);setError('');}};
  async function open(){setWorking(true);setError('');try{const value=await api.previewUnlinkAll();setPreview(value);setConfirmation(value);}catch(e){setError(e.message);}finally{setWorking(false);}}
  async function confirm(){
    if(saving.current||busy)return;
    saving.current=true;setWorking(true);setError('');
    try{
      const value=await act(async()=>{try{return await api.unlinkAllTransfers(confirmation.token);}catch(e){setError(e.message);throw e;}});
      if(value!==false){setResult(value);setConfirmation(null);setPreview(await api.previewUnlinkAll());}
    }catch(e){setError(e.message);}finally{saving.current=false;setWorking(false);}
  }
  return <>
    <article className="admin-action"><div><span className="admin-action-label">Transfer matching</span><h3>Unlink all transfers</h3><p>Remove saved transfer connections across every month and account so you can run through matching again.</p><small>{preview?`${preview.pairs} linked pairs · ${preview.count} transactions`:'Checking transfers…'}</small></div><button className="danger" disabled={busy||working||!preview?.count} onClick={open}>Unlink all transfers</button></article>
    {error&&!confirmation&&<p role="alert" className="dr-error-text">{error}</p>}
    {result&&<div className="admin-result" role="status"><strong>{result.pairs} transfer pairs unlinked · {result.count} transactions updated.</strong><p>A recovery copy was saved in your local workspace’s backups/admin folder. Open Experimental → Transfers to test matching.</p></div>}
    {confirmation&&<WorkspaceModal title="Unlink all transfers?" onClose={close} footer={<div className="admin-confirm-buttons"><button disabled={working} onClick={close}>Cancel</button><button className="danger" disabled={working||busy||!confirmation.count} onClick={confirm}>{working?'Unlinking…':'Confirm unlink all transfers'}</button></div>}>
      <div className="admin-confirm"><p>Unlink <strong>{confirmation.pairs} transfer pairs</strong> affecting <strong>{confirmation.count} transactions</strong>?</p><p>This covers every imported month and includes {confirmation.archived} transactions in archived accounts.{confirmation.unpaired>0&&` It also clears ${confirmation.unpaired} incomplete transfer assignments.`}</p><p>Both sides return to ordinary transactions. Transfer fee and extra-received classifications are cleared; spending and income totals may change until the transactions are linked again.</p><p>Amounts, source files, snapshots, tags, events, people and matching rules are kept. Existing deductions on other transactions are unchanged.</p><p>A local recovery copy is saved first. This action has no automatic undo. Nothing is relinked automatically.</p>{error&&<p role="alert" className="dr-error-text">{error}</p>}</div>
    </WorkspaceModal>}
  </>;
}
