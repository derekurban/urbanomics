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

test("account settings validate safe prefix expressions, preserve identity and route only unambiguous bank matches", (t) => {
  const ctx = setup(t),
    { store, account, file } = ctx;
  const values = {
    name: "Everyday card",
    prefixRegex: "pc[_-](card|mastercard)",
    color: "#6883c5",
  };
  const waiting = store.enqueue([file("PC_Card_August", [row()])], {
    stage: true,
    process: false,
  }).ids[0];
  store.updateAccount(account, values);
  assert.equal(store.job(waiting).status, "queued");
  assert.equal(store.state().months.length, 0);
  assert.equal(
    store.testPrefix(values.prefixRegex, "PC_Mastercard_2026-08.csv").matches,
    true,
  );
  assert.equal(
    store.testPrefix(values.prefixRegex, "Other_PC_Card.csv").matches,
    false,
  );
  assert.equal(store.testPrefix("pc|eq", "other_eq.csv").matches, false);
  assert.equal(
    store.testPrefix("(a+)+$", "a".repeat(240) + "!").matches,
    false,
  );
  assert.throws(
    () => store.updateAccount(account, { ...values, prefixRegex: "[" }),
    /Invalid prefix/,
  );
  assert.throws(
    () => store.updateAccount(account, { ...values, prefixRegex: "(?=pc)" }),
    /Invalid prefix/,
  );
  assert.throws(
    () => store.updateAccount(account, { ...values, color: "red" }),
    /color/,
  );
  assert.throws(
    () => store.updateAccount(account, { ...values, name: "" }),
    /account name/,
  );
  assert.equal(store.state().accounts[0].color, "#6883C5");
  store.processReady();
  const saved = store.db.prepare("SELECT * FROM snapshots").all();
  const tx = store.transactions("2026-08")[0].id;
  store.updateAccount(account, { ...values, name: "Renamed account" });
  assert.equal(store.transactions("2026-08")[0].id, tx);
  assert.deepEqual(store.db.prepare("SELECT * FROM snapshots").all(), saved);
  store.addAccount("Other bank", "eq", "savings", {
    prefixRegex: "pc",
    color: "#9674B7",
  });
  let job = store.enqueue([file("PC_card_new", [row("New expense")])], {
    process: false,
  }).ids[0];
  assert.equal(store.job(job).account_id, account);
  store.addAccount("Conflicting card", "pc", "credit", {
    prefixRegex: "pc",
    color: "#BE6684",
  });
  job = store.enqueue([file("PC_card_conflict", [row("Ambiguous expense")])], {
    process: false,
  }).ids[0];
  assert.equal(store.job(job).status, "routing");
  const repeated = store.enqueue([file("PC_card_again", [row()])], {
    process: false,
  }).ids[0];
  assert.equal(
    store.job(repeated).account_id,
    account,
    "known original retains accepted account",
  );
  ctx.reopen();
  assert.equal(ctx.store.state().accounts[0].name, "Renamed account");
  assert.equal(ctx.store.state().accounts[0].prefixRegex, values.prefixRegex);
  assert.equal(ctx.store.state().accounts[0].color, "#6883C5");
});

test("prefix rules and remembered filenames conflict without silently choosing an account", (t) => {
  const { store, file, ingest, account } = setup(t);
  ingest(file("statement_2026-08", [row()]), account, true);
  store.addAccount("Second card", "pc", "credit", {
    prefixRegex: "statement",
    color: "#BE6684",
  });
  const job = store.enqueue(
    [file("statement_2026-07", [row("Another statement")])],
    { process: false },
  ).ids[0];
  assert.equal(store.job(job).status, "routing");
});

