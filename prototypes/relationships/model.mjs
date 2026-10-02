export const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n/100);
export const people=['Me','Alex','Maya'];
export const tags={Lodging:'#bbb7db',Dining:'#e6c3a7',Groceries:'#b8cfbf',Home:'#c9c6e5',Salary:'#bed0df',Gift:'#e7c9d8',Other:'#d6d5d1'};
export const eventNames=['Mountain weekend','Household'];
export function seed(){
 const row=(id,name,amount,account,date,extra={})=>({id,name,amount,account,date,event:null,tags:[],shares:{},allocations:[],income:0,incomeTag:'',done:false,...extra});
 return {rows:[
 row('alex','Alex · weekend & groceries',27500,'Chequing','2026-08-18',{person:'Alex'}),
 row('cabin','Pine House cabin',-60000,'Mastercard','2026-08-14',{event:'Mountain weekend',tags:[{id:'Lodging',cents:60000}],shares:{Me:20000,Alex:20000,Maya:20000}}),
 row('dinner','Juniper dinner',-18000,'Mastercard','2026-08-15',{event:'Mountain weekend',tags:[{id:'Dining',cents:18000}],shares:{Me:6000,Alex:6000,Maya:6000}}),
 row('market','Superstore · mixed basket',-12000,'Chequing','2026-08-17',{event:'Household',shares:{Me:8000,Alex:4000}}),
 row('maya','Maya · partial repayment',20000,'Chequing','2026-08-19',{person:'Maya'}),
 row('arrival','Savings transfer received',50000,'Chequing','2026-08-13',{candidate:'departure'}),
 row('departure','Savings transfer sent',-50200,'Savings','2026-08-13',{candidate:'arrival'}),
 row('tickets','Tickets paid by Maya',9000,'Outside my accounts','2026-08-16',{kind:'payable',person:'Maya',event:'Mountain weekend',shares:{Me:3000,Alex:3000,Maya:3000},tags:[{id:'Other',cents:9000}]}),
 row('settle','E-transfer to Maya',-3000,'Chequing','2026-08-20',{person:'Maya',kind:'settlement'}),
 row('salary','Northstar Studio',280000,'Chequing','2026-08-28',{suggestedTag:'Salary'}),
 ],links:[],batchAdded:false};
}
export const get=(s,id)=>s.rows.find(r=>r.id===id);
export const linked=(s,id)=>s.links.find(l=>l.in===id||l.out===id);
export const sum=a=>a.reduce((n,x)=>n+x.cents,0);
export const used=r=>sum(r.allocations)+r.income;
export const remainder=r=>Math.abs(r.amount)-used(r);
export const recovered=(s,id,person,except)=>s.rows.filter(r=>r.id!==except&&(!person||r.person===person)).reduce((n,r)=>n+r.allocations.filter(a=>a.id===id).reduce((t,a)=>t+a.cents,0),0);
export function capacity(s,source,target){
 if(source.kind==='payable')return 0;
 if(target.kind==='payable')return source.kind==='settlement'&&source.person===target.person?Math.max(0,(target.shares.Me||0)-recovered(s,target.id,null,source.id)):0;
 if(source.amount<=0||target.amount>=0||target.kind==='settlement'||linked(s,target.id)||linked(s,source.id))return 0;
 const gross=Math.abs(target.amount),received=recovered(s,target.id,null,source.id);
 const personalCap=Object.keys(target.shares).length?(target.shares[source.person]||0)-recovered(s,target.id,source.person,source.id):gross-received;
 return Math.max(0,Math.min(gross-received,personalCap));
}
function validCents(n){if(!Number.isSafeInteger(n)||n<0)throw Error('Enter a positive amount with no more than two decimals.');}
export function allocate(s,sourceId,targetId,cents){
 validCents(cents);const source=get(s,sourceId),target=get(s,targetId);
 if(cents>capacity(s,source,target))throw Error('That exceeds the remaining expense or this person’s agreed share.');
 const next=source.allocations.filter(a=>a.id!==targetId);if(cents)next.push({id:targetId,cents});
 if(sum(next)+source.income>Math.abs(source.amount))throw Error('That exceeds the money available in this payment.');
 source.allocations=next;source.done=false;return s;
}
export function connect(s,sourceId,targetId){const r=get(s,sourceId),t=get(s,targetId);const current=r.allocations.find(a=>a.id===targetId)?.cents||0;return allocate(s,sourceId,targetId,Math.min(current+remainder(r),capacity(s,r,t)));}
export function assignIncome(s,id,tag){const r=get(s,id);if(r.amount<=0||r.kind==='payable'||linked(s,id))throw Error('This is not available income.');r.income=Math.abs(r.amount)-sum(r.allocations);r.incomeTag=tag;r.done=false;return s;}
export function share(s,id,person,cents){
 validCents(cents);const r=get(s,id),next={...r.shares,[person]:cents};
 if(Object.values(next).reduce((n,x)=>n+x,0)>Math.abs(r.amount))throw Error('Shares cannot exceed the expense total. Lower another share first.');
 if(r.kind==='payable'){if((next.Me||0)<recovered(s,id))throw Error('Your share cannot be below the amount already settled.');}
 else for(const p of people)if((next[p]||0)<recovered(s,id,p))throw Error('A share cannot be below the repayment already applied.');
 r.shares=next;r.done=false;return s;
}
export function tagAmount(s,id,tag,cents){validCents(cents);const r=get(s,id),total=Math.abs(r.amount);const next=r.tags.filter(t=>t.id!==tag&&t.id!=='Other');if(tag!=='Other'&&cents)next.push({id:tag,cents});const assigned=sum(next);if(assigned>total)throw Error('Tag amounts exceed this transaction. Lower another amount first.');r.tags=[...next,...(assigned<total?[{id:'Other',cents:total-assigned}]:[])];r.done=false;return s;}
export function transfer(s,inId,outId){const incoming=get(s,inId),out=get(s,outId);if(incoming.amount<=0||out.amount>=0||incoming.account===out.account||incoming.kind==='payable'||out.kind==='settlement')throw Error('Choose an outgoing transaction in another account.');if(linked(s,inId)||linked(s,outId)||used(incoming)||recovered(s,outId))throw Error('Remove existing connections before pairing these records.');if(Math.abs(out.amount)<incoming.amount)throw Error('This trial supports equal transfers or an outgoing fee only.');s.links.push({in:inId,out:outId,fee:Math.abs(out.amount)-incoming.amount});incoming.done=true;out.done=true;return s;}
export function unlink(s,id){const l=linked(s,id);s.links=s.links.filter(x=>x!==l);get(s,l.in).done=false;get(s,l.out).done=false;return s;}
export function ready(s,r){if(linked(s,r.id))return true;if(r.kind==='payable')return Object.values(r.shares).reduce((a,b)=>a+b,0)===r.amount;if(r.kind==='settlement'||r.amount>0)return remainder(r)===0;return sum(r.tags)===-r.amount&&(!Object.keys(r.shares).length||Object.values(r.shares).reduce((a,b)=>a+b,0)===-r.amount);}
export function stats(s){
 const expenses=s.rows.filter(r=>r.amount<0&&!linked(s,r.id)&&r.kind!=='settlement');const paid=-expenses.reduce((n,r)=>n+r.amount,0);const back=expenses.reduce((n,r)=>n+recovered(s,r.id),0);
 const owed=expenses.reduce((n,r)=>n+['Alex','Maya'].reduce((a,p)=>a+Math.max(0,(r.shares[p]||0)-recovered(s,r.id,p)),0),0);
 const payable=s.rows.filter(r=>r.kind==='payable').reduce((n,r)=>n+Math.max(0,(r.shares.Me||0)-recovered(s,r.id)),0);
 const fees=s.links.reduce((n,l)=>n+l.fee,0),income=s.rows.reduce((n,r)=>n+r.income,0);
 return {paid,back,owed,payable,fees,income,fronted:paid-back,unresolved:s.rows.filter(r=>r.amount>0&&r.kind!=='payable'&&!linked(s,r.id)).reduce((n,r)=>n+remainder(r),0)};
}
export function addBatch(s){if(s.batchAdded)return s;s.batchAdded=true;for(let i=0;i<120;i++)s.rows.push({id:'routine-'+i,name:['Metro groceries','Corner café','City market'][i%3],amount:-(1250+i*17),account:'Mastercard',date:'2026-08-'+String(1+i%28).padStart(2,'0'),event:null,tags:[],shares:{},allocations:[],income:0,incomeTag:'',suggestedTag:i%3===1?'Dining':'Groceries',done:false});return s;}
export const suggestible=r=>r.suggestedTag&&!r.done&&(r.amount>0?!used(r):!r.tags.length);
export function batchApply(s,ids){for(const id of ids){const r=get(s,id);if(!r||!suggestible(r)||linked(s,id))continue;if(r.amount>0)assignIncome(s,id,r.suggestedTag);else tagAmount(s,id,r.suggestedTag,-r.amount);r.done=true;}return s;}
