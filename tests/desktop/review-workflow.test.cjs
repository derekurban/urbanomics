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
