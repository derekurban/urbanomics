import { Icon } from "@derekurban/design-system";
import React,{useState} from "react";
import {EventCalendar} from "./EventCalendar.jsx";
import {EntityEditor} from "./EntityEditor.jsx";
import {palette} from "./snapshots-v2-atoms.jsx";
import {useWorkspaceLedger} from "./workspace-ledger.js";
import {Alert} from "./ui.jsx";
// Trips and occasions: link their transactions from a calendar, split them with people, see who still owes.
export function EventsWorkspace({data,run,busy,onSource,onOrganize,onSettings}){
 const {state,records,entities,error,setError,act}=useWorkspaceLedger(data,run);
 const [selected,setSelected]=useState(""),[editing,setEditing]=useState(null);
 const events=entities.filter(e=>e.kind==="group"),people=entities.filter(e=>e.kind==="person"),visible=records.filter(r=>!r.deleted&&r.review.kind!=="transfer");
 function edit(e){setError("");setEditing({color:palette[events.length%palette.length],...e});}
 return <section className="events-hub workspace-page">
 <div className="page-heading"><div><h1>Events</h1><p>Group a trip or an occasion's transactions, split them with the people who shared it, and see who still owes what.</p></div>{events.length>0&&<div className="page-heading-actions"><button className="primary" disabled={busy||!state} onClick={()=>edit({kind:"group"})}><Icon name="plus" size={16}/>New event</button></div>}</div>
 {error&&!editing&&<Alert onDismiss={()=>setError("")}>{error}</Alert>}
 {!state?<p>Loading events…</p>:!events.length?<div className="empty-state"><Icon name="calendar-days" size={24}/><h2>Give your plans a place.</h2><p>Create an event with its dates and the people who shared it. Nearby transactions are suggested from a calendar, and each expense splits evenly unless you change it.</p><button className="primary" onClick={()=>edit({kind:"group"})}>Create your first event</button></div>:<EventCalendar selectedEvent={selected} onSelectEvent={setSelected} records={records} visible={visible} groups={events} people={people} busy={busy} onSave={changes=>act(()=>window.urbanomics.organize(changes))} onEdit={edit} onSource={onSource} onPayment={row=>onOrganize(row.id)}/>}
 {editing&&<EntityEditor key={editing.id||"new"} entity={editing} entities={entities} act={act} error={error} onAddPerson={onSettings?()=>{setEditing(null);onSettings("person");}:undefined} onClose={()=>{setEditing(null);setError("");}}/>}</section>;
}
