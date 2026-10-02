// Screenshots every variation for two scenarios from the running study (http://127.0.0.1:4185).
const {chromium} = require('playwright'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const origin = process.env.ORIGIN || 'http://127.0.0.1:4185', root = path.resolve('private/validation/organize-card-' + Date.now());
  fs.mkdirSync(root, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true}), page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const s of ['split', 'repay']) for (let v = 1; v <= 10; v++) {
    await page.goto(`${origin}/?v=${v}&s=${s}`); await page.locator('.frame').waitFor(); await page.waitForTimeout(250);
    await page.screenshot({path: path.join(root, `${s}-${String(v).padStart(2, '0')}.png`), fullPage: true});
  }
  await page.goto(`${origin}/?v=5&s=untagged`); await page.locator('.frame').waitFor(); await page.getByRole('button', {name: 'Remember'}).click(); await page.waitForTimeout(200); await page.screenshot({path: path.join(root, 'untagged-05-remember.png'), fullPage: true});
  console.log(JSON.stringify({ok: errors.length === 0, errors, root}));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
