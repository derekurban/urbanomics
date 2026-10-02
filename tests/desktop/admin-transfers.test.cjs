const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {ImportStore}=require('../../electron/imports/store.cjs');
const {csv}=require('../../electron/imports/parsers.cjs');
const {configurationSQL}=require('../../electron/configuration.cjs');
test('unlink all previews, rejects stale tokens, backs up and atomically clears both sides including archived accounts',t=>{
 const root=path.resolve('private/validation/admin-transfers-'+randomUUID()),s=new ImportStore(root);t.after(()=>s.close());
 const a=s.addAccount('Synthetic spending','pc','chequing'),b=s.addAccount('Synthetic savings','pc','savings');
 const add=(account,name,entries)=>{const file=path.join(root,name+'.csv');fs.writeFileSync(file,csv([['Description','Type','Card Holder Name','Date','Time','Amount'],...entries.map(([text,value])=>[text,'TEST','TEST','08/01/2026','12:00 AM',value])]));s.resolveAccount(s.enqueue([file]).ids[0],account,false);};
 add(a,'out',[['Send fee',-100],['Send exact',-200],['Unrelated expense',-50]]);add(b,'in',[['Receive fee',99],['Receive exact',200],['Unrelated income',1000]]);
 const get=name=>s.review.records().find(r=>r.description===name);
 for(const name of ['fee','exact']){const out=get('Send '+name),incoming=get('Receive '+name);s.review.linkTransfer(out.id,out.version,incoming.id,incoming.version,200);}
 const first=s.admin.previewUnlink();assert.equal(first.count,4);assert.equal(first.pairs,2);assert.equal(first.unpaired,0);
 assert.throws(()=>s.admin.unlinkAll(s.admin.preview().token),/Transactions changed/,'Tokens are action-specific');
 const changed=get('Send fee');s.review.write(changed.id,{...changed.review,tags:[{id:'preserved-tag',cents:10000}],groups:['preserved-event'],assignedPersonId:'preserved-person'},changed.version);
 assert.throws(()=>s.admin.unlinkAll(first.token),/Transactions changed/);
 s.deleteAccount(b);assert.equal(s.admin.previewUnlink().archived,2);
 const before=s.review.records(),config=configurationSQL(s.db),raw=Object.fromEntries(['transactions','sources','snapshots'].map(table=>[table,s.db.prepare('SELECT * FROM '+table).all()]));
 const write=s.review.write.bind(s.review);let writes=0;
 s.review.write=(...args)=>{if(++writes===2)throw new Error('Injected failure');return write(...args);};
 assert.throws(()=>s.admin.unlinkAll(s.admin.previewUnlink().token),/Injected failure/);assert.deepEqual(s.review.records(),before);s.review.write=write;
 const result=s.admin.unlinkAll(s.admin.previewUnlink().token);assert.equal(result.count,4);assert.equal(result.pairs,2);
 const recovery=JSON.parse(fs.readFileSync(result.backup,'utf8'));assert.equal(recovery.action,'unlink-all-transfers');assert.equal(recovery.records.length,4);
 for(const row of s.review.records()){
  const old=before.find(r=>r.id===row.id);
  if(old.review.kind!=='transfer'){assert.deepEqual(row,old);continue;}
  assert.deepEqual(row.review,{...old.review,kind:'unreviewed',reviewed:false,transferId:'',transferFeeCents:0,transferExcessCents:0});assert.equal(row.version,old.version+1);
  assert.deepEqual(recovery.records.find(r=>r.id===row.id).review,old.review);
 }
 assert.equal(configurationSQL(s.db),config);for(const [table,values]of Object.entries(raw))assert.deepEqual(s.db.prepare('SELECT * FROM '+table).all(),values);
 const files=fs.readdirSync(path.join(root,'backups/admin'));assert.deepEqual(s.admin.unlinkAll(s.admin.previewUnlink().token),{count:0,pairs:0,backup:null});assert.deepEqual(fs.readdirSync(path.join(root,'backups/admin')),files);
 // An incomplete legacy transfer is explicitly counted and cleared as well.
 const orphan=get('Send exact');s.review.write(orphan.id,{...orphan.review,kind:'transfer',transferId:'missing',transferExcessCents:10},orphan.version);
 const preview=s.admin.previewUnlink();assert.equal(preview.pairs,0);assert.equal(preview.unpaired,1);s.admin.unlinkAll(preview.token);assert.equal(get('Send exact').review.transferId,'');
});
