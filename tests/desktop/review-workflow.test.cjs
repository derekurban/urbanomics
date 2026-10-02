const test = require('node:test'), assert = require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), {randomUUID}=require('node:crypto');
const {ImportStore}=require('../../electron/imports/store.cjs');
const {configurationSQL,seedConfiguration}=require('../../electron/configuration.cjs');
const {orderedTags,tagFits}=require('../../electron/review/tag-model.mjs');
test('tag ordering is atomic, detects stale changes, follows gradients and round-trips configuration without changing financial records',async t=>{
 const root=path.resolve(__dirname,'../../private/validation/order-'+randomUUID());
 const store=new ImportStore(root); t.after(()=>store.close());
 const group=store.review.entity('bucket',{name:'Food',color:'#88aa88',gradientStart:'#ff0000',gradientEnd:'#0000ff'});
 const a=store.review.entity('category',{name:'Alpha',parentId:group,color:'#88aa88'}), b=store.review.entity('category',{name:'Beta',parentId:group,color:'#88aa88'});
 const income=store.review.entity('category',{name:'Income',flowType:'income',color:'#88aa88'});
 const account=store.addAccount('Synthetic account','pc','chequing');
 const sample=path.join(root,'sample.csv');
 fs.writeFileSync(sample,require('../../electron/imports/parsers.cjs').csv([
  ['Description','Type','Card Holder Name','Date','Time','Amount'],
  ['Synthetic purchase','SYNTHETIC','TEST','08/01/2026','12:00 AM','-12.34']
 ]));
 store.resolveAccount(store.enqueue([sample]).ids[0],account,false);
 const record=store.review.records()[0];
 store.review.organize([{id:record.id,version:record.version,tags:[{id:a,cents:1234}]}]);
 const before=store.db.prepare('SELECT * FROM review_items').all();
 store.review.reorderTags([b,a],[a,b]);
 assert.deepEqual(orderedTags(store.review.entities().filter(e=>e.parentId===group)).map(e=>e.id),[b,a]);
 assert.throws(()=>store.review.reorderTags([a,b],[a,b]),/changed/);
 assert.throws(()=>store.review.reorderTags([income,a],[b,a]),/changed/);
 const {categoryColors}=await import('../../src/category-colors.js');
 assert.equal(categoryColors(store.review.entities()).find(e=>e.id===b).color,'#ff0000');
 assert.equal(categoryColors(store.review.entities()).find(e=>e.id===a).color,'#0000ff');
 store.review.entity('category',{...store.review.entities().find(e=>e.id===b),name:'Zulu'});
 assert.deepEqual(orderedTags(store.review.entities().filter(e=>e.parentId===group)).map(e=>e.id),[b,a]);
 const newTag=store.review.entity('category',{name:'Aardvark',parentId:group,color:'#88aa88'});
 assert.deepEqual(orderedTags(store.review.entities().filter(e=>e.parentId===group)).map(e=>e.id),[b,a,newTag]);
 assert.deepEqual(store.db.prepare('SELECT * FROM review_items').all(),before);
 const config=path.join(root,'configuration.sql');fs.writeFileSync(config,configurationSQL(store.db));
 const copy=new ImportStore(path.join(root,'copy'));try {seedConfiguration(copy.db,config);assert.deepEqual(copy.review.entities().sort((a,b)=>a.id.localeCompare(b.id)),store.review.entities().sort((a,b)=>a.id.localeCompare(b.id)));}finally{copy.close();}
 assert.equal(tagFits({amountCents:10,review:{kind:'repayment'}},{flowType:'income'}),true);
 assert.equal(tagFits({amountCents:10,review:{kind:'transfer'}},{flowType:'income'}),false);
});
test('review overview separates transfers, incoming allocations, claims and cross-month repayments including untagged costs', async()=>{
 const {reviewOverview}=await import('../../src/review-overview-model.js');
 const {transactionState,transactionLabels}=await import('../../src/transaction-state.js');
 const row=(id,amount,review={},extra={})=>({id,description:id,amountCents:amount,date:'2026-08-10',month:'2026-08',accountId:'a',account:'A',currency:'CAD',review:{kind:'unreviewed',tags:[],groups:[],allocations:[],shares:null,...review},...extra});
 const records=[row('out',-10000,{kind:'transfer',transferId:'in'}),row('in',10000,{kind:'transfer',transferId:'out'},{accountId:'b'}),row('dinner',-12000,{kind:'expense',shares:[{id:'me',cents:6000},{id:'alex',cents:6000}]}),row('salary',200000,{kind:'income',incomeType:'paycheck'}),row('receipt',7000,{kind:'repayment',personId:'alex',allocations:[{id:'dinner',cents:5000}],remainder:2000},{date:'2026-09-01',month:'2026-09'}),row('coffee',-500)];
 const facts=transactionState(records[0],records);assert.equal(facts.uncategorized,false);assert.deepEqual(transactionLabels(records[0],facts),['Transfer linked']);
 const all=reviewOverview(records,records,[])[0];assert.equal(all.model.cashIn,207000);assert.equal(all.model.cashOut,12500);assert.equal(all.allocated,5000);assert.equal(all.unassigned,2000);assert.equal(all.model.repaid,5000);assert.equal(all.model.owed,1000);assert.equal(all.claims,6000);assert.equal(all.untagged,4);
 assert.equal(all.notClaimed,6500);
 const august=reviewOverview(records,records.filter(t=>t.month==='2026-08'),[])[0];assert.equal(august.model.cashIn,200000);assert.equal(august.allocated,0);assert.equal(august.model.repaid,5000);
});
