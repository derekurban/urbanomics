// Claude's Organize suggestions come back after a restart: answers saved in the workspace (as the assistant
// saves them) show as the Suggested and Auto-applied filters when Organize opens in a fresh page, with no API
// key and no request to Anthropic. A tag that no longer exists is left out.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { startWebServer } = require("../electron/web-server.cjs");
(async () => {
  const root = path.resolve("private/validation/saved-suggestions-" + Date.now()), server = await startWebServer({ root, port: 0 }), store = server.store;
  const file = path.join(root, "rows.csv");
  fs.writeFileSync(file, ["Description,Type,Card Holder Name,Date,Time,Amount", "PANTRY MARKET 12,S,S,09/02/2026,12:00 AM,-42", "PANTRY MARKET 13,S,S,09/03/2026,12:00 AM,-18", "OLD SHOP,S,S,09/04/2026,12:00 AM,-9"].join("\n"));
  store.resolveAccount(store.enqueue([file]).ids[0], store.state().accounts[0].id, false);
  const groceries = store.review.entities().find((e) => e.name === "Groceries").id, row = (d) => store.review.records().find((r) => r.description === d);
  const keep = store.db.prepare("INSERT INTO assistant_suggestions VALUES (?,?,?,?)");
  const answer = (id, cents, tag = groceries) => JSON.stringify({ result: { summary: "Groceries.", transactionId: id, suggestions: [{ kind: "tag", id: tag, cents, reason: "Market.", confidence: "high" }] } });
  keep.run(row("PANTRY MARKET 12").id, "done", answer(row("PANTRY MARKET 12").id, 4200), "2026-09-05");
  keep.run(row("PANTRY MARKET 13").id, "done", JSON.parse(JSON.stringify(answer(row("PANTRY MARKET 13").id, 1800))).replace('"result"', '"autoApplied":true,"result"'), "2026-09-05");
  keep.run(row("OLD SHOP").id, "done", answer(row("OLD SHOP").id, 900, "deleted-tag"), "2026-09-05");
  const browser = await chromium.launch({ channel: "chrome", headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    for (const pass of [1, 2]) {
      await page.goto(server.origin + "/#organize");
      const chip = (name) => page.getByRole("button", { name: new RegExp("^" + name) });
      await chip("Suggested").waitFor();
      assert.match(await chip("Suggested").textContent(), /2/, "the two market answers; the one whose tag was deleted is left out");
      await chip("Auto-applied").waitFor();
      await chip("Suggested").click();
      await page.locator(".od-row-main", { hasText: "PANTRY MARKET 12" }).waitFor();
      assert.equal(await page.locator(".od-row-main", { hasText: "OLD SHOP" }).count(), 0);
      await page.screenshot({ path: path.join(root, `0${pass}-restored.png`) });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, root }));
  } catch (e) { await page.screenshot({ path: path.join(root, "failure.png") }).catch(() => {}); console.error(e); throw e; } finally { await browser.close(); await server.close(); }
})().catch(() => (process.exitCode = 1));
