const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {startWebServer}=require('../electron/web-server.cjs');
(async()=>{
 const root=path.resolve('private/validation/accounts-browser-'+Date.now()),server=await startWebServer({root,port:0,seed:false}),store=server.store;
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const shot=async name=>{await page.waitForFunction(()=>document.getAnimations().every(a=>a.effect?.getComputedTiming().iterations===Infinity||['finished','idle'].includes(a.playState)));await page.screenshot({path:path.join(root,name+'.png'),fullPage:true});};
 try{
 await page.goto(server.origin+'/#accounts');await page.getByRole('heading',{name:'A place for every account.'}).waitFor();await shot('01-empty');
 await page.getByRole('button',{name:'+ Add account',exact:true}).click();await page.getByRole('button',{name:'Set up in Snapshots →',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save account',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');
 const make=(name,filename,rows,balance=true,currency='CAD')=>{
  const file=path.join(root,filename);fs.writeFileSync(file,['Day,Memo,Value'+(balance?',Balance':''),...rows].join('\n'));
  const job=store.enqueue([file],{manualLayouts:true}).ids[0];
  const layout=store.layouts.save(job,{name:name+' CSV',prefixRegex:'^'+filename.replace('.csv','')+'.*',headers:['Day','Memo','Value',...(balance?['Balance']:[])],mapping:{date:0,description:1,amount:2,...(balance?{balance:3}:{}),dateFormat:'ymd',amountMode:'signed',sign:1,currency,delimiter:','}});
  const id=store.addAccount(name,'custom:'+layout.id,'', {color:name==='Savings'?'#6883C5':'#B87654',prefixRegex:'^'+filename.replace('.csv','')+'.*'});
  store.resolveAccount(job,id,false);return id;
 };
 const everyday=make('Everyday','everyday.csv',['2026-06-01,Salary,2800','2026-06-12,Coffee,-15','2026-07-01,Salary,2900','2026-07-31,To savings,-501','2026-08-01,Salary,3000','2026-08-15,Groceries,-240','2026-08-17,Books,-60'],false);
 const savings=make('Savings','savings.csv',['2026-08-01,From everyday,500,3500','2026-08-31,Interest,12,3512']);
 make('Travel USD','travel.csv',['2026-08-02,Sale,900,900'],true,'USD');
 const rows=store.review.records(),out=rows.find(r=>r.description==='To savings'),inc=rows.find(r=>r.description==='From everyday');store.review.linkTransfer(out.id,out.version,inc.id,inc.version,200);
 await page.reload();await page.locator('.accounts-tile').filter({hasText:'Everyday'}).waitFor();assert.equal(await page.locator('.accounts-tile').count(),3);
 assert.equal(await page.getByTestId('account-money-in').innerText(),'$8,700.00');assert.equal(await page.getByTestId('account-money-out').innerText(),'$316.00');assert.equal(await page.locator('.accounts-route').count(),1);await shot('02-overview');
 await page.getByRole('button',{name:/July 2026: money in/}).click();assert.equal(await page.getByTestId('account-money-out').innerText(),'$1.00');assert.equal(await page.locator('.accounts-activity-list button').count(),2);await shot('03-month');
 await page.getByRole('button',{name:'Edit Everyday',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Edit account',exact:true});await dialog.getByLabel('Account name',{exact:true}).fill('Daily spending');await dialog.getByLabel('Type (optional)',{exact:true}).fill('Chequing');await dialog.getByRole('button',{name:'Previous files',exact:true}).click();
 const previous=dialog.getByRole('region',{name:'Previous imported files'});
 assert.equal(await previous.getByRole('button',{name:'Test everyday.csv from Everyday',exact:true}).count(),1);
 assert.equal(await previous.getByRole('button',{name:'Test savings.csv from Savings',exact:true}).count(),0);
 await previous.getByRole('button',{name:'Test everyday.csv from Everyday',exact:true}).click();
 await dialog.getByText('Matches this filename',{exact:true}).waitFor();
 assert.equal(await dialog.getByLabel('Try a filename',{exact:true}).inputValue(),'everyday.csv');
 assert.equal(await dialog.getByLabel('Try a filename',{exact:true}).evaluate(el=>el===document.activeElement),true);
 await dialog.getByRole('button',{name:'Previous files',exact:true}).click();
 await previous.getByRole('button',{name:'All accounts',exact:true}).click();
 await previous.getByLabel('Search previous files',{exact:true}).fill('savings');
 await shot('04-previous-files');
 await previous.getByRole('button',{name:'Test savings.csv from Savings',exact:true}).click();
 await dialog.getByText('Does not match this filename',{exact:true}).waitFor();
 assert.equal(await dialog.getByLabel('Filename prefix regex',{exact:true}).inputValue(),'^everyday.*');
 assert.equal(store.review.records().length,10);
 await dialog.getByRole('button',{name:'Previous files',exact:true}).click();
 await previous.getByLabel('Search previous files',{exact:true}).fill('no-such-file');
 await previous.getByText('No files match your search.',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Previous files',exact:true}).click();
 await dialog.getByLabel('Filename prefix regex',{exact:true}).fill('[');await dialog.getByText(/Invalid prefix regex/).waitFor();assert.equal(await dialog.getByRole('button',{name:'Save account',exact:true}).isDisabled(),true);
 await dialog.getByLabel('Filename prefix regex',{exact:true}).fill('^everyday_.*');await dialog.getByLabel('Try a filename',{exact:true}).fill('everyday_august.csv');await dialog.getByText('Matches this filename',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Color #9674B7',exact:true}).click();await shot('04-edit');await dialog.getByRole('button',{name:'Save account',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(store.state().accounts.find(a=>a.id===everyday).name,'Daily spending');assert.equal(store.state().accounts.find(a=>a.id===everyday).color,'#9674B7');
 await page.locator('.accounts-tile').filter({hasText:'Savings'}).click();await page.locator('.accounts-facts').getByText('$3,512.00',{exact:true}).waitFor();await page.getByRole('button',{name:'View observations ↗',exact:true}).click();await page.getByRole('dialog',{name:'Balance observations'}).waitFor();await shot('05-balances');await page.keyboard.press('Escape');
 await page.getByLabel('Account currency',{exact:true}).selectOption('USD');await page.locator('.accounts-tile').filter({hasText:'Travel USD'}).click();assert.match(await page.getByTestId('account-money-in').innerText(),/900.00/);assert.equal(await page.locator('.accounts-route').count(),0);
 await page.getByLabel('Account currency',{exact:true}).selectOption('CAD');await page.locator('.accounts-tile').filter({hasText:'Daily spending'}).click();
 await page.getByRole('button',{name:'Delete Daily spending',exact:true}).click();await page.getByRole('button',{name:'Keep account',exact:true}).click();assert.equal(store.state().accounts.length,3);
 await page.getByRole('button',{name:'Delete Daily spending',exact:true}).click();await page.getByRole('dialog',{name:'Delete account'}).getByRole('button',{name:'Delete account',exact:true}).click();await page.getByText('Deleted accounts (1)',{exact:true}).waitFor();assert.equal(store.state().accounts.length,2);await page.getByText('Deleted accounts (1)',{exact:true}).click();await page.getByRole('button',{name:'Restore Daily spending',exact:true}).click();await page.locator('.accounts-tile').filter({hasText:'Daily spending'}).waitFor();assert.equal(store.review.records().length,10);
 await page.getByRole('button',{name:'+ Add account',exact:true}).click();dialog=page.getByRole('dialog',{name:'Add account',exact:true});await dialog.getByLabel('Account name',{exact:true}).fill('Rainy day');await dialog.getByLabel('Saved CSV layout',{exact:true}).selectOption({label:'Savings CSV'});await dialog.getByText('Manual assignment',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Save account',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('.accounts-tile').filter({hasText:'Rainy day'}).click();await page.getByText('No transactions in this period.',{exact:true}).waitFor();
 await page.locator('.accounts-tile').filter({hasText:'Daily spending'}).click();for(const width of [1280,1680]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot('06-layout-'+width);}
 await page.setViewportSize({width:1280,height:768});await page.getByRole('button',{name:'Edit Daily spending',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit account',exact:true});await dialog.getByRole('button',{name:'Previous files',exact:true}).click();await dialog.getByRole('button',{name:'All accounts',exact:true}).click();await dialog.getByLabel('Account name',{exact:true}).focus();const box=await dialog.getByRole('button',{name:'Save account',exact:true}).boundingBox();assert.ok(box.y+box.height<=768);await shot('07-short-editor');await page.keyboard.press('Escape');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.accounts-tile').filter({hasText:'Savings'}).click();assert.equal(await page.locator('.accounts-detail').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Accounts',exact:true}).click();await page.locator('.accounts-tile').filter({hasText:'Daily spending'}).waitFor();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,root}));
 }catch(e){await shot('failure');console.error(e);throw e;}finally{await browser.close();await server.close();}
})().catch(()=>process.exitCode=1);
