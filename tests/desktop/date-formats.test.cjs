const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {detectDateFormats,parseCalendarDate}=require('../../electron/imports/date-formats.cjs');
const {ImportStore}=require('../../electron/imports/store.cjs');
const {createWorkspaceService}=require('../../electron/workspace-service.cjs');

test('date detection checks beyond preview rows and exposes decisive evidence',()=>{
 const dates=Array.from({length:455},()=>['09/07/2026']);dates[29]=['08/31/2026'];
 const result=detectDateFormats(dates,0);
 assert.equal(result.status,'conclusive');assert.equal(result.suggested,'mdy');
 assert.equal(result.candidates.find(c=>c.format==='mdy').validCount,455);
 assert.equal(result.candidates.find(c=>c.format==='mdy').example.raw,'08/31/2026');
 assert.deepEqual(result.candidates.find(c=>c.format==='dmy').firstInvalid,{raw:'08/31/2026',record:31});
});
test('ambiguous dates retain both interpretations, including identical-day dates',()=>{
 const r=detectDateFormats([['03/04/2026'],['05/06/2026']],0);
 assert.equal(r.status,'ambiguous');assert.equal(r.suggested,null);
 assert.equal(r.candidates.find(c=>c.format==='mdy').example.date,'2026-03-04');
 assert.equal(r.candidates.find(c=>c.format==='dmy').example.date,'2026-04-03');
 assert.equal(detectDateFormats([['01/01/2026']],0).suggested,null);
});
test('date detection respects leap years, invalid rows, mixed orders and empty files',()=>{
 assert.equal(detectDateFormats([['2024-02-29']],0).suggested,'ymd');
 assert.equal(detectDateFormats([['29/02/2024']],0).suggested,'dmy');
 for(const dates of [[['2026-02-29']],[['04/13/2026'],['13/04/2026']],[['2026-08-01'],['']],[['not a date']],[['01/01/1800']]]){
   const result=detectDateFormats(dates,0);assert.equal(result.status,'invalid');assert.equal(result.suggested,null);
 }
 assert.equal(detectDateFormats([],0).status,'empty');
 assert.throws(()=>parseCalendarDate('09/30/2026','dmy'),/"09\/30\/2026" does not fit Day \/ Month \/ Year/);
});
test('date detection service is read-only, validates column and separator, preserves source bytes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'urbanomics-dates-')),store=new ImportStore(root),service=createWorkspaceService({store,platform:{}});
 t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true})});
 const body='When;Note;Value\n09/07/2026;First;10\n08/31/2026;Next;20\n',file=path.join(root,'dates.csv');fs.writeFileSync(file,body);
 const id=store.enqueue([file],{stage:true,process:false,manualLayouts:true}).ids[0],before=store.job(id),events=[];service.subscribe(event=>{if(event==='changed')events.push(1)});
 const result=await service.invoke('imports:detect-dates',id,0,';');assert.equal(result.ok,true,result.error);assert.equal(result.value.suggested,'mdy');
 assert.deepEqual(store.job(id),before);assert.equal(events.length,0);assert.equal(store.review.records().length,0);
 assert.equal((await service.invoke('imports:detect-dates',id,9,';')).ok,false);
 assert.equal((await service.invoke('imports:detect-dates',id,0,'|')).ok,false);
 assert.equal(fs.readFileSync(path.join(root,'archive/sources',before.source_hash+'.csv'),'utf8'),body);
});
