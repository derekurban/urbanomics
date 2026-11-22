// Delete a transaction from the Organize card: Details → Delete transaction… asks first, the row leaves the
// ledger, the toast's Undo brings it back, and a row tied to a settlement explains why it can't go yet.
// Synthetic workspace only; screenshots land in the workspace folder.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { startWebServer } = require("../electron/web-server.cjs");
(async () => {
  const root = path.resolve("private/validation/delete-transaction-" + Date.now()), server = await startWebServer({ root, port: 0 }), store = server.store;
  const file = path.join(root, "rows.csv");
  fs.writeFileSync(file, ["Description,Type,Card Holder Name,Date,Time,Amount", "DOUBLE CAFE,S,S,09/02/2026,12:00 AM,-6", "DOUBLE CAFE,S,S,09/02/2026,12:00 AM,-6", "HARDWARE STORE,S,S,09/03/2026,12:00 AM,-100", "STORE REFUND,S,S,09/09/2026,12:00 AM,30"].join("\n"));
  store.resolveAccount(store.enqueue([file]).ids[0], store.state().accounts[0].id, false);
  const rows = (d) => store.review.records().filter((r) => r.description === d);
  const refund = rows("STORE REFUND")[0];
  store.review.settle(refund.id, refund.version, { personId: "", lines: [{ id: rows("HARDWARE STORE")[0].id, cents: 3000 }] });
  const browser = await chromium.launch({ channel: "chrome", headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(root, name + ".png") }); };
  const settled = () => page.waitForFunction(() => !document.querySelector(".organize-desk[data-busy]"));
  const openDelete = async (name) => {
    await page.getByLabel("Find a transaction").fill(name);
    if (!(await page.locator(".od-row.is-open", { hasText: name }).count())) await page.locator(".od-row-main", { hasText: name }).first().click();
    await page.getByRole("combobox", { name: "Describe this transaction" }).evaluate((el) => el.blur()).catch(() => {});
    if (await page.getByRole("button", { name: "Details", exact: true }).count()) await page.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByRole("button", { name: "Delete transaction…" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this transaction?" });
    await dialog.waitFor();
    return dialog;
  };
  try {
    await page.goto(server.origin + "/#organize");
    let dialog = await openDelete("DOUBLE CAFE");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Cancel", "focus starts on Cancel");
    await shot("01-confirm");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(rows("DOUBLE CAFE").length, 2, "Cancel deletes nothing");
    dialog = await openDelete("DOUBLE CAFE");
    await dialog.getByRole("button", { name: "Delete transaction" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("Deleted DOUBLE CAFE").waitFor();
    await settled();
    assert.equal(rows("DOUBLE CAFE").length, 1);
    assert.equal(await page.locator(".od-row-main", { hasText: "DOUBLE CAFE" }).count(), 1);
    await shot("02-deleted");
    await page.getByRole("button", { name: "Undo" }).first().click();
    await page.getByText("Brought back DOUBLE CAFE").waitFor();
    await settled();
    assert.equal(rows("DOUBLE CAFE").length, 2);
    await page.waitForFunction(() => document.querySelectorAll(".od-row-main").length >= 2);

    dialog = await openDelete("HARDWARE STORE");
    await dialog.getByRole("button", { name: "Delete transaction" }).click();
    await dialog.getByText(/settles part of this expense/).waitFor();
    await shot("03-refused");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    assert.equal(rows("HARDWARE STORE").length, 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, root }));
  } catch (e) { await shot("failure").catch(() => {}); console.error(e); throw e; } finally { await browser.close(); await server.close(); }
})().catch(() => (process.exitCode = 1));
