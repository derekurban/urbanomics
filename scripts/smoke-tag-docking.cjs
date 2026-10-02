const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startWebServer}=require('../electron/web-server.cjs');
(async()=>{
 const root=path.resolve('private/validation/tag-docking-'+Date.now());
 const server=await startWebServer({root:path.join(root,'data'),port:0});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1346,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const food=server.store.review.entities().find(e=>e.kind==='bucket'&&e.name==='Food');
 for(const name of ['Coffee','Delivery','Snacks','Very long vendor tag name'])server.store.review.entity('category',{name,parentId:food.id,color:'#aaaabb'});
 const fixture=path.join(root,'docking.csv');fs.writeFileSync(fixture,require('../electron/imports/parsers.cjs').csv([['Description','Type','Card Holder Name','Date','Time','Amount'],['Docking groceries','SAMPLE','SAMPLE','09/18/2026','12:00 AM',-128.60],['Docking second expense','SAMPLE','SAMPLE','09/18/2026','12:00 AM',-84.20]]));server.store.resolveAccount(server.store.enqueue([fixture]).ids[0],server.store.transferLab.accounts()[0].id,false);
 const active=()=>page.locator('.money-card[aria-hidden="false"]:not([inert])');
 const settle=()=>page.waitForFunction(()=>document.querySelector('.scene')?.dataset.moving==='false'&&document.querySelector('.money-card[aria-hidden="false"]:not([inert])'));
 const shot=async name=>page.screenshot({path:path.join(root,name+'.png'),fullPage:true});
 const flight=async(action,name)=>{
  await page.evaluate(()=>{window.dockWatch=true;const watch=()=>{const el=document.querySelector('.ct-tag-flight');if(el){const a=el.getAnimations()[0];if(a&&a.currentTime>90){a.pause();window.dockAnimation=a;return;}}if(window.dockWatch)requestAnimationFrame(watch);};requestAnimationFrame(watch);});
  await action();await page.waitForFunction(()=>window.dockAnimation?.playState==='paused');
  assert.equal(await page.locator('.ct-tag-flight').count(),1);
  await shot(name);await page.evaluate(()=>{window.dockWatch=false;window.dockAnimation.play();window.dockAnimation=null;});
  await page.locator('.ct-tag-flight').waitFor({state:'detached'});
 };
 try{
  await page.goto(server.origin+'/#experimental');
  await page.getByRole('navigation',{name:'Experimental queues'}).getByRole('button',{name:/Expenses/}).click();await settle();
  await active().getByRole('button',{name:'Category Food',exact:true}).click();
  await flight(()=>active().getByRole('button',{name:'Add Groceries',exact:true}).click(),'select-midflight');
  assert.equal(await active().getByRole('button',{name:'Add Groceries',exact:true}).count(),0);
  assert.equal(await active().getByLabel('Amount for Groceries').count(),1);
  await flight(()=>active().getByRole('button',{name:'Remove Groceries',exact:true}).click(),'return-midflight');
  assert.equal(await active().getByRole('button',{name:'Add Groceries',exact:true}).count(),1);
  await active().getByRole('button',{name:'Add Groceries',exact:true}).press('Enter');await page.waitForTimeout(350);
  assert.ok(await active().getByLabel('Amount for Groceries').evaluate(el=>el===document.activeElement),'Keyboard focus follows selected tag');
  await active().getByRole('button',{name:'Remove Groceries',exact:true}).press('Enter');await page.waitForTimeout(350);
  assert.ok(await active().getByRole('button',{name:'Add Groceries',exact:true}).evaluate(el=>el===document.activeElement),'Keyboard focus returns to available tag');
  for(const name of ['Groceries','Restaurants','Coffee','Delivery','Snacks','Very long vendor tag name'])await active().getByRole('button',{name:'Add '+name,exact:true}).click();
  await page.waitForTimeout(350);assert.equal(await page.locator('.ct-tag-flight').count(),0);await shot('six-tags');
  assert.equal(await active().locator('[data-tag-tile][style*="visibility: hidden"]').count(),0);
  const grid=await active().locator('.ct-mini-grid').boundingBox(),list=await active().locator('.ct-mini-available').boundingBox();assert.ok(grid.y+grid.height<=list.y+1,'Grid and available tags do not overlap');
  await active().getByLabel('Amount for Groceries').fill('0.01');await active().getByLabel('Amount for Groceries').press('Enter');
  const before=await active().locator('.ct-mini-slot input').evaluateAll(els=>els.reduce((s,e)=>s+Math.round(Number(e.value)*100),0));
  const rail=await active().locator('.ct-mini-rail').boundingBox(),handle=await active().getByRole('slider',{name:'Divider after Restaurants',exact:true}).boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(rail.x+rail.width*.3,handle.y+handle.height/2,{steps:20});await page.mouse.up();
  assert.equal(await active().locator('.ct-mini-slot input').evaluateAll(els=>els.reduce((s,e)=>s+Math.round(Number(e.value)*100),0)),before);
  await active().getByRole('button',{name:'Remove Coffee',exact:true}).click();
  await page.getByRole('button',{name:'Next card',exact:true}).click();await settle();assert.equal(await page.locator('.ct-tag-flight').count(),0,'Card switch clears flight');
  await page.getByRole('button',{name:'Previous card',exact:true}).click();await settle();assert.equal(await active().getByLabel('Amount for Groceries').inputValue(),'0.01','Draft survives navigation');
  await page.emulateMedia({reducedMotion:'reduce'});await active().getByRole('button',{name:'Add Coffee',exact:true}).click();assert.equal(await page.locator('.ct-tag-flight').count(),0);
  await shot('reduced-motion');assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,root}));
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
