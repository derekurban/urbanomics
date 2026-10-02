const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve('private/validation/split-bar-'+Date.now());fs.mkdirSync(root,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const amount=name=>page.getByRole('textbox',{name:'Amount for '+name,exact:true});
 const total=async()=>Math.round((await page.locator('.amount input').evaluateAll(els=>els.reduce((n,e)=>n+Number(e.value),0)))*100);
 const shot=async name=>{await page.waitForTimeout(300);await page.screenshot({path:path.join(root,name+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);};
 try{
  await page.goto('http://127.0.0.1:4182');await amount('Groceries').waitFor();assert.equal(await amount('Groceries').inputValue(),'128.60');
  await page.getByRole('button',{name:'Original rail',exact:true}).click();await shot('one-tag');
  const slider=page.getByRole('slider',{name:'Split after Groceries'}),box=await slider.boundingBox(),track=await page.locator('.track').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(track.x+track.width*.7,box.y+box.height/2,{steps:25});await page.mouse.up();
  assert.equal(await total(),12860);assert.ok(Number(await amount('Other').inputValue())>0);await shot('other-remainder');
  const remainder=await amount('Other').inputValue();await page.getByRole('button',{name:'Home +',exact:true}).click();assert.equal(await amount('Home').inputValue(),remainder);assert.equal(await amount('Other').count(),0);assert.equal(await total(),12860);
  await amount('Groceries').fill('64.01');await amount('Groceries').press('Enter');assert.equal(await total(),12860);assert.equal(await amount('Groceries').inputValue(),'64.01');
  await page.getByRole('button',{name:'Remove Home'}).click();assert.equal(await amount('Home').count(),0);assert.equal(await total(),12860);await page.getByRole('button',{name:'↶ Undo',exact:true}).click();assert.equal(await amount('Home').count(),1);
  await page.getByRole('button',{name:'Two tags',exact:true}).click();await page.getByRole('button',{name:'$0.01',exact:true}).click();await slider.press('ArrowLeft');assert.equal(await amount('Groceries').inputValue(),'71.99');assert.equal(await amount('Home').inputValue(),'56.61');
  await page.getByRole('button',{name:'Integrated',exact:true}).click();await shot('ribbon-two');
  await page.getByRole('button',{name:'Five tags',exact:true}).click();await amount('Groceries').fill('0.01');await amount('Groceries').press('Enter');assert.equal(await amount('Groceries').inputValue(),'0.01');assert.equal(await total(),12860);await shot('ribbon-tiny');
  await page.getByRole('button',{name:'Original rail',exact:true}).click();await shot('rail-tiny');
  await page.getByRole('button',{name:'Split evenly',exact:true}).click();assert.equal(await total(),12860);assert.equal(await amount('Other').count(),0);
  for(const name of ['Groceries','Home','Dining','Personal','Gifts'])await page.getByRole('button',{name:'Remove '+name}).click();assert.equal(await amount('Other').inputValue(),'128.60');assert.equal(await page.getByRole('slider').count(),0);
  await page.getByRole('button',{name:'Groceries +',exact:true}).click();assert.equal(await amount('Groceries').inputValue(),'128.60');
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Five tags',exact:true}).click();await page.getByRole('slider',{name:'Split after Gifts'}).press('ArrowLeft');assert.equal(await amount('Other').inputValue(),'0.01');assert.equal(await total(),12860);
  await page.getByRole('button',{name:'Try saving this split',exact:false}).click();assert.match(await page.getByRole('status').textContent(),/No app data/);
  const heights={};
  for(const variant of ['Original rail','Inline','Mini grid','Integrated']){
   await page.getByRole('button',{name:variant,exact:true}).click();
   assert.equal(await total(),12860,'Switching preserves allocation');
   await page.getByRole('button',{name:'Two tags',exact:true}).click();
   await shot(variant+'-two');
   await amount('Groceries').fill('63.21');await amount('Groceries').press('Enter');
   assert.equal(await amount('Groceries').inputValue(),'63.21');assert.equal(await total(),12860);
   await page.getByRole('button',{name:'Five tags',exact:true}).click();
   await shot(variant+'-five');heights[variant]=(await page.locator('.transaction').boundingBox()).height;
   if(variant!=='Original rail')assert.ok(heights[variant]<heights['Original rail']*.85,'Compact card should be meaningfully shorter');
   await amount('Groceries').fill('0.01');await amount('Groceries').press('Enter');await shot(variant+'-tiny');
   await page.getByRole('button',{name:'Remove Home'}).click();await page.getByRole('button',{name:'↶ Undo',exact:true}).click();assert.equal(await amount('Home').count(),1);assert.equal(await total(),12860);
   await page.setViewportSize({width:900,height:900});await shot(variant+'-narrow');await page.setViewportSize({width:1280,height:1100});
  }
  console.log({heights});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,root,checks:'pointer/keyboard dividers, Other remainder, exact inputs, add/remove, undo, tiny sections, conservation, reduced motion'}));
 }catch(e){await shot('failure');throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
