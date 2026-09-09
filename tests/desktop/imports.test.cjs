const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const {
  parseExport,
  cents,
  csv,
  hash,
} = require("../../electron/imports/parsers.cjs");
const header = [
  "Description",
  "Type",
  "Card Holder Name",
  "Date",
  "Time",
  "Amount",
];
const row = (
  description = "Synthetic cafe",
  date = "08/15/2026",
  amount = "-12.34",
) => [description, "PURCHASE", "SAMPLE PERSON", date, "12:00 AM", amount];
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-test-"));
  let store = new ImportStore(path.join(root, "private"), {
    now: () => new Date("2026-09-09T12:00:00Z"),
  });
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const account = store.addAccount("Synthetic Mastercard", "pc", "credit");
  function file(name, rows) {
    const p = path.join(root, name + ".csv");
    fs.writeFileSync(p, csv([header, ...rows]));
    return p;
  }
  function ingest(file, accountId = account, remember = false) {
    const { ids } = store.enqueue([file]);
    if (store.job(ids[0]).status === "routing")
      store.resolveAccount(ids[0], accountId, remember);
    return ids[0];
  }
  return {
    root,
    account,
    file,
    ingest,
    get store() {
      return store;
    },
    reopen() {
      store.close();
      store = new ImportStore(path.join(root, "private"), {
        now: () => new Date("2026-09-09T12:00:00Z"),
      });
      return store;
    },
  };
}
test("all supported layouts preserve exact cents and exported calendar dates", () => {
  assert.equal(cents("-$1,234.56"), -123456);
  assert.equal(cents("0.01"), 1);
  assert.throws(() => cents("1.001"));
  assert.throws(() => cents("12,34"));
  assert.throws(() => cents("1$2"));
  const pc = parseExport(
    Buffer.from(csv([header, row('Quoted, "merchant"\nsecond line')])),
  );
  assert.equal(pc.rows[0].amountCents, -1234);
  assert.equal(pc.rows[0].date, "2026-08-15");
  assert.equal(pc.rows[0].raw[0], 'Quoted, "merchant"\nsecond line');
  const eq = parseExport(
    Buffer.from(
      "Transfer date,Description,Amount,Balance\r\n2026-08-31,Interest,$0.01,$100.01\r\n",
    ),
  );
  assert.equal(eq.rows[0].balanceCents, 10001);
  const simplii = parseExport(
    Buffer.from(
      "Date, Transaction Details, Funds Out, Funds In \r\n08/31/2026, Synthetic transfer, , 120.25\r\n",
    ),
  );
  assert.equal(simplii.rows[0].amountCents, 12025);
  assert.throws(
    () => parseExport(Buffer.from(csv([header, row("Bad", "02/30/2026")]))),
    /calendar date/,
  );
  assert.throws(
    () =>
      parseExport(
        Buffer.from(
          "Date, Transaction Details, Funds Out, Funds In \n08/01/2026,Ambiguous,1,2",
        ),
      ),
    /Both funds/,
  );
  assert.throws(
    () =>
      parseExport(
        Buffer.from(
          csv([header, row()]) + "\r\n" + csv([row()]).replace("\uFEFF", ""),
        ),
      ),
    /Malformed/,
  );
});
test("repeated files and reordered equivalent exports do not double count; multiplicity is retained", (t) => {
  const f = setup(t),
    rows = [row(), row(), row("Other")],
    first = f.file("card", rows);
  f.ingest(first);
  assert.equal(f.store.transactions("2026-08").length, 3);
  const repeat = f.ingest(first);
  assert.equal(JSON.parse(f.store.job(repeat).result).matched, 3);
  const reordered = f.ingest(f.file("reordered", [rows[2], rows[0], rows[1]]));
  assert.equal(f.store.job(reordered).status, "complete");
  assert.equal(f.store.transactions("2026-08").length, 3);
  assert.equal(f.store.state().snapshots.length, 1);
  assert.equal(fs.readdirSync(path.join(f.store.root, "inbox")).length, 0);
  assert.ok(fs.existsSync(first));
});
test("overlap decisions preserve accepted rows and distinguish additional identical payments", (t) => {
  const f = setup(t);
  f.ingest(f.file("first", [row(), row("Keep older")]));
  const old = f.store.state().snapshots[0],
    bytes = JSON.stringify(f.store.snapshot(old.id));
  const id = f.ingest(f.file("partial", [row(), row(), row("New")]));
  assert.equal(f.store.job(id).status, "overlap");
  assert.equal(f.store.transactions("2026-08").length, 2);
  const conflict = f.store.state().jobs[0].conflicts[0];
  assert.equal(conflict.matches, 1);
  f.store.process(id, { [conflict.fingerprint]: "match" });
  assert.equal(f.store.transactions("2026-08").length, 4);
  assert.equal(JSON.stringify(f.store.snapshot(old.id)), bytes);
  assert.equal(f.store.state().snapshots.length, 2);
  const extra = f.ingest(f.file("additional", [row(), row("Another new")]));
  f.store.process(extra, { [conflict.fingerprint]: "keep" });
  assert.equal(f.store.transactions("2026-08").length, 6);
  assert.equal(
    f.store.detail(
      f.store
        .transactions("2026-08")
        .find((r) => r.description === "Keep older").id,
    ).sources.length,
    1,
  );
});
test("scope excludes September, archives originals, and can backfill from the same file", (t) => {
  const f = setup(t);
  f.store.setScope("2026-08", "2026-08");
  const input = f.file("year", [
    row("July", "07/31/2026"),
    row(),
    row("September", "09/01/2026"),
  ]);
  let id = f.ingest(input);
  assert.deepEqual(JSON.parse(f.store.job(id).result), {
    added: 1,
    matched: 0,
    excluded: 2,
    months: ["2026-08"],
    sourceRows: 3,
  });
  const original = path.join(
    f.store.root,
    "archive/sources",
    hash(fs.readFileSync(input)) + ".csv",
  );
  assert.ok(fs.readFileSync(input).equals(fs.readFileSync(original)));
  assert.equal(f.store.transactions("2026-09").length, 0);
  f.store.setScope("2026-01", "2026-08");
  id = f.ingest(input);
  assert.equal(JSON.parse(f.store.job(id).result).added, 1);
  assert.equal(f.store.transactions("2026-07").length, 1);
  assert.equal(f.store.transactions("2026-08").length, 1);
  assert.throws(
    () => f.store.setScope("2026-01", "2026-09"),
    /completed months/,
  );
});
test("account identity is explicit and ambiguous filename rules do not guess", (t) => {
  const f = setup(t),
    second = f.store.addAccount("Other card", "pc", "credit");
  f.ingest(f.file("card_initial", [row()]), f.account, true);
  const b = f.file("card_2026-07", [row("July", "07/01/2026")]);
  // Bind a second account using an unfamiliar name, then explicitly record the shared pattern.
  f.store.db
    .prepare("INSERT INTO rules VALUES (?,?,?)")
    .run("card", "pc", second);
  const id = f.store.enqueue([b]).ids[0];
  assert.equal(f.store.job(id).status, "routing");
  f.store.resolveAccount(id, second);
  const id2 = f.store.enqueue([f.file("unfamiliar", [row(), row("Unique")])])
    .ids[0];
  f.store.resolveAccount(id2, second);
  assert.equal(f.store.job(id2).status, "complete");
  assert.equal(f.store.transactions("2026-08").length, 3);
});
test("bad rows reject the entire file and dismissing preserves the archived original", (t) => {
  const f = setup(t),
    input = f.file("bad", [row(), row("Invalid", "08/15/2026", "garbage")]);
  const id = f.store.enqueue([input]).ids[0];
  assert.equal(f.store.job(id).status, "error");
  assert.match(f.store.job(id).error, /Record 3/);
  assert.equal(f.store.transactions("2026-08").length, 0);
  f.store.dismiss(id);
  assert.equal(f.store.state().jobs.length, 0);
  assert.equal(
    fs.readdirSync(path.join(f.store.root, "archive/sources")).length,
    1,
  );
  assert.ok(fs.existsSync(input));
});
test("failed archive publication leaves intake recoverable; restart publishes exactly once", (t) => {
  const f = setup(t),
    input = f.file("card", [row()]);
  const materialize = f.store.materialize;
  f.store.materialize = () => {
    throw new Error("Synthetic disk failure");
  };
  const id = f.ingest(input);
  assert.equal(f.store.job(id).status, "finalizing");
  assert.match(f.store.state().archiveError, /disk failure/);
  assert.ok(fs.existsSync(path.join(f.store.root, "inbox", id + ".csv")));
  f.store.materialize = materialize;
  f.reopen();
  assert.equal(f.store.job(id).status, "complete");
  assert.equal(f.store.transactions("2026-08").length, 1);
  assert.equal(fs.readdirSync(path.join(f.store.root, "inbox")).length, 0);
  assert.equal(f.store.state().snapshots.length, 1);
});
test("snapshot failure rolls back transaction rows, provenance, and receipts", (t) => {
  const f = setup(t);
  f.store.makeSnapshot = () => {
    throw new Error("Synthetic database failure");
  };
  const id = f.ingest(f.file("card", [row()]));
  assert.equal(f.store.job(id).status, "error");
  assert.equal(f.store.transactions("2026-08").length, 0);
  assert.equal(
    f.store.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n,
    0,
  );
  assert.equal(f.store.state().history.length, 0);
});
test("archive integrity failure never overwrites an existing revision", (t) => {
  const f = setup(t);
  f.ingest(f.file("card", [row()]));
  const folder = path.join(f.store.root, "archive/snapshots/2026-08");
  const archived = path.join(
    folder,
    fs.readdirSync(folder).find((n) => n.endsWith(".json")),
  );
  fs.writeFileSync(archived, "Synthetic corruption");
  f.store.recover();
  assert.match(f.store.state().archiveError, /integrity/);
  assert.equal(fs.readFileSync(archived, "utf8"), "Synthetic corruption");
});
test("folder intake ignores non-CSV files and subfolders, and coalesces queued duplicates", (t) => {
  const f = setup(t);
  f.file("unknown", [row()]);
  fs.writeFileSync(
    path.join(f.root, "notes.txt"),
    "Synthetic nonfinancial file",
  );
  const batch = f.store.enqueue([f.root]);
  assert.equal(batch.ids.length, 1);
  assert.equal(batch.skipped, 2); // notes and the private workspace subfolder
  assert.deepEqual(f.store.enqueue([f.root]).ids, batch.ids);
  assert.equal(f.store.state().jobs.length, 1);
});
