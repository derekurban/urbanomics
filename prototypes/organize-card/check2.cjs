// Round two: screenshots of each of the six layouts, open on the split scenario and on the repayment,
// plus a mid-transition frame to confirm the strip morphs rather than reappearing.
const {chromium} = require('playwright'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const origin = process.env.ORIGIN || 'http://127.0.0.1:4185', root = path.resolve('private/validation/organize-card2-' + Date.now());
  fs.mkdirSync(root, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true}), page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (let v = 1; v <= 6; v++) for (const s of ['split', 'repay']) {
    await page.goto(`${origin}/?round=2&v=${v}&s=${s}`); await page.locator('.frame').waitFor(); await page.waitForTimeout(500);
    await page.screenshot({path: path.join(root, `r2-${String(v).padStart(2, '0')}-${s}.png`), fullPage: true});
  }
  // Toggle a closed row and catch a frame mid-way.
  await page.goto(`${origin}/?round=2&v=1&s=split`); await page.locator('.frame').waitFor(); await page.waitForTimeout(400);
  await page.locator('.row').filter({hasText: 'City Power'}).locator('.as-button').first().click(); await page.waitForTimeout(140);
  await page.screenshot({path: path.join(root, 'r2-01-mid-transition.png')});
  await page.waitForTimeout(600); await page.screenshot({path: path.join(root, 'r2-01-after.png'), fullPage: true});
  console.log(JSON.stringify({ok: errors.length === 0, errors, root}));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
