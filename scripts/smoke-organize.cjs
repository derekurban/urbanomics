const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs");
const { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private", "validation", "organize-" + randomUUID()),
  dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const store = new ImportStore(dataDir, {
    now: () => new Date("2026-09-10T12:00:00Z"),
  }),
  account = store.addAccount("Synthetic card", "pc", "credit"),
  file = path.join(root, "synthetic.csv");
fs.writeFileSync(
  file,
  csv([
    ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
    [
      "Synthetic dinner",
      "PURCHASE",
      "SAMPLE PERSON",
      "08/20/2026",
      "12:00 AM",
      "-100",
    ],
  ]),
);
store.resolveAccount(store.enqueue([file]).ids[0], account, false);
store.close();
const env = {
  ...process.env,
  URBANOMICS_DATA_DIR: dataDir,
  URBANOMICS_CONFIG_DIR: path.join(root, "configuration"),
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({ args: [repo], cwd: repo, env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Snapshots", exact: true }).waitFor();
  await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
  await page.getByRole("heading", { name: "Organize", exact: true }).waitFor();
}
const section = (name) =>
  page
    .getByRole("navigation", { name: "Organize sections" })
    .getByRole("button", { name, exact: true })
    .click();
const snapshot = (name) =>
  page.screenshot({
    path: path.join(root, name + ".png"),
    animations: "disabled",
    fullPage: true,
  });
const state = () => page.evaluate(() => window.urbanomics.reviewState());
async function create(kind, name, selected = []) {
  await page
    .getByRole("button", { name: `+ New ${kind}`, exact: true })
    .click();
  const d = page.getByRole("dialog", { name: `New ${kind}`, exact: true });
  await d.getByLabel("Name", { exact: true }).fill(name);
  if (kind === "event") {
    await d.getByLabel("Start date", { exact: true }).fill("2026-08-14");
    await d.getByLabel("End date", { exact: true }).fill("2026-08-20");
  }
  for (const tag of selected)
    await d.getByRole("button", { name: tag, exact: true }).click();
  await d.getByRole("button", { name: `Save ${kind}`, exact: true }).click();
  await d.waitFor({ state: "hidden" });
}
(async () => {
  try {
    await launch();
    await section("Categories");
    assert.equal(
      await page.locator(".nav-item").filter({ hasText: "Accounts" }).count(),
      0,
    );
    await create("category", "Dining");
    await create("category", "Home");
    await page
      .getByRole("button", { name: "Edit category Dining", exact: true })
      .click();
    let d = page.getByRole("dialog", { name: "Edit category", exact: true });
    await d.getByLabel("Name", { exact: true }).fill("Food");
    await d.getByLabel("Color", { exact: true }).fill("#6883c5");
    await d.getByRole("button", { name: "Save category", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    await page
      .getByRole("searchbox", { name: "Search categories", exact: true })
      .fill("food");
    assert.equal(await page.locator(".og-row").count(), 1);
    await snapshot("tags");
    await page
      .getByRole("searchbox", { name: "Search categories", exact: true })
      .fill("");
    await create("category", "Everyday");
    await page
      .getByRole("heading", { name: "Everyday", exact: true })
      .waitFor();
    assert.equal(await page.locator(".og-row").count(), 3);
    await snapshot("categories");
    await section("Events");
    await create("event", "Mountain weekend");
    await section("People");
    await create("person", "Alex");
    await snapshot("people");
    await page.evaluate(async () => {
      const s = await window.urbanomics.reviewState(),
        tx = s.records[0],
        tag = s.entities.find((e) => e.name === "Food"),
        group = s.entities.find((e) => e.name === "Mountain weekend"),
        person = s.entities.find((e) => e.name === "Alex");
      await window.urbanomics.organize([
        {
          id: tx.id,
          version: tx.version,
          tags: [{ id: tag.id, cents: 10000 }],
          groups: [group.id],
        },
      ]);
      const next = (await window.urbanomics.reviewState()).records[0];
      await window.urbanomics.saveFinancial(next.id, next.version, {
        ...next.review,
        kind: "expense",
        reviewed: true,
        shares: [
          { id: "me", cents: 5000 },
          { id: person.id, cents: 5000 },
        ],
      });
    });
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await page
      .getByRole("button", { name: "Category Food", exact: true })
      .waitFor();
    await page.locator(".nav-item").filter({ hasText: "Organize" }).click();
    await section("People");
    await page.getByText("1 transaction", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Edit person Alex", exact: true })
      .click();
    d = page.getByRole("dialog", { name: "Edit person", exact: true });
    await d.getByRole("button", { name: "Delete person", exact: true }).click();
    await d
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await d.getByRole("alert").filter({ hasText: "used by a split" }).waitFor();
    await d
      .getByRole("button", { name: "Close Edit person", exact: true })
      .click();
    const before = (await state()).records[0];
    await section("Categories");
    await page
      .getByRole("button", { name: "Edit category Everyday", exact: true })
      .click();
    d = page.getByRole("dialog", { name: "Edit category", exact: true });
    await d
      .getByRole("button", { name: "Delete category", exact: true })
      .click();
    await d
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    assert.deepEqual((await state()).records[0], before);
    await section("Events");
    await page
      .getByRole("button", { name: "Edit event Mountain weekend", exact: true })
      .click();
    d = page.getByRole("dialog", { name: "Edit event", exact: true });
    await d.getByRole("button", { name: "Delete event", exact: true }).click();
    await d
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    const after = (await state()).records[0];
    assert.deepEqual(after.review.groups, []);
    assert.deepEqual(after.review.tags, before.review.tags);
    assert.deepEqual(after.review.shares, before.review.shares);
    await section("Accounts");
    await page
      .getByRole("button", { name: "Edit Synthetic card", exact: true })
      .waitFor();
    await page
      .getByRole("heading", { name: "Remembered filenames", exact: true })
      .waitFor();
    await snapshot("accounts");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 760),
    );
    await section("Categories");
    await snapshot("narrow-organize");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Edit category Food", exact: true })
      .click();
    d = page.getByRole("dialog", { name: "Edit category", exact: true });
    await d.getByLabel("Name", { exact: true }).focus();
    await snapshot("focused-editor");
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    const saved = await state();
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(await state(), saved);
    const configSQL = fs.readFileSync(
      path.join(root, "configuration/workspace.sql"),
      "utf8",
    );
    assert.ok(configSQL.includes("Food"));
    assert.ok(!configSQL.includes("Synthetic dinner"));
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "four sections, CRUD, direct categories, shared Review entities, protected deletion, narrow/focused layout, persistence",
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
