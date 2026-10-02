// Drives the running study (http://127.0.0.1:4184) in headless Chrome and saves screenshots under private/validation.
// Checks: tagging completes a row, splits conserve cents, a repayment uses the receipt's unsorted amount,
// twins link both sides with a fee, undo restores, batch tagging applies once per row. Synthetic data only.
const {chromium} = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const origin = process.env.ORIGIN || 'http://127.0.0.1:4184', root = path.resolve('private/validation/organize-desk-' + Date.now());
  fs.mkdirSync(root, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true}), page = await browser.newPage({viewport: {width: 1440, height: 1000}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const shot = async (name, full = false) => { await page.waitForTimeout(350); await page.screenshot({path: path.join(root, name + '.png'), fullPage: full}); };
  const row = name => page.locator('.row-main', {hasText: name}).first();
  const shapeOf = async name => page.locator('.row', {has: row(name)}).first().locator('.shape').first().getAttribute('aria-label');
  const describe = () => page.getByRole('combobox', {name: 'Describe this transaction'});
  try {
    await page.goto(origin); await page.locator('.ledger').waitFor();
    await shot('01-landing', true);
    await row('Mountain cabin').click(); await describe().waitFor(); await shot('02-open-expense');
    await describe().fill('lod'); await page.getByRole('option', {name: /Lodging/}).waitFor(); await shot('03-describe-menu');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    assert.match(await shapeOf('Mountain cabin'), /^Lodging \$412\.50$/);
    // Flow moved to the next unsorted row (Bookshop, further down). Reopen cabin to split it.
    await row('Mountain cabin').click(); await describe().fill('fuel'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    assert.match(await shapeOf('Mountain cabin'), /Lodging \$206\.25, Fuel \$206\.25/);
    await page.getByLabel('Amount for Fuel').fill('55.20'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    assert.match(await shapeOf('Mountain cabin'), /Lodging \$206\.25, Fuel \$55\.20, Unsorted \$151\.05/);
    await page.getByLabel('Boundary after Lodging').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    assert.match(await shapeOf('Mountain cabin'), /Lodging \$207\.25, Fuel \$54\.20/);
    await describe().fill('cabin w'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    await shot('04-split-with-event');
    await page.keyboard.press('Escape');
    // Repayment: Sam paid back part of the cabin.
    await row('E-transfer from Sam').click(); await describe().fill('sam'); await page.keyboard.press('Enter');
    await page.getByText('Sam paid you back for…').waitFor(); await shot('05-repay-choose');
    await page.locator('.suggest-row', {hasText: 'Mountain cabin'}).click(); await page.waitForTimeout(200);
    assert.match(await shapeOf('E-transfer from Sam'), /Sam repaid Mountain cabin \$60\.00/);
    await page.getByLabel('Amount for Sam repaid Mountain cabin').fill('40'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    await describe().fill('gift'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await row('E-transfer from Sam').click(); await shot('06-mixed-receipt');
    assert.match(await shapeOf('E-transfer from Sam'), /Sam repaid Mountain cabin \$40\.00, Gift \$20\.00/);
    await page.keyboard.press('Escape');
    // Transfer twins: opening one side highlights the other.
    await row('Payment to Mastercard').click(); await page.locator('.row.is-twin').waitFor(); await shot('07-twin-highlight');
    await page.locator('.row-twin').click(); await page.waitForTimeout(300);
    assert.match(await shapeOf('Payment to Mastercard'), /Transfer to Mastercard \$1,240\.00/);
    assert.match(await shapeOf('Payment, thank you'), /Transfer from Chequing \$1,240\.00/);
    await row('Transfer to savings').click(); await describe().fill('sav'); await page.getByRole('option', {name: /Transfer to Savings/}).waitFor(); await shot('08-twin-in-describe'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    assert.match(await shapeOf('Transfer to savings'), /Transfer to Savings \$498\.00, Transfer fee \$2\.00/);
    await page.getByRole('button', {name: 'Unlink'}).waitFor(); await shot('09-linked-open');
    await page.getByRole('button', {name: 'Undo'}).click(); await page.waitForTimeout(200);
    assert.match(await shapeOf('Transfer to savings'), /^Unsorted/);
    await page.keyboard.press('Escape');
    // Batch: two coffees at once.
    await row('Ritual coffee').first().click({modifiers: ['Control']}); await row('Bookshop').click({modifiers: ['Control']}); await page.locator('.batch').waitFor(); await shot('10-batch');
    await page.locator('.batch-tags button', {hasText: 'Coffee'}).click(); await page.waitForTimeout(200);
    assert.match(await shapeOf('Bookshop'), /^Coffee/);
    await page.getByRole('button', {name: 'Unsorted'}).click(); await shot('11-unsorted-filter', true);
    await page.getByRole('button', {name: 'All'}).click();
    await page.getByRole('group', {name: 'Theme'}).locator('button').nth(1).click(); await page.waitForTimeout(200);
    await shot('12-dark-landing'); await row('E-transfer from Sam').click(); await describe().waitFor(); await shot('13-dark-open');
    await describe().fill('g'); await page.waitForTimeout(200); await shot('14-dark-menu');
    await page.setViewportSize({width: 820, height: 1000}); await page.waitForTimeout(300); await shot('15-narrow', true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ok: true, root}));
  } catch (e) { console.error(e); await page.screenshot({path: path.join(root, 'error.png')}); process.exitCode = 1; }
  finally { await browser.close(); }
})();
