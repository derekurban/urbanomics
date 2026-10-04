import {savedTags,isOther} from '../electron/review/system-tags.mjs';
import {pendingTransfers} from '../electron/review/transfer-model.mjs';
import {apportion} from './dashboard-model.js';
const formats=new Map();
export function money(n,currency='CAD'){if(!formats.has(currency))formats.set(currency,new Intl.NumberFormat('en-CA',{style:'currency',currency}));return formats.get(currency).format(n/100);}
export function mapRecords(records,entities){
 const byId=new Map(records.map(r=>[r.id,r])),definitions=new Map(entities.map(t=>[t.id,t]));
 const pending=new Set(pendingTransfers(records).map(r=>r.id));
 return records.filter(r=>r.amountCents!==0).map(row=>{
  const allocations=row.review.kind==='repayment'?row.review.allocations.filter(a=>a.cents>0):[];
  let tags=savedTags(row).filter(t=>!isOther(t.id,entities));
  const budget=Math.abs(row.amountCents)-allocations.reduce((n,a)=>n+a.cents,0);
  const legacyScaling=row.amountCents>0&&allocations.length>0&&row.review.allocationMode!=='layers'&&tags.reduce((n,t)=>n+t.cents,0)>budget;
  if(legacyScaling)tags=apportion(budget,tags);
  let layers=[...allocations.map(a=>({id:'expense:'+a.id,kind:'expense',target:a.id,name:byId.get(a.id)?.description||'Archived expense',cents:a.cents,color:'var(--data-neutral)'})),...tags.map(t=>({id:'tag:'+t.id,kind:'tag',target:t.id,name:definitions.get(t.id)?.name||'Archived tag',color:definitions.get(t.id)?.color||'var(--data-neutral)',cents:t.cents}))];
  if(row.review.kind==='transfer'){layers=[];if(row.amountCents>0){const out=byId.get(row.review.transferId);if(out){layers.push({id:'transfer:'+out.id,kind:'transfer',target:out.id,name:'Transfer from '+out.account,cents:Math.min(-out.amountCents,row.amountCents),color:palette.Transfer});if(row.review.transferExcessCents)layers.push({id:'excess',kind:'excess',name:'Unexplained extra',cents:row.review.transferExcessCents,color:'var(--data-neutral)'});}}}
  return {...row,raw:row,name:row.description,amount:row.amountCents,person:row.review.personId||row.review.assignedPersonId||'',shares:Object.fromEntries((row.review.shares||[]).map(p=>[p.id,p.cents])),layers,version:row.version,liveVersion:row.version,canTransfer:pending.has(row.id),dirty:false,legacyScaling,groups:[...row.review.groups],event:row.review.groups.map(id=>definitions.get(id)?.name).filter(Boolean).join(', ')};
 });
}
// Parts the app makes up (not user tags) are neutral and follow the theme; user tags keep their own colors.
export const palette={Unallocated:'var(--data-neutral)',Lodging:'var(--data-neutral)',Transfer:'var(--line-strong)',Fee:'var(--data-neutral)'};
export const total=r=>Math.abs(r.amount);
export const assigned=r=>r.layers.reduce((n,l)=>n+l.cents,0);
export const rest=r=>total(r)-assigned(r);
export const find=(s,id)=>s.find(r=>r.id===id);
export function repayment(s,id,person,exclude){return s.filter(r=>r.id!==exclude&&(!person||r.person===person)).reduce((n,r)=>n+r.layers.filter(l=>l.kind==='expense'&&l.target===id).reduce((a,l)=>a+l.cents,0),0);}
export const paired=(s,id)=>s.find(r=>r.layers.some(l=>l.kind==='transfer'&&l.target===id));
export function cap(s,source,target){if(source.currency!==target.currency||source.amount<=0||target.amount>=0||paired(s,target.id)||target.layers.some(l=>l.kind==='transfer'))return 0;if(!['unreviewed','expense'].includes(target.raw.review.kind))return 0;const gross=total(target)-repayment(s,target.id,null,source.id);const share=Object.keys(target.shares||{}).length?(target.shares[source.person]||0)-repayment(s,target.id,source.person,source.id):gross;return Math.max(0,Math.min(share,gross));}
export function segments(s,r){const p=paired(s,r.id);if(p)return [{id:'principal',name:'Transfer to '+p.account,kind:'transfer',cents:Math.min(p.amount,total(r)),color:palette.Transfer},{id:'fee',name:'Transfer fee',kind:'fee',cents:Math.max(0,total(r)-p.amount),color:palette.Fee}].filter(l=>l.cents);return [...r.layers.map(l=>({...l,color:l.color||palette[l.name]||palette[l.colorKey]||palette.Lodging})),{id:'other',name:'Unallocated',kind:'default',cents:rest(r),color:palette.Unallocated}].filter(l=>l.cents>0);}
function check(n){if(!Number.isSafeInteger(n)||n<0)throw Error('Enter an amount of zero or more, with up to two decimals.');}
export function resize(s,id,key,cents){check(cents);const r=find(s,id),l=r.layers.find(l=>l.id===key);if(!l||paired(s,id)||l.kind==='transfer')throw Error('Unlink the transfer before changing its amount.');if(cents>l.cents+rest(r))throw Error('Lower another part first to free up that amount.');if(l.kind==='expense'&&cents>cap(s,r,find(s,l.target)))throw Error("That's more than this person still owes on that expense.");l.cents=cents;r.saved=false;return s;}
export function add(s,id,kind,target,cents,option){check(cents);if(cents===0)throw Error('Enter an amount greater than zero.');const r=find(s,id);if(paired(s,id)||r.layers.some(l=>l.kind==='transfer'))throw Error('Unlink the transfer before adding a part.');const key=kind+':'+target;if(r.layers.some(l=>l.id===key))throw Error('That part is already there. Change its amount instead.');if(cents>rest(r))throw Error("That's more than the unsorted amount left.");if(kind==='expense'){const t=find(s,target);if(!r.person)throw Error('Choose a person before connecting an expense repayment.');if(!t||cents>cap(s,r,t))throw Error("That's more than this person still owes on that expense.");r.layers.push({id:key,kind,target,name:t.name,color:option?.color||'var(--data-neutral)',cents});}else if(kind==='tag'){r.layers.push({id:key,kind,target,name:option.name,color:option.color,cents});}else if(kind==='transfer'){const t=find(s,target);if(!t||!r.canTransfer||!t.canTransfer||r.manual||t.manual||r.currency!==t.currency||r.amount<=0||t.amount>=0||r.accountId===t.accountId||total(t)<total(r)||r.layers.length||paired(s,t.id)||repayment(s,t.id))throw Error('Use an untouched outgoing record in another account that covers this receipt.');if(cents!==total(r))throw Error('Transfers link the full incoming amount.');r.layers.push({id:key,kind,target,name:'Transfer from '+t.account,cents,colorKey:'Transfer'});}else throw Error("That kind of part isn't supported.");r.saved=false;return s;}
export function remove(s,id,key){const r=find(s,id);r.layers=r.layers.filter(l=>l.id!==key);r.saved=false;return s;}
export function boundary(s,id,index,delta){const r=find(s,id),parts=segments(s,r),a=parts[index],b=parts[index+1];if(!b||a.kind==='transfer'||b.kind==='transfer'||paired(s,id))return s;check(Math.abs(delta));let low=-a.cents,high=b.cents;if(a.kind==='expense')high=Math.min(high,cap(s,r,find(s,a.target))-a.cents);if(b.kind==='expense')low=Math.max(low,b.cents-cap(s,r,find(s,b.target)));const d=Math.max(low,Math.min(high,delta));r.layers.find(l=>l.id===a.id).cents+=d;if(b.id!=='other')r.layers.find(l=>l.id===b.id).cents-=d;r.saved=false;return s;}
export function pools(s){let recovered=0,internal=0,fees=0;const income={},expense={};for(const r of s){if(paired(s,r.id))continue;for(const l of segments(s,r)){if(l.kind==='expense')recovered+=l.cents;else if(l.kind==='transfer'){internal+=l.cents;fees+=total(find(s,l.target))-l.cents;}else{const dest=r.amount>0?income:expense;dest[l.name]=(dest[l.name]||0)+l.cents;}}}return {income,expense,recovered,internal,fees};}

// Template proportions can scale up or down, unlike capped expense deductions.
export function templateWeights(amount, tags) {
 if (!Number.isSafeInteger(amount) || amount<=0 || tags.some(p=>!Number.isSafeInteger(p.cents)||p.cents<0) || tags.reduce((n,p)=>n+p.cents,0)>amount) throw Error('Tag amounts must fit within the transaction before saving a template.');
 const portions=[...tags,{id:'remainder',cents:amount-tags.reduce((n,p)=>n+p.cents,0)}].map((p,i)=>({id:p.id,i,weight:Number(BigInt(p.cents)*10000n/BigInt(amount)),fraction:BigInt(p.cents)*10000n%BigInt(amount)}));
 let left=10000-portions.reduce((n,p)=>n+p.weight,0);
 for(const p of [...portions].sort((a,b)=>a.fraction===b.fraction?a.i-b.i:a.fraction>b.fraction?-1:1)){if(!left)break;p.weight++;left--;}
 return portions.filter(p=>p.id!=='remainder'&&p.weight>0).map(({id,weight})=>({id,weight}));
}
