const { _electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { ImportStore } = require("../electron/imports/store.cjs");
const { csv } = require("../electron/imports/parsers.cjs");
const repo = path.resolve(__dirname, ".."),
  root = path.join(repo, "private/validation/transfers-" + randomUUID()),
  dataDir = path.join(root, "workspace");
fs.mkdirSync(root, { recursive: true });
const store = new ImportStore(dataDir, {
  now: () => new Date("2026-09-10T12:00:00Z"),
});
const a = store.addAccount("Sample chequing", "pc", "chequing"),
  b = store.addAccount("Sample savings", "pc", "savings");
function file(name, rows) {
  const file = path.join(root, name + ".csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ...rows.map(([description, amount, date = "08/20/2026"]) => [
        description,
        "SYNTHETIC",
        "SAMPLE PERSON",
        date,
        "12:00 AM",
        amount,
      ]),
    ]),
  );
  return file;
}
const outFile = file("out", [
  ["Sample fee out", "-1002.50"],
  ["Sample exact out", "-200"],
  ["Sample competing out", "-200"],
  ["Sample extra out", "-300"],
]);
const inFile = file("in", [
  ["Sample fee in", "1000", "07/31/2026"],
  ["Sample exact in", "200"],
  ["Sample competing in", "200"],
  ["Sample extra in", "303"],
]);
for (const [source, account] of [
  [outFile, a],
  [inFile, b],
])
  store.resolveAccount(store.enqueue([source]).ids[0], account, false);
const monthFile = file("month-choice", [
  ["Only July", "-12", "07/12/2026"],
  ["Only August", "-13", "08/12/2026"],
  ["Only September", "-14", "09/01/2026"],
]);
store.close();
const env = { ...process.env, URBANOMICS_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch() {
  app = await _electron.launch({ args: [repo], cwd: repo, env });
  const page = await app.firstWindow();
  await page.getByRole("heading", { name: "Snapshots", exact: true }).waitFor();
  return page;
}
(async () => {
  try {
    let page = await launch();
    await page.locator(".nav-item").filter({ hasText: "Review" }).click();
    await page
      .getByRole("navigation", { name: "Transaction tools" })
      .getByRole("button", { name: "Transfers", exact: true })
      .click();
    await page
      .getByLabel("Transaction month", { exact: true })
      .selectOption("2026-07");
    const workspace = page.getByRole("region", {
      name: "Transfer linking",
      exact: true,
    });
    const left = workspace.getByRole("region", {
        name: "Pending incoming transfers",
      }),
      right = workspace.getByRole("region", {
        name: "Possible outgoing matches",
      });
    const link = workspace.getByRole("button", {
      name: "Link transfer",
      exact: true,
    });
    assert.equal(await link.isDisabled(), true);
    await left.getByRole("button").filter({ hasText: "Sample fee in" }).click();
    await right
      .getByRole("button")
      .filter({ hasText: "Sample fee out" })
      .waitFor();
    assert.equal(await link.isDisabled(), true);
    await workspace.getByLabel("Transfer percentage band").fill("0");
    assert.equal(await right.getByRole("button").count(), 0);
    await workspace.getByLabel("Transfer percentage band").fill("2");
    await right
      .getByRole("button")
      .filter({ hasText: "Sample fee out" })
      .click();
    assert.equal(await left.locator("[aria-pressed=true]").count(), 1);
    assert.equal(await right.locator("[aria-pressed=true]").count(), 1);
    assert.match(await workspace.locator(".tr-fee").innerText(), /2\.50/);
    await page.screenshot({
      path: path.join(root, "transfer-pair.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.screenshot({
      path: path.join(root, "transfer-pair-narrow.png"),
      animations: "disabled",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await link.click();
    await workspace
      .getByRole("status")
      .filter({ hasText: "Transfer linked" })
      .waitFor();
    assert.equal(
      await left
        .getByRole("button")
        .filter({ hasText: "Sample fee in" })
        .count(),
      0,
    );
    assert.equal(await left.locator("[aria-pressed=true]").count(), 0);
    let state = await page.evaluate(() => window.urbanomics.reviewState());
    assert.equal(
      state.records.find((t) => t.description === "Sample fee out").review
        .transferFeeCents,
      250,
    );
    await workspace.getByRole("button", { name: /^Linked/ }).click();
    await workspace
      .getByRole("button", { name: "Unlink pair", exact: true })
      .click();
    await workspace
      .getByRole("status")
      .filter({ hasText: "Pair unlinked" })
      .waitFor();
    await workspace.getByRole("button", { name: /^Pending/ }).click();
    await page.getByLabel("Transaction month", { exact: true }).selectOption("");
    await left
      .getByRole("button")
      .filter({ hasText: "Sample exact in" })
      .click();
    assert.equal(await right.getByRole("button").count(), 2);
    await right
      .getByRole("button")
      .filter({ hasText: "Sample exact out" })
      .click();
    await link.click();
    await workspace
      .getByRole("status")
      .filter({ hasText: "Transfer linked" })
      .waitFor();
    state = await page.evaluate(() => window.urbanomics.reviewState());
    assert.equal(
      state.records.find((t) => t.description === "Sample competing in").review
        .reviewed,
      false,
    );
    const extraIn = left
      .getByRole("button")
      .filter({ hasText: "Sample extra in" });
    if ((await extraIn.getAttribute("aria-pressed")) !== "true")
      await extraIn.click();
    await right
      .getByRole("button")
      .filter({ hasText: "Sample extra out" })
      .click();
    assert.match(
      await workspace.locator(".tr-unresolved").innerText(),
      /3\.00/,
    );
    await link.click();
    await workspace
      .getByRole("status")
      .filter({ hasText: "Transfer linked" })
      .waitFor();
    await workspace.getByRole("button", { name: /^Linked/ }).click();
    await page.screenshot({
      path: path.join(root, "linked-pairs.png"),
      animations: "disabled",
    });
    await page.locator(".nav-item").filter({ hasText: "Snapshots" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Change month", exact: true })
        .count(),
      0,
    );
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, monthFile);
    await page
      .getByRole("button", { name: "Upload CSVs", exact: true })
      .click();
    const latest = await page.evaluate(() => window.urbanomics.state());
    const job = latest.jobs.find((t) => t.filename === "month-choice.csv");
    assert.ok(job);
    await page.evaluate(
      ({ id, account }) => window.urbanomics.route(id, account, false),
      { id: job.id, account: a },
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    state = await page.evaluate(() => window.urbanomics.reviewState());
    assert.ok(state.records.some((t) => t.description === "Only July"));
    assert.ok(state.records.some((t) => t.description === "Only August"));
    assert.ok(state.records.some((t) => t.description === "Only September"));
    assert.ok(
      (await page.evaluate(() => window.urbanomics.state())).months.some(
        (t) => t.month === "2026-08",
      ),
    );
    await app.close();
    app = null;
    page = await launch();
    state = await page.evaluate(() => window.urbanomics.reviewState());
    assert.equal(
      state.records.find((t) => t.description === "Sample extra in").review
        .transferExcessCents,
      300,
    );
    assert.equal(
      state.records.find((t) => t.description === "Sample exact out").review
        .reviewed,
      true,
    );
    console.log(
      JSON.stringify({
        ok: true,
        root,
        checks:
          "percentage matches, checked pair linking, fees, extra received, linked filtering, unlink, competing candidates, responsive layout, automatic date-based import and restart",
      }),
    );
  } finally {
    if (app) await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
