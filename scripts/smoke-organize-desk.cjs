// Organize desk in the real app against an isolated synthetic workspace: tagging with advance, splits
// through typed amounts and a keyboard boundary, events, a repayment with a taggable remainder, transfer
// twins linked from the list and from the describe box, unlink, undo, batch tagging, the deep link from
// Transactions, the Settings → Transfers tab, dark mode and a narrow layout. Never run against personal data.
const {chromium} = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {startWebServer} = require('../electron/web-server.cjs');
const {csv} = require('../electron/imports/parsers.cjs');
(async () => {
  const root = path.resolve('private/validation/organize-desk-app-' + Date.now()), server = await startWebServer({root: path.join(root, 'data'), port: 0}), store = server.store;
  const chequing = store.transferLab.accounts()[0].id, savings = store.addAccount('Desk savings', 'pc', 'savings', {color: '#8fa6cb'});
  const header = ['Description', 'Type', 'Card Holder Name', 'Date', 'Time', 'Amount'];
  const write = (name, rows) => { const f = path.join(root, name); fs.writeFileSync(f, csv([header, ...rows.map(([d, date, a]) => [d, 'SAMPLE', 'SAMPLE', date, '12:00 AM', String(a)])])); return f; };
  store.resolveAccount(store.enqueue([write('desk-chequing.csv', [['Desk cabin', '09/18/2026', -100], ['Desk receipt', '09/22/2026', 75], ['Desk pal receipt', '09/23/2026', 20], ['Desk transfer out', '09/20/2026', -502], ['Desk coffee one', '09/24/2026', -5.75], ['Desk coffee two', '09/25/2026', -5.75]])]).ids[0], chequing, false);
  store.resolveAccount(store.enqueue([write('desk-savings.csv', [['Desk transfer in', '09/21/2026', 500]])]).ids[0], savings, false);
  const gift = store.review.entity('category', {name: 'Desk gift', flowType: 'income', color: '#6f84b5'});
  const person = store.review.entity('person', {name: 'Desk friend', color: '#ca8d86'});
  const pal = store.review.entity('person', {name: 'Desk pal', color: '#af8eb5'});
  const event = store.review.entity('group', {name: 'Desk weekend', color: '#af8eb5', startDate: '2026-09-18', endDate: '2026-09-20', participants: [pal]});
  store.transferLab.save({maxDays: 3, basisPoints: 100, routes: []}, store.transferLab.config().version);
  const row = name => store.review.records().find(r => r.description === name);
  const browser = await chromium.launch({channel: 'chrome', headless: true}), page = await browser.newPage({viewport: {width: 1440, height: 1000}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const shot = async (name, full = false) => { await page.waitForTimeout(400); await page.screenshot({path: path.join(root, name + '.png'), fullPage: full}); };
  const main = name => page.locator('.od-row-main').filter({has: page.locator('.od-who > b', {hasText: new RegExp('^' + name + '$')})}).first();
  const shape = async name => page.locator('.od-row', {has: main(name)}).first().locator('.od-shape').first().getAttribute('aria-label');
  const describe = () => page.getByRole('combobox', {name: 'Describe this transaction'});
  const settle = async () => { await page.waitForTimeout(80); await page.waitForFunction(() => !document.querySelector('.organize-desk[data-busy]')); await page.waitForTimeout(150); };
  const find = () => page.getByLabel('Find a transaction');
  try {
    await page.goto(server.origin + '/#organize'); await page.locator('.od-ledger').waitFor();
    await find().fill('Desk'); await shot('01-landing', true);
    // Tagging completes the row and the list moves on to the next unsorted row.
    await main('Desk cabin').click(); await describe().fill('groc'); await page.getByRole('option', {name: /Groceries/}).waitFor(); await shot('02-describe');
    await page.keyboard.press('Enter'); assert.match(await shape('Desk cabin'), /^Groceries \$100\.00$/, 'strip updates before the save completes');
    await page.waitForFunction(() => document.querySelector('.od-toast.is-on')?.textContent.includes('Tagged Groceries'));
    await settle(); assert.match(await shape('Desk cabin'), /^Groceries \$100\.00$/);
    assert.equal(row('Desk cabin').review.tags[0].cents, 10000); assert.equal(row('Desk cabin').review.allocationMode, 'layers');
    assert.ok(await page.locator('.od-row.is-open').count(), 'next unsorted row opened');
    // Split: a second tag halves the first; exact amounts and the keyboard boundary conserve cents.
    await main('Desk cabin').click(); await describe().fill('restau'); await page.keyboard.press('Enter'); await settle();
    assert.match(await shape('Desk cabin'), /Groceries \$50\.00, Restaurants \$50\.00/);
    await page.getByLabel('Amount for Restaurants').fill('35'); await page.keyboard.press('Enter'); await settle();
    assert.match(await shape('Desk cabin'), /Groceries \$50\.00, Restaurants \$35\.00, Unsorted \$15\.00/);
    await page.getByLabel('Amount for Groceries').fill('51'); await page.keyboard.press('Enter'); await settle();
    assert.deepEqual(row('Desk cabin').review.tags.map(t => t.cents), [5100, 3500]);
    await page.getByLabel('Amount for Restaurants').fill('34'); await page.keyboard.press('Enter'); await settle();
    assert.deepEqual(row('Desk cabin').review.tags.map(t => t.cents), [5100, 3400]);
    await describe().fill('desk week'); await page.keyboard.press('Enter'); await settle(); assert.deepEqual(row('Desk cabin').review.groups, [event]);
    assert.deepEqual(row('Desk cabin').review.shares, [{id: 'me', cents: 5000}, {id: pal, cents: 5000}], 'joining the event applies its split'); assert.equal(row('Desk cabin').review.sharesSource, 'event:' + event);
    await shot('03-split-event');
    await page.keyboard.press('Escape'); await main('Desk cabin').click(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox', 'a row with an unsorted gap focuses the describe box');
    await describe().fill('friend'); await page.getByRole('option', {name: /Shared with Desk friend/}).waitFor(); await shot('03b-share-option'); await page.keyboard.press('Enter'); await settle();
    assert.deepEqual(row('Desk cabin').review.shares, [{id: 'me', cents: 3334}, {id: pal, cents: 3333}, {id: person, cents: 3333}]); assert.equal(row('Desk cabin').review.sharesSource, 'manual');
    assert.equal(await page.getByRole('button', {name: 'Desk friend', exact: true, pressed: true}).count(), 1, 'the split slot shows the person as on');
    await page.getByLabel('Share for Desk friend').fill('40'); await page.keyboard.press('Enter'); await settle();
    assert.deepEqual(row('Desk cabin').review.shares, [{id: 'me', cents: 2667}, {id: pal, cents: 3333}, {id: person, cents: 4000}]);
    assert.deepEqual(row('Desk cabin').review.tags.map(t => t.cents), [5100, 3400], 'sharing keeps the tags');
    // Repayment: the friend's receipt applies to the cabin and the rest becomes a gift.
    await main('Desk receipt').click(); await describe().fill('friend'); await page.getByRole('option', {name: /Desk friend settles up/}).waitFor(); await shot('04-settle-option');
    assert.match(await page.getByRole('option', {name: /Desk friend settles up/}).textContent(), /owes you \$40\.00/, 'the option states the balance');
    await page.keyboard.press('Enter'); await settle();
    assert.equal(row('Desk receipt').review.allocations[0].cents, 4000); assert.equal(row('Desk receipt').review.kind, 'repayment');
    await page.locator('.od-part-row.is-settle').waitFor(); assert.match(await page.locator('.od-part-row.is-settle').textContent(), /Desk friend settled.*Desk cabin/);
    await describe().fill('desk gift'); await page.keyboard.press('Enter'); await settle();
    assert.equal(row('Desk receipt').review.allocations[0].cents, 4000); assert.deepEqual(row('Desk receipt').review.tags, [{id: gift, cents: 3500}]);
    await main('Desk coffee one').click(); await describe().fill('pal'); await page.getByRole('option', {name: /Shared with Desk pal/}).click(); await settle();
    assert.deepEqual(row('Desk coffee one').review.shares, [{id: 'me', cents: 288}, {id: pal, cents: 287}], 'sharing an expense from its own box');
    await page.keyboard.press('Escape');
    await main('Desk pal receipt').click(); await describe().fill('pal'); const palOption = page.getByRole('option', {name: /Desk pal settles up/}); await palOption.waitFor();
    assert.match(await palOption.textContent(), /owes you \$36\.20/, 'balance spans both shared expenses'); await shot('04b-settle-balance');
    await page.keyboard.press('Enter'); await settle();
    assert.deepEqual(row('Desk pal receipt').review.allocations, [{id: row('Desk cabin').id, cents: 2000}], 'oldest open share first');
    assert.deepEqual(row('Desk cabin').review.shares, [{id: 'me', cents: 2667}, {id: pal, cents: 3333}, {id: person, cents: 4000}]);
    await main('Desk cabin').click(); await page.getByRole('button', {name: 'Desk pal', exact: true, pressed: true}).waitFor(); await shot('05a-split-slot');
    await page.getByRole('button', {name: 'Desk pal', exact: true, pressed: true}).click(); await page.waitForFunction(() => document.querySelector('.od-toast.is-error')); await settle();
    assert.equal(row('Desk cabin').review.shares.length, 3, 'a settler stays in the split');
    await page.getByRole('button', {name: /Follow Desk weekend again/}).click(); await page.waitForFunction(() => document.querySelector('.od-toast.is-error')?.textContent.includes('Desk friend')); await settle();
    assert.equal(row('Desk cabin').review.sharesSource, 'manual', 'cannot follow an event that excludes a settler');
    await page.keyboard.press('Escape');
    await main('Desk receipt').click(); await page.waitForTimeout(150); await shot('05-mixed');
    assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox', 'a fully sorted row does not grab the describe box');
    await page.keyboard.press('Escape');
    // Transfer twins from the list button, undo, then from the describe box; unlink from the open row.
    await main('Desk transfer in').click(); await page.locator('.od-row.is-twin').waitFor(); await shot('06-twin');
    await page.locator('.od-twin').click(); await page.waitForFunction(() => document.querySelector('.od-toast.is-on')?.textContent.includes('Moved between accounts')); await settle();
    assert.equal(row('Desk transfer in').review.kind, 'transfer'); assert.equal(row('Desk transfer out').review.transferFeeCents, 200);
    assert.match(await shape('Desk transfer out'), /Transfer to Desk savings \$500\.00, Transfer fee \$2\.00/);
    await page.getByRole('button', {name: 'Undo'}).click(); await settle(); assert.notEqual(row('Desk transfer in').review.kind, 'transfer');
    await main('Desk transfer out').click(); await describe().fill('savings'); await page.getByRole('option', {name: /^To Desk savings/}).waitFor(); await page.keyboard.press('Enter'); await settle();
    assert.equal(row('Desk transfer out').review.kind, 'transfer'); await shot('07-linked');
    await page.getByRole('button', {name: 'Unlink', exact: true}).click(); await settle(); assert.notEqual(row('Desk transfer out').review.kind, 'transfer');
    await page.keyboard.press('Escape');
    // Batch: two coffees at once, then undo restores both.
    await main('Desk coffee one').click({modifiers: ['Control']}); await main('Desk coffee two').click({modifiers: ['Control']}); await page.locator('.od-batch').waitFor(); await shot('08-batch');
    await page.locator('.od-batch-tags button', {hasText: 'Restaurants'}).click(); await settle();
    assert.equal(row('Desk coffee one').review.tags[0].cents, 575); assert.equal(row('Desk coffee two').review.tags[0].cents, 575);
    await page.getByRole('button', {name: 'Undo'}).click(); await settle(); assert.equal(row('Desk coffee one').review.tags.length, 0);
    await page.getByRole('button', {name: 'Unsorted', exact: false}).first().click(); await shot('09-unsorted');
    // Deep link from Transactions opens the row.
    await page.getByRole('navigation', {name: 'Main navigation'}).getByRole('button', {name: 'Transactions'}).click();
    await page.getByRole('button', {name: 'Filters & view +', exact: true}).click(); await page.getByLabel('Search transactions', {exact: true}).fill('Desk cabin');
    await page.getByRole('button', {name: 'Desk cabin', exact: true}).click(); await page.getByRole('button', {name: 'Organize transaction →', exact: true}).click();
    await page.locator('.od-row.is-open', {hasText: 'Desk cabin'}).waitFor(); await shot('10-deep-link');
    // Transfer settings live under Settings.
    await page.getByRole('navigation', {name: 'Main navigation'}).getByRole('button', {name: 'Settings'}).click();
    await page.getByRole('navigation', {name: 'Settings sections'}).getByRole('button', {name: 'Transfers', exact: true}).click();
    await page.getByLabel('Lab amount tolerance').waitFor(); await shot('11-settings-transfers', true);
    // Admin clears every split and repayment behind a confirmation.
    await page.getByRole('navigation', {name: 'Settings sections'}).getByRole('button', {name: 'Admin', exact: true}).click();
    await page.getByRole('button', {name: 'Clear all splits and repayments', exact: true}).click(); await page.getByRole('dialog', {name: 'Clear all splits and repayments?'}).waitFor(); await shot('11b-admin-clear');
    await page.getByRole('button', {name: 'Confirm clear all', exact: true}).click(); await page.getByText(/repayments cleared/).waitFor();
    assert.equal(row('Desk cabin').review.shares, null); assert.deepEqual(row('Desk receipt').review.allocations, []); assert.equal(row('Desk receipt').review.kind, 'income'); assert.equal(row('Desk pal receipt').review.kind, 'unreviewed');
    assert.deepEqual(row('Desk cabin').review.groups, [event], 'event membership stays');
    // Dark mode and a narrow layout.
    await page.evaluate(() => localStorage.setItem('urbanomics.colorMode.v1', 'dark')); await page.goto(server.origin + '/#organize'); await page.reload(); await page.locator('.od-ledger').waitFor();
    await find().fill('Desk'); await main('Desk receipt').click(); await describe().waitFor(); await shot('12-dark');
    await page.setViewportSize({width: 820, height: 1000}); await page.waitForTimeout(300); await shot('13-narrow', true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ok: true, root}));
  } catch (e) { console.error(e); await page.screenshot({path: path.join(root, 'error.png'), fullPage: true}).catch(() => {}); process.exitCode = 1; }
  finally { await browser.close(); await server.close(); }
})();
