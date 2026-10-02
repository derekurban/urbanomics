const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.URBANOMICS_LAB_URL || 'http://127.0.0.1:4176/lab/';

(async () => {
  const output = path.resolve('private/validation/rolodex');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  const settle = async index => {
    await page.waitForFunction(index => {
      const scene = document.querySelector('.scene');
      return scene?.dataset.moving === 'false' && Math.abs(Number(scene.dataset.position) - index) < .001;
    }, index);
    assert.equal(await page.locator('.rail-right .tick[aria-selected=true]').getAttribute('id'), `tick-${index}`);
    assert.equal(await page.locator('.rail-left .tick[aria-selected=true]').getAttribute('id'), `tick-left-${index}`);
    assert.equal(await page.locator('.money-card[aria-hidden=false]').getAttribute('data-card-index'), String(index));
    const geometry = await page.locator(`#tick-${index}`).evaluate(el => ({
      tick: el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2,
      rail: el.parentElement.getBoundingClientRect().y + el.parentElement.getBoundingClientRect().height / 2,
      width: el.querySelector('span').getBoundingClientRect().width,
    }));
    assert.ok(Math.abs(geometry.tick - geometry.rail) < 1, 'selected tick centered');
    assert.ok(Math.abs(geometry.width - 30) < 1, 'selected tick longest');
  };
  await page.goto(base);
  await settle(4);
  const restingLayers = await page.locator('.money-card').evaluateAll(cards => cards.map(card => ({
    visibility: getComputedStyle(card).visibility,
    opacity: getComputedStyle(card).opacity,
    contentOpacity: getComputedStyle(card.querySelector('.card-inner')).opacity,
    filter: getComputedStyle(card).filter,
    softness: Number(getComputedStyle(card).getPropertyValue('--softness')),
  })));
  assert.equal(restingLayers.filter(card => card.visibility === 'visible').length, 3, 'only the selected card and immediate neighbours show at rest');
  assert.equal(restingLayers[4].opacity, '1', 'focused card fully opaque');
  assert.equal(restingLayers[4].filter, 'none', 'focused card stays sharp');
  for (const index of [3,5]) {
    assert.equal(restingLayers[index].opacity, '1', 'neighbours hide all cards behind them');
    assert.ok(restingLayers[index].softness > 0, 'neighbours retain their subdued appearance');
    assert.ok(restingLayers[index].filter.startsWith('blur('), 'neighbours are softly blurred');
  }
  await page.screenshot({ path: path.join(output, 'phone.png') });
  await page.getByRole('button', { name: 'Next card', exact: true }).tap(); await settle(5);
  await page.getByRole('button', { name: 'Previous card', exact: true }).tap(); await settle(4);
  await page.getByRole('button', { name: 'Next card', exact: true }).tap();
  await page.getByRole('button', { name: 'Next card', exact: true }).tap(); await settle(6);
  await page.getByRole('button', { name: 'Previous card', exact: true }).tap();
  await page.getByRole('button', { name: 'Previous card', exact: true }).tap(); await settle(4);
  await page.locator('#tick-7').tap(); await settle(7);

  const cdp = await context.newCDPSession(page);
  async function touchDrag(surface, dy, cancel = false) {
    const bounds = await page.locator(surface).boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 10 }] });
      await new Promise(resolve => setTimeout(resolve, 12));
    }
    // A deliberate hold before release tests direct positioning without flick projection.
    await new Promise(resolve => setTimeout(resolve, 130));
    await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  }
  await touchDrag('.rail-right .rail', -42); await settle(9);
  await touchDrag('.rail-left .rail', 42); await settle(7);
  await page.locator('#tick-left-9').tap(); await settle(9);
  await touchDrag('.deck', 125); await settle(8);
  await touchDrag('.deck', -60, true); await settle(8);
  await page.locator('.deck').focus();
  await page.keyboard.press('Home'); await settle(0);
  assert.equal(await page.getByRole('button', { name: 'Previous card' }).isEnabled(), false);
  await page.keyboard.press('ArrowUp'); await settle(0);
  await page.keyboard.press('End'); await settle(59);
  assert.equal(await page.getByRole('button', { name: 'Next card' }).isEnabled(), false);
  await page.keyboard.press('ArrowDown'); await settle(59);
  await page.keyboard.press('PageUp'); await settle(56);
  const box = await page.locator('.deck').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 160); await settle(57);
  await page.locator('.deck').focus(); await page.keyboard.press('Home'); await settle(0);
  await page.keyboard.press('PageDown'); await settle(3);
  await page.locator('#tick-6').tap(); await settle(6);
  await page.setViewportSize({ width: 430, height: 932 }); await settle(6);
  await page.getByRole('button', { name: 'About this interaction' }).tap();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Close information' }).tap();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /\/api\//.test(url)), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('urbanomics-ingest-lab-v1')), null);
  await context.close();

  // Hold the actual pointer gesture at intermediate positions. Testing only settled
  // cards missed the original amount clipping when the two faces changed layers.
  for (const [width, height] of [[360,640],[390,844],[1280,900]]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage(); await p.goto(base); await p.locator('.scene[data-position]').waitFor();
    const surface = await p.locator('.deck').boundingBox();
    const cardHeight = await p.locator('.money-card').first().evaluate(el => el.offsetHeight);
    const centerX = surface.x + surface.width / 2, centerY = surface.y + surface.height / 2;
    const selectedCard = await p.locator('[data-card-index="4"]').boundingBox();
    for (const side of ['left', 'right']) {
      const tick = await p.locator(`.rail-${side} .tick[aria-selected=true] span`).boundingBox();
      const gap = side === 'left' ? selectedCard.x - (tick.x + tick.width) : tick.x - (selectedCard.x + selectedCard.width);
      assert.ok(gap >= 0 && gap <= 12, `${side} index stays close without covering the card`);
    }
    await p.mouse.move(centerX, centerY); await p.mouse.down();
    const startIncoming = await p.locator('[data-card-index="5"]').boundingBox();
    let priorIncomingY = startIncoming.y;
    for (const progress of [.05,.1,.2,.35,.5,.65,.8]) {
      await p.mouse.move(centerX, centerY - cardHeight * .57 * .86 * progress);
      const outgoing = await p.locator('[data-card-index="4"]').boundingBox();
      const incoming = await p.locator('[data-card-index="5"]').boundingBox();
      assert.ok(await p.locator('.money-card').evaluateAll(cards => cards.every(card => getComputedStyle(card).opacity === '1' && getComputedStyle(card.querySelector('.card-inner')).opacity === '1')), 'softening keeps a solid face rather than revealing rear layers');
      assert.ok(incoming.y <= priorIncomingY + .5, `${width}: incoming card never kicks outward or reverses`);
      if (progress === .05) assert.ok(Math.abs(incoming.y - startIncoming.y) < 10, 'small starting gesture has no abrupt card displacement');
      priorIncomingY = incoming.y;
      if (progress >= .2) assert.ok(incoming.y >= outgoing.y + outgoing.height, `${width}: faces do not clip at ${progress}`);
      for (const box of [outgoing, incoming]) assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, 'travelling face stays inside viewport');
      if (progress === .5) {
        await p.screenshot({ path: path.join(output, `handoff-${width}.png`) });
        // An actually occluded card must not alter the visible face's pixels.
        // Test both faces against a capture with their deeper layers hidden.
        const clips = [outgoing, incoming].map(box => ({x:box.x+box.width*.2,y:box.y+box.height*.2,width:box.width*.6,height:box.height*.6}));
        const before = [];
        for (const clip of clips) before.push(await p.screenshot({clip}));
        await p.locator('.money-card').evaluateAll(cards => cards.forEach(card => {if(!['4','5'].includes(card.dataset.cardIndex))card.style.visibility='hidden';}));
        for(let i=0;i<clips.length;i++) {
          const after=await p.screenshot({clip:clips[i]});
          if(!before[i].equals(after)) {
            // Chrome can re-rasterize blurred glyph edges by one RGB level when
            // a composited layer disappears. Reject visible changes, not that noise.
            const difference=await p.evaluate(async images=>{
              const pixels=await Promise.all(images.map(async image=>{
                const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(image),c=>c.charCodeAt(0))],{type:'image/png'}));
                const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
                const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
                return context.getImageData(0,0,canvas.width,canvas.height).data;
              }));
              let max=0,changed=0;
              for(let j=0;j<pixels[0].length;j+=4){
                const delta=Math.max(...[0,1,2,3].map(c=>Math.abs(pixels[0][j+c]-pixels[1][j+c])));
                max=Math.max(max,delta);if(delta)changed++;
              }
              return {max,fraction:changed/(pixels[0].length/4)};
            },[before[i].toString('base64'),after.toString('base64')]);
            assert.ok(difference.max<=1&&difference.fraction<.005, `${width}: rear card cannot ghost through face ${i}: ${JSON.stringify(difference)}`);
          }
        }
      }
    }
    await p.mouse.up(); await ctx.close();
  }

  for (const [width, height] of [[360,640],[390,844],[430,932],[1280,900],[844,390]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(base); await p.locator('.scene[data-position]').waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false, `${width}x${height} overflow`);
    await p.locator('.deck').focus(); await p.keyboard.press('ArrowDown');
    await p.waitForFunction(() => document.querySelector('.scene').dataset.position === '5.0000');
    const card = await p.locator('.money-card[aria-hidden=false]').boundingBox();
    assert.ok(card.x >= 0 && card.x + card.width <= width, 'card stays within width');
    assert.ok(card.y >= 0 && card.y + card.height <= height, 'card stays within height');
    await p.screenshot({ path: path.join(output, `reduced-${width}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log('Passed: native touch drag and rail scrubbing, marker tap, spring settling, synchronized card/tick/counter, cancellation, wheel, keyboard, ends, resize, reduced motion, portrait/landscape fit; no financial API or sample-task storage.');
})().catch(error => { console.error(error); process.exit(1); });
