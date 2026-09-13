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
store.review.starterHierarchy();
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
  await page.getByRole("region", { name: "Tag card sorter" }).waitFor();
}
const state = () => page.evaluate(() => window.urbanomics.reviewState());
const shot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
const button = (name) => page.getByRole("button", { name, exact: true });
async function open(group) {
  await page.keyboard.press("Escape");
  await button("Category " + group).focus();
  await button("Category " + group).press("Enter");
  await button(
    "Tag " + (group === "Food" ? "Groceries" : "Clothing"),
  ).waitFor();
}
async function drag(group, tag, cancel = false) {
  await page.keyboard.press("Escape");
  await page.locator(".os-transaction").scrollIntoViewIfNeeded();
  const c = await page.locator(".os-transaction").boundingBox(),
    b = await button("Category " + group).boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await button("Tag " + tag).waitFor();
  const target = await button("Tag " + tag).boundingBox();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 10 },
  );
  assert.ok(
    await page
      .locator(".os-stack")
      .evaluate(
        (el) =>
          Number(getComputedStyle(el).zIndex) <
          Number(
            getComputedStyle(document.querySelector(".rh-expanded")).zIndex,
          ),
      ),
    "card stack is below petals during actual drag",
  );
  // A full-page screenshot resizes the viewport mid-drag and moves the circle away from the pointer.
  await page.screenshot({
    path: path.join(root, "two-motion-drag.png"),
    animations: "disabled",
    fullPage: false,
  });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}
