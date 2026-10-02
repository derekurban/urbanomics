const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>localStorage.setItem('urbanomics-envelope-speed-v1','.25'));
  const p=await context.newPage();await p.goto('http://127.0.0.1:4176/lab/');
  await p.getByRole('button',{name:'Done',exact:true}).waitFor();
  assert.equal(await p.getByRole('slider').count(),0);
  await p.evaluate(()=>{
    window.sendTimings=[];
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      const animation=animate.call(this,frames,options);
      window.sendTimings.push({animation,target:this.className,options});return animation;
    };
    window.sendStart=0;window.sendEnd=0;
    const observer=new MutationObserver(()=>{
      const exists=document.querySelector('.send-envelope');
      if(exists&&!window.sendStart)window.sendStart=performance.now();
      if(!exists&&window.sendStart&&!window.sendEnd)window.sendEnd=performance.now();
    });observer.observe(document.body,{subtree:true,childList:true});
  });
  await p.getByRole('button',{name:'Done',exact:true}).click();
  await p.locator('.send-envelope').waitFor({state:'detached'});
  const result=await p.evaluate(()=>({elapsed:window.sendEnd-window.sendStart,timings:window.sendTimings.map(({animation,target,options})=>({target,rate:animation.playbackRate,duration:options.duration,delay:options.delay||0}))}));
  assert.ok(result.timings.every(a=>Math.abs(a.rate-2110/750)<.000001));
  assert.ok(Math.abs((980+300+180+650)/result.timings[0].rate-750)<.001);
  assert.ok(result.elapsed>=700&&result.elapsed<950,`frame-scheduled sequence: ${result.elapsed}ms`);
  assert.equal(await p.locator('.send-tick').count(),0);
  assert.equal(await p.locator('.money-card[aria-hidden=false]').getAttribute('data-card-index'),'5');
  console.log(`Passed: 750ms configured sequence, ${Math.round(result.elapsed)}ms observed including frame scheduling, ticks share timing, saved speed ignored.`);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
