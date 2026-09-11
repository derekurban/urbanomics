const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs");
const { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "orbit-" + randomUUID()),
  dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const store = new ImportStore(dataDir, {
  now: () => new Date("2026-09-10T12:00:00Z"),
});
const account = store.addAccount("Synthetic chequing", "pc", "chequing"),
  file = path.join(root, "synthetic.csv");
fs.writeFileSync(
  file,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    ...[
      ["Walmart", "08/28/2026", "-240"],
      ["Salary", "08/27/2026", "2000"],
      ["Dinner", "08/26/2026", "-120"],
    ].map(([name, date, amount]) => [
      name,
      "SYNTHETIC",
      "SAMPLE PERSON",
      date,
      "12:00 AM",
      amount,
    ]),
  ]),
);
store.resolveAccount(store.enqueue([file]).ids[0], account, false);
for (const kind of ["category", "group"])
  for (const [i, name] of (kind === "category"
    ? [
        "Groceries",
        "Home",
        "Dining",
        "Travel",
        "Transport",
        "Money in",
        "Other",
      ]
    : [
        "Mountain weekend",
        "City day",
        "Family visit",
        "Concert",
        "Camping",
        "Holiday",
        "Long summer road trip with friends",
      ]
  ).entries())
    store.review.entity(kind, {
      name,
      ...(kind === "group"
        ? { startDate: "2026-08-26", endDate: "2026-08-28" }
        : {}),
      color: ["#78976A", "#8FA6CB", "#C8A06D", "#AF8EB5", "#70A8A5", "#CA8D86"][
        i % 6
      ],
    });
