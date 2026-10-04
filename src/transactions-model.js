import {boundaryEntry} from "./dashboard-model.js";
import {transactionFlow} from "../electron/review/tag-model.mjs";
import {needsTagging,isOther} from "../electron/review/system-tags.mjs";
export function ledgerView(records,entities,filters,{snapshot=false,sourceRows=records}={}){
 const byId=new Map(records.map(r=>[r.id,r])),names=new Map(entities.map(e=>[e.id,e.name]));
 const deductions=new Map();
 for(const r of records)if(r.review.kind==="repayment")for(const p of r.review.allocations)deductions.set(p.id,(deductions.get(p.id)||0)+p.cents);
 const rows=sourceRows.filter(r=>!r.deleted).map(row=>{
   const flow=snapshot?(row.amountCents>0?"income":"expense"):transactionFlow(row);
   return {row,flow,deducted:deductions.get(row.id)||0,allocated:row.review.allocations.reduce((n,p)=>n+p.cents,0),needsAttention:needsTagging(row),tags:row.review.tags.filter(p=>!isOther(p.id,entities)).map(p=>names.get(p.id)||"Tag"),events:row.review.groups.map(id=>names.get(id)||"Event")};
 }).filter(({row:r,flow,needsAttention,deducted,allocated})=>(!filters.month||r.date.startsWith(filters.month))&&(!filters.account||r.accountId===filters.account)&&(!filters.currency||r.currency===filters.currency)&&(!filters.flow||flow===filters.flow)&&(!filters.tag||r.review.tags.some(p=>p.id===filters.tag))&&(!filters.event||r.review.groups.includes(filters.event))&&(!filters.person||r.review.assignedPersonId===filters.person||r.review.personId===filters.person||r.review.shares?.some(p=>p.id===filters.person))&&(!filters.status||filters.status==="attention"&&needsAttention||filters.status==="deductions"&&(deducted>0||allocated>0)||filters.status==="shared"&&r.review.shares?.some(p=>p.id!=="me"&&p.cents>0))&&`${r.description} ${r.originalDescription||""} ${r.account}`.toLowerCase().includes(filters.query.trim().toLowerCase()));
 const direction=filters.order==="asc"?1:-1;
 rows.sort((a,b)=>direction*(filters.sort==="amount"?a.row.amountCents-b.row.amountCents:filters.sort==="description"?a.row.description.localeCompare(b.row.description):a.row.date.localeCompare(b.row.date))||a.row.id.localeCompare(b.row.id));
 let moneyIn=0,moneyOut=0;
 for(const {row} of rows){const cents=snapshot?Math.abs(row.amountCents):boundaryEntry(row,byId).cents;if(row.amountCents>0)moneyIn+=cents;else moneyOut+=cents;}
 return {rows,moneyIn,moneyOut};
}
