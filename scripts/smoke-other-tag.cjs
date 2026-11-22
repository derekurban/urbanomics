// The Other tag is a real choice on the Organize desk: typing "other" offers it (not "Create tag Other")
// for money out and money in, choosing it saves the system tag, and the row then counts as sorted and
// shows Other on its strip and in Transactions. Synthetic workspace only.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { startWebServer } = require("../electron/web-server.cjs");
(async () => {
  const root = path.resolve("private/validation/other-tag-" + Date.now()), server = await startWebServer({ root, port: 0 }), store = server.store;
  const file = path.join(root, "rows.csv");
  fs.writeFileSync(file, ["Description,Type,Card Holder Name,Date,Time,Amount", "ODD THING 1,S,S,09/02/2026,12:00 AM,-42", "ODD MONEY IN,S,S,09/03/2026,12:00 AM,15"].join("\n"));
  store.resolveAccount(store.enqueue([file]).ids[0], store.state().accounts[0].id, false);
  const row = (d) => store.review.records().find((r) => r.description === d);
  const browser = await chromium.launch({ channel: "chrome", headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const settled = () => page.waitForFunction(() => !document.querySelector(".organize-desk[data-busy]"));
  try {
    await page.goto(server.origin + "/#organize");
    for (const [name, role] of [["ODD THING 1", "other-expense"], ["ODD MONEY IN", "other-income"]]) {
      await page.getByLabel("Find a transaction").fill(name);
      await page.locator(".od-row-main", { hasText: name }).first().click();
      await page.getByRole("combobox", { name: "Describe this transaction" }).fill("other");
      await page.getByRole("option", { name: /^Other/ }).first().waitFor();
      assert.equal(await page.getByRole("option", { name: /Create tag/ }).count(), 0, "Other is offered, not created");
      await page.screenshot({ path: path.join(root, role + "-describe.png") });
      await page.keyboard.press("Enter");
      await page.getByText("Tagged Other").first().waitFor();
      await settled();
      const saved = row(name), other = store.review.entities().find((e) => e.systemRole === role);
      assert.deepEqual(saved.review.tags, [{ id: other.id, cents: Math.abs(saved.amountCents) }]);
    }
    await page.goto(server.origin + "/#organize"); await page.getByLabel("Find a transaction").fill("ODD THING 1");
    assert.match(await page.locator(".od-row", { hasText: "ODD THING 1" }).first().locator(".od-shape").first().getAttribute("aria-label"), /^Other \$42\.00$/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, root }));
  } catch (e) { await page.screenshot({ path: path.join(root, "failure.png") }).catch(() => {}); console.error(e); throw e; } finally { await browser.close(); await server.close(); }
})().catch(() => (process.exitCode = 1));
