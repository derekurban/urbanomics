// Settle against expenses in the browser host on a synthetic workspace: a store refund found by typing
// "settle", applied to the matching expense and undone; then a friend's e-transfer split across two expenses
// from the card's link, which shares both with them. Screenshots land in the workspace folder.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { startWebServer } = require("../electron/web-server.cjs");
(async () => {
  const root = path.resolve("private/validation/settle-" + Date.now()), server = await startWebServer({ root, port: 0 }), store = server.store;
  const file = path.join(root, "settle.csv");
  fs.writeFileSync(file, ["Description,Type,Card Holder Name,Date,Time,Amount",
    "HARDWARE STORE,S,S,09/02/2026,12:00 AM,-100", "CONCERT TICKETS,S,S,09/03/2026,12:00 AM,-80",
    "HARDWARE STORE REFUND,S,S,09/09/2026,12:00 AM,30", "E-TRANSFER SAM,S,S,09/10/2026,12:00 AM,90"].join("\n"));
  store.resolveAccount(store.enqueue([file]).ids[0], store.state().accounts[0].id, false);
  const sam = store.review.entity("person", { name: "Sam", color: "#8899AA" });
  const row = (d) => store.review.records().find((r) => r.description === d);
  const browser = await chromium.launch({ channel: "chrome", headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(root, name + ".png") }); };
  const settled = () => page.waitForFunction(() => !document.querySelector(".organize-desk[data-busy]"));
  try {
    await page.goto(server.origin + "/#organize");
    await page.getByLabel("Find a transaction").fill("HARDWARE STORE REFUND");
    await page.locator(".od-row-main", { hasText: "HARDWARE STORE REFUND" }).first().click();
    await page.getByRole("combobox", { name: "Describe this transaction" }).fill("settle");
    await page.getByRole("option", { name: /Settle against expenses/ }).click();
    const dialog = page.getByRole("dialog", { name: "Settle against expenses", exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Who this money is from").inputValue(), "");
    // The expense with the same name comes first.
    assert.match(await dialog.locator(".od-settle-row").first().textContent(), /HARDWARE STORE/);
    await dialog.getByRole("checkbox", { name: /^Settle HARDWARE STORE on/ }).check();
    assert.equal(await dialog.getByLabel("Amount for HARDWARE STORE", { exact: true }).inputValue(), "30.00");
    await shot("01-refund-dialog");
    await dialog.getByRole("button", { name: "Settle $30.00", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText(/\$30\.00 refunded/).waitFor();
    await settled();
    let refund = row("HARDWARE STORE REFUND");
    assert.equal(refund.review.kind, "repayment");
    assert.deepEqual(refund.review.allocations, [{ id: row("HARDWARE STORE").id, cents: 3000 }]);
    await page.getByLabel("Find a transaction").fill("HARDWARE STORE REFUND");
    await page.locator(".od-row-main", { hasText: "HARDWARE STORE REFUND" }).first().click();
    await page.getByText("Refund", { exact: true }).waitFor();
    await shot("02-refund-on-card");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z");
    await page.getByText("Undone", { exact: true }).waitFor();
    await settled();
    assert.equal(row("HARDWARE STORE REFUND").review.allocations.length, 0);

    // Sam's e-transfer: From is guessed from the description; it pays for two expenses.
    await page.getByLabel("Find a transaction").fill("E-TRANSFER SAM");
    await page.locator(".od-row-main", { hasText: "E-TRANSFER SAM" }).first().click();
    await page.getByRole("button", { name: "Settle against expenses…", exact: true }).click();
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Who this money is from").inputValue(), sam);
    await dialog.getByRole("checkbox", { name: /^Settle HARDWARE STORE on/ }).check();
    await dialog.getByLabel("Amount for HARDWARE STORE", { exact: true }).fill("50");
    await dialog.getByRole("checkbox", { name: /^Settle CONCERT TICKETS on/ }).check();
    await dialog.getByLabel("Amount for CONCERT TICKETS", { exact: true }).fill("40");
    await dialog.getByText("Applies $90.00 · $0.00 stays unsorted").waitFor();
    await shot("03-person-dialog");
    await dialog.getByLabel("Amount for CONCERT TICKETS", { exact: true }).fill("45");
    await dialog.getByText(/more than this money has unsorted/).waitFor();
    assert.equal(await dialog.getByRole("button", { name: /^Settle \$/ }).isDisabled(), true);
    await dialog.getByLabel("Amount for CONCERT TICKETS", { exact: true }).fill("40");
    await dialog.getByRole("button", { name: "Settle $90.00", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText(/\$90\.00 settled with Sam · 2 expenses/).waitFor();
    await settled();
    assert.deepEqual(row("HARDWARE STORE").review.shares, [{ id: "me", cents: 5000 }, { id: sam, cents: 5000 }]);
    assert.deepEqual(row("CONCERT TICKETS").review.shares, [{ id: "me", cents: 4000 }, { id: sam, cents: 4000 }]);
    assert.equal(row("E-TRANSFER SAM").review.personId, sam);
    await page.getByLabel("Find a transaction").fill("E-TRANSFER SAM");
    await page.locator(".od-row-main", { hasText: "E-TRANSFER SAM" }).first().click();
    await page.getByText("Sam settled", { exact: true }).waitFor();
    await shot("04-person-on-card");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Find a transaction").fill("HARDWARE STORE REFUND");
    await page.locator(".od-row-main", { hasText: "HARDWARE STORE REFUND" }).first().click();
    await page.getByRole("button", { name: "Settle against expenses…", exact: true }).click();
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await shot("05-dialog-phone");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, root }));
  } catch (e) { await shot("failure").catch(() => {}); console.error(e); throw e; } finally { await browser.close(); await server.close(); }
})().catch(() => (process.exitCode = 1));
