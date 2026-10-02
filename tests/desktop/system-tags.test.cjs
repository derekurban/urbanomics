const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ImportStore}=require('../../electron/imports/store.cjs');
const {configurationSQL,seedConfiguration}=require('../../electron/configuration.cjs');
const {csv}=require('../../electron/imports/parsers.cjs');
const {OTHER_INCOME,OTHER_EXPENSE,TRANSFER_TAG,DEDUCTION_TAG,needsTagging}=require('../../electron/review/system-tags.mjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'urbanomics-system-tags-')),store=new ImportStore(root);
 t.after(()=>store.close());
 const a=store.addAccount('Sample checking','pc','chequing'),b=store.addAccount('Sample savings','pc','savings');
 function add(account,name,rows){const file=path.join(root,name+'.csv');fs.writeFileSync(file,csv([['Description','Type','Card Holder Name','Date','Time','Amount'],...rows.map(([name,n])=>[name,'SAMPLE','SAMPLE','09/01/2026','12:00 AM',n])]));store.resolveAccount(store.enqueue([file]).ids[0],account,false);}
 add(a,'first',[['Dinner',-100],['Pay',1000],['Repayment',70],['Outgoing',-500]]);add(b,'second',[['Incoming',500]]);
 const row=name=>store.review.records().find(t=>t.description===name),view=name=>store.review.state().records.find(t=>t.description===name);
 return {root,store,row,view};
}
test('automatic Other preserves ledger, rules replace defaults, explicit Other can be filed and reset',async t=>{
 const {store,row,view}=fixture(t),before=JSON.stringify(store.review.records());
 assert.equal(view('Dinner').review.tags[0].id,OTHER_EXPENSE);
 assert.equal(view('Pay').review.tags[0].id,OTHER_INCOME);
 assert.equal(view('Pay').review.tags[0].cents,100000);
 assert.ok(needsTagging(view('Dinner')));
 assert.equal(JSON.stringify(store.review.records()),before);
 const tag=store.review.entity('category',{name:'Dining',color:'#123456'});
 const r=store.transactionRules.save({name:'Dinner rule',pattern:'^Dinner',categoryId:tag,personId:'',direction:'out',enabled:true});
 const preview=store.transactionRules.state();assert.equal(preview.candidates.find(c=>c.id===row('Dinner').id).status,'ready');
 store.transactionRules.apply(preview.token);assert.equal(view('Dinner').review.tags[0].id,tag);assert.equal(needsTagging(view('Dinner')),false);
 const pay=row('Pay');store.review.financial(pay.id,pay.version,{kind:'income',tags:[{id:OTHER_INCOME,cents:pay.amountCents}]});
 assert.equal(view('Pay').review.incomeType,'');assert.equal(needsTagging(view('Pay')),false);
 const {attentionQueues}=await import('../../src/experimental-model.js');
 assert.equal(attentionQueues(store.review.state().records,{routes:[],maxDays:1,basisPoints:0}).income.some(t=>t.id===pay.id),false);
 store.admin.untagAll(store.admin.preview().token);
 assert.equal(view('Dinner').review.tags[0].id,OTHER_EXPENSE);assert.ok(needsTagging(view('Pay')));
});
test('system identities are locked, renames round-trip in configuration without financial data',t=>{
 const {store,root,row}=fixture(t),before=JSON.stringify(store.review.records());
 const tag=store.review.entities().find(t=>t.id===OTHER_EXPENSE);
 store.review.entity('category',{...tag,name:'Miscellaneous'});
 assert.throws(()=>store.review.entity('category',{...tag,color:'#ffffff'}),/locked/);
 assert.throws(()=>store.review.entity('category',{...tag,parentId:'different'}),/locked/);
 assert.throws(()=>store.review.removeEntity(tag.id),/cannot be deleted/);
 assert.throws(()=>store.review.reorderTags([tag.id],[tag.id]),/fixed position/);
 const pay=row('Pay');assert.throws(()=>store.review.organize([{id:pay.id,version:pay.version,tags:[{id:TRANSFER_TAG,cents:pay.amountCents}]}]),/lens|existing/);
 assert.equal(JSON.stringify(store.review.records()),before);
 const config=configurationSQL(store.db);assert.ok(config.includes('Miscellaneous'));assert.ok(!config.includes(row('Dinner').id));
 const file=path.join(root,'config.sql');fs.writeFileSync(file,config);
 const fresh=new ImportStore(path.join(root,'fresh'));try{seedConfiguration(fresh.db,file);assert.equal(fresh.review.entities().find(e=>e.id===OTHER_EXPENSE).name,'Miscellaneous');assert.equal(fresh.review.records().length,0);}finally{fresh.close();}
});
test('existing Other definitions retain their IDs and become the gray locked default', async t=>{
 const {store,view,row}=fixture(t);
 store.db.prepare("INSERT INTO review_entities (id,kind,name,color,tags,flowType) VALUES ('legacy-other','category','Other','#123456','[]','income')").run();
 assert.equal(view('Pay').review.tags[0].id,'legacy-other');
 const original=JSON.stringify(store.review.records());
 const entity=store.review.entities().find(e=>e.id==='legacy-other');assert.equal(entity.color,'#929292');assert.equal(entity.systemRole,'other-income');
 store.review.entity('category',{...entity,name:'Unsorted'});
 assert.equal(view('Pay').review.tags[0].id,'legacy-other');assert.equal(store.review.entities().find(e=>e.id==='legacy-other').name,'Unsorted');
 const {retag}=await import('../../src/review-model.js');
 const specific=store.review.entity('category',{name:'Wages',flowType:'income',color:'#123456'});
 assert.deepEqual(retag(view('Pay').review.tags,['legacy-other',specific],100000,store.review.entities()),[{id:specific,cents:100000}]);
 assert.equal(JSON.stringify(store.review.records()),original);
});
test('transfer and deduction tags follow real links, preserve original expense tags, and do not change totals',async t=>{
 const {store,row,view}=fixture(t);
 const out=row('Outgoing'),inc=row('Incoming');store.review.linkTransfer(out.id,out.version,inc.id,inc.version,0);
 for(const name of ['Outgoing','Incoming']){assert.equal(view(name).systemTags[0].id,TRANSFER_TAG);assert.equal(view(name).tagsAutomatic,false);assert.equal(needsTagging(view(name)),false);}
 const person=store.review.entity('person',{name:'Sample friend',color:'#123456'}),expense=row('Dinner'),pay=row('Repayment');
 store.review.financial(pay.id,pay.version,{kind:'repayment',personId:person,allocations:[{id:expense.id,cents:6000}],remainder:1000});
 assert.equal(view('Dinner').systemTags[0].id,DEDUCTION_TAG);assert.equal(view('Repayment').systemTags[0].id,DEDUCTION_TAG);
 assert.equal(view('Dinner').review.tags[0].id,OTHER_EXPENSE);assert.equal(view('Dinner').review.tags[0].cents,10000);
 const {dashboard}=await import('../../src/dashboard-model.js');const state=store.review.state();
 const totals=dashboard(state.records,state.entities,{from:'2026-09-01',through:'2026-09-30',currency:'CAD'});
 assert.equal(totals.cashIn,107000);assert.equal(totals.cashOut,10000);assert.equal(totals.net,4000);
 store.review.entity('system',{id:DEDUCTION_TAG,name:'Shared repayment'});assert.equal(view('Dinner').systemTags[0].name,'Shared repayment');
 const current=row('Repayment');store.review.financial(current.id,current.version,{kind:'income'});
 assert.equal(view('Dinner').systemTags.length,0);assert.equal(view('Repayment').systemTags.length,0);
 store.review.unlinkTransfer(out.id,row('Outgoing').version,row('Incoming').version);
 assert.equal(view('Outgoing').systemTags.length,0);assert.equal(view('Outgoing').review.tags[0].id,OTHER_EXPENSE);
});
