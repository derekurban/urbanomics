const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  fs.mkdirSync('private/validation/rolodex-finish',{recursive:true});
  for(const [width,height] of [[390,844],[1280,900]]){
    const context=await browser.newContext({viewport:{width,height}}),p=await context.newPage();
    await p.goto('http://127.0.0.1:4176/lab/');
    await p.evaluate(()=>{
      const animate=Element.prototype.animate;
      Element.prototype.animate=function(frames,options){return animate.call(this,frames,{...options,duration:options.duration*5,delay:(options.delay||0)*5});};
    });
    await p.getByRole('button',{name:'Done',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('.envelope-stamp')?.getAnimations().some(a=>a.playState==='finished'));
    const alignment=await p.evaluate(()=>{
      const stamp=document.querySelector('.envelope-stamp'),paper=document.querySelector('.envelope-paper');
      const angle=el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return Math.atan2(m.b,m.a)*180/Math.PI;};
      const path=stamp.querySelector('path').getBBox(),svg=stamp.querySelector('svg').getBoundingClientRect(),box=stamp.getBoundingClientRect();
      return {angle:angle(stamp)+angle(paper),pathX:path.x+path.width/2,pathY:path.y+path.height/2,dx:svg.x+svg.width/2-box.x-box.width/2,dy:svg.y+svg.height/2-box.y-box.height/2};
    });
    assert.ok(Math.abs(alignment.angle)<.01&&Math.abs(alignment.dx)<1&&Math.abs(alignment.dy)<1);
    assert.equal(alignment.pathX,20);assert.equal(alignment.pathY,20);
    await p.screenshot({path:`private/validation/rolodex-finish/stamp-${width}.png`});
    await p.locator('.send-envelope').waitFor({state:'detached'});
    assert.equal(await p.locator('.send-tick').count(),0);
    await context.close();
  }
  const c=await browser.newContext({reducedMotion:'reduce'}),p=await c.newPage();
  await p.goto('http://127.0.0.1:4176/lab/');await p.getByRole('button',{name:'Done',exact:true}).click();
  await p.locator('.send-envelope').waitFor({state:'detached'});
  await browser.close();console.log('Passed: centered upright seal, departure cleanup and reduced-motion behavior.');
})().catch(e=>{console.error(e);process.exit(1);});
