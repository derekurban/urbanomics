const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {startWebServer}=require('../electron/web-server.cjs');
const root=path.resolve('private/validation/mobile-'+randomUUID());
(async()=>{
 const server=await startWebServer({root:path.join(root,'data'),port:0});
 const receiving=server.store.addAccount('Sample savings','pc','savings'),spending=server.store.db.prepare('SELECT id FROM accounts ORDER BY rowid LIMIT 1').get().id;
 for(const [account,name,amount] of [[receiving,'Phone transfer in','100'],[spending,'Phone transfer out','-100']]){
  const file=path.join(root,name+'.csv');fs.writeFileSync(file,require('../electron/imports/parsers.cjs').csv([['Description','Type','Card Holder Name','Date','Time','Amount'],[name,'SYNTHETIC','SAMPLE','09/16/2026','12:00 AM',amount]]));server.store.resolveAccount(server.store.enqueue([file]).ids[0],account,false);
 }
 const browser=await chromium.launch({headless:true,channel:'chrome'}).catch(async error=>{await server.close();throw error;});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const nav=async name=>{await page.locator('.nav-item').filter({hasText:name}).tap();};
 const stage=async name=>page.getByRole('navigation',{name:'Transaction tools'}).getByRole('button',{name,exact:true}).tap();
 const shot=async name=>{await page.screenshot({path:path.join(root,name+'.png'),fullPage:true,animations:'disabled'});const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+1 && e.getBoundingClientRect().width && !e.closest('.dash-year-chart,.dash-network-scroll,.dr-calendar,.og-sections,.rv-stages')).slice(0,8).map(e=>e.className)}));assert.ok(overflow.scroll<=page.viewportSize().width,JSON.stringify({name,...overflow}));};
 try {
  await page.goto(server.origin);await page.locator('.dash-heading').waitFor();await shot('dashboard');
  await nav('Snapshots');await page.getByRole('heading',{name:'Snapshots',exact:true}).waitFor();await shot('snapshots');
  await nav('Review');await stage('Transfers');
  await page.getByRole('region',{name:'Pending incoming transfers'}).getByRole('button').filter({hasText:'Phone transfer in'}).tap();
  await page.getByRole('region',{name:'Possible outgoing matches'}).getByRole('button').filter({hasText:'Phone transfer out'}).tap();
  await shot('transfers-paired');await page.getByRole('button',{name:'Link transfer',exact:true}).tap();await page.getByRole('button',{name:'Undo link',exact:true}).waitFor();
  assert.equal(server.store.review.records().find(r=>r.description==='Phone transfer in').review.kind,'transfer');
  await shot('transfers');await stage('Events');await shot('events');await stage('Income');await shot('income');
  await stage('Expenses');await page.locator('.mobile-transaction').waitFor();await page.locator('.mobile-tag-grid').getByRole('button').filter({hasText:'Food'}).tap();await shot('expense-tags');
  const description=await page.locator('.mobile-transaction h3').textContent();
  await page.getByRole('button',{name:'Tag Groceries',exact:true}).tap();
  await page.waitForFunction(async description=>(await window.urbanomics.reviewState()).records.find(r=>r.description===description).review.tags.length>0,description);
  await page.locator('.mobile-transaction').tap();await page.getByRole('dialog',{name:'Transaction settings'}).waitFor();await shot('transaction-settings');await page.getByRole('button',{name:'Cancel',exact:true}).tap();
  await stage('Overview');await shot('overview');await nav('Transactions');await shot('transactions');await nav('Organize');await shot('organize');
  await page.getByRole('button',{name:'Categories & tags',exact:true}).tap();await shot('tag-management');
  // A second screen saves while the phone has an unsaved financial draft.
  await nav('Review');await stage('Income');await page.getByRole('button',{name:'Other income',exact:true}).tap();await page.getByLabel('Income source name').fill('My unsaved phone draft');
  const paycheck=server.store.review.records().find(r=>r.month==='2026-09' && r.review.kind==='income');
  await server.service.invoke('review:financial',paycheck.id,paycheck.version,{...paycheck.review,kind:'income',incomeType:'interest'});
  await page.getByRole('button',{name:'Reload saved version',exact:true}).waitFor();assert.equal(await page.getByLabel('Income source name').inputValue(),'My unsaved phone draft');
  await page.getByRole('button',{name:'Save changes',exact:true}).tap();await page.getByText(/changed/i).filter({visible:true}).first().waitFor();assert.equal(server.store.review.records().find(r=>r.id===paycheck.id).review.incomeType,'interest');
  await page.getByRole('button',{name:'Reload saved version',exact:true}).tap();assert.equal(await page.getByRole('button',{name:'Interest',exact:true}).getAttribute('aria-pressed'),'true');
  for(const width of [360,430]) {await page.setViewportSize({width,height:844});await nav('Dashboard');await shot('dashboard-'+width);await nav('Review');await stage('Expenses');await shot('expenses-'+width);}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,root,checks:'touch navigation, all review steps, tagging persistence, transaction dialog, 360/390/430 layouts'}));
 } finally {await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
