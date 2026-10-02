const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { csv } = require("../../electron/imports/parsers.cjs");
const { configurationSQL } = require("../../electron/configuration.cjs");
const { costBreakdown } = require("../../electron/review/event-model.mjs");
const {
  pendingTransfers,
} = require("../../electron/review/transfer-model.mjs");
test("cash and bank contributions share expense caps, stay out of snapshots/configuration and can be undone", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-cash-"));
  let store = new ImportStore(path.join(root, "data"));
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const account = store.addAccount("Synthetic bank", "pc", "chequing"),
    person = store.review.entity("person", {
      name: "Partner",
      color: "#78976A",
    });
  const file = path.join(root, "sample.csv");
  fs.writeFileSync(
    file,
    csv([
      ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
      ...[
        ["Dinner", "-100"],
        ["Household", "-200"],
        ["Bank payment", "100"],
        ["Salary", "2000"],
      ].map(([name, amount]) => [
        name,
        "SYNTHETIC",
        "SAMPLE",
        "08/15/2026",
        "12:00 AM",
        amount,
      ]),
    ]),
  );
  store.resolveAccount(store.enqueue([file]).ids[0], account, false);
  const row = (name) =>
    store.review.records().find((t) => t.description === name);
  const snapshot = store.db.prepare("SELECT * FROM snapshots").all(),
    originals = store.db.prepare("SELECT * FROM transactions").all();
  const dinner = row("Dinner"),
    house = row("Household");
  const id = store.review.saveCash({
    description: "PRIVATE_CASH_SENTINEL",
    date: "2026-09-01",
    amountCents: 8000,
    currency: "CAD",
  });
  const receipt = () => store.review.records().find((t) => t.id === id);
  assert.equal(receipt().manual, true);
  assert.equal(
    pendingTransfers(store.review.records()).some((t) => t.id === id),
    false,
  );
  store.review.financial(id, receipt().version, {
    kind: "repayment",
    reviewed: true,
    personId: person,
    allocations: [
      { id: dinner.id, cents: 5000 },
      { id: house.id, cents: 3000 },
    ],
    remainder: 0,
  });
  assert.deepEqual(row("Dinner"), dinner);
  assert.deepEqual(row("Household"), house);
  const bank = row("Bank payment");
  store.review.financial(bank.id, bank.version, {
    kind: "repayment",
    reviewed: true,
    personId: person,
    allocations: [{ id: dinner.id, cents: 5000 }],
    remainder: 5000,
  });
  assert.equal(costBreakdown([dinner], store.review.records())[0].fronted, 0);
  assert.throws(
    () =>
      store.review.financial(id, receipt().version, {
        kind: "repayment",
        reviewed: true,
        personId: person,
        allocations: [{ id: dinner.id, cents: 8000 }],
        remainder: 0,
      }),
    /exceed/,
  );
  assert.throws(
    () => store.review.saveCash({ ...receipt(), amountCents: 7000 }),
    /allocations/,
  );
  assert.throws(
    () =>
      store.review.financial(id, receipt().version, {
        kind: "transfer",
        transferId: dinner.id,
        reviewed: true,
      }),
    /Cash receipts/,
  );
  assert.throws(
    () =>
      store.review.saveCash({
        description: "Bad date",
        date: "2026-02-30",
        amountCents: 1,
        currency: "CAD",
      }),
    /valid date/,
  );
  assert.throws(
    () =>
      store.review.saveCash({
        description: "Fraction",
        date: "2026-08-01",
        amountCents: 1.5,
        currency: "CAD",
      }),
    /whole cents/,
  );
  assert.ok(
    !configurationSQL(store.db).includes("PRIVATE_CASH_SENTINEL") &&
      !configurationSQL(store.db).includes(id),
  );
  assert.deepEqual(store.db.prepare("SELECT * FROM snapshots").all(), snapshot);
  assert.deepEqual(
    store.db.prepare("SELECT * FROM transactions").all(),
    originals,
  );
  const saved = receipt();
  store.close();
  store = new ImportStore(path.join(root, "data"));
  assert.deepEqual(receipt(), saved);
  assert.throws(() => store.review.voidCash(id, saved.version - 1), /changed/);
  store.review.voidCash(id, saved.version);
  assert.equal(receipt(), undefined);
  assert.equal(
    costBreakdown([dinner], store.review.records())[0].fronted,
    5000,
  );
  assert.ok(
    store.db.prepare("SELECT voidedAt FROM cash_receipts WHERE id=?").get(id)
      .voidedAt,
  );
  const salary = row("Salary");
  store.review.financial(salary.id, salary.version, {kind: "income", reviewed: true});
  assert.equal(row("Salary").review.kind, "income");
  assert.equal(row("Salary").review.incomeType, "");
  assert.throws(
    () => store.review.entity("group", { name: "Undated", color: "#78976A" }),
    /both a start date/,
  );
});
