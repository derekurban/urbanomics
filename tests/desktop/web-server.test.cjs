const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { startWebServer } = require('../../electron/web-server.cjs');
const channels = require('../../electron/api-channels.json');

test('browser and Electron expose the same named finance operations', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../../electron/preload.cjs'), 'utf8');
  const methods = [...preload.matchAll(/(\w+):\s*\([^)]*\)\s*=>\s*invoke\(\s*"([^"]+)"/g)];
  assert.deepEqual(Object.fromEntries(methods.map(m => [m[1], m[2]])), channels);
});

test('local browser host persists isolated changes and deduplicates CSV uploads', async () => {
  const root = path.resolve(__dirname, '../../private/validation/web-' + randomUUID());
  const app = await startWebServer({ root, port: 0 });
  const { origin } = app;
  const { token } = await (await fetch(origin + '/api/session')).json();
  const headers = { Origin: origin, 'X-Urbanomics-Token': token, 'Content-Type': 'application/json' };
  const call = async (method, args = []) => (await fetch(origin + '/api/call', {
    method: 'POST', headers, body: JSON.stringify({ method, args }),
  })).json();
  try {
    const state = await call('reviewState');
    assert.equal(state.ok, true);
    assert.equal(state.value.records.length, 15);
    const record = state.value.records.find(t => t.amountCents < 0);
    assert.equal((await call('transactionRulesState')).ok,true);
    const coverage=await call('transactionRuleCoverage',[record.id]);assert.equal(coverage.ok,true);assert.equal(coverage.value.transactionId,record.id);
    const saved = await call('saveEntity', ['category', { name: 'Web test tag', color: '#8fa68b' }]);
    assert.equal(saved.ok, true);
    assert.equal((await call('organize', [[{ id: record.id, version: record.version,
      tags: [{ id: saved.value, cents: Math.abs(record.amountCents) }] }]])).ok, true);
    assert.ok(fs.existsSync(path.join(root, 'configuration/workspace.sql')));
    await assert.rejects(startWebServer({ root, port: 0 }), /already open/);
    const csv = 'Description,Type,Card Holder Name,Date,Time,Amount\nBrowser upload,SYNTHETIC,SAMPLE,08/25/2026,12:00 AM,-12.34\n';
    const upload = async () => (await fetch(origin + '/api/upload', { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'sample-upload.csv' }, body: csv })).json();
    assert.equal((await upload()).ok, true);
    assert.equal((await call('reviewState')).value.records.length, 16);
    assert.equal((await upload()).ok, true);
    assert.equal((await call('reviewState')).value.records.length, 16);
    assert.deepEqual(fs.readdirSync(path.join(root, 'web-uploads')), []);
    const source=app.store.db.prepare('SELECT hash FROM sources LIMIT 1').get();
    const original=await fetch(origin+'/api/files/source/'+source.hash);
    assert.equal(original.status,200);assert.match(original.headers.get('content-disposition'),/attachment/);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()),fs.readFileSync(path.join(root,'archive/sources',source.hash+'.csv')));
    const snapshot=app.store.db.prepare('SELECT id FROM snapshots LIMIT 1').get();
    assert.equal((await fetch(origin+'/api/files/snapshot/'+snapshot.id)).status,200);
    assert.equal((await fetch(origin+'/api/files/source/..%2F..%2Fprivate')).status,404);
    assert.equal((await call('drop', [['C:/arbitrary/private.csv']])).ok, false);
    assert.equal((await call('choose')).ok, false);
    assert.equal((await call('stageDrop', [['C:/arbitrary/private.csv']])).ok,false);
    assert.equal((await call('stageChoose')).ok,false);
    assert.equal((await call('__proto__')).ok, false);
    assert.match((await call('reveal', ['dropbox'])).error, /Electron/);
    assert.equal((await fetch(origin + '/private/browser/workspace.sqlite')).status, 404);
    assert.equal((await fetch(origin + '/api/session', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await fetch(origin + '/api/call', { method: 'POST', headers: { ...headers, 'X-Urbanomics-Token': 'wrong' }, body: '{}' })).status, 403);
    assert.equal((await fetch(origin + '/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(origin + '/api/upload', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-File-Name': '..%2Foutside.csv' }, body: csv })).status, 400);
  } finally { await app.close(); }
  const reopened = await startWebServer({ root, port: 0 });
  try {
    assert.equal(reopened.store.review.records().length, 16);
    assert.ok(reopened.store.review.entities().some(e => e.name === 'Web test tag'));
  } finally { await reopened.close(); }
});

test('V2 web uploads stay staged even for recognized accounts and reject path-based staging',async()=>{const root=path.resolve(__dirname,'../../private/validation/web-v2-'+randomUUID()),app=await startWebServer({root,port:0,seed:false});try{const account=app.store.addAccount('Synthetic bank','eq','',{prefixRegex:'^bank.*'}),{token}=await(await fetch(app.origin+'/api/session')).json(),headers={Origin:app.origin,'X-Urbanomics-Token':token};const res=await(await fetch(app.origin+'/api/upload',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','X-File-Name':'bank.csv','X-Stage-Only':'true'},body:'Transfer date,Description,Amount,Balance\n2026-08-01,Synthetic,12,12\n'})).json();assert.equal(res.ok,true);assert.equal(app.store.job(res.value.ids[0]).account_id,null);const layout=app.store.layouts.save(res.value.ids[0],{name:"Bank layout",prefixRegex:"^bank.*",headers:["Transfer date","Description","Amount","Balance"],mapping:{date:0,description:1,amount:2,balance:3,dateFormat:"ymd",amountMode:"signed",sign:1,currency:"CAD",delimiter:","}});app.store.resolveAccount(res.value.ids[0],account,false,{process:false,allowLayout:true});assert.equal(app.store.review.records().length,0);for(const method of ['stageDrop','stageChoose']){const bad=await(await fetch(app.origin+'/api/call',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({method,args:[['C:/private.csv']]})})).json();assert.equal(bad.ok,false);}const done=await(await fetch(app.origin+'/api/call',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({method:'processImportBatch',args:[res.value.ids]})})).json();assert.equal(done.ok,true,done.error);assert.equal(done.value.added,1);}finally{await app.close();}});
