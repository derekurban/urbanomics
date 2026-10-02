const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.URBANOMICS_LAB_URL || 'http://127.0.0.1:4176/lab/';
(async()=>{
  const output=path.resolve('private/validation/rolodex-send');fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height] of (process.env.URBANOMICS_SEND_QUICK ? [] : [[390,844],[360,640],[1280,900],[844,390]])){
    const ctx=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
    // Previously saved tuning preferences must no longer affect the accepted look.
    await ctx.addInitScript(()=>localStorage.setItem('urbanomics-rolodex-appearance-v1',JSON.stringify({blur:6,opacity:0})));
    const p=await ctx.newPage(), errors=[], requests=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
    await p.goto(base);
    // Slow only this visual capture run so short animation phases are inspectable.
    await p.evaluate(()=>{
      const animate=Element.prototype.animate;
      Element.prototype.animate=function(frames,options){return animate.call(this,frames,{...options,duration:options.duration*7,delay:(options.delay||0)*7});};
    });
    const done=p.getByRole('button',{name:'Done',exact:true});await done.waitFor();
    assert.equal(await p.getByRole('slider').count(),0);
    assert.equal(await p.locator('[data-card-index="3"]').evaluate(el=>getComputedStyle(el).filter),'blur(2px)');
    assert.equal(await p.locator('[data-card-index="3"]').evaluate(el=>el.style.getPropertyValue('--shade-strength')),'.3');
    await p.screenshot({path:path.join(output,`rest-${width}.png`)});
    const upperBefore=await p.locator('[data-card-index="3"]').getAttribute('style');
    await p.evaluate(()=>{
      window.upperFrames=[];
      const upper=document.querySelector('[data-card-index="3"]');
      window.upperObserver=new MutationObserver(()=>window.upperFrames.push(upper.getAttribute('style')));
      window.upperObserver.observe(upper,{attributes:true,attributeFilter:['style']});
    });
    await done.click();
    await p.locator('.send-envelope[data-phase=folding]').waitFor();
    assert.equal(await p.locator('.send-tick').count(),2);
    assert.equal(await p.locator('.envelope-seams').count(),0,'seams are actual folded edges, not a late overlay');
    assert.equal(await p.getByRole('button',{name:'Sending…',exact:true}).isEnabled(),false);
    assert.equal(await p.locator('[data-card-index="4"]').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    // Attempt other navigation while folding: it must not steal the active card.
    await p.locator('.deck').focus();await p.keyboard.press('End');
    assert.equal(await p.locator('.scene').getAttribute('data-position'),'4.0000');
    await p.waitForTimeout(230);
    await p.screenshot({path:path.join(output,`fold-${width}.png`)});
    await p.locator('.send-envelope[data-phase=sealed]').waitFor();
    assert.equal(await p.locator('.paper-flap').count(),4);
    await p.waitForTimeout(180);
    await p.screenshot({path:path.join(output,`stamp-${width}.png`)});
    await p.locator('.send-envelope[data-phase=departing]').waitFor();
    await p.waitForFunction(()=>{
      const tick=document.querySelector('.send-tick');
      return tick&&Number(getComputedStyle(tick).opacity)<.85&&new DOMMatrixReadOnly(getComputedStyle(tick).transform).m41>20;
    });
    await p.screenshot({path:path.join(output,`send-${width}.png`)});
    const tickExit=await p.locator('.send-tick').evaluateAll(ticks=>ticks.map(tick=>({opacity:Number(getComputedStyle(tick).opacity),x:new DOMMatrixReadOnly(getComputedStyle(tick).transform).m41})));
    assert.ok(tickExit.every(tick=>tick.opacity<1&&tick.x>0),'both selected ticks travel right and fade');
    await p.locator('.send-envelope').waitFor({state:'detached'});
    assert.equal(await p.locator('.send-tick').count(),0);
    await p.waitForFunction(()=>document.querySelector('.scene').dataset.gap==='0.0000');
    assert.equal(await p.locator('.money-card[aria-hidden=false]').getAttribute('data-card-index'),'5');
    assert.equal(await p.locator('[data-card-index="3"]').getAttribute('style'),upperBefore);
    const upperFrames=await p.evaluate(()=>{window.upperObserver.disconnect();return window.upperFrames;});
    assert.ok(upperFrames.every(style=>style===upperBefore),'upper neighbour remains unchanged throughout removal');
    assert.equal(await p.locator('[data-card-index="4"]').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    assert.equal(await done.isEnabled(),true);
    await done.click();await p.locator('.send-envelope').waitFor({state:'detached'});
    await p.waitForFunction(()=>document.querySelector('.scene').dataset.gap==='0.0000');
    assert.equal(await p.locator('.money-card[aria-hidden=false]').getAttribute('data-card-index'),'6');
    await p.locator('.deck').focus();await p.keyboard.press('End');
    await p.waitForFunction(()=>document.querySelector('.scene').dataset.position==='57.0000');
    await done.click();await p.locator('.send-envelope').waitFor({state:'detached'});
    await p.waitForFunction(()=>document.querySelector('.scene').dataset.position==='56.0000');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
    assert.deepEqual(errors,[]);assert.equal(requests.some(url=>url.includes('/api/')),false);
    await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const p=await ctx.newPage();await p.goto(base);await p.getByRole('button',{name:'Done',exact:true}).click();
  await p.locator('.send-envelope').waitFor({state:'detached'});
  assert.equal(await p.locator('.scene').getAttribute('data-position'),'4.0000');
  for(let remaining=59;remaining>0;remaining--){
    await p.getByRole('button',{name:'Done',exact:true}).click();
    await p.locator('.send-envelope').waitFor({state:'detached'});
  }
  assert.equal(await p.locator('.scene').getAttribute('data-position'),'0.0000');
  assert.equal(await p.getByText('No cards here.',{exact:true}).isVisible(),true);
  await p.getByRole('button',{name:'Replay cards',exact:true}).click();
  assert.equal(await p.locator('.position').innerText(),'01\n/\n60');
  await ctx.close();await browser.close();
  console.log('Passed: fixed appearance, four-side fold/stamp/depart, anchored upper neighbour, removed sent cards, locked navigation, repeat send, exhausted-stack reset, reduced motion, no overflow or financial API requests.');
})().catch(error=>{console.error(error);process.exit(1);});
