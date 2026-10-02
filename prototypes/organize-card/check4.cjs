// Round four: drive each approach through the same tasks and screenshot the results.
// Tasks: tag City Power, settle Sam's e-transfer, pair the credit card payment, move the brokerage contribution to an untracked account.
const {chromium} = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const origin = process.env.ORIGIN || 'http://127.0.0.1:4185', root = path.resolve('private/validation/organize-card4-' + Date.now());
  fs.mkdirSync(root, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true}), page = await browser.newPage({viewport: {width: 1280, height: 1000}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const row = name => page.locator('.row').filter({has: page.locator('.who > b', {hasText: new RegExp('^' + name + '$')})}).first();
  const open = async name => { await row(name).locator('.row-main').first().click(); await page.waitForTimeout(450); };
  const shot = async name => { await page.waitForTimeout(300); await page.screenshot({path: path.join(root, name + '.png'), fullPage: true}); };
  const strip = async name => row(name).locator('.row-strip .strip').first().innerText();
  const type = async (placeholder, text) => { const box = page.getByPlaceholder(placeholder).first(); await box.click(); await box.fill(text); await page.waitForTimeout(150); await box.press('Enter'); await page.waitForTimeout(450); };
  try {
    for (let v = 1; v <= 3; v++) {
      await page.goto(`${origin}/?round=4&v=${v}&s=cabin`); await page.locator('.frame').waitFor(); await page.waitForTimeout(400);
      await shot(`r4-${v}-a-cabin`);
      await open('City Power');
      if (v === 1 || v === 3) await type('Tag…', 'util'); else await type('Tag, event or account…', 'util');
      assert.match(await strip('City Power'), /Utilities/, `v${v}: City Power tagged`);
      await shot(`r4-${v}-b-power-tagged`);
      await open('e-Transfer from Sam');
      if (v === 1) { await page.getByRole('button', {name: 'Offset', exact: true}).click(); await page.waitForTimeout(300); await type('Person or vendor…', 'sam'); }
      else if (v === 2) await type('Tag, who settled, event or account…', 'sam');
      else { await page.getByRole('button', {name: /Looks like Sam/}).click(); await page.waitForTimeout(400); }
      assert.match(await strip('e-Transfer from Sam'), /Sam settled/, `v${v}: Sam settled`);
      await shot(`r4-${v}-c-sam-settled`);
      await open('Payment to credit card');
      if (v === 1) await page.locator('.cand').first().click();
      else if (v === 2) await type('Tag, event or account…', 'credit');
      else { await page.getByRole('button', {name: /Looks like Credit card/}).click(); }
      await page.waitForTimeout(450);
      assert.match(await strip('Payment to credit card'), /To Credit card/, `v${v}: payment paired`);
      await open('Brokerage');
      if (v === 1) { await page.getByRole('button', {name: 'Move', exact: true}).click(); await page.waitForTimeout(300); await type('Own account…', 'broker'); }
      else if (v === 2) await type('Tag, event or account…', 'broker');
      else await type('Change who…', 'broker');
      assert.match(await strip('Brokerage'), /To Brokerage/, `v${v}: moved to an untracked account`);
      await shot(`r4-${v}-d-moves`);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ok: true, root}));
  } catch (e) { console.error(e); await page.screenshot({path: path.join(root, 'error.png'), fullPage: true}).catch(() => {}); process.exitCode = 1; }
  finally { await browser.close(); }
})();
