const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startWebServer}=require('../electron/web-server.cjs');
const {csv}=require('../electron/imports/parsers.cjs');
const root=path.resolve('private/validation/virtual-roll-'+Date.now());fs.mkdirSync(root,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const count of [500,1000]){
  const server=await startWebServer({root:path.join(root,String(count)),port:0});
  try{
   const store=server.store,account=store.addAccount('Large queue','pc','chequing');
   const file=path.join(root,count+'.csv');fs.writeFileSync(file,csv([['Description','Type','Card Holder Name','Date','Time','Amount'],...Array.from({length:count},(_,i)=>['Queue expense '+i,'SYNTHETIC','SAMPLE','09/18/2026','12:00 AM',(-10-i/100).toFixed(2)]),...Array.from({length:24},(_,i)=>['Queue income '+i,'SYNTHETIC','SAMPLE','09/18/2026','12:00 AM',String(2000+i)])]));
   store.resolveAccount(store.enqueue([file]).ids[0],account,false);
   const page=await browser.newPage({viewport:{width:1346,height:960}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
   await page.addInitScript(()=>{window.maxMounted=0;const sample=()=>{window.maxMounted=Math.max(window.maxMounted,document.querySelectorAll('.money-card').length);requestAnimationFrame(sample);};requestAnimationFrame(sample);});
   const settled=()=>page.waitForFunction(()=>{const s=document.querySelector('.scene');return s?.dataset.transition==='idle'&&s.dataset.moving==='false'&&document.querySelector('.money-card[aria-hidden="false"]:not([inert])');});
   const modes=()=>page.getByRole('navigation',{name:'Experimental queues'});
   const deck=()=>page.getByRole('region',{name:'Transaction cards. Scroll or use arrow keys.'});
   const position=()=>page.locator('.experimental-roll .position').textContent();
   const active=()=>page.locator('.money-card[aria-hidden="false"]');
   await page.goto(server.origin+'/#experimental');await modes().getByRole('button',{name:/Expenses/}).click();await settled();
   assert.equal(await position(),`1 / ${count}`);
   const centered=await active().evaluate(el=>{const c=el.getBoundingClientRect(),d=el.parentElement.getBoundingClientRect();return Math.abs(c.y+c.height/2-d.y-d.height/2);});assert.ok(centered<1,'First card is centered after an empty queue');
   await deck().press('End');await settled();assert.equal(await position(),`${count} / ${count}`);assert.ok(await active().isVisible());
   await deck().press('Home');await settled();assert.equal(await position(),`1 / ${count}`);
   for(let i=0;i<15;i++)await deck().press('PageDown');await settled();assert.equal(await position(),`46 / ${count}`);
   const rail=await page.getByRole('listbox',{name:'right transaction index'}).boundingBox();
   await page.mouse.move(rail.x+rail.width/2,rail.y+rail.height/2);await page.mouse.down();await page.mouse.move(rail.x+rail.width/2,rail.y+rail.height/2-250,{steps:8});await page.mouse.up();await settled();
   assert.ok(Number((await position()).split('/')[0])>46,'Rail drag crosses the mounted window');
   const original=await active().locator('.ct-receipt strong').textContent();
   await page.screenshot({path:path.join(root,`${count}-middle.png`)});
   // Tag at a window boundary, then undo using the existing versioned service.
   await page.getByRole('button',{name:'Category Food',exact:true}).click();
   await active().getByRole('button',{name:'Add Groceries',exact:true}).click();
   await active().getByRole('button',{name:'Save expense'}).click();
   await page.waitForFunction(()=>!document.querySelector('.send-envelope')&&!document.querySelector('.ex-heading button')?.disabled);await settled();
   assert.match(await position(),new RegExp('/ '+(count-1)+'$'));
   const tagged=store.review.records().find(r=>r.description===original);assert.equal(tagged.review.tags.length,1);
   await page.getByRole('button',{name:'Undo last decision'}).click();await settled();assert.equal(store.review.records().find(r=>r.id===tagged.id).review.tags.length,0);
   await page.waitForFunction(n=>document.querySelector('.experimental-roll .position').textContent.endsWith('/ '+n),count);
   // A complete mode replacement must mount its destination before the entry flight.
   await modes().getByRole('button',{name:/Income/}).click();await settled();
   await active().getByRole('button',{name:'Choose income',exact:true}).click();await active().getByRole('button',{name:'Add Paycheck',exact:true}).click();
   await deck().press('End');await settled();await deck().press('Home');await settled();assert.equal(await active().getByLabel('Amount for Paycheck').count(),1,'Draft survives unmount/remount');
   await modes().getByRole('button',{name:/Expenses/}).click();await settled();assert.match(await position(),new RegExp('/ '+count+'$'));
   await page.emulateMedia({reducedMotion:'reduce'});await deck().press('End');await settled();assert.equal(await position(),`${count} / ${count}`);
   await modes().getByRole('button',{name:/Income/}).click();await settled();await modes().getByRole('button',{name:/Expenses/}).click();await settled();
   const max=await page.evaluate(()=>window.maxMounted);assert.ok(max<=18,`Mounted ${max} cards for ${count} expenses`);assert.ok(await page.locator('.tick').count()<=36);
   assert.deepEqual(errors,[]);console.log(JSON.stringify({count,maxMounted:max,checks:'Home/End, rapid PageDown, tag/undo, mode transitions, reduced motion',ok:true}));await page.close();
  }finally{await server.close();}
 }}finally{await browser.close();}console.log(root);
})().catch(e=>{console.error(e);process.exitCode=1;});
