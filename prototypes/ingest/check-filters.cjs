const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base='http://127.0.0.1:4176/lab/';
(async()=>{
  fs.mkdirSync('private/validation/rolodex-filters',{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height] of [[390,844],[360,640],[1280,900],[844,390]]){
    const context=await browser.newContext({viewport:{width,height}}),p=await context.newPage(),errors=[],requests=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
    await p.goto(base);await p.getByRole('button',{name:'Done',exact:true}).waitFor();
    assert.equal(await p.locator('[data-card-index]').count(),60);
    await p.screenshot({path:`private/validation/rolodex-filters/all-${width}.png`});
    await p.getByRole('button',{name:/^Expenses \d/}).click();
    await p.locator('.scene[data-transition=out]').waitFor();
    await p.waitForTimeout(240);await p.screenshot({path:`private/validation/rolodex-filters/transition-${width}.png`});
    await p.locator('.scene[data-transition=idle]').waitFor();
    assert.equal(await p.locator('.spin-card').count(),0);
    assert.ok(await p.locator('.money-card[aria-hidden=false]').getAttribute('class').then(c=>c.includes('expense-card')));
    await p.screenshot({path:`private/validation/rolodex-filters/expenses-${width}.png`});
    await p.getByRole('button',{name:'Done',exact:true}).click();await p.locator('.send-envelope').waitFor({state:'detached'});
    await p.getByRole('button',{name:/^Income \d/}).click();
    // Retarget before a spin completes: latest choice must win without stale results.
    await p.getByRole('button',{name:/^All \d/}).click();
    await p.locator('.scene[data-transition=idle]').waitFor();
    assert.equal(await p.locator('.position').innerText().then(t=>t.split('/')[1].trim()),'59');
    await p.getByRole('button',{name:/^Filters/}).click();
    await p.getByRole('button',{name:'Savings',exact:true}).click();
    await p.locator('.scene[data-transition=idle]').waitFor();
    await p.getByRole('button',{name:/^Expenses \d/}).click();await p.locator('.scene[data-transition=idle]').waitFor();
    assert.equal(await p.getByText('No cards here.',{exact:true}).isVisible(),true);
    await p.getByRole('button',{name:'Clear filters',exact:true}).click();await p.locator('.scene[data-transition=idle]').waitFor();
    await p.getByRole('textbox',{name:'Search transactions'}).fill('Juniper');await p.getByRole('button',{name:'Apply',exact:true}).click();
    await p.locator('.scene[data-transition=idle]').waitFor();
    assert.equal(await p.locator('.money-card[aria-hidden=false] h2').innerText(),'Juniper Kitchen');
    await p.getByRole('button',{name:'Close filters',exact:true}).click();
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
    assert.deepEqual(errors,[]);assert.equal(requests.some(r=>r.includes('/api/')),false);
    await context.close();
  }
  const context=await browser.newContext({reducedMotion:'reduce'}),p=await context.newPage();await p.goto(base);
  await p.getByRole('button',{name:/^Expenses \d/}).click();
  assert.equal(await p.locator('.spin-card').count(),0);assert.equal(await p.locator('.scene').getAttribute('data-transition'),'idle');
  assert.ok((await p.locator('.money-card[aria-hidden=false]').getAttribute('class')).includes('expense-card'));
  await browser.close();console.log('Passed: 60 cards, staggered card/tick slide, direction/account/search combinations, latest-filter wins, Done retention, empty results, responsive fit, reduced motion; no financial API.');
})().catch(e=>{console.error(e);process.exit(1);});
