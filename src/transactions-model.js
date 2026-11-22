import {boundaryEntry} from "./dashboard-model.js";
import {transactionFlow,tagType} from "../electron/review/tag-model.mjs";
import {needsTagging} from "../electron/review/system-tags.mjs";
export const UNGROUPED_TAGS="dashboard:ungrouped";
// A tag filter can name one tag, a broad category (any of its tags) or the tags with no category.
export function tagFilterIds(id,entities){
 if(!id)return null;
 const buckets=new Set(entities.filter(e=>e.kind==="bucket").map(e=>e.id));
 if(id===UNGROUPED_TAGS)return new Set(entities.filter(e=>e.kind==="category"&&tagType(e)==="expense"&&!buckets.has(e.parentId)).map(e=>e.id));
 if(buckets.has(id))return new Set(entities.filter(e=>e.kind==="category"&&e.parentId===id).map(e=>e.id));
 return new Set([id]);
}
export function ledgerView(records,entities,filters,{snapshot=false,sourceRows=records}={}){
 const byId=new Map(records.map(r=>[r.id,r])),names=new Map(entities.map(e=>[e.id,e.name]));
 const deductions=new Map(),tagIds=tagFilterIds(filters.tag,entities);
 for(const r of records)if(r.review.kind==="repayment")for(const p of r.review.allocations)deductions.set(p.id,(deductions.get(p.id)||0)+p.cents);
 const rows=sourceRows.filter(r=>!r.deleted).map(row=>{
   const flow=snapshot?(row.amountCents>0?"income":"expense"):transactionFlow(row);
   const other=flow==="transfer"?byId.get(row.review.transferId):null;
   return {row,flow,counterpart:other&&other.review.transferId===row.id?other:null,deducted:deductions.get(row.id)||0,allocated:row.review.allocations.reduce((n,p)=>n+p.cents,0),needsAttention:needsTagging(row),tags:(row.tagsAutomatic?[]:row.review.tags).map(p=>names.get(p.id)||"Tag"),events:row.review.groups.map(id=>names.get(id)||"Event")};
 }).filter(({row:r,flow,needsAttention,deducted,allocated})=>(!filters.month||r.date.startsWith(filters.month))&&(!filters.from||r.date>=filters.from)&&(!filters.through||r.date<=filters.through)&&(!filters.account||r.accountId===filters.account)&&(!filters.currency||r.currency===filters.currency)&&(!filters.flow||flow===filters.flow)&&(!tagIds||(!r.tagsAutomatic&&r.review.tags.some(p=>tagIds.has(p.id))))&&(!filters.event||r.review.groups.includes(filters.event))&&(!filters.person||r.review.assignedPersonId===filters.person||r.review.personId===filters.person||r.review.shares?.some(p=>p.id===filters.person))&&(!filters.status||filters.status==="attention"&&needsAttention||filters.status==="deductions"&&(deducted>0||allocated>0)||filters.status==="shared"&&r.review.shares?.some(p=>p.id!=="me"&&p.cents>0))&&`${r.description} ${r.originalDescription||""} ${r.account}`.toLowerCase().includes((filters.query||"").trim().toLowerCase()));
 const direction=filters.order==="asc"?1:-1;
 rows.sort((a,b)=>direction*(filters.sort==="amount"?a.row.amountCents-b.row.amountCents:filters.sort==="description"?a.row.description.localeCompare(b.row.description):a.row.date.localeCompare(b.row.date))||a.row.id.localeCompare(b.row.id));
 let moneyIn=0,moneyOut=0,moved=0,fees=0;
 const shown=new Set(rows.map(r=>r.row.id));
 for(const {row,flow,counterpart} of rows){
  const cents=snapshot?Math.abs(row.amountCents):boundaryEntry(row,byId).cents;if(row.amountCents>0)moneyIn+=cents;else moneyOut+=cents;
  // Money moved between accounts counts each linked pair once: by its outgoing half, or by the incoming half when only that is shown.
  if(!snapshot&&flow==="transfer"&&counterpart){if(row.amountCents<0){moved+=Math.min(-row.amountCents,counterpart.amountCents);fees+=row.review.transferFeeCents||0;}else if(!shown.has(counterpart.id))moved+=Math.min(row.amountCents,-counterpart.amountCents);}
 }
 return {rows,moneyIn,moneyOut,moved,fees};
}
