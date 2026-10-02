import React,{useEffect,useState} from "react";
import {AllocationWorkspace} from "./AllocationWorkspace.jsx";
import {TransferWorkspace} from "./TransferWorkspace.jsx";
import {InfoDot} from "./snapshots-v2-atoms.jsx";
import {useWorkspaceLedger} from "./workspace-ledger.js";
export function OrganizeHub({data,run,busy,onSource,target}){
 const [mode,setMode]=useState(target?.mode||"transactions");
 const {state,records,error,act}=useWorkspaceLedger(data,run);
 useEffect(()=>{if(target)setMode(target.mode);},[target]);
 return <section className="organize-hub workspace-page"><div className="workspace-heading"><div><h1>Organize <InfoDot label="About organizing">Allocate transaction amounts to tags, connect repayments to expenses, and add event context. Transfers stay separate from income and expenses. Draft changes apply only when you save.</InfoDot></h1></div></div><nav className="workspace-tabs" aria-label="Organize tools"><button aria-pressed={mode==="transactions"} onClick={()=>setMode("transactions")}>Transactions</button><button aria-pressed={mode==="transfers"} onClick={()=>setMode("transfers")}>Transfers</button></nav>
 <div hidden={mode!=="transactions"}><AllocationWorkspace data={data} run={run} onSource={onSource} initialTransaction={target?.id} embedded/></div>
 {mode==="transfers"&&(!state?<p>{error||"Loading transfers…"}</p>:<TransferWorkspace records={records} visible={records.filter(r=>!r.deleted)} busy={busy} act={act} error={error} onSource={onSource}/>)}</section>;
}
