// Vendors in the browser host on a synthetic workspace: make a vendor from a description, add a second
// matcher from the list, give it a tag, apply it to existing rows and undo, see a clash refused, see the
// vendor on the Organize desk, and watch a new import get the tag. Screenshots land in the workspace folder.
const { chromium } = require("playwright"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { startWebServer } = require("../electron/web-server.cjs");
(async () => {
  const root = path.resolve("private/validation/vendors-" + Date.now()), server = await startWebServer({ root, port: 0 }), store = server.store;
  const account = store.state().accounts[0];
  const importRows = (name, rows) => {
    const file = path.join(root, name + ".csv");
    fs.writeFileSync(file, ["Description,Type,Card Holder Name,Date,Time,Amount", ...rows.map(([d, a, date = "09/18/2026"]) => `${d},SAMPLE,SAMPLE,${date},12:00 AM,${a}`)].join("\n"));
    store.resolveAccount(store.enqueue([file]).ids[0], account.id, false);
  };
  importRows("coffee", [["SQ *BEAN COUNTER 1042", -4.5, "09/16/2026"], ["SQ *BEAN COUNTER 2210", -5.25, "09/17/2026"], ["BEAN COUNTER ONLINE 77", -18], ["CITY HYDRO", -80]]);
  const coffee = store.review.entity("category", { name: "Coffee", color: "#89b78a" });
  store.review.entity("person", { name: "Sam", color: "#8899AA" });
  const browser = await chromium.launch({ channel: "chrome", headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(root, name + ".png"), fullPage: true }); };
  const nav = (name) => page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true });
  const bean = () => store.review.records().filter((r) => /BEAN COUNTER/.test(r.originalDescription ?? r.description));
  try {
    await page.goto(server.origin + "/#vendors");
    await page.getByRole("heading", { name: "Vendors", exact: true }).waitFor();
    await page.getByRole("heading", { name: "One name for each place you spend.", exact: true }).waitFor();
    await shot("01-vendors-empty");

    await page.getByRole("button", { name: "Make SQ *BEAN COUNTER 1042 a vendor", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New vendor", exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Name", { exact: true }).inputValue(), "Bean Counter");
    assert.equal(await dialog.getByLabel("Text for matcher 1", { exact: true }).inputValue(), "SQ *BEAN COUNTER");
    await dialog.getByText("Covers 2 transactions", { exact: true }).waitFor();
    // The second spelling joins from the list on the left as a second matcher.
    await dialog.getByRole("button", { name: "Add BEAN COUNTER ONLINE 77", exact: true }).click();
    assert.equal(await dialog.getByLabel("Text for matcher 2", { exact: true }).inputValue(), "BEAN COUNTER ONLINE");
    await dialog.getByText("Covers 3 transactions", { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel("Matcher 1 matches", { exact: true }).textContent(), "2 matches");
    assert.equal(await dialog.getByLabel("Matcher 2 matches", { exact: true }).textContent(), "1 match");
    await dialog.getByLabel("Tag for new transactions", { exact: true }).selectOption(coffee);
    const apply = dialog.getByRole("checkbox", { name: /Also give 3 transactions you already have Coffee/ });
    await apply.waitFor();
    assert.equal(await apply.isChecked(), true);
    await shot("02-vendor-editor");
    await dialog.getByRole("button", { name: "Save vendor", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("3 transactions got Coffee", { exact: true }).waitFor();
    assert.ok(bean().every((r) => r.description === "Bean Counter" && r.review.tags[0]?.id === coffee));
    await page.locator(".og-row", { hasText: "Bean Counter" }).waitFor();
    await shot("03-vendors-list");
    // Undo puts the three back; the vendor stays.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByText("Put back 3 transactions", { exact: true }).waitFor();
    assert.ok(bean().every((r) => !r.review.tags.length));
    assert.equal(store.vendors.list().length, 1);
    await page.getByRole("button", { name: "Tag 3 transactions from their vendors", exact: true }).waitFor();

    // A vendor that would also catch a Bean Counter row is refused before saving.
    await page.getByRole("button", { name: "New vendor", exact: true }).click();
    const other = page.getByRole("dialog", { name: "New vendor", exact: true });
    await other.getByLabel("Name", { exact: true }).fill("Online shops");
    await other.getByLabel("Text for matcher 1", { exact: true }).fill("ONLINE");
    await other.getByLabel("How matcher 1 matches", { exact: true }).selectOption("contains");
    await other.getByText(/would also match Bean Counter/).waitFor();
    assert.equal(await other.getByRole("button", { name: "Save vendor", exact: true }).isDisabled(), true);
    await shot("04-vendor-clash");
    await other.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("button", { name: "Tag 3 transactions from their vendors", exact: true }).click();
    await page.getByText("Tagged 3 transactions from their vendors", { exact: true }).waitFor();
    assert.ok(bean().every((r) => r.review.tags[0]?.id === coffee));

    // The Organize desk shows the vendor on the open row, and offers one for a row without.
    await nav("Organize").click();
    await page.getByLabel("Find a transaction").fill("Bean Counter");
    await page.locator(".od-row-main", { hasText: "Bean Counter" }).first().click();
    await page.getByText("Bean Counter · new ones get Coffee", { exact: true }).waitFor();
    await shot("05-organize-vendor-slot");
    await page.getByLabel("Find a transaction").fill("CITY HYDRO");
    await page.locator(".od-row-main", { hasText: "CITY HYDRO" }).first().click();
    await page.getByRole("button", { name: "Make it a vendor", exact: true }).click();
    const hydro = page.getByRole("dialog", { name: "New vendor", exact: true });
    assert.equal(await hydro.getByLabel("Name", { exact: true }).inputValue(), "City Hydro");
    await hydro.getByText("Covers 1 transaction", { exact: true }).waitFor();
    await hydro.getByRole("button", { name: "Save vendor", exact: true }).click();
    await hydro.waitFor({ state: "hidden" });
    assert.equal(store.review.records().find((r) => r.originalDescription === "CITY HYDRO")?.description, "City Hydro");

    // A new import is named and tagged as it arrives.
    importRows("later", [["SQ *BEAN COUNTER 3001", -6, "09/25/2026"]]);
    const fresh = store.review.records().find((r) => r.originalDescription === "SQ *BEAN COUNTER 3001");
    assert.equal(fresh.description, "Bean Counter");
    assert.equal(fresh.review.tags[0]?.id, coffee);

    // Settings no longer has Aliases or Rules, and their old addresses open Vendors.
    await page.goto(server.origin + "/#settings/rules");
    await page.waitForFunction(() => location.hash === "#vendors");
    await page.getByRole("heading", { name: "Vendors", exact: true }).waitFor();
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await shot("06-vendors-dark");
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Edit vendor Bean Counter", exact: true }).click();
    await page.getByRole("dialog", { name: "Edit Bean Counter", exact: true }).getByText("Covers 4 transactions", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await shot("07-vendor-editor-phone");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, root }));
  } catch (e) { await shot("failure").catch(() => {}); console.error(e); throw e; } finally { await browser.close(); await server.close(); }
})().catch(() => (process.exitCode = 1));
