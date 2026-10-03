// Date order in the guided setup: the server checks every row with the real parser. One fitting
// order fills in on its own and says so; two fitting orders ask, with an example of each; no
// fitting order is reported with the offending record instead of guessed.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {startWebServer}=require('../electron/web-server.cjs');
(async()=>{
 const root=path.resolve('private/validation/date-assist-browser-'+Date.now()),server=await startWebServer({root,port:0,seed:false}),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const shot=async name=>{await page.waitForFunction(()=>document.getAnimations().every(a=>a.effect?.getComputedTiming().iterations===Infinity||a.playState==='finished'||a.playState==='idle'));return page.screenshot({path:path.join(root,name+'.png'),fullPage:true});};
 const upload=async(name,body)=>{const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose CSV files',exact:true}).click();await(await chooser).setFiles({name,mimeType:'text/csv',buffer:Buffer.from(body)});await page.getByRole('region',{name:'Set up files',exact:true}).waitFor();await page.getByRole('button',{name:'Walk me through it'}).click();await page.getByRole('heading',{name:/one file on its own/}).waitFor();};
 const clear=async()=>{await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Remove all files',exact:true}).click();await page.getByRole('button',{name:'Remove files',exact:true}).click();await page.getByRole('heading',{name:'Start with a bank export.'}).waitFor();};
 try{
  await page.goto(server.origin);
  // One row beyond the first screenful decides the order: 08/31 can only be month-day-year.
  const rows=Array.from({length:455},(_,i)=>`${i===29?'08/31/2026':'09/07/2026'},Synthetic ${i},-5.00`);
  await upload('manual.csv','Date,Description,Amount\n'+rows.join('\n'));
  await page.getByText('all 455 rows read only as month-day-year',{exact:true}).waitFor();await page.getByText('Dates in Date, written month-day-year').waitFor();
  assert.equal(await page.getByRole('button',{name:'Change',exact:true}).count(),0,'a settled date order offers nothing to change to, and the sign is still a question');await page.getByRole('button',{name:/^Positive is money in/}).waitFor();await shot('01-detected');
  await clear();
  // Two orders fit every row: the date fact is open with both, each showing the first value read that way.
  await upload('ambiguous.csv','Date,Description,Amount\n03/04/2026,First,1\n05/06/2026,Second,2\n');
  await page.getByText('Dates in Date',{exact:true}).waitFor();await page.getByRole('button',{name:/^month-day-year/}).waitFor();await page.getByRole('button',{name:/^day-month-year/}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Looks right',exact:true}).isEnabled(),false);await shot('02-ambiguous');
  await page.getByRole('button',{name:/^day-month-year/}).click();await page.getByText('Dates in Date, written day-month-year').waitFor();
  await page.getByRole('button',{name:/^Positive is money in/}).click();await page.getByText(/All 2 rows read/).waitFor();
  assert.ok((await page.getByRole('table').last().innerText()).includes('2026-04-03'),'the preview reads 03/04 as April 3');await shot('03-chosen');
  await page.getByRole('button',{name:'Looks right',exact:true}).click();await page.getByRole('heading',{name:'Ready to import',exact:true}).waitFor();
  assert.equal(server.store.layouts.list()[0].mapping.dateFormat,'dmy');
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByText('Already set up. Change anything here and save it again.',{exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Remove all files',exact:true}).click();await page.getByRole('button',{name:'Remove files',exact:true}).click();await page.getByRole('heading',{name:'Start with a bank export.'}).waitFor();
  // Mixed orders: nothing is guessed; the fact stays open and says why.
  await upload('mixed.csv','Date,Description,Amount\n04/13/2026,First,1\n13/04/2026,Second,2\n');
  await page.getByText('No single order reads every row. Check the file for mixed or invalid dates, or pick a different column below.').waitFor();
  assert.equal(await page.getByRole('button',{name:'Looks right',exact:true}).isEnabled(),false);await shot('04-mixed');
  await page.setViewportSize({width:1280,height:768});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot('05-narrow');
  await page.emulateMedia({reducedMotion:'reduce'});assert.deepEqual(errors,[]);assert.equal(server.store.review.records().length,0);console.log(JSON.stringify({ok:true,root}));
 }catch(e){await shot('failure');console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
