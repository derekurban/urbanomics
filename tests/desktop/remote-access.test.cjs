const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {startWebServer}=require('../../electron/web-server.cjs');
const {ImportStore}=require('../../electron/imports/store.cjs');
const {createWorkspaceService}=require('../../electron/workspace-service.cjs');
const {isTailscaleIPv4,createPeerAuthorizer}=require('../../electron/tailscale-auth.cjs');
// Raw HTTP preserves a proxy's Host header; Node fetch rewrites it to the target URL.
function fetch(url, options={}) {return new Promise((resolve,reject)=>{const req=require('node:http').request(url,{method:options.method||'GET',headers:options.headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(options.body);});}
test('direct access authenticates the socket peer using Tailscale, fails closed and rejects non-tailnet addresses',async()=>{
 assert.equal(isTailscaleIPv4('100.64.0.1'),true);assert.equal(isTailscaleIPv4('100.127.255.255'),true);
 for(const ip of ['127.0.0.1','192.168.1.1','100.128.0.1','100.64.0.999','100.64.0.1;echo'])assert.equal(isTailscaleIPv4(ip),false);
 const auth=createPeerAuthorizer('owner@example.com','unused',async address=>({UserProfile:{LoginName:address==='100.64.0.1'?'owner@example.com':'someone@example.com'},Node:{}}));
 assert.equal(await auth('100.64.0.1'),true);assert.equal(await auth('100.64.0.2'),false);assert.equal(await auth('127.0.0.1'),false);
 assert.equal(await createPeerAuthorizer('owner','unused',async()=>{throw Error('offline');})('100.64.0.1'),false);
 assert.equal(await createPeerAuthorizer('owner','unused',async()=>({UserProfile:{LoginName:'owner'},Node:{Tags:['tag:shared']}}))('100.64.0.1'),false);
});
test('Tailscale proxy checks owner, origin and CSRF before reads/writes; HTTP and desktop share one service',async()=>{
 const root=path.resolve(__dirname,'../../private/validation/remote-'+randomUUID()),store=new ImportStore(root);
 const service=createWorkspaceService({store,configurationDir:path.join(root,'configuration'),platform:{reveal:()=>{throw Error('must not open desktop folders');}}});
 const remote={origin:'https://desktop.test.ts.net',login:'owner@example.com'};
 const server=await startWebServer({root,port:0,sharedStore:store,sharedService:service,remote});
 const trusted={Host:'desktop.test.ts.net','Tailscale-User-Login':remote.login};
 try {
  for(const url of ['/','/api/session','/api/events','/api/files/source/'+ 'a'.repeat(64)]){
   assert.equal((await fetch(server.origin+url)).status,403);
   assert.equal((await fetch(server.origin+url,{headers:{Host:trusted.Host,'Tailscale-User-Login':'other@example.com'}})).status,403);
  }
  const session=await (await fetch(server.origin+'/api/session',{headers:trusted})).json();assert.equal(session.workspaceMode,'desktop');
  const headers={...trusted,Origin:remote.origin,'X-Urbanomics-Token':session.token,'Content-Type':'application/json'};
  const call=async(method,args=[])=>fetch(server.origin+'/api/call',{method:'POST',headers,body:JSON.stringify({method,args})});
  let changed=0;const off=service.subscribe(event=>{if(event==='changed')changed++;});
  const result=await (await call('saveEntity',['category',{name:'Mobile test',color:'#88aa88'}])).json();assert.equal(result.ok,true);assert.ok(store.review.entities().some(e=>e.id===result.value));assert.equal(changed,1);
  const desktop=await service.invoke('review:entity','category',{name:'Desktop test',color:'#88aa88'});
  assert.ok((await (await call('reviewState')).json()).value.entities.some(e=>e.id===desktop.value));assert.equal(changed,2);off();
  assert.equal((await (await call('drop',[['C:/private.csv']])).json()).ok,false);
  assert.equal((await (await call('reveal',['private'])).json()).ok,false);
  assert.equal((await fetch(server.origin+'/api/session',{headers:{...trusted,Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(server.origin+'/api/call',{method:'POST',headers:{...headers,'X-Urbanomics-Token':'wrong'},body:'{}'})).status,403);
  await server.close();assert.equal(store.review.entities().filter(e=>!e.systemRole).length,2);
 } finally {if(server) await server.close();store.close();}
});