store.close();
const env = { ...process.env, URBANOMICS_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({ args: [repo], cwd: repo, env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Snapshots", exact: true }).waitFor();
  await page.locator(".nav-item").filter({ hasText: "Review" }).click();
  await page.getByRole("region", { name: "Category card sorter" }).waitFor();
}
const state = () => page.evaluate(() => window.urbanomics.reviewState());
const stage = (name) =>
  page
    .getByRole("navigation", { name: "Review stages" })
    .getByRole("button", { name })
    .click();
const shot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
async function drag(target) {
  await page.locator(".os-transaction").scrollIntoViewIfNeeded();
  const c = await page.locator(".os-transaction").boundingBox(),
    t = await page
      .getByRole("button", { name: target, exact: true })
      .boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
  await page.mouse.up();
}
(async () => {
  try {
    await launch();
    const initial = await state();
    assert.equal(
      await page.getByRole("button", { name: "Board", exact: true }).count(),
      0,
    );
    await drag("Category Groceries");
    await page.getByText("1 of 3 categorized", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("dialog").count(),
      0,
      "drag never opens settings",
    );
    assert.match(await page.locator(".os-transaction").textContent(), /Salary/);
    let s = await state();
    assert.deepEqual(
      s.records
        .find((t) => t.description === "Walmart")
        .review.tags.map((p) => p.cents),
      [24000],
    );
    assert.equal(
      s.records.find((t) => t.description === "Walmart").version,
      1,
      "drop saves exactly once",
    );
    // Cancel and Escape retain the card and saved state.
    await page
      .getByRole("button", { name: "Previous transaction", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Category Groceries", exact: true })
      .click();
    await page.getByText("0 of 3 categorized", { exact: true }).waitFor();
    assert.match(
      await page.locator(".os-transaction").textContent(),
      /Walmart/,
    );
    assert.deepEqual(
      (await state()).records.find((t) => t.description === "Walmart").review
        .tags,
      [],
    );
    await drag("Category Groceries");
    await page.getByText("1 of 3 categorized", { exact: true }).waitFor();
    s = await state();
    await page.locator(".os-transaction").click();
    let modal = page.getByRole("dialog", { name: "Transaction settings" });
    await modal.getByRole("checkbox", { name: "Home", exact: true }).check();
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.match(await page.locator(".os-transaction").textContent(), /Salary/);
    assert.deepEqual(await state(), s);
    await page.locator(".os-transaction").press("Enter");
    await modal.getByRole("checkbox", { name: "Home", exact: true }).check();
    await page.keyboard.press("Escape");
    assert.deepEqual(await state(), s);
    assert.match(await page.locator(".os-transaction").textContent(), /Salary/);
    await page
      .getByRole("button", { name: "Previous transaction", exact: true })
      .click();
    await page.locator(".os-transaction").click();
    await modal
      .getByRole("searchbox", { name: "Categories", exact: true })
      .fill("home");
    await modal.getByRole("checkbox", { name: "Home", exact: true }).check();
    assert.equal(
      await modal.locator(".ts-selected button").count(),
      2,
      "search retains selected categories",
    );
    await modal
      .getByRole("spinbutton", {
        name: "Exact divider after Groceries",
        exact: true,
      })
      .fill("140.01");
    await shot("category-settings");
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
    assert.match(await page.locator(".os-transaction").textContent(), /Salary/);
    s = await state();
    assert.deepEqual(
      s.records
        .find((t) => t.description === "Walmart")
        .review.tags.map((p) => p.cents),
      [14001, 9999],
    );
    assert.ok(s.records.every((t) => !t.review.reviewed));
    await page
      .getByRole("button", { name: "Previous transaction", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove Home", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Category Home", exact: true })
      .and(page.locator('[aria-pressed="false"]'))
      .waitFor();
    assert.match(
      await page.locator(".os-transaction").textContent(),
      /Walmart/,
    );
    assert.deepEqual(
      (await state()).records
        .find((t) => t.description === "Walmart")
        .review.tags.map((p) => p.cents),
      [24000],
    );
    await page.locator(".os-transaction").click();
    await modal.getByRole("checkbox", { name: "Home", exact: true }).check();
    await modal
      .getByRole("spinbutton", {
        name: "Exact divider after Groceries",
        exact: true,
      })
      .fill("140.01");
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
    assert.ok(
      await page.locator(".os-navigation > button").evaluateAll((buttons) =>
        buttons.every((b) => {
          const r = b.getBoundingClientRect(),
            s = b.querySelector("svg").getBoundingClientRect();
          return (
            Math.abs(r.width - r.height) < 1 &&
            Math.abs(r.x + r.width / 2 - s.x - s.width / 2) < 1 &&
            Math.abs(r.y + r.height / 2 - s.y - s.height / 2) < 1
          );
        }),
      ),
      "chevrons are centered inside square buttons",
    );
    assert.equal(await page.locator("[data-orbit-target]").count(), 7);
    assert.equal(
      await page
        .getByRole("button", { name: "Next targets", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Category Other", exact: true })
      .waitFor();
    await shot("categories-orbit");
    await stage("2 · Events");
    await page
      .getByRole("button", { name: "Transactions on 2026-08-28" })
      .click();
    await page
      .getByRole("button", { name: "Link Walmart", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Unlink Walmart", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Manage event City day", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Transactions on 2026-08-28" })
      .click();
    await page
      .getByRole("button", { name: "Link Walmart", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Unlink Walmart", exact: true })
      .waitFor();
    await shot("events-calendar");
    s = await state();
    const walmart = s.records.find((t) => t.description === "Walmart");
    assert.equal(walmart.review.groups.length, 2);
    assert.deepEqual(
      walmart.review.tags.map((p) => p.cents),
      [14001, 9999],
    );
    assert.equal(
      s.records.find((t) => t.description === "Salary").review.groupsReviewed,
      false,
    );
    assert.deepEqual(
      s.records.map((t) => t.review.allocations),
      initial.records.map((t) => t.review.allocations),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await shot("events-narrow");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await stage("1 · Categories");
    await page
      .getByRole("button", { name: "Previous transaction", exact: true })
      .click();
    await shot("tags-narrow");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    // A concurrent edit cannot be overwritten, nor may a failed Save advance.
    const shown = await page.locator(".os-transaction h3").textContent();
    await page.locator(".os-transaction").click();
    await modal.getByRole("checkbox", { name: "Dining", exact: true }).check();
    await page.evaluate(async (name) => {
      const s = await window.urbanomics.reviewState(),
        t = s.records.find((t) => t.description === name);
      await window.urbanomics.organize([
        { id: t.id, version: t.version, groups: t.review.groups },
      ]);
    }, shown);
    const concurrent = await state();
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    await modal.getByRole("alert").waitFor();
    assert.deepEqual(await state(), concurrent);
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator(".os-transaction h3").textContent(), shown);
    const saved = await state();
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(await state(), saved);
    await stage("2 · Events");
    await page
      .getByRole("region", { name: "Event calendar", exact: true })
      .waitFor();
    await page.evaluate(async () => {
      for (let i = 1; i <= 17; i++)
        await window.urbanomics.saveEntity("category", {
          name: `Extra category ${String(i).padStart(2, "0")}`,
          color: "#78976A",
        });
    });
    await page.reload();
    await page
      .getByRole("heading", { name: "Snapshots", exact: true })
      .waitFor();
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    async function checkLayout(maxHeight = 900) {
      await page.waitForFunction(
        () => document.querySelectorAll("[data-orbit-target]").length === 24,
      );
      await page.waitForFunction(() => {
        const orbit = document.querySelector(".os-orbit");
        const bounds = orbit.getBoundingClientRect(),
          rects = [
            ...orbit.querySelectorAll("[data-orbit-target],.os-stack"),
          ].map((e) => e.getBoundingClientRect());
        return rects.every(
          (r, i) =>
            r.left >= bounds.left - 1 &&
            r.right <= bounds.right + 1 &&
            r.top >= bounds.top - 1 &&
            r.bottom <= bounds.bottom + 1 &&
            rects
              .slice(i + 1)
              .every(
                (s) =>
                  r.right <= s.left ||
                  r.left >= s.right ||
                  r.bottom <= s.top ||
                  r.top >= s.bottom,
              ),
        );
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.ok(
        (await page.locator(".os-orbit").boundingBox()).height <= maxHeight,
        "24 compact categories stay within the layout height budget",
      );
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1329, 940),
    );
    await checkLayout(650);
    await shot("all-24-categories");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await checkLayout();
    await shot("all-24-narrow");
    const beforeDrag = await state();
    await page.locator(".os-transaction").scrollIntoViewIfNeeded();
    const center = await page.locator(".os-transaction").boundingBox(),
      scroll = await page.evaluate(() => scrollY);
    await page.mouse.move(
      center.x + center.width / 2,
      center.y + center.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(center.x + center.width / 2, 30, { steps: 8 });
    await page.waitForFunction(
      (before) => window.scrollY < before - 40,
      scroll,
    );
    await page.mouse.move(4, 100);
    await page.mouse.up();
    assert.deepEqual(
      await state(),
      beforeDrag,
      "dragging beyond the viewport and releasing outside a target does not save",
    );
    await page
      .getByRole("textbox", { name: "Search categories", exact: true })
      .fill("Extra category 17");
    assert.equal(await page.locator("[data-orbit-target]").count(), 1);
    await page
      .getByRole("textbox", { name: "Search categories", exact: true })
      .fill("");
    await checkLayout();
    const current = await page.locator(".os-transaction h3").textContent();
    await page
      .getByRole("button", { name: "Category Extra category 17", exact: true })
      .click();
    await page.waitForFunction(async (name) => {
      const s = await window.urbanomics.reviewState(),
        id = s.entities.find((e) => e.name === "Extra category 17").id;
      return s.records
        .find((t) => t.description === name)
        .review.tags.some((p) => p.id === id);
    }, current);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "category quick save, cancel, modal splits, event calendar, split cents, all categories, optional events, stale saves, narrow layout, restart",
      }),
    );
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  console.error("Artifacts:", root);
  process.exitCode = 1;
});
