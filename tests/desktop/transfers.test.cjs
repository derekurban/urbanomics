const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
const {
  withinBand,
  transferCandidates,
} = require("../../electron/review/transfer-model.mjs");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-transfers-"));
  const folder = path.join(root, "workspace"),
    options = { now: () => new Date("2026-09-10T12:00:00Z") };
  let store = new ImportStore(folder, options);
  const a = store.addAccount("Synthetic chequing", "pc", "chequing"),
    b = store.addAccount("Synthetic savings", "pc", "savings");
  function file(name, entries) {
    const file = path.join(root, name + ".csv");
    fs.writeFileSync(
      file,
      csv([
        ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
        ...entries.map(([label, amount, date = "08/31/2026"]) => [
          label,
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
  function ingest(name, entries, account = a) {
    const id = store.enqueue([file(name, entries)]).ids[0];
    store.resolveAccount(id, account, false);
  }
  ingest("out", [
    ["Fee out", "-1002.50"],
    ["Exact out", "-200"],
    ["Extra out", "-300"],
    ["Cent out", "-1"],
    ["Same account in", "200"],
  ]);
  ingest(
    "in",
    [
      ["Fee in", "1000", "07/31/2026"],
      ["Exact in", "200"],
      ["Competing in", "200"],
      ["Extra in", "303"],
      ["Cent in", "0.99"],
    ],
    b,
  );
  const row = (name) =>
    store.review.records().find((t) => t.description === name);
  const link = (out, inc, band = 200) => {
    const x = row(out),
      y = row(inc);
    return store.review.linkTransfer(x.id, x.version, y.id, y.version, band);
  };
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    root,
    a,
    b,
    file,
    row,
    ingest,
    link,
    reopen() {
      store.close();
      store = new ImportStore(folder, options);
    },
  };
}
test("percentage candidates preserve exact-cent boundaries and ambiguous alternatives", (t) => {
  const c = fixture(t);
  assert.equal(withinBand(-10000, 9900, 100), true);
  assert.equal(withinBand(-10000, 9899, 100), false);
  assert.equal(withinBand(-10000, 10100, 100), true);
  assert.equal(withinBand(-10000, 10101, 100), false);
  assert.equal(withinBand(-100, 99, 99), false);
  assert.equal(withinBand(-100, 99, 100), true);
  assert.equal(
    withinBand(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0),
    true,
  );
  assert.equal(withinBand(-100, 0, 10000), false);
  assert.equal(withinBand(-100, 100, NaN), false);
  assert.equal(withinBand(-100, 100, 10001), false);
  const rows = c.store.review.records(),
    out = c.row("Exact out");
  assert.equal(transferCandidates(out, rows, 0).length, 2);
  assert.equal(
    transferCandidates(
      out,
      rows.map((t) =>
        t.description === "Competing in" ? { ...t, currency: "USD" } : t,
      ),
      0,
    ).length,
    1,
  );
  assert.equal(
    transferCandidates(c.row("Fee out"), rows, 200)[0].description,
    "Fee in",
  );
});
test("link stores principal differences once, preserves sources and categories, and rejects stale or reused pairs", async (t) => {
  const c = fixture(t),
    category = c.store.review.entity("category", {
      name: "Synthetic category",
      color: "#78976A",
    });
  const out = c.row("Fee out"),
    inc = c.row("Fee in");
  c.store.review.organize([
    {
      id: out.id,
      version: out.version,
      tags: [{ id: category, cents: 100250 }],
    },
  ]);
  const originals = () =>
    [
      "transactions",
      "snapshots",
      "observations",
      "sources",
      "transaction_aliases",
    ].map((table) =>
      c.store.db.prepare("SELECT * FROM " + table + " ORDER BY rowid").all(),
    );
  const before = originals(),
    currentOut = c.row("Fee out");
  c.store.review.organize([
    { id: inc.id, version: inc.version, groupsReviewed: true },
  ]);
  assert.throws(
    () =>
      c.store.review.linkTransfer(
        out.id,
        currentOut.version,
        inc.id,
        inc.version,
        200,
      ),
    /changed/,
  );
  assert.equal(c.row("Fee out").review.transferId, "");
  c.link("Fee out", "Fee in");
  assert.equal(c.row("Fee out").review.transferFeeCents, 250);
  assert.equal(c.row("Fee in").review.transferFeeCents, 0);
  assert.equal(c.row("Fee in").review.transferId, out.id);
  assert.equal(c.row("Fee out").review.tags[0].cents, 100250);
  assert.throws(() => c.link("Fee out", "Fee in"), /pending/);
  c.link("Extra out", "Extra in");
  assert.equal(c.row("Extra in").review.transferExcessCents, 300);
  assert.equal(c.row("Extra out").review.transferExcessCents, 0);
  const model = await import("../../src/review-model.js");
  const totals = model.flowSummary(c.store.review.records(), [category]).totals;
  assert.equal(totals.transferFees, 250);
  assert.equal(totals.transferOut, 100000);
  assert.equal(totals.out, 0);
  assert.deepEqual(originals(), before);
  c.reopen();
  const saved = c.row("Fee out"),
    partner = c.row("Fee in");
  assert.equal(saved.review.transferFeeCents, 250);
  c.store.review.financial(partner.id, partner.version, {
    ...partner.review,
    reviewed: false,
  });
  assert.equal(
    c.row("Fee out").review.transferFeeCents,
    250,
    "reopen preserves the existing unequal pair",
  );
  const a = c.row("Fee out"),
    b = c.row("Fee in");
  assert.throws(
    () => c.store.review.unlinkTransfer(a.id, a.version, b.version - 1),
    /changed/,
  );
  c.store.review.unlinkTransfer(a.id, a.version, b.version);
  assert.equal(c.row("Fee out").review.transferFeeCents, 0);
  assert.equal(c.row("Fee in").review.transferId, "");
  assert.equal(c.row("Fee out").review.reviewed, false);
  assert.deepEqual(originals(), before);
});
test("transfer linking blocks reviewed entries, same-account entries, out-of-band amounts and repayment targets", (t) => {
  const c = fixture(t);
  assert.throws(() => c.link("Fee out", "Fee in", 0), /outside/);
  assert.throws(
    () => c.link("Exact out", "Same account in", 0),
    /another account/,
  );
  const inc = c.row("Exact in");
  c.store.review.financial(inc.id, inc.version, {
    kind: "income",
    reviewed: true,
  });
  assert.throws(() => c.link("Exact out", "Exact in", 0), /pending/);
  const person = c.store.review.entity("person", {
      name: "Synthetic person",
      color: "#78976A",
    }),
    payment = c.row("Competing in"),
    expense = c.row("Exact out");
  c.store.review.financial(payment.id, payment.version, {
    kind: "repayment",
    reviewed: true,
    personId: person,
    allocations: [{ id: expense.id, cents: 20000 }],
    remainder: 0,
  });
  assert.equal(
    transferCandidates(expense, c.store.review.records(), 0).length,
    0,
    "reviewed, repayment and same-account entries are excluded",
  );
  assert.throws(() => c.link("Exact out", "Competing in", 0), /pending/);
});
test("multi-month imports append dated rows while preserving previous snapshots", (t) => {
  const c = fixture(t),
    originalSnapshotCount = c.store.state().snapshots.length;
  const file = c.file("multi-month", [
    ["July row", "-15", "07/20/2026"],
    ["August row", "-16", "08/20/2026"],
    ["September row", "-17", "09/01/2026"],
  ]);
  const id = c.store.enqueue([file], { stage: true, process: false }).ids[0];
  c.store.resolveAccount(id, c.a, false, { process: false });
  assert.equal(c.store.job(id).status, "queued");
  assert.equal(c.row("July row"), undefined);
  assert.ok(c.store.state().months.some((m) => m.month === "2026-08"));
  assert.equal(c.store.state().snapshots.length, originalSnapshotCount);
  c.store.process(id);
  assert.ok(c.row("July row"));
  assert.ok(c.row("August row"));
  assert.ok(c.row("September row"));
  assert.equal(c.store.state().months.length, 3);
  c.reopen();
  assert.equal(c.store.review.records().length, 13);
});

test("category views conserve transfer principal, fee cents and unexplained extras without treating them as income", async () => {
  const { flowSummary } = await import("../../src/review-model.js");
  const rows = [
    {
      amountCents: -10001,
      review: {
        kind: "transfer",
        reviewed: true,
        tags: [
          { id: "a", cents: 5000 },
          { id: "b", cents: 5001 },
        ],
        transferFeeCents: 1,
      },
    },
    {
      amountCents: 30300,
      review: {
        kind: "transfer",
        reviewed: true,
        tags: [
          { id: "a", cents: 10000 },
          { id: "b", cents: 20300 },
        ],
        transferExcessCents: 300,
      },
    },
  ];
  const all = flowSummary(rows, ["a", "b"]).totals;
  assert.equal(all.transferOut, 10000);
  assert.equal(all.transferFees, 1);
  assert.equal(all.transferIn, 30000);
  assert.equal(all.transferExcess, 300);
  assert.equal(all.income, 0);
  const a = flowSummary(rows, ["a"]).totals,
    b = flowSummary(rows, ["b"]).totals;
  for (const key of Object.keys(all)) assert.equal(a[key] + b[key], all[key]);
  assert.equal(a.transferFees, 0);
  assert.equal(b.transferFees, 1);
});
