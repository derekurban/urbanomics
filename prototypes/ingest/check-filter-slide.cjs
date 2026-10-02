const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const LAB_URL = process.env.URBANOMICS_LAB_URL || 'http://127.0.0.1:4176/lab/';
(async()=>{
  fs.mkdirSync('private/validation/rolodex-slide',{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height] of [[390,844],[360,640],[1280,900],[844,390]]){
    const c=await browser.newContext({viewport:{width,height}}),p=await c.newPage();
    await p.goto(LAB_URL);
    await p.evaluate(()=>{
      window.slideFrames=[];
      const capture=()=>{
        const scene=document.querySelector('.scene');
        const cards=[...document.querySelectorAll('.money-card')].filter(c=>c.style.visibility==='visible').map(card=>{
          const id=card.dataset.cardIndex;
          return {id,shift:parseFloat(card.style.translate)||0,alpha:Number(card.style.opacity||1),pose:card.style.transform,
            left:document.getElementById('tick-left-'+id).style.translate,right:document.getElementById('tick-'+id).style.translate};
        });
        window.slideFrames.push({phase:scene.dataset.transition,sceneTransform:getComputedStyle(scene).transform,
          cards,railOverflow:getComputedStyle(document.querySelector('.rail')).overflow});
        window.slideRaf=requestAnimationFrame(capture);
      };capture();
    });
    await p.getByRole('button',{name:/^Expenses \d/}).click();
    await p.waitForTimeout(100);await p.screenshot({path:`private/validation/rolodex-slide/out-${width}.png`});
    await p.locator('.scene[data-transition=in]').waitFor();await p.waitForTimeout(100);
    await p.screenshot({path:`private/validation/rolodex-slide/in-${width}.png`});
    await p.locator('.scene[data-transition=idle]').waitFor();await p.waitForTimeout(35);
    const frames=await p.evaluate(()=>{cancelAnimationFrame(window.slideRaf);return window.slideFrames;});
    const outgoing=frames.filter(f=>f.phase==='out'),incoming=frames.filter(f=>f.phase==='in');
    assert.ok(outgoing.some(f=>f.cards.some(c=>c.shift>5&&c.alpha<.95)),'cards fly right while fading');
    assert.ok(incoming.some(f=>f.cards.some(c=>c.shift< -5&&c.alpha<.95)),'cards arrive from the left');
    for(const phase of [outgoing,incoming]){
      assert.ok(phase.every(f=>f.sceneTransform==='none'),'scene itself remains stationary');
      assert.ok(phase.some(f=>Math.max(...f.cards.map(c=>c.shift))-Math.min(...f.cards.map(c=>c.shift))>15),'cards visibly stagger');
      assert.ok(phase.every(f=>f.railOverflow==='visible'),'ticks can fly beyond narrow rails');
      for(const f of phase)for(const card of f.cards){
        assert.equal(card.left,card.right,'both ticks share timing');
        assert.ok(Math.abs((parseFloat(card.left)||0)-card.shift)<.01,'ticks share their card displacement');
      }
    }
    for(const card of frames.at(-1).cards){assert.equal(card.shift,0);assert.equal(card.alpha,1);}
    assert.equal(await p.locator('.money-card[aria-hidden=false] h2').innerText(),'Juniper Kitchen');
    await p.screenshot({path:`private/validation/rolodex-slide/settled-${width}.png`});
    // Retarget once during arrival and once during the following exit.
    await p.getByRole('button',{name:/^Income \d/}).click();
    await p.locator('.scene[data-transition=in]').waitFor();await p.waitForTimeout(60);
    await p.getByRole('button',{name:/^Expenses \d/}).click();
    await p.getByRole('button',{name:/^All \d/}).click();
    await p.locator('.scene[data-transition=idle]').waitFor();
    assert.ok((await p.locator('.position').innerText()).includes('60'));
    await c.close();
  }
  await browser.close();console.log('Passed: staggered right exit and left entry, per-card tick synchronization, unclipped rails, settled cleanup and rapid filter retarget across four viewports.');
})().catch(e=>{console.error(e);process.exit(1);});
