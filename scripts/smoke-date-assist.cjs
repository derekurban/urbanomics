const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {startWebServer}=require('../electron/web-server.cjs');
(async()=>{
 const root=path.resolve('private/validation/date-assist-browser-'+Date.now()),server=await startWebServer({root,port:0,seed:false}),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const shot=async name=>{await page.waitForFunction(()=>document.getAnimations().every(a=>a.effect?.getComputedTiming().iterations===Infinity||a.playState==='finished'||a.playState==='idle'));return page.screenshot({path:path.join(root,name+'.png'),fullPage:true});};
 const upload=async(name,body)=>{const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose CSV files',exact:true}).click();await(await chooser).setFiles({name,mimeType:'text/csv',buffer:Buffer.from(body)});await page.getByRole('button',{name:'Set up 1 file',exact:true}).click();};
 const map=async name=>{const editor=page.locator('.sv2-compact-editor');await editor.getByLabel('Layout name',{exact:true}).fill(name);await editor.getByLabel('Date',{exact:true}).selectOption('0');await editor.getByLabel('Description',{exact:true}).selectOption('1');await editor.getByLabel('Amount',{exact:true}).selectOption('2');await editor.getByLabel('Positive amounts are',{exact:true}).selectOption('1');return editor;};
 const clear=async()=>{await page.locator('.sv2-rail').getByRole('button',{name:'Files',exact:false}).click();await page.getByRole('button',{name:'Clear staged copies',exact:true}).click();await page.getByRole('button',{name:'Clear copies',exact:true}).click();await page.getByRole('heading',{name:'Every month, filed where it belongs.'}).waitFor();};
 try{
  await page.goto(server.origin);
  const rows=Array.from({length:455},(_,i)=>`${i===29?'08/31/2026':'09/07/2026'},Synthetic ${i},-5.00`);
  await upload('manual.csv','Date,Description,Amount\n'+rows.join('\n'));
  let editor=await map('Personal export');await page.getByText('One format fits all 455 rows. Check the example below.',{exact:true}).waitFor();
  assert.equal(await editor.getByLabel('Date order',{exact:true}).inputValue(),'mdy');await editor.getByText('All rows validated',{exact:true}).waitFor();await shot('01-detected');
  const previewTop=(await editor.locator('.sv2-layout-preview').boundingBox()).y;await editor.getByLabel('Layout name',{exact:true}).fill('Personal export revised');await editor.getByText('All rows validated',{exact:true}).waitFor();assert.equal(Math.round((await editor.locator('.sv2-layout-preview').boundingBox()).y),Math.round(previewTop));assert.equal(await editor.getByLabel('Layout name',{exact:true}).evaluate(el=>el===document.activeElement),true);
  await editor.getByLabel('Date order',{exact:true}).selectOption('dmy');await page.getByText('Record 31: “08/31/2026” does not fit Day / Month / Year.',{exact:true}).waitFor();
  await editor.locator('.sv2-error').filter({hasText:'Record 31: Invalid calendar date:'}).waitFor();assert.equal(await editor.getByLabel('Date order',{exact:true}).inputValue(),'dmy');assert.equal(await editor.getByRole('button',{name:'Save layout',exact:true}).isEnabled(),false);await shot('02-override-error');
  await page.getByRole('button',{name:'Use Month / Day / Year',exact:true}).click();await editor.getByText('All rows validated',{exact:true}).waitFor();await editor.getByRole('button',{name:'Save layout',exact:true}).click();assert.equal(server.store.layouts.list()[0].mapping.dateFormat,'mdy');
  await clear();await upload('ambiguous.csv','Date,Description,Amount\n03/04/2026,First,1\n05/06/2026,Second,2\n');editor=await map('Ambiguous export');
  await page.getByText('2 formats fit all 2 rows. Choose the intended reading.',{exact:true}).waitFor();assert.equal(await editor.getByLabel('Date order',{exact:true}).inputValue(),'');assert.equal(await editor.getByRole('button',{name:'Save layout',exact:true}).isEnabled(),false);await shot('03-ambiguous');
  await page.getByRole('button',{name:'Use Day / Month / Year',exact:true}).click();await editor.getByText('All rows validated',{exact:true}).waitFor();assert.equal(await editor.getByLabel('Date order',{exact:true}).inputValue(),'dmy');
  await editor.getByRole('button',{name:'Save layout',exact:true}).click();await page.getByRole('button',{name:'Map columns',exact:true}).click();assert.equal(await page.getByLabel('Date order',{exact:true}).inputValue(),'dmy');await shot('04-saved-choice');
  await clear();await upload('mixed.csv','Date,Description,Amount\n04/13/2026,First,1\n13/04/2026,Second,2\n');editor=await map('Mixed export');await page.getByText('No single format reads every row. Check for invalid dates or mixed date orders.',{exact:true}).waitFor();assert.equal(await editor.getByLabel('Date order',{exact:true}).inputValue(),'');await shot('05-mixed');
  await clear();await upload('columns.csv','First date,Description,Amount,Second date\n2026-08-31,First,1,08/31/2026\n');
  let release;const gate=new Promise(resolve=>{release=resolve});
  await page.route('**/api/call',async route=>{const body=route.request().postDataJSON();if(body.method==='detectImportDates'&&body.args[1]===0){const response=await route.fetch();await gate;await route.fulfill({response});}else await route.continue();});
  const pending=page.waitForRequest(r=>r.url().endsWith('/api/call')&&r.postDataJSON()?.method==='detectImportDates'&&r.postDataJSON().args[1]===0);
  await page.getByLabel('Date',{exact:true}).selectOption('0');await pending;
  await page.getByLabel('Date',{exact:true}).selectOption('3');await page.getByRole('button',{name:'Use Month / Day / Year',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Date order',{exact:true}).inputValue(),'mdy');release();
  await page.getByLabel('Date order',{exact:true}).selectOption('dmy');await page.getByText('Record 2: “08/31/2026” does not fit Day / Month / Year.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Date order',{exact:true}).inputValue(),'dmy');await page.unroute('**/api/call');
  await page.setViewportSize({width:1280,height:768});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot('06-narrow');
  await page.emulateMedia({reducedMotion:'reduce'});assert.deepEqual(errors,[]);assert.equal(server.store.review.records().length,0);console.log(JSON.stringify({ok:true,root}));
 }catch(e){await shot('failure');console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