(async () => {
  try {
    await launch();
    const initial = await state();
    const initialBox = await page.locator(".os-transaction").boundingBox();
    await shot("category-orbit");
    // Hover into a category, then leave the actual circle (not just its square bounds).
    await button("Category Food").hover();
    await button("Tag Groceries").waitFor();
    let circle = await page.locator("[data-petal-disc]").evaluate((el) => {
      const s = el.closest(".os-orbit").getBoundingClientRect();
      return {
        x: s.left + el.offsetLeft,
        y: s.top + el.offsetTop,
        r: el.offsetWidth / 2,
      };
    });
    await page.mouse.move(circle.x, circle.y);
    assert.equal(await page.locator(".rh-tag").count(), 8);
    await page.mouse.move(circle.x + circle.r - 6, circle.y + circle.r - 6);
    await page.locator(".rh-expanded").waitFor({ state: "hidden" });
    assert.deepEqual((await state()).records, initial.records);
    // Pointer capture must still let an unfinished drag leave and close the circle.
    await page.locator(".os-transaction").scrollIntoViewIfNeeded();
    const card = await page.locator(".os-transaction").boundingBox(),
      bucket = await button("Category Food").boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      bucket.x + bucket.width / 2,
      bucket.y + bucket.height / 2,
      { steps: 12 },
    );
    await button("Tag Groceries").waitFor();
    const canvas = await page.locator(".os-orbit").boundingBox();
    await page.mouse.move(canvas.x + 8, canvas.y + 8, { steps: 15 });
    await page.locator(".rh-expanded").waitFor({ state: "hidden" });
    await page.mouse.up();
    assert.deepEqual((await state()).records, initial.records);
    await shot("radial-closed-after-drag-leave");
    await drag("Food", "Groceries");
    await page.getByText("1 of 2 tagged", { exact: true }).waitFor();
    assert.match(await page.locator(".os-transaction").textContent(), /Dinner/);
    assert.equal(await page.getByRole("dialog").count(), 0);
    let s = await state();
    assert.equal(s.records.find((r) => r.description === "Walmart").version, 1);
    assert.deepEqual(
      s.records
        .find((r) => r.description === "Walmart")
        .review.tags.map((p) => p.cents),
      [24000],
    );
    await button("Previous transaction").click();
    await open("Food");
    await button("Tag Restaurants").click();
    await page.waitForFunction(async () => {
      const s = await window.urbanomics.reviewState();
      return (
        s.records.find((r) => r.description === "Walmart").review.tags[0]
          ?.id === s.entities.find((e) => e.name === "Restaurants").id
      );
    });
    assert.match(
      await page.locator(".os-transaction").textContent(),
      /Walmart/,
    );
    await button("Tag Restaurants").click();
    await page.getByText("0 of 2 tagged", { exact: true }).waitFor();
    assert.match(
      await page.locator(".os-transaction").textContent(),
      /Walmart/,
    );
    const beforeCancel = await state();
    await drag("Food", "Groceries", true);
    assert.deepEqual(await state(), beforeCancel);
    await drag("Food", "Groceries");
    await page.getByText("1 of 2 tagged", { exact: true }).waitFor();
    const beforeModal = await state();
    await page.locator(".os-transaction").press("Enter");
    const modal = page.getByRole("dialog", { name: "Transaction settings" });
    await modal
      .getByRole("checkbox", { name: "Groceries", exact: true })
      .check();
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(await state(), beforeModal);
    await button("Previous transaction").click();
    await page.locator(".os-transaction").press("Enter");
    await modal
      .getByRole("searchbox", { name: "Tags", exact: true })
      .fill("clothing");
    await modal
      .getByRole("checkbox", { name: "Clothing", exact: true })
      .check();
    await modal
      .getByRole("spinbutton", {
        name: "Exact divider after Groceries",
        exact: true,
      })
      .fill("140.01");
    await shot("split-tags");
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
    assert.match(
      await page.locator(".os-transaction").textContent(),
      /Walmart/,
    );
    s = await state();
    assert.deepEqual(
      s.records
        .find((r) => r.description === "Walmart")
        .review.tags.map((p) => p.cents),
      [14001, 9999],
    );
    const saved = s.records;
    await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
    await button("Categories & tags").click();
    await page
      .getByRole("region", { name: "Categories and tags hierarchy" })
      .waitFor();
    assert.equal(await page.locator(".th-tag select").count(), 0);
    await page
      .locator(".th-tag")
      .filter({ has: page.getByText("Groceries", { exact: true }) })
      .focus();
    await page.keyboard.press("Space");
    await page
      .getByRole("region", { name: "Category Personal", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(async () => {
      const s = await window.urbanomics.reviewState();
      return (
        s.entities.find((e) => e.name === "Groceries").parentId ===
        s.entities.find((e) => e.kind === "bucket" && e.name === "Personal").id
      );
    });
    assert.deepEqual((await state()).records, saved);
    // Real HTML drag moves a tag back; keyboard lifting is the non-pointer alternative.
    const groceryRow = page
      .locator(".th-tag")
      .filter({ has: page.getByText("Groceries", { exact: true }) });
    await groceryRow.dragTo(
      page.getByRole("region", { name: "Category Food", exact: true }),
    );
    await page.waitForFunction(async () => {
      const s = await window.urbanomics.reviewState();
      return (
        s.entities.find((e) => e.name === "Groceries").parentId ===
        s.entities.find((e) => e.kind === "bucket" && e.name === "Food").id
      );
    });
    assert.deepEqual((await state()).records, saved);
    await shot("hierarchy");
    await button("Edit category Food").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete category", exact: true })
      .click();
    await button("Confirm deletion").click();
    await page
      .getByRole("dialog")
      .getByText(/Move this category/)
      .waitFor();
    await page.keyboard.press("Escape");
    await button("Edit tag Groceries").click();
    await page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Groceries");
    await button("Save tag").click();
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await open("Food");
    await shot("expanded-tags");
    // At a narrow width every petal stays inside its fixed canvas and labels never grow it.
    await app
      .browserWindow(page)
      .then((w) => w.evaluate((w) => w.setSize(900, 850)));
    await page.locator(".os-orbit").scrollIntoViewIfNeeded();
    await open("Food");
    await shot("hierarchy-narrow");
    await open("Food");
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector(".os-orbit").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        card: {
          width: document
            .querySelector(".os-transaction")
            .getBoundingClientRect().width,
          height: document
            .querySelector(".os-transaction")
            .getBoundingClientRect().height,
        },
        tags: [...document.querySelectorAll(".rh-tag")].map((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.left >= stage.left &&
            r.right <= stage.right &&
            r.top >= stage.top &&
            r.bottom <= stage.bottom
          );
        }),
      };
    });
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.tags.length, 8);
    assert.ok(geometry.tags.every(Boolean));
    assert.equal(geometry.card.width, initialBox.width);
    assert.equal(geometry.card.height, initialBox.height);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open("Food");
    assert.equal(
      await page
        .locator(".rh-tag")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    // All tags stay on one growing circle; search keeps each one reachable.
    await page.evaluate(async () => {
      const s = await window.urbanomics.reviewState();
      const parent = s.entities.find(
        (e) => e.name === "Food" && e.kind === "bucket",
      );
      await window.urbanomics.saveEntity("category", {
        name: "Very long ninth food tag for checking overflow",
        color: "#88AA88",
        parentId: parent.id,
      });
    });
    await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await open("Food");
    assert.equal(await button("More tags").count(), 0);
    assert.equal(await page.locator(".rh-tag").count(), 9);
    await button(
      "Tag Very long ninth food tag for checking overflow",
    ).waitFor();
    await shot("all-nine-tags-narrow");
    await page
      .getByRole("textbox", { name: "Search categories and tags", exact: true })
      .fill("ninth");
    await button(
      "Tag Very long ninth food tag for checking overflow",
    ).waitFor();
    assert.equal(
      (await page.locator(".os-transaction").boundingBox()).height,
      initialBox.height,
    );
    await page
      .getByRole("textbox", { name: "Search categories and tags", exact: true })
      .fill("");
    const beforeOuterDrag = (await state()).records;
    await drag("Food", "Very long ninth food tag for checking overflow", true);
    await shot("outer-ring-after-cancel");
    assert.deepEqual((await state()).records, beforeOuterDrag);
    await page.keyboard.press("Escape");
    await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
    await button("Categories & tags").click();
    await shot("expense-tags-alphabetical");
    await page
      .getByRole("group", { name: "Organization lens" })
      .getByRole("button", { name: /Income/ })
      .click();
    assert.equal(await page.locator(".th-tag").count(), 0);
    await button("+ New tag").click();
    let incomeModal = page.getByRole("dialog", {
      name: "New tag",
      exact: true,
    });
    assert.equal(
      await incomeModal
        .getByRole("button", { name: "Income", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await incomeModal
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Paycheck");
    await incomeModal
      .getByRole("button", { name: "Save tag", exact: true })
      .click();
    await incomeModal.waitFor({ state: "hidden" });
    await shot("income-tags");
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await page
      .getByRole("group", { name: "Review tag lens" })
      .getByRole("button", { name: "Money in", exact: true })
      .click();
    assert.match(await page.locator(".os-transaction").textContent(), /Salary/);
    assert.equal(await button("Category Food").count(), 0);
    assert.equal(await button("Tag Groceries").count(), 0);
    await button("Tag Paycheck").click();
    await page.getByText("1 of 1 tagged", { exact: true }).waitFor();
    assert.equal(
      (await state()).records.find((r) => r.description === "Salary").review
        .kind,
      "unreviewed",
      "tagging does not declare earned income",
    );
    await shot("income-review");
    const beforePalettes = (await state()).records;
    await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
    await button("Categories & tags").click();
    await button("Edit category Food").click();
    let paletteModal = page.getByRole("dialog");
    await paletteModal
      .getByLabel("Start color", { exact: true })
      .fill("#b94e36");
    await paletteModal.getByLabel("End color", { exact: true }).fill("#dfbd49");
    await shot("category-gradient-editor");
    await button("Save category").click();
    await paletteModal.waitFor({ state: "hidden" });
    await shot("category-two-color-steps");
    const food = (await state()).entities.find(
      (e) => e.kind === "bucket" && e.name === "Food",
    );
    assert.equal(food.color, "#cc8640");
    await page
      .getByRole("group", { name: "Organization lens" })
      .getByRole("button", { name: /Income/ })
      .click();
    await button("Edit Income colors").click();
    paletteModal = page.getByRole("dialog");
    await paletteModal
      .getByLabel("Start color", { exact: true })
      .fill("#5363bc");
    await paletteModal.getByLabel("End color", { exact: true }).fill("#49c796");
    await shot("income-gradient-editor");
    await button("Save palette").click();
    await paletteModal.waitFor({ state: "hidden" });
    await page.evaluate(async () => {
      for (const name of ["Gifts", "Interest"])
        await window.urbanomics.saveEntity("category", {
          name,
          flowType: "income",
          color: "#123456",
        });
    });
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
    await button("Categories & tags").click();
    await page
      .getByRole("group", { name: "Organization lens" })
      .getByRole("button", { name: /Income/ })
      .click();
    const incomeColors = await page
      .locator(".th-tag")
      .evaluateAll((rows) =>
        rows.map((e) => e.style.getPropertyValue("--tag-color")),
      );
    assert.deepEqual(incomeColors, ["#5363bc", "#4e95a9", "#49c796"]);
    await shot("income-two-color-steps");
    await button("Edit tag Interest").click();
    assert.equal(
      await page.getByRole("dialog").locator("input[type=color]").count(),
      0,
    );
    await button("Cancel").click();
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await page
      .getByRole("group", { name: "Review tag lens" })
      .getByRole("button", { name: "Money in", exact: true })
      .click();
    assert.equal(await page.locator(".rh-tag").count(), 3);
    await shot("income-gradient-radial");
    await page
      .getByRole("group", { name: "Review tag lens" })
      .getByRole("button", { name: "Money out", exact: true })
      .click();
    await open("Food");
    await shot("expense-gradient-radial");
    assert.deepEqual((await state()).records, beforePalettes);
    const persisted = await state();
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(await state(), persisted);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "two-motion pointer drag; exactly one save; first-only advance; edit and removal stay; Escape cancels; modal cancel and exact-cent split; keyboard and drag hierarchy moves; circular hover/drag exit; single growing ring; deletion guard; fixed geometry at 900px; reduced motion; restart",
      }),
    );
  } catch (error) {
    if (page) await shot("failure");
    throw error;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  console.error(root);
  process.exitCode = 1;
});
