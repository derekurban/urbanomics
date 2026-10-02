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
    await section("Categories & tags");
    assert.equal(
      await page.locator(".nav-item").filter({ hasText: "Accounts" }).count(),
      0,
    );
    await create("tag", "Dining");
    await create("tag", "Home");
    await page
      .getByRole("button", { name: "Edit tag Dining", exact: true })
      .click();
    let d = page.getByRole("dialog", { name: "Edit tag", exact: true });
    await d.getByLabel("Name", { exact: true }).fill("Food");
    assert.equal(await d.locator("input[type=color]").count(), 0);
    await d.getByRole("button", { name: "Save tag", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    await page
      .getByRole("searchbox", {
        name: "Search categories and tags",
        exact: true,
      })
      .fill("food");
    assert.equal(await page.locator(".th-tag").count(), 1);
    await snapshot("tags");
    await page
      .getByRole("searchbox", {
        name: "Search categories and tags",
        exact: true,
      })
      .fill("");
    await create("tag", "Everyday");
    await page.getByText("Everyday", { exact: true }).waitFor();
    assert.equal(await page.locator(".th-tag").count(), 3);
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
    await page.getByRole("navigation", {name:"Transaction tools"}).getByRole("button",{name:"Expenses",exact:true}).click();
    await page
      .getByRole("button", { name: "Category Ungrouped", exact: true })
      .focus();
    await page.getByRole("button", { name: "Tag Food", exact: true }).waitFor();
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
    await section("Categories & tags");
    await page
      .getByRole("button", { name: "Edit tag Everyday", exact: true })
      .click();
    d = page.getByRole("dialog", { name: "Edit tag", exact: true });
    await d.getByRole("button", { name: "Delete tag", exact: true }).click();
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
    await section("Categories & tags");
    await snapshot("narrow-organize");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Edit tag Food", exact: true })
      .click();
    d = page.getByRole("dialog", { name: "Edit tag", exact: true });
    await d.getByLabel("Name", { exact: true }).focus();
    await snapshot("focused-editor");
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    await section("Admin");
    await page
      .getByRole("button", { name: "Reset transaction tags", exact: true })
      .click();
    let adminDialog = page.getByRole("dialog", {
      name: "Reset transaction tags?",
      exact: true,
    });
    await adminDialog.waitFor({ state: "visible" });
    await snapshot("admin-confirm-narrow");
    const beforeAdmin = await state();
    await page.keyboard.press("Escape");
    assert.deepEqual(await state(), beforeAdmin);
    await page
      .getByRole("button", { name: "Reset transaction tags", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(await state(), beforeAdmin);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1329, 920),
    );
    await snapshot("admin-actions");
    const beforeAdminSQL = fs.readFileSync(
      path.join(root, "configuration/workspace.sql"),
      "utf8",
    );
    await page
      .getByRole("button", { name: "Reset transaction tags", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm reset tags", exact: true })
      .click();
    await adminDialog.waitFor({ state: "hidden" });
    await page
      .getByRole("status")
      .getByText("1 transaction untagged.", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Reset transaction tags", exact: true })
        .isDisabled(),
      true,
    );
    const afterAdmin = await state();
    assert.deepEqual(afterAdmin.entities, beforeAdmin.entities);
    for (const row of afterAdmin.records) {
      const old = beforeAdmin.records.find((r) => r.id === row.id);
      assert.deepEqual(row.review, { ...old.review, tags: [] });
    }
    assert.equal(
      fs.readFileSync(path.join(root, "configuration/workspace.sql"), "utf8"),
      beforeAdminSQL,
    );
    assert.equal(fs.readdirSync(path.join(dataDir, "backups/admin")).length, 1);
    await snapshot("admin-results");
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
          "four sections, CRUD, direct categories, shared Review entities, protected deletion, narrow/focused layout, Admin confirm/cancel, atomic untag, private recovery copy, persistence",
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
