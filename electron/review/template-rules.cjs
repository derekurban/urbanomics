const {tagType}=require('./tag-model.mjs');
const {savedTags,isOther}=require('./system-tags.mjs');
function normalizeTemplate(value,entities,direction){
 if(value==null)return null;
 if(!['in','out'].includes(direction)||typeof value.autoReview!=='boolean'||!Array.isArray(value.tags)||!Array.isArray(value.groups))throw Error('Templates need a direction, tag proportions, events and review preference.');
 const tags=value.tags.map(p=>({id:p.id,weight:p.weight}));
 if(new Set(tags.map(p=>p.id)).size!==tags.length||tags.some(p=>!Number.isSafeInteger(p.weight)||p.weight<=0||p.weight>10000||!entities.some(e=>e.id===p.id&&e.kind==='category'&&!isOther(e.id,entities)&&tagType(e)===(direction==='in'?'income':'expense')))||tags.reduce((n,p)=>n+p.weight,0)>10000)throw Error('Template tag percentages must fit within 100% and match the direction.');
 const groups=[...new Set(value.groups)];if(groups.some(id=>!entities.some(e=>e.id===id&&e.kind==='group')))throw Error('Choose existing template events.');
 return {tags,groups,autoReview:value.autoReview};
}
function portions(amount,tags){
 const weights=[...tags,{id:'remainder',weight:10000-tags.reduce((n,p)=>n+p.weight,0)}];
 const rows=weights.map((p,index)=>({...p,index,cents:Number(BigInt(amount)*BigInt(p.weight)/10000n),remainder:Number(BigInt(amount)*BigInt(p.weight)%10000n)}));
 let left=amount-rows.reduce((n,p)=>n+p.cents,0);for(const p of [...rows].sort((a,b)=>b.remainder-a.remainder||a.index-b.index)){if(!left)break;p.cents++;left--;}
 return rows.filter(p=>p.id!=='remainder'&&p.cents>0).map(({id,cents})=>({id,cents}));
}
function templateCandidate(row,matched,entities){
 const result={id:row.id,date:row.date,description:row.description,account:row.account,amountCents:row.amountCents,currency:row.currency,version:row.version,rules:matched.map(r=>r.name),ruleIds:matched.map(r=>r.id),changes:{},conflicts:[]};
 if(matched.length!==1)return {...result,status:'conflict',reason:'A template overlaps another rule. Resolve the competing matches before applying.',conflicts:matched.map(r=>r.name)};
 const rule=matched[0];
 try{normalizeTemplate(rule.template,entities,rule.direction);}catch(e){return {...result,status:'protected',reason:e.message};}
 if(row.review.templateRuleId===rule.id)return {...result,status:'unchanged',reason:'This transaction already has a template decision.'};
 if(!['unreviewed','expense'].includes(row.review.kind)||savedTags(row).length||row.review.allocations?.some(a=>a.cents>0)||row.review.shares?.length||(row.review.assignedPersonId&&row.review.assignedPersonId!==rule.personId)||row.review.groups.length)return {...result,status:'protected',reason:'Existing tags, people, events or financial decisions are preserved.'};
 return {...result,status:'ready',reason:rule.template.autoReview?'Apply template and accept without manual review.':'Apply template and keep in the attention queue.',changes:{template:rule.template,tags:portions(Math.abs(row.amountCents),rule.template.tags),personId:rule.personId,templateRuleId:rule.id}};
}
module.exports={normalizeTemplate,templateCandidate,portions};
