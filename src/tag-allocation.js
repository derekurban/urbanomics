import {sum,equal} from './review-model.js';

// Keep a zero-valued fallback at the rail's end, without persisting a phantom tag.
export function allocationParts(parts,other,total){
 return [...parts.filter(p=>p.id!==other).map(p=>({...p})),{id:other,cents:parts.find(p=>p.id===other)?.cents??(parts.length?0:total)}];
}
export const savedAllocation=(parts,other)=>parts.filter(p=>p.id!==other||p.cents>0||parts.length===1);
export function addAllocation(parts,id,other){
 const next=parts.map(p=>({...p})),fallback=next.find(p=>p.id===other);
 if(id!==other&&next.some(p=>p.id===id))return next;
 let cents=id!==other?fallback.cents:0;
 if(cents)fallback.cents=0;
 else{const donor=next.reduce((a,b)=>a.cents>=b.cents?a:b);cents=Math.floor(donor.cents/2);donor.cents-=cents;}
 if(id===other)fallback.cents+=cents;else next.splice(next.length-1,0,{id,cents});
 return next;
}
export function removeAllocation(parts,id,other){
 if(id===other)return parts;
 const cents=parts.find(p=>p.id===id)?.cents||0;
 return parts.filter(p=>p.id!==id).map(p=>({...p,cents:p.cents+(p.id===other?cents:0)}));
}
export function editAllocation(parts,id,cents,other){
 if(!Number.isSafeInteger(cents))return parts;
 const next=parts.map(p=>({...p})),target=next.find(p=>p.id===id);
 if(!target)return parts;
 let delta=Math.max(0,Math.min(sum(parts),cents))-target.cents;
 if(delta<0){const receiver=id===other?next.find(p=>p.id!==other):next.find(p=>p.id===other);if(!receiver)return parts;receiver.cents-=delta;target.cents+=delta;}
 else for(const donor of [...next.filter(p=>p.id===other&&p.id!==id),...next.filter(p=>p.id!==other&&p.id!==id).reverse()]){const take=Math.min(delta,donor.cents);donor.cents-=take;target.cents+=take;delta-=take;}
 return next;
}
export function equalAllocation(parts,other){
 const ids=parts.filter(p=>p.id!==other).map(p=>p.id);
 return ids.length?[...equal(ids,sum(parts)),{id:other,cents:0}]:parts;
}
