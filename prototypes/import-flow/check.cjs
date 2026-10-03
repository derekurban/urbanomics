// Screenshots each flow's screens from the running study (http://127.0.0.1:4186), light theme, 1280×900.
const {chromium} = require('playwright'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const origin = process.env.ORIGIN || 'http://127.0.0.1:4186', root = path.resolve('private/validation/import-flow-' + Date.now());
  fs.mkdirSync(root, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true}), page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const shot = async name => { await page.waitForTimeout(350); await page.screenshot({path: path.join(root, name + '.png'), fullPage: true}); };
  // A
  await page.goto(`${origin}/?flow=a`); await page.locator('.stage').waitFor(); await shot('a1-empty');
  await page.getByRole('button', {name: 'Add an account'}).click(); await page.getByLabel('Account name').fill('Everyday chequing'); await page.getByLabel('Text to match').fill('Bank_everyday'); await shot('a1-one-account');
  await page.getByRole('button', {name: 'Another account'}).click(); await page.getByLabel('Account name').last().fill('Visa'); await page.getByLabel('Text to match').last().fill('creditcard');
  await page.getByRole('button', {name: 'Another account'}).click(); await page.getByLabel('Account name').last().fill('Savings'); await page.getByLabel('Text to match').last().fill('savings'); await shot('a1-resolved');
  await page.getByRole('button', {name: 'Continue'}).click(); await shot('a2-columns');
  await page.getByRole('button', {name: 'Looks right'}).click(); await page.getByRole('button', {name: 'Looks right'}).click(); await page.getByRole('button', {name: 'Looks right'}).click(); await shot('a2-confirmed');
  await page.getByRole('button', {name: 'Continue'}).click(); await shot('a3-check');
  await page.getByRole('button', {name: /Import 6 files/}).click(); await shot('a4-results');
  // B
  await page.goto(`${origin}/?flow=b`); await page.locator('.stage').waitFor(); await shot('b1-kinds');
  await page.getByRole('button', {name: 'Create'}).click(); await shot('b1-account-made');
  await page.getByRole('button', {name: 'Looks right'}).click(); await shot('b1-second-kind');
  // C
  await page.goto(`${origin}/?flow=c`); await page.locator('.stage').waitFor(); await shot('c0-intro');
  await page.getByRole('button', {name: 'Let’s go'}).click(); await shot('c1-account');
  await page.getByRole('button', {name: /^Use “/}).click(); await shot('c1-account-made');
  await page.getByRole('button', {name: 'Continue'}).click(); await shot('c2-date');
  await page.locator('.mapper .col').first().click(); await page.getByRole('button', {name: 'Continue'}).click(); await page.locator('.mapper .col').nth(1).click(); await page.getByRole('button', {name: 'Continue'}).click(); await shot('c4-amount');
  await page.locator('.mapper .col').nth(2).click(); await page.getByRole('button', {name: 'Continue'}).click(); await shot('c5-confirm');
  console.log(JSON.stringify({ok: errors.length === 0, errors, root}));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