test("version 2 accounts migrate without changing the ledger or immutable snapshots", (t) => {
  const ctx = setup(t);
  ctx.ingest(ctx.file("legacy", [row()]));
  const before = ctx.store.db.prepare("SELECT * FROM snapshots").all();
  const ids = ctx.store.transactions("2026-08").map((tx) => tx.id);
  ctx.store.db.exec(
    "ALTER TABLE accounts DROP COLUMN prefixRegex; ALTER TABLE accounts DROP COLUMN color; ALTER TABLE accounts DROP COLUMN deletedAt; PRAGMA user_version=2",
  );
  ctx.reopen();
  assert.equal(
    ctx.store.db.prepare("PRAGMA user_version").get().user_version,
    5,
  );
  assert.deepEqual(
    ctx.store.db.prepare("SELECT * FROM snapshots").all(),
    before,
  );
  assert.deepEqual(
    ctx.store.transactions("2026-08").map((tx) => tx.id),
    ids,
  );
  assert.equal(ctx.store.state().accounts[0].prefixRegex, "");
  assert.match(ctx.store.state().accounts[0].color, /^#[0-9A-F]{6}$/);
});

test("processing progress and persisted results reflect actual completed files without affecting repeat detection", async (t) => {
  const ctx = setup(t),
    { store, account, file } = ctx;
  store.updateAccount(account, {
    name: "Card",
    prefixRegex: "batch",
    color: "#427A64",
  });
  const first = file("batch-a", [row("Cafe"), row("Excluded", "09/02/2026")]);
  const second = file("batch-b", [row("Market")]);
  store.enqueue([first, second], { stage: true, process: false });
  const progress = [];
  const result = await store.processReadyWithProgress((value) =>
    progress.push(value),
  );
  assert.equal(result.completed, 2);
  assert.equal(result.added, 2);
  assert.equal(result.matched, 0);
  assert.equal(result.excluded, 1);
  assert.deepEqual(result.months, ["2026-08"]);
  assert.equal(result.remaining, 0);
  assert.deepEqual(
    progress.map((p) => p.done),
    [0, 1, 2],
  );
  assert.ok(progress.every((p) => p.total === 2));
  ctx.reopen();
  assert.deepEqual(ctx.store.state().lastProcessResult, result);
  const reordered = file("batch-reordered", [
    row("Excluded", "09/02/2026"),
    row("Cafe"),
  ]);
  ctx.store.enqueue([reordered], { stage: true, process: false });
  const repeat = await ctx.store.processReadyWithProgress();
  assert.equal(repeat.completed, 1);
  assert.equal(repeat.added, 0);
  assert.equal(repeat.matched, 1);
  assert.equal(ctx.store.transactions("2026-08").length, 2);
  ctx.store.enqueue([file("batch-overlap", [row("Cafe"), row("New")])], {
    stage: true,
    process: false,
  });
  const unresolved = await ctx.store.processReadyWithProgress();
  assert.equal(unresolved.completed, 0);
  assert.equal(unresolved.added, 0);
  assert.equal(unresolved.remaining, 1);
  assert.equal(unresolved.files[0].status, "overlap");
});
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

test("deleting an account hides active rows, stops routing and preserves audit data across restart and restore", (t) => {
  const ctx = setup(t),
    { store, account, file, ingest } = ctx;
  store.updateAccount(account, {
    name: "My card",
    prefixRegex: "card",
    color: "#427A64",
  });
  const original = file("card_august", [row()]);
  ingest(original, account, true);
  const ledger = store.db.prepare("SELECT * FROM transactions").all();
  const snapshots = store.db.prepare("SELECT * FROM snapshots").all();
  const pending = store.enqueue([file("card_next", [row("Next purchase")])], {
    stage: true,
    process: false,
  }).ids[0];
  assert.equal(store.job(pending).status, "queued");
  store.deleteAccount(account);
  assert.equal(store.state().accounts.length, 0);
  assert.equal(store.state().deletedAccounts[0].id, account);
  assert.equal(store.state().months.length, 0);
  assert.equal(store.transactions("2026-08").length, 0);
  assert.equal(store.state().rules.length, 0);
  assert.equal(store.job(pending).status, "routing");
  assert.equal(store.job(pending).account_id, null);
  assert.deepEqual(
    store.db.prepare("SELECT * FROM transactions").all(),
    ledger,
  );
  assert.deepEqual(
    store.db.prepare("SELECT * FROM snapshots").all(),
    snapshots,
  );
  assert.equal(store.state().history[0].account, "My card");
  assert.ok(
    store.state().activity.find((j) => j.status === "complete").accountDeleted,
  );
  assert.throws(
    () => store.resolveAccount(pending, account),
    /Choose an account/,
  );
  // A known original from a deleted account cannot fall through to another prefix.
  const other = store.addAccount("Other card", "pc", "credit", {
    prefixRegex: "card",
    color: "#9674B7",
  });
  const repeated = store.enqueue([original], { stage: true, process: false })
    .ids[0];
  assert.equal(store.job(repeated).status, "routing");
  ctx.reopen();
  assert.equal(ctx.store.state().deletedAccounts.length, 1);
  ctx.store.deleteAccount(other);
  ctx.store.restoreAccount(account);
  assert.equal(ctx.store.transactions("2026-08")[0].id, ledger[0].id);
  assert.equal(ctx.store.state().months[0].count, 1);
  assert.equal(ctx.store.job(repeated).account_id, account);
  ctx.store.process(repeated);
  assert.equal(JSON.parse(ctx.store.job(repeated).result).matched, 1);
  assert.deepEqual(
    ctx.store.db.prepare("SELECT * FROM snapshots").all(),
    snapshots,
  );
});

test("an empty account can be deleted and restored, and finalizing imports protect deletion", (t) => {
  const { store, account, file, ingest } = setup(t);
  store.deleteAccount(account);
  assert.equal(store.state().accounts.length, 0);
  store.restoreAccount(account);
  assert.equal(store.state().accounts.length, 1);
  const materialize = store.materialize;
  store.materialize = () => {
    throw new Error("Synthetic disk failure");
  };
  const id = ingest(file("unfinished", [row()]));
  assert.equal(store.job(id).status, "finalizing");
  assert.throws(() => store.deleteAccount(account), /Finish archive recovery/);
  assert.equal(store.state().accounts.length, 1);
  store.materialize = materialize;
  store.recover();
  store.deleteAccount(account);
  assert.equal(store.state().accounts.length, 0);
});
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

test("Dropbox stages, survives restart, and processes only when requested", (t) => {
  const f = setup(t),
    input = f.file("staged", [row()]);
  const id = f.store.enqueue([input], { stage: true, process: false }).ids[0];
  f.store.resolveAccount(id, f.account, true, { process: false });
  assert.equal(f.store.job(id).status, "queued");
  assert.equal(f.store.transactions("2026-08").length, 0);
  f.reopen();
  assert.equal(f.store.job(id).status, "queued");
  assert.equal(fs.readdirSync(path.join(f.store.root, "dropbox")).length, 1);
  assert.deepEqual(f.store.processReady(), { attempted: 1, completed: 1 });
  assert.equal(fs.readdirSync(path.join(f.store.root, "dropbox")).length, 0);
  assert.equal(f.store.transactions("2026-08").length, 1);
  assert.ok(fs.existsSync(input));
  f.store.enqueue([input], { stage: true, process: false });
  assert.equal(f.store.transactions("2026-08").length, 1);
  f.store.processReady();
  assert.equal(f.store.state().sources.length, 1);
  assert.equal(f.store.state().activity.length, 2);
  assert.equal(f.store.state().snapshotIndex.length, 1);
});

test("clearing Dropbox archives external CSVs and preserves non-CSV files and snapshots", (t) => {
  const f = setup(t);
  f.ingest(f.file("accepted", [row()]));
  const originalSnapshot = f.store.snapshot(f.store.state().snapshots[0].id);
  fs.copyFileSync(
    f.file("external", [row("Different")]),
    path.join(f.store.root, "dropbox/external.csv"),
  );
  fs.writeFileSync(
    path.join(f.store.root, "dropbox/notes.txt"),
    "Leave me alone",
  );
  assert.deepEqual(f.store.clearDropbox(), { cleared: 1 });
  assert.deepEqual(fs.readdirSync(path.join(f.store.root, "dropbox")), [
    "notes.txt",
  ]);
  assert.equal(f.store.state().sources.length, 2);
  assert.equal(f.store.state().activity[0].status, "dismissed");
  assert.deepEqual(f.store.snapshot(originalSnapshot.id), originalSnapshot);
});

test("cleanup never deletes a file changed after staging or an unarchived original", (t) => {
  const f = setup(t),
    input = f.file("changed", [row()]);
  const id = f.store.enqueue([input], { stage: true, process: false }).ids[0];
  f.store.resolveAccount(id, f.account, false, { process: false });
  const drop = path.join(f.store.root, "dropbox/changed.csv");
  fs.writeFileSync(drop, "new contents written after staging");
  f.store.process(id);
  assert.equal(
    fs.readFileSync(drop, "utf8"),
    "new contents written after staging",
  );
  const next = f.store.enqueue([f.file("keep", [row("Other")])], {
    stage: true,
    process: false,
  }).ids[0];
  const source = f.store.job(next).source_hash;
  fs.writeFileSync(
    path.join(f.store.root, "archive/sources", source + ".csv"),
    "Synthetic corruption",
  );
  assert.throws(() => f.store.dismiss(next), /integrity/);
  assert.ok(fs.existsSync(path.join(f.store.root, "dropbox/keep.csv")));
  assert.equal(f.store.job(next).status, "routing");
});

test("same-named exports are staged independently without overwriting", (t) => {
  const f = setup(t),
    input = f.file("same", [row()]);
  f.store.enqueue([input], { stage: true, process: false });
  const first = fs.readFileSync(path.join(f.store.root, "dropbox/same.csv"));
  f.file("same", [row("Different")]);
  f.store.enqueue([input], { stage: true, process: false });
  assert.ok(
    fs.readFileSync(path.join(f.store.root, "dropbox/same.csv")).equals(first),
  );
  assert.equal(fs.readdirSync(path.join(f.store.root, "dropbox")).length, 2);
  assert.equal(f.store.state().jobs.length, 2);
});

test("account snapshot versions count only changes to that account and preserve links", (t) => {
  const f = setup(t),
    other = f.store.addAccount("Another synthetic card", "pc", "credit");
  f.ingest(f.file("first", [row()]));
  f.ingest(f.file("second", [row("Different")]), other);
  let index = f.store.state().snapshotIndex;
  assert.equal(index.length, 2);
  assert.equal(
    index.find((s) => s.accountId === f.account).workspaceRevision,
    1,
  );
  assert.equal(index.find((s) => s.accountId === other).revision, 1);
  f.ingest(f.file("third", [row("Brand new")]));
  index = f.store.state().snapshotIndex;
  assert.equal(index.length, 3);
  const changed = index.find(
    (s) => s.accountId === f.account && s.revision === 2,
  );
  assert.equal(changed.workspaceRevision, 3);
  assert.equal(changed.rowCount, 2);
  assert.equal(changed.sourceHashes.length, 2);
  assert.equal(index.filter((s) => s.accountId === other).length, 1);
});

test("staged files remain when publication fails and are cleared on recovery", (t) => {
  const f = setup(t),
    input = f.file("archive-retry", [row()]);
  const id = f.store.enqueue([input], { stage: true, process: false }).ids[0];
  f.store.resolveAccount(id, f.account, false, { process: false });
  f.store.materialize = () => {
    throw new Error("Synthetic publication failure");
  };
  f.store.process(id);
  assert.equal(f.store.job(id).status, "finalizing");
  assert.equal(fs.readdirSync(path.join(f.store.root, "dropbox")).length, 1);
  f.reopen();
  assert.equal(f.store.job(id).status, "complete");
  assert.equal(fs.readdirSync(path.join(f.store.root, "dropbox")).length, 0);
});
