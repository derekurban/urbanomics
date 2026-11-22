// The Organize list loads its next page by itself when you scroll near the end (no Show more click), and
// stops when every row is shown. Synthetic workspace of 400 rows.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { startWebServer } = require("../electron/web-server.cjs");
(async () => {
  const root = path.resolve("private/validation/organize-scroll-" + Date.now()), server = await startWebServer({ root, port: 0, seed: false }), store = server.store;
  const file = path.join(root, "rows.csv"), day = (i) => { const d = new Date(Date.UTC(2026, 0, 1) + i * 864e5 / 2); return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`; };
  fs.writeFileSync(file, ["Description,Type,Card Holder Name,Date,Time,Amount", ...Array.from({ length: 400 }, (_, i) => `SCROLL SHOP ${i},S,S,${day(i)},12:00 AM,-${(i % 50) + 1}`)].join("\n"));
  const account = store.addAccount("Scroll card", "pc", "card");
  store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  const browser = await chromium.launch({ channel: "chrome", headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const rows = () => page.locator(".od-row-main").count();
  try {
    await page.goto(server.origin + "/#organize");
    await page.locator(".od-row-main").first().waitFor();
    assert.equal(await rows(), 150);
    for (const expected of [300, 400]) {
      await page.locator(".od-more").scrollIntoViewIfNeeded();
      await page.waitForFunction((n) => document.querySelectorAll(".od-row-main").length >= n, expected);
      assert.equal(await rows(), expected);
    }
    assert.equal(await page.locator(".od-more").count(), 0, "no Show more once everything is shown");
    await page.screenshot({ path: path.join(root, "01-end.png") });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, root }));
  } catch (e) { await page.screenshot({ path: path.join(root, "failure.png") }).catch(() => {}); console.error(e); throw e; } finally { await browser.close(); await server.close(); }
})().catch(() => (process.exitCode = 1));
