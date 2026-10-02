const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {startWebServer}=require('../electron/web-server.cjs');
(async()=>{
 const root=path.resolve('private/validation/snapshots-motion-'+Date.now()),server=await startWebServer({root,port:0,seed:false}),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(server.origin);const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose CSV files',exact:true}).click();
  await(await chooser).setFiles(Array.from({length:8},(_,i)=>({name:`Sample_${i}.csv`,mimeType:'text/csv',buffer:Buffer.from(`Date,Description,Amount\n2026-08-${String(i+1).padStart(2,'0')},Synthetic ${i},5\n`)})));
  await page.getByRole('heading',{name:'Staged files'}).waitFor();
  const moving=await page.locator('.sv2').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length);assert.ok(moving>0);
  await page.screenshot({path:path.join(root,'01-stagger-early.png'),fullPage:true});
  await page.waitForTimeout(120);await page.screenshot({path:path.join(root,'02-stagger-mid.png'),fullPage:true});
  await page.getByRole('button',{name:'Set up 8 files',exact:true}).click();await page.getByLabel('Layout name',{exact:true}).waitFor();
  await page.screenshot({path:path.join(root,'03-layout-enter.png'),fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('.sv2').getAnimations({subtree:true}).every(a=>a.playState!=='running'));
  assert.equal(await page.locator('.sv2').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
  await page.getByLabel('Layout name',{exact:true}).fill('Keyboard focus');await page.getByLabel('Layout name',{exact:true}).press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName==='BUTTON'||document.activeElement.tagName==='INPUT'),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,root}));
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
