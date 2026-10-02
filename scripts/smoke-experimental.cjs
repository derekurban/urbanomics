const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {startWebServer}=require('../electron/web-server.cjs');
const {csv}=require('../electron/imports/parsers.cjs');
const root=path.resolve('private/validation/experimental-'+randomUUID());
(async()=>{
 const server=await startWebServer({root:path.join(root,'data'),port:0});
 const store=server.store, accounts=store.transferLab.accounts();
 const spending=accounts[0].id,savings=store.addAccount('Sample savings','pc','savings');
 function add(account,name,entries){const file=path.join(root,name+'.csv');fs.writeFileSync(file,csv([['Description','Type','Card Holder Name','Date','Time','Amount'],...entries.map(([text,amount,date='09/16/2026'])=>[text,'SYNTHETIC','SAMPLE',date,'12:00 AM',String(amount)])]));store.resolveAccount(store.enqueue([file]).ids[0],account,false);}
 add(spending,'out',[['Exact transfer out',-500],['Fee transfer out',-250],['Ambiguous out A',-300],['Ambiguous out B',-300],['Experimental groceries',-83.27],['Experimental restaurant',-72.19],['Seven days earlier',-450,'09/09/2026'],['Seven days later',-550,'09/23/2026'],['Eight days later',-500,'09/24/2026'],['Beyond ten percent',-550.01,'09/16/2026']]);
 add(savings,'in',[['Exact transfer in',500],['Fee transfer in',247.5],['Ambiguous transfer in',300],['Experimental pay',1900]]);
 for(const name of ['Gift','Interest','Refund','Reimbursement','Sale','Freelance'])store.review.entity('category',{name,flowType:'income',color:'#96b89b'});
 const food=store.review.entities().find(e=>e.kind==='bucket'&&e.name==='Food');
 for(const name of ['Coffee & cafes','Takeout','Delivery','Bars','Snacks','Lunches','Bakery','Produce'])store.review.entity('category',{name,parentId:food.id,color:'#96b89b'});
 for(const name of ['Home','Personal','Travel']){const id=store.review.entity('bucket',{name,color:'#a1b6cf'});store.review.entity('category',{name:name+' purchases',parentId:id,color:'#96b89b'});}
 add(savings,'stack-income',Array.from({length:12},(_,i)=>['Stack income '+i,2100+i]));
 store.transferLab.save({routes:[{from:spending,to:savings}],maxDays:1,basisPoints:200},0);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:960}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const screen=async name=>{if(/^(expense-card|income-|deduction-)/.test(name))await page.waitForTimeout(300);await page.screenshot({path:path.join(root,name+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow: '+name);};

 const mode=async name=>{await page.getByRole('navigation',{name:'Experimental queues'}).getByRole('button',{name:new RegExp(name)}).click();await settled();};
 const active=()=>page.locator('.money-card[aria-hidden="false"]');
 const settled=()=>page.waitForFunction(()=>{const s=document.querySelector('.scene');return s?.dataset.transition==='idle'&&s.dataset.moving==='false'&&document.querySelector('.money-card[aria-hidden="false"]:not([inert])');});
 const find=async text=>{
   await settled();const count=Number((await page.locator('.experimental-roll .position').textContent()).split('/')[1]);
   await page.getByRole('region',{name:'Transaction cards. Scroll or use arrow keys.'}).press('Home');await settled();
   for(let i=0;i<count;i++){
     if((await active().locator('.ex-receipt.to .ex-receipt-title,.ct-receipt strong').textContent())===text)return;
     if(i<count-1){await page.getByRole('button',{name:'Next card',exact:true}).click();await settled();}
   }
   throw Error('Card not found: '+text);
 };
 const row=name=>store.review.records().find(r=>r.description===name);
 const saveDone=async()=>{await page.waitForFunction(()=>!document.querySelector('.send-envelope'));await page.waitForFunction(()=>!document.querySelector('.ex-heading button')?.disabled);};
 try {
  await page.goto(server.origin+'/#experimental');await settled();
  assert.equal(await page.getByLabel('Search attention queue').count(),0);assert.equal(await page.locator('.ex-options').count(),0);
  await find('Exact transfer in');await screen('connected-halves');
  assert.equal(await active().locator('.ex-resolution-heading,.ex-resolution-tools,.ex-receipt-caption').count(),0);
  assert.ok((await active().boundingBox()).height<=350);
  assert.equal(await active().locator('.ex-receipt.from .ex-receipt-title').textContent(),'Exact transfer out');
  const before=row('Exact transfer in');
  const geometry=await active().evaluate(el=>{const css=getComputedStyle(el),b=el.getBoundingClientRect();return {filter:css.filter,transform:css.transform,x:b.x,y:b.y};});
  assert.equal(geometry.filter,'none');assert.equal(geometry.transform,'none');assert.ok(Math.abs(geometry.x-Math.round(geometry.x))<.02);
  await active().getByRole('button',{name:'Remove suggested transfer'}).click();await page.waitForTimeout(270);await screen('three-choices');
  assert.equal(await active().getByRole('button',{name:'Skip for now'}).count(),0);
  assert.equal(await active().getByRole('button',{name:'Save & continue'}).count(),0);
  assert.ok((await active().locator('.ex-receipt.to').boundingBox()).height<65);
  assert.equal(row('Exact transfer in').version,before.version,'X does not save or dismiss the transaction');
  for(const label of ['Choose transfer','Choose deduction','Choose income'])assert.equal(await active().getByRole('button',{name:label,exact:true}).count(),1);
  await active().getByRole('button',{name:'Choose transfer',exact:true}).click();
  await page.waitForTimeout(260);await screen('transfer-picker');
  assert.equal(await active().getByRole('textbox').count(),0);
  assert.equal(await active().getByRole('button',{name:'Skip for now'}).count(),0);
  assert.equal(await active().getByRole('slider').count(),2);
  const slider=async(name,value)=>active().getByRole('slider',{name,exact:true}).fill(String(value));
  await slider('Transfer day range',7);await slider('Transfer amount difference',10);
  assert.equal(await active().getByRole('button').filter({hasText:'Seven days earlier'}).count(),1);
  assert.equal(await active().getByRole('button').filter({hasText:'Seven days later'}).count(),1);
  assert.equal(await active().getByRole('button').filter({hasText:'Eight days later'}).count(),0);
  assert.equal(await active().getByRole('button').filter({hasText:'Beyond ten percent'}).count(),0);
  await screen('transfer-picker-expanded-range');
  await active().getByRole('button',{name:'Back to resolution choices'}).click();await active().getByRole('button',{name:'Choose transfer',exact:true}).click();
  assert.equal(await active().getByRole('slider',{name:'Transfer day range',exact:true}).inputValue(),'7');
  await slider('Transfer day range',0);await slider('Transfer amount difference',0);
  assert.equal(await active().locator('.ex-transfer-choices button').count(),1);

  await page.evaluate(()=>{window.heroFrames=[];const sample=()=>{
    const hero=document.querySelector('.ex-transfer-hero');
    if(hero){const r=hero.getBoundingClientRect();window.heroFrames.push({x:r.x,y:r.y,width:r.width,height:r.height,title:hero.querySelector('.ex-hero-title').textContent});}
    if(!window.heroFrames.length||hero)requestAnimationFrame(sample);
  };requestAnimationFrame(sample);});
  await active().getByRole('button').filter({hasText:'Exact transfer out'}).click();
  await screen('transfer-hero-moving');
  await page.waitForFunction(()=>window.heroFrames.length>1&&!document.querySelector('.ex-transfer-hero'));
  const heroFrames=await page.evaluate(()=>window.heroFrames);
  assert.ok(heroFrames.length>=3);assert.ok(heroFrames.at(-1).width>heroFrames[0].width+100);
  assert.ok(heroFrames.every(f=>f.title==='Exact transfer out'));
  for(let i=1;i<heroFrames.length;i++){assert.ok(heroFrames[i].width>=heroFrames[i-1].width-.1);assert.ok(heroFrames[i].height>=heroFrames[i-1].height-.1,'Hero should grow toward a fixed destination without changing direction');}
  assert.equal(await page.locator('.ex-hero-measure').count(),0);
  assert.equal(await active().locator('.ex-receipt.from').evaluate(el=>getComputedStyle(el).visibility),'visible');
  assert.equal(await active().locator('.ex-state-content').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(row('Exact transfer in').version,before.version,'Selecting a tile only changes the local card');
  await screen('transfer-hero-settled');

  // Pause two real animation phases to inspect the horizontal folds and seal.
  await page.evaluate(()=>{window.foldFrames=[];window.foldPaused='';const watch=()=>{
    const el=document.querySelector('.send-envelope'),phase=el?.dataset.phase;
    if(el&&!window.foldFrames.includes(phase)&&['folding','sealed'].includes(phase)){
      const running=document.getAnimations().filter(a=>a.playState==='running');
      if(running.some(a=>a.currentTime>(phase==='folding'?190:50))){window.foldAnimations=running;running.forEach(a=>a.pause());window.foldFrames.push(phase);window.foldPaused=phase;}
    }if(window.foldFrames.length<2)requestAnimationFrame(watch);
  };requestAnimationFrame(watch);});
  await active().getByRole('button',{name:'Link transfer',exact:false}).click();
  for(const phase of ['folding','sealed']){await page.waitForFunction(expected=>window.foldPaused===expected,phase);assert.equal(await page.locator('.paper-flap').count(),2);await screen('two-flaps-'+phase);await page.evaluate(()=>{window.foldPaused='';window.foldAnimations.forEach(a=>a.play());});}
  await saveDone();assert.equal(row('Exact transfer in').review.kind,'transfer');
  await page.getByRole('button',{name:'Undo last decision'}).click();await find('Exact transfer in');assert.notEqual(row('Exact transfer in').review.kind,'transfer');
  // Hold persistence separately from motion: fold now, stamp only after success.
  await page.evaluate(()=>{
    window.realLink=window.urbanomics.linkTransfer;
    window.urbanomics.linkTransfer=async(...args)=>{await new Promise((resolve,reject)=>{window.releaseLink=resolve;window.rejectLink=reject;});return window.realLink(...args);};
    document.querySelector('.money-card[aria-hidden="false"] .ex-confirm').addEventListener('click',()=>{
      window.clickedAt=performance.now();
      const check=()=>{if(document.querySelector('.send-envelope')?.dataset.phase==='folding')window.foldLatency=performance.now()-window.clickedAt;else requestAnimationFrame(check);};requestAnimationFrame(check);
    },{once:true});
  });
  const unchangedVersion=row('Exact transfer in').version;
  await active().getByRole('button',{name:'Link transfer'}).click();
  await page.waitForFunction(()=>document.querySelector('.send-envelope')?.dataset.phase==='saving');
  const latency=await page.evaluate(()=>window.foldLatency);assert.ok(latency<150,'Click should start folding before persistence: '+latency);
  assert.equal(row('Exact transfer in').version,unchangedVersion);
  assert.equal(await page.locator('.envelope-stamp').evaluate(el=>getComputedStyle(el).opacity),'0');
  assert.equal(await page.locator('.envelope-paper').evaluate(el=>getComputedStyle(el).clipPath),'none');
  await screen('waiting-for-save');
  await page.evaluate(()=>window.rejectLink(new Error('Synthetic save failure')));await saveDone();await settled();
  assert.equal(await active().locator('.ex-receipt.to .ex-receipt-title').textContent(),'Exact transfer in');
  assert.equal(row('Exact transfer in').version,unchangedVersion);assert.equal(await page.locator('.send-tick').count(),0);
  assert.ok(await active().getByRole('button',{name:'Link transfer'}).isEnabled());await screen('restored-after-failure');
  await active().getByRole('button',{name:'Link transfer'}).click();await page.waitForFunction(()=>document.querySelector('.send-envelope')?.dataset.phase==='saving');
  assert.equal(row('Exact transfer in').version,unchangedVersion);
  await page.evaluate(()=>window.releaseLink());await saveDone();assert.equal(row('Exact transfer in').review.kind,'transfer');
  await page.evaluate(()=>{window.urbanomics.linkTransfer=window.realLink;});
  await page.getByRole('button',{name:'Undo last decision'}).click();await find('Exact transfer in');
  console.log(JSON.stringify({clickToFoldMs:latency,pendingSaveGate:true,failedSaveRestored:true}));
  await page.emulateMedia({reducedMotion:'reduce'});
  await active().getByRole('button',{name:'Remove suggested transfer'}).click();await active().getByRole('button',{name:'Choose transfer',exact:true}).click();
  await slider('Transfer day range',7);await slider('Transfer amount difference',10);
  await active().getByRole('button').filter({hasText:'Seven days earlier'}).click();
  assert.equal(await page.locator('.ex-transfer-hero').count(),0,'Reduced motion skips shared-element travel');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await active().getByRole('checkbox',{name:/extra received/}).check();await active().getByRole('button',{name:'Link transfer'}).click();await saveDone();
  assert.equal(row('Exact transfer in').review.transferExcessCents,5000);
  assert.equal(store.transferLab.state().config.basisPoints,200,'Card sliders must not change shared matching settings');
  await page.getByRole('button',{name:'Undo last decision'}).click();await find('Exact transfer in');

  await find('Fee transfer in');assert.ok(await active().getByRole('button',{name:'Link transfer'}).isDisabled());
  await active().getByRole('checkbox',{name:/difference as a fee/}).check();await active().getByRole('button',{name:'Link transfer'}).click();await saveDone();
  assert.equal(row('Fee transfer out').review.transferFeeCents,250);
  await find('Ambiguous transfer in');assert.equal(await active().getByRole('button',{name:'Remove suggested transfer'}).count(),0);
  await active().getByRole('button',{name:'Choose income',exact:true}).click();
  assert.equal(await active().getByRole('button',{name:'Save income'}).count(),1);assert.equal(await active().getByRole('button',{name:'Skip for now'}).count(),0);
  await page.waitForTimeout(260);await screen('income-configuring');
  assert.equal(await active().getByRole('button',{name:'Save income'}).count(),1);
  await active().getByRole('button',{name:'Add Gift',exact:true}).click();assert.equal(await active().getByRole('button',{name:'Save income'}).count(),1);
  await active().getByRole('button',{name:'Remove Gift',exact:true}).click();assert.equal(await active().getByRole('button',{name:'Save income'}).count(),1);
  await active().getByRole('button',{name:'Add Gift',exact:true}).click();
  await screen('income-on-card');await active().getByRole('button',{name:'Save income'}).click();await saveDone();
  assert.equal(row('Ambiguous transfer in').review.kind,'income');assert.equal(row('Ambiguous transfer in').review.tags.length,1);assert.notEqual(row('Ambiguous out A').review.kind,'transfer');
  await mode('Income');await find('Experimental pay');
  await active().getByRole('button',{name:'Choose income',exact:true}).click();await active().getByRole('button',{name:'Add Paycheck',exact:true}).click();
  await active().getByRole('button',{name:'Add Freelance',exact:true}).click();assert.equal(await active().getByRole('slider').count(),2,'Split and remainder controls stay on card');await active().getByLabel('Amount for Paycheck').fill('1200.01');await active().getByLabel('Amount for Paycheck').press('Enter');await screen('income-split');
  await active().getByRole('button',{name:'Save income'}).click();await saveDone();assert.equal(row('Experimental pay').review.kind,'income');assert.equal(row('Experimental pay').review.tags.length,2);assert.equal(row('Experimental pay').review.tags[0].cents,120001);assert.equal(row('Experimental pay').review.tags[1].cents,69999);
  // Unrelated expenses and an event share canonical IDs; the payment cannot deduct twice.
  const personId=store.review.entity('person',{name:'Alex Example',color:'#aaaabb'});
  const person=store.review.entities().find(e=>e.id===personId);
  const event=store.review.entity('group',{name:'Shared weekend',startDate:'2026-09-15',endDate:'2026-09-17',color:'#a2a2a2'});
  const groceries=row('Experimental groceries'),restaurant=row('Experimental restaurant');
  store.review.organize([groceries,restaurant].map(t=>({id:t.id,version:t.version,groups:[event]})));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await find('Stack income 0');
  await active().getByRole('button',{name:'Choose deduction',exact:true}).click();
  assert.equal(await active().getByRole('button',{name:'Save deduction'}).count(),0);assert.equal(await active().getByRole('button',{name:'Skip for now'}).count(),0);
  await page.waitForTimeout(260);await screen('deduction-configuring');
  await active().getByRole('button',{name:person.name,exact:true}).click();assert.equal(await active().getByRole('button',{name:'Save deduction'}).count(),0);
  await active().getByRole('checkbox',{name:/Shared weekend/}).check();assert.equal(await active().getByRole('button',{name:'Save deduction'}).count(),1);
  await active().getByRole('checkbox',{name:/Shared weekend/}).uncheck();assert.equal(await active().getByRole('button',{name:'Save deduction'}).count(),0);
  await active().getByRole('checkbox',{name:/Shared weekend/}).check();
  await active().getByLabel('Deduction for Experimental groceries').fill('50.01');
  await screen('deduction-on-card');
  const selected=row('Stack income 0');await active().getByRole('button',{name:'Save deduction'}).click();await saveDone();
  const paid=row('Stack income 0');assert.equal(paid.review.kind,'repayment');assert.equal(paid.review.allocations.length,2);assert.equal(paid.review.allocations.find(p=>p.id===groceries.id).cents,5001);assert.equal(paid.review.remainder,selected.amountCents-5001-7219);
  assert.equal(new Set(paid.review.allocations.map(p=>p.id)).size,2);
  // A later edit rejects Undo instead of overwriting it.
  store.review.organize([{id:paid.id,version:paid.version,tags:[]}]);
  await page.getByRole('button',{name:'Undo last decision'}).click();await page.locator('.ex-message.error').waitFor();assert.equal(row('Stack income 0').review.kind,'repayment');
  await mode('Expenses');await find('Experimental groceries');await page.getByRole('button',{name:'Category Food',exact:true}).click();await screen('expense-card-tags');assert.equal(await page.locator('.ex-orbit,.ex-bubble').count(),0);
  const expenseBefore=row('Experimental groceries').version;
  await active().getByRole('button',{name:'Add Groceries',exact:true}).click();
  await active().getByRole('button',{name:'Add Restaurants',exact:true}).click();
  assert.equal(row('Experimental groceries').version,expenseBefore,'Selecting tags is a draft');
  assert.equal(await active().getByRole('slider').count(),2,'Split and remainder controls stay on card');
  await active().getByLabel('Amount for Groceries').fill('32.01');await active().getByLabel('Amount for Groceries').press('Enter');await screen('expense-card-split');
  await active().getByRole('button',{name:/Person Optional/}).click();await active().getByRole('button',{name:'Alex Example',exact:true}).click();await screen('expense-card-person');
  await active().getByRole('button',{name:'Save expense'}).click();await saveDone();
  const expenseSaved=row('Experimental groceries');assert.equal(expenseSaved.review.tags.length,3);assert.equal(expenseSaved.review.tags[0].cents,3201);assert.equal(expenseSaved.review.tags[1].cents,4163);assert.equal(expenseSaved.review.assignedPersonId,personId);assert.equal(expenseSaved.review.kind,groceries.review.kind);
  await page.getByRole('button',{name:'Undo last decision'}).click();await find('Experimental groceries');assert.equal(row('Experimental groceries').review.tags.length,0);assert.equal(row('Experimental groceries').review.assignedPersonId,'');
  assert.equal(await active().getByRole('button',{name:'Save expense'}).count(),1);
  await mode('Income');await find('Stack income 1');
  await active().getByRole('button',{name:'Choose income',exact:true}).click();await active().getByRole('button',{name:'Add Freelance',exact:true}).click();
  const stale=row('Stack income 1');await server.service.invoke('review:organize',[{id:stale.id,version:stale.version,tags:[]}]);
  await page.getByText(/This card changed on another screen/).waitFor();assert.equal(await active().getByLabel('Amount for Freelance').count(),1);assert.ok(await active().getByRole('button',{name:'Save income'}).isDisabled());
  await page.getByRole('button',{name:'Reload card',exact:true}).click();await settled();
  // Exercise the shared palette without changing any financial records.
  await page.locator('.nav-item').filter({hasText:'Organize'}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await screen('appearance');
  await page.getByLabel('Theme accent',{exact:true}).fill('#3b5275');await page.getByRole('button',{name:'Apply palette',exact:true}).click();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()),'#3b5275');
  await page.reload();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()),'#3b5275');
  await page.locator('.nav-item').filter({hasText:'Organize'}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByRole('button',{name:'Restore neutral palette'}).click();
  await page.locator('.nav-item').filter({hasText:'Dashboard'}).click();await page.locator('.dash-workspace .dash-stats').first().waitFor();await page.waitForTimeout(500);await screen('dashboard-neutral');
  await page.locator('.nav-item').filter({hasText:'Snapshots'}).click();await page.waitForTimeout(700);await screen('snapshots-neutral');
  await page.locator('.nav-item').filter({hasText:'Organize'}).click();await page.getByRole('button',{name:'Overview',exact:true}).click();await page.waitForTimeout(250);await screen('organize-neutral');
  await page.locator('.nav-item').filter({hasText:'Experimental'}).click();await mode('Income');await find('Stack income 2');
  await page.emulateMedia({reducedMotion:'reduce'});await active().getByRole('button',{name:'Choose income',exact:true}).click();await active().getByRole('button',{name:'Add Paycheck',exact:true}).click();await active().getByRole('button',{name:'Save income'}).click();await saveDone();
  assert.equal(row('Stack income 2').review.kind,'income');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,root,checks:'on-card transfer/income/deduction, atomic tags, exact-cent event deductions, stale drafts/undo, 2-flap frames, shared theme persistence, on-card expense tags/splits/person/undo, reduced motion'}));
 } catch(error){await screen('failure').catch(()=>{});console.error(JSON.stringify({errors,root}));throw error;}
 finally {await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

