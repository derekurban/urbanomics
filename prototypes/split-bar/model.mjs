export const TOTAL=12860;
export const tags=[
 {id:'groceries',name:'Groceries',color:'#a8c6ad',dark:'#456950'},
 {id:'home',name:'Home',color:'#c5b5dc',dark:'#715786'},
 {id:'dining',name:'Dining',color:'#e6bd9d',dark:'#916749'},
 {id:'personal',name:'Personal',color:'#a7c5dc',dark:'#4a708d'},
 {id:'gifts',name:'Gifts',color:'#dfaeba',dark:'#95596b'},
 {id:'other',name:'Other',color:'#d4d4d2',dark:'#71716e'},
];
export const definition=id=>tags.find(t=>t.id===id);
export const sum=parts=>parts.reduce((n,p)=>n+p.cents,0);
export const initial=()=>[{id:'groceries',cents:TOTAL},{id:'other',cents:0}];
export function add(parts,id){
 if(parts.some(p=>p.id===id))return parts;
 const next=parts.map(p=>({...p})),other=next.at(-1);
 let cents=other.cents;
 if(cents)other.cents=0;
 else{const largest=next.reduce((a,b)=>a.cents>=b.cents?a:b);cents=Math.floor(largest.cents/2);largest.cents-=cents;}
 next.splice(next.length-1,0,{id,cents});return next;
}
export function remove(parts,id){
 if(id==='other')return parts;
 const cents=parts.find(p=>p.id===id)?.cents||0;
 return parts.filter(p=>p.id!==id).map(p=>p.id==='other'?{...p,cents:p.cents+cents}:{...p});
}
export function boundary(parts,index,absolute,step=1){
 const next=parts.map(p=>({...p})),before=sum(parts.slice(0,index)),combined=parts[index].cents+parts[index+1].cents;
 const left=Math.max(0,Math.min(combined,Math.round(absolute/step)*step-before));
 next[index].cents=left;next[index+1].cents=combined-left;return next;
}
export function amount(parts,id,cents){
 const next=parts.map(p=>({...p})),target=next.find(p=>p.id===id),total=sum(parts);
 cents=Math.max(0,Math.min(total,Math.round(cents)));
 let delta=cents-target.cents;
 if(delta<0){const receiver=id==='other'?next.find(p=>p.id!=='other'):next.at(-1);if(!receiver)return parts;receiver.cents-=delta;target.cents=cents;}
 else{const donors=[...next.filter(p=>p.id==='other'&&p.id!==id),...next.filter(p=>p.id!=='other'&&p.id!==id).reverse()];for(const p of donors){const taken=Math.min(delta,p.cents);p.cents-=taken;target.cents+=taken;delta-=taken;}}
 return next;
}
export function evenly(parts){
 const active=parts.filter(p=>p.id!=='other'),total=sum(parts);
 if(!active.length)return parts;
 return [...active.map((p,i)=>({...p,cents:Math.floor(total/active.length)+(i<total%active.length?1:0)})),{id:'other',cents:0}];
}
