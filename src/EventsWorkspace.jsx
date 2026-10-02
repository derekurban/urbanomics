import { Icon } from "@derekurban/design-system";
import React,{useState} from "react";
import {EventCalendar} from "./EventCalendar.jsx";
import {EntityEditor} from "./EntityEditor.jsx";
import {InfoDot} from "./snapshots-v2-atoms.jsx";
import {useWorkspaceLedger} from "./workspace-ledger.js";
export function EventsWorkspace({data,run,busy,onSource,onOrganize}){
 const {state,records,entities,error,setError,act}=useWorkspaceLedger(data,run);
 const [selected,setSelected]=useState(""),[editing,setEditing]=useState(null);
 const events=entities.filter(e=>e.kind==="group"),people=entities.filter(e=>e.kind==="person"),visible=records.filter(r=>!r.deleted&&r.review.kind!=="transfer");
 function edit(e){setError("");setEditing({color:"#6883C5",...e});}
 return <section className="events-hub workspace-page"><div className="workspace-heading"><div><h1>Events <InfoDot label="About events">Collect transactions around a trip or occasion. Dates suggest nearby transactions; linking is always your choice. Costs and repayments use the saved financial connections.</InfoDot></h1></div><button className="primary" disabled={busy||!state} onClick={()=>edit({kind:"group"})}>+ New event</button></div>
 {error&&<p role="alert" className="alert error">{error}</p>}
 {!state?<p>Loading events…</p>:!events.length?<div className="workspace-empty"><span aria-hidden="true"><Icon name="calendar-days" size={24}/></span><h2>Give your plans a place.</h2><p>Create an event, set its dates, then bring its transactions together.</p><button onClick={()=>edit({kind:"group"})}>Create your first event</button></div>:<><div className="workspace-stats"><div><strong>{events.length}</strong><span>Events</span></div><div><strong>{visible.filter(r=>r.review.groups.length).length}</strong><span>Linked transactions</span></div><div><strong>{events.filter(e=>e.endDate>=new Date().toLocaleDateString("en-CA")).length}</strong><span>Current & upcoming</span></div></div><EventCalendar selectedEvent={selected} onSelectEvent={setSelected} records={records} visible={visible} groups={events} people={people} busy={busy} onSave={changes=>act(()=>window.urbanomics.organize(changes))} onEdit={edit} onSource={onSource} onPayment={row=>onOrganize(row.id)}/></>}
 {editing&&<EntityEditor key={editing.id||"new"} entity={editing} entities={entities} act={act} error={error} onClose={()=>{setEditing(null);setError("");}}/>}</section>;
}
