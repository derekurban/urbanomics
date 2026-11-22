// The Split box on the Events page: under an event's Costs & repayments each expense opens to the same Split
// box as the Organize card. Take a participant out (just you), set a share as a percentage and in dollars,
// and go back to the event's even split. Synthetic workspace; screenshots in the workspace folder.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { startWebServer } = require("../electron/web-server.cjs");
(async () => {
  const root = path.resolve("private/validation/event-split-" + Date.now()), server = await startWebServer({ root, port: 0 }), store = server.store;
  const file = path.join(root, "trip.csv");
  fs.writeFileSync(file, ["Description,Type,Card Holder Name,Date,Time,Amount", "TRIP CABIN,S,S,09/18/2026,12:00 AM,-300", "TRIP SOUVENIR,S,S,09/19/2026,12:00 AM,-40"].join("\n"));
  store.resolveAccount(store.enqueue([file]).ids[0], store.state().accounts[0].id, false);
  const sam = store.review.entity("person", { name: "Sam", color: "#8899AA" });
  const trip = store.review.entity("group", { name: "Lake trip", color: "#af8eb5", startDate: "2026-09-18", endDate: "2026-09-20", participants: [sam] });
  const row = (d) => store.review.records().find((r) => r.description === d);
  store.review.organize(["TRIP CABIN", "TRIP SOUVENIR"].map((d) => ({ id: row(d).id, version: row(d).version, groups: [trip] })));
  assert.deepEqual(row("TRIP SOUVENIR").review.shares, [{ id: "me", cents: 2000 }, { id: sam, cents: 2000 }], "follows the even split");
  const browser = await chromium.launch({ channel: "chrome", headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(root, name + ".png"), fullPage: true }); };
  const box = (d) => page.getByRole("group", { name: `Split for ${d}` });
  const until = (fn, label) => page.waitForFunction(() => true).then(async () => { for (let i = 0; i < 50; i++) { if (fn()) return; await page.waitForTimeout(100); } throw Error("timed out: " + label); });
  try {
    await page.goto(server.origin + "/#events");
    await page.getByRole("listitem").filter({ hasText: "Lake trip" }).click();
    await page.getByRole("radio", { name: "Costs & repayments" }).click().catch(async () => page.getByText("Costs & repayments", { exact: true }).click());
    await page.locator(".cost-expenses summary", { hasText: "TRIP SOUVENIR" }).click();
    await box("TRIP SOUVENIR").waitFor();
    await shot("01-even");
    // The souvenir is mine alone.
    await box("TRIP SOUVENIR").getByRole("button", { name: "Sam", pressed: true }).click();
    await until(() => row("TRIP SOUVENIR").review.shares === null, "just you");
    await box("TRIP SOUVENIR").getByText("Just you").waitFor();
    // The cabin: Sam covers 25%, then $100.
    await page.locator(".cost-expenses summary", { hasText: "TRIP CABIN" }).click();
    const pct = box("TRIP CABIN").getByLabel("Share for Sam in percent");
    await pct.fill("25"); await pct.press("Enter");
    await until(() => JSON.stringify(row("TRIP CABIN").review.shares) === JSON.stringify([{ id: "me", cents: 22500 }, { id: sam, cents: 7500 }]), "25%");
    await box("TRIP CABIN").getByText("Your share $225.00 (75%) · your own split").waitFor();
    const dollars = box("TRIP CABIN").getByLabel("Share for Sam", { exact: true });
    await dollars.fill("100"); await dollars.press("Enter");
    await until(() => row("TRIP CABIN").review.shares.find((s) => s.id === sam)?.cents === 10000, "$100");
    await page.mouse.move(900, 10); await page.waitForTimeout(400); await page.locator(".cost-expenses").screenshot({ path: path.join(root, "02-custom.png") });
    await box("TRIP CABIN").getByRole("button", { name: "Split like Lake trip" }).click();
    await until(() => row("TRIP CABIN").review.sharesSource === "event:" + trip && row("TRIP CABIN").review.shares.find((s) => s.id === sam)?.cents === 15000, "event split");
    await box("TRIP CABIN").getByText(/as Lake trip/).waitFor();
    // Too much is refused with a message, nothing saved.
    await pct.fill("100"); await pct.press("Enter");
    await until(() => row("TRIP CABIN").review.shares.find((s) => s.id === sam)?.cents === 30000, "100%");
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no sideways scroll on a phone");
    await shot("03-phone");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, root }));
  } catch (e) { await shot("failure").catch(() => {}); console.error(e); throw e; } finally { await browser.close(); await server.close(); }
})().catch(() => (process.exitCode = 1));
