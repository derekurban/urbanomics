const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  parseExport,
  hash,
  routingKey,
  monthValid,
  csv,
} = require("./parsers.cjs");

function lastCompleteMonth(now = new Date()) {
  return `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
}
function immutable(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(Buffer.from(bytes)))
      throw new Error("Archive integrity check failed. Existing file differs.");
  } else {
    // Atomic publication: incomplete temporary files never become archive records.
    const temp = `${file}.${randomUUID()}.tmp`;
    const fd = fs.openSync(temp, "wx");
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  }
}

class ImportStore {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.now = options.now || (() => new Date());
    for (const dir of ["inbox", "archive/sources", "archive/snapshots"])
      fs.mkdirSync(path.join(this.root, dir), { recursive: true });
    this.db = new DatabaseSync(path.join(this.root, "urbanomics.sqlite"));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, schema TEXT NOT NULL, kind TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rules (key TEXT NOT NULL, schema TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id), PRIMARY KEY(key,schema,account_id));
      CREATE TABLE IF NOT EXISTS sources (hash TEXT PRIMARY KEY, filename TEXT NOT NULL, schema TEXT, canonical TEXT, bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, source_hash TEXT NOT NULL REFERENCES sources(hash), filename TEXT NOT NULL, account_id TEXT REFERENCES accounts(id), status TEXT NOT NULL, error TEXT, result TEXT, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), fingerprint TEXT NOT NULL, date TEXT NOT NULL, month TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tx_fingerprint ON transactions(account_id,fingerprint);
      CREATE TABLE IF NOT EXISTS observations (source_hash TEXT NOT NULL REFERENCES sources(hash), account_id TEXT NOT NULL REFERENCES accounts(id), record INTEGER NOT NULL, transaction_id TEXT REFERENCES transactions(id), reason TEXT, PRIMARY KEY(source_hash,account_id,record));
      CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, source_hash TEXT NOT NULL, account_id TEXT NOT NULL, scope TEXT NOT NULL, canonical TEXT NOT NULL, result TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, month TEXT NOT NULL, revision INTEGER NOT NULL, created TEXT NOT NULL, json TEXT NOT NULL, csv TEXT NOT NULL, UNIQUE(month,revision));
      PRAGMA user_version=1;`);
    this.db
      .prepare("INSERT OR IGNORE INTO settings VALUES (?,?)")
      .run("startMonth", "2026-01");
    this.db
      .prepare("INSERT OR IGNORE INTO settings VALUES (?,?)")
      .run("throughMonth", lastCompleteMonth(this.now()));
    this.recover();
  }
  close() {
    this.db.close();
  }
  settings() {
    return Object.fromEntries(
      this.db
        .prepare("SELECT * FROM settings")
        .all()
        .map((r) => [r.key, r.value]),
    );
  }
  setScope(start, through) {
    if (
      !monthValid(start) ||
      !monthValid(through) ||
      start > through ||
      through > lastCompleteMonth(this.now())
    )
      throw new Error(
        "Choose completed months, with start before or equal to the last month.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE settings SET value=? WHERE key=?")
        .run(start, "startMonth");
      this.db
        .prepare("UPDATE settings SET value=? WHERE key=?")
        .run(through, "throughMonth");
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.processPending();
  }
  addAccount(name, schema, kind) {
    name = String(name || "").trim();
    if (
      !name ||
      name.length > 80 ||
      !["pc", "eq", "simplii"].includes(schema) ||
      !["credit", "chequing", "savings"].includes(kind)
    )
      throw new Error("Enter a name, supported bank, and account type.");
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO accounts VALUES (?,?,?,?)")
      .run(id, name, schema, kind);
    return id;
  }
  resolveAccount(jobId, accountId, remember = true) {
    const job = this.job(jobId);
    if (!["routing", "overlap", "error", "queued"].includes(job.status))
      throw new Error("This import is already complete.");
    const source = this.db
      .prepare("SELECT * FROM sources WHERE hash=?")
      .get(job.source_hash);
    const account = this.db
      .prepare("SELECT * FROM accounts WHERE id=?")
      .get(accountId);
    if (!account || account.schema !== source.schema)
      throw new Error("Choose an account at the same bank as this CSV.");
    this.db
      .prepare("UPDATE jobs SET account_id=?,status=?,error=NULL WHERE id=?")
      .run(accountId, "queued", jobId);
    if (remember)
      this.db
        .prepare("INSERT OR IGNORE INTO rules VALUES (?,?,?)")
        .run(routingKey(job.filename), source.schema, accountId);
    return this.process(jobId);
  }
  job(id) {
    const job = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
    if (!job) throw new Error("Import not found.");
    return job;
  }
  enqueue(paths) {
    if (!Array.isArray(paths) || paths.length > 250)
      throw new Error("Drop up to 250 files at a time.");
    const files = [];
    let skipped = 0;
    for (const candidate of paths) {
      if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
        skipped++;
        continue;
      }
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink()) {
        skipped++;
        continue;
      }
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(candidate, {
          withFileTypes: true,
        })) {
          if (entry.isFile() && /\.csv$/i.test(entry.name))
            files.push(path.join(candidate, entry.name));
          else skipped++;
        }
      } else if (stat.isFile() && /\.csv$/i.test(candidate))
        files.push(candidate);
      else skipped++;
    }
    if (files.length > 250)
      throw new Error(
        "This folder contains more than 250 CSVs. Drop a smaller selection.",
      );
    const ids = [];
    for (const file of files) {
      if (fs.statSync(file).size > 20 * 1024 * 1024) {
        skipped++;
        continue;
      }
      const bytes = fs.readFileSync(file);
      const sourceHash = hash(bytes),
        filename = path.basename(file);
      const active = this.db
        .prepare(
          "SELECT id FROM jobs WHERE source_hash=? AND status NOT IN ('complete','dismissed')",
        )
        .get(sourceHash);
      if (active) {
        ids.push(active.id);
        continue;
      }
      const id = randomUUID();
      immutable(
        path.join(this.root, "archive/sources", `${sourceHash}.csv`),
        bytes,
      );
      immutable(path.join(this.root, "inbox", `${id}.csv`), bytes);
      let parsed, error;
      try {
        parsed = parseExport(bytes);
      } catch (e) {
        error = e.message;
      }
      this.db
        .prepare("INSERT OR IGNORE INTO sources VALUES (?,?,?,?,?)")
        .run(
          sourceHash,
          filename,
          parsed?.schema || null,
          parsed?.canonicalHash || null,
          bytes.length,
        );
      let accountId = null;
      if (parsed) {
        const known = this.db
          .prepare(
            "SELECT DISTINCT account_id AS id FROM imports WHERE source_hash=?",
          )
          .all(sourceHash);
        const matched = this.db
          .prepare(
            "SELECT account_id AS id FROM rules WHERE key=? AND schema=?",
          )
          .all(routingKey(filename), parsed.schema);
        const choices = known.length ? known : matched;
        if (choices.length === 1) accountId = choices[0].id;
      }
      this.db
        .prepare("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)")
        .run(
          id,
          sourceHash,
          filename,
          accountId,
          error ? "error" : accountId ? "queued" : "routing",
          error || null,
          null,
          this.now().toISOString(),
        );
      ids.push(id);
      if (accountId && !error) this.process(id);
    }
    return { ids, skipped };
  }
  plan(job) {
    const bytes = fs.readFileSync(
      path.join(this.root, "archive/sources", `${job.source_hash}.csv`),
    );
    if (hash(bytes) !== job.source_hash)
      throw new Error("Original archive file failed its integrity check.");
    const parsed = parseExport(bytes);
    const scope = this.settings();
    const included = parsed.rows.filter(
      (r) => r.month >= scope.startMonth && r.month <= scope.throughMonth,
    );
    const excluded = parsed.rows.filter(
      (r) => r.month < scope.startMonth || r.month > scope.throughMonth,
    );
    const auto = new Map();
    const canonical = this.db
      .prepare(
        "SELECT source_hash FROM imports WHERE canonical=? AND account_id=? AND scope=? ORDER BY created DESC LIMIT 1",
      )
      .get(parsed.canonicalHash, job.account_id, JSON.stringify(scope));
    const previous = canonical
      ? this.db
          .prepare(
            "SELECT t.id,t.fingerprint FROM observations o JOIN transactions t ON t.id=o.transaction_id WHERE o.source_hash=? AND o.account_id=? ORDER BY o.record",
          )
          .all(canonical.source_hash, job.account_id)
      : [];
    const available = new Map();
    for (const row of previous) {
      if (!available.has(row.fingerprint)) available.set(row.fingerprint, []);
      available.get(row.fingerprint).push(row.id);
    }
    for (const row of included) {
      const provenance = this.db
        .prepare(
          "SELECT transaction_id FROM observations WHERE source_hash=? AND account_id=? AND record=?",
        )
        .get(job.source_hash, job.account_id, row.record);
      if (provenance?.transaction_id)
        auto.set(row.record, provenance.transaction_id);
      else if (available.get(row.fingerprint)?.length)
        auto.set(row.record, available.get(row.fingerprint).shift());
    }
    const grouped = new Map();
    for (const row of included.filter((r) => !auto.has(r.record))) {
      if (!grouped.has(row.fingerprint)) grouped.set(row.fingerprint, []);
      grouped.get(row.fingerprint).push(row);
    }
    const conflicts = [];
    const reserved = new Set(auto.values());
    for (const [fingerprint, rows] of grouped) {
      const existing = this.db
        .prepare(
          "SELECT id FROM transactions WHERE account_id=? AND fingerprint=? ORDER BY rowid",
        )
        .all(job.account_id, fingerprint)
        .map((r) => r.id)
        .filter((id) => !reserved.has(id));
      if (existing.length)
        conflicts.push({
          fingerprint,
          rows,
          existing,
          matches: Math.min(rows.length, existing.length),
        });
    }
    return { parsed, scope, included, excluded, auto, conflicts };
  }
  process(id, resolutions = {}) {
    let job = this.job(id);
    if (job.status === "complete" || job.status === "dismissed") return;
    if (job.status === "finalizing") {
      this.recover();
      return;
    }
    if (!job.account_id) return;
    try {
      const plan = this.plan(job);
      if (
        plan.conflicts.some(
          (c) => !["match", "keep"].includes(resolutions[c.fingerprint]),
        )
      ) {
        this.db
          .prepare("UPDATE jobs SET status=?,error=NULL WHERE id=?")
          .run("overlap", id);
        return;
      }
      const matches = new Map(plan.auto);
      for (const conflict of plan.conflicts)
        if (resolutions[conflict.fingerprint] === "match") {
          for (let n = 0; n < conflict.matches; n++)
            matches.set(conflict.rows[n].record, conflict.existing[n]);
        }
      const affected = new Set();
      const result = {
        added: 0,
        matched: 0,
        excluded: plan.excluded.length,
        months: [],
        sourceRows: plan.parsed.rows.length,
      };
      this.db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of plan.included) {
          let txId = matches.get(row.record);
          if (!txId) {
            txId = randomUUID();
            this.db
              .prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?)")
              .run(
                txId,
                job.account_id,
                row.fingerprint,
                row.date,
                row.month,
                JSON.stringify(row),
              );
            result.added++;
            affected.add(row.month);
          } else result.matched++;
          this.db
            .prepare(
              "INSERT INTO observations VALUES (?,?,?,?,NULL) ON CONFLICT(source_hash,account_id,record) DO UPDATE SET transaction_id=excluded.transaction_id,reason=NULL",
            )
            .run(job.source_hash, job.account_id, row.record, txId);
        }
        for (const row of plan.excluded)
          this.db
            .prepare("INSERT OR IGNORE INTO observations VALUES (?,?,?,NULL,?)")
            .run(
              job.source_hash,
              job.account_id,
              row.record,
              row.month < plan.scope.startMonth
                ? "before-range"
                : "after-range",
            );
        result.months = [...affected].sort();
        this.db
          .prepare("INSERT INTO imports VALUES (?,?,?,?,?,?,?)")
          .run(
            randomUUID(),
            job.source_hash,
            job.account_id,
            JSON.stringify(plan.scope),
            plan.parsed.canonicalHash,
            JSON.stringify(result),
            this.now().toISOString(),
          );
        for (const month of affected) this.makeSnapshot(month);
        this.db
          .prepare("UPDATE jobs SET status=?,result=?,error=NULL WHERE id=?")
          .run("finalizing", JSON.stringify(result), id);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
      this.recover();
    } catch (e) {
      job = this.job(id);
      this.db
        .prepare("UPDATE jobs SET status=?,error=? WHERE id=?")
        .run(
          job.status === "finalizing" ? "finalizing" : "error",
          e.message,
          id,
        );
    }
  }
  transactions(month) {
    return this.db
      .prepare(
        "SELECT t.*,a.name AS account,a.kind FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE month=? ORDER BY date DESC,t.rowid",
      )
      .all(month)
      .map((t) => ({
        ...JSON.parse(t.payload),
        id: t.id,
        accountId: t.account_id,
        account: t.account,
        accountKind: t.kind,
      }));
  }
  makeSnapshot(month) {
    const transactions = this.transactions(month);
    const revision = this.db
      .prepare(
        "SELECT COALESCE(MAX(revision),0)+1 AS revision FROM snapshots WHERE month=?",
      )
      .get(month).revision;
    const id = randomUUID(),
      created = this.now().toISOString();
    const data = {
      version: 1,
      id,
      month,
      revision,
      created,
      dateBasis: "export-calendar-date",
      classification: "Unreviewed cash movements; not spending or income",
      transactions: transactions.map((t) => ({
        ...t,
        sources: this.db
          .prepare(
            "SELECT source_hash AS hash,record FROM observations WHERE transaction_id=?",
          )
          .all(t.id),
      })),
    };
    const encoded = csv([
      [
        "Transaction ID",
        "Account",
        "Date",
        "Time (as exported)",
        "Description",
        "Bank type",
        "Amount CAD",
        "Currency",
      ],
      ...transactions.map((t) => [
        t.id,
        t.account,
        t.date,
        t.time,
        t.description,
        t.type,
        (t.amountCents / 100).toFixed(2),
        t.currency,
      ]),
    ]);
    this.db
      .prepare("INSERT INTO snapshots VALUES (?,?,?,?,?,?)")
      .run(
        id,
        month,
        revision,
        created,
        JSON.stringify(data, null, 2),
        encoded,
      );
  }
  materialize() {
    for (const s of this.db.prepare("SELECT * FROM snapshots").all()) {
      const base = path.join(
        this.root,
        "archive/snapshots",
        s.month,
        `r${String(s.revision).padStart(4, "0")}-${s.id}`,
      );
      immutable(`${base}.json`, s.json);
      immutable(`${base}.csv`, s.csv);
    }
  }
  recover() {
    try {
      this.materialize();
      for (const job of this.db
        .prepare("SELECT * FROM jobs WHERE status='finalizing'")
        .all()) {
        // Only remove this app's intake copy after archive publication succeeds.
        const inboxFile = path.join(this.root, "inbox", `${job.id}.csv`);
        if (fs.existsSync(inboxFile)) fs.unlinkSync(inboxFile);
        this.db
          .prepare("UPDATE jobs SET status=?,error=NULL WHERE id=?")
          .run("complete", job.id);
      }
      this.archiveError = null;
    } catch (e) {
      this.archiveError = e.message;
    }
  }
  processPending() {
    for (const job of this.db
      .prepare("SELECT id FROM jobs WHERE status='queued'")
      .all())
      this.process(job.id);
  }
  dismiss(id) {
    const job = this.job(id);
    if (!["error", "routing", "overlap"].includes(job.status))
      throw new Error("This import cannot be dismissed while saving.");
    // Source remains archived. The queue item is simply hidden, never an original deletion.
    this.db.prepare("UPDATE jobs SET status=? WHERE id=?").run("dismissed", id);
    const file = path.join(this.root, "inbox", `${id}.csv`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  state() {
    const scope = this.settings();
    const jobs = this.db
      .prepare(
        "SELECT j.*,s.schema FROM jobs j JOIN sources s ON s.hash=j.source_hash WHERE status NOT IN ('complete','dismissed') ORDER BY created",
      )
      .all()
      .map((j) => {
        let plan;
        try {
          if (j.account_id && j.status !== "error") plan = this.plan(j);
        } catch {
          /* explicit job error remains visible */
        }
        return {
          id: j.id,
          filename: j.filename,
          accountId: j.account_id,
          schema: j.schema,
          status: j.status,
          error: j.error,
          conflicts:
            plan?.conflicts.map((c) => ({
              fingerprint: c.fingerprint,
              date: c.rows[0].date,
              description: c.rows[0].description,
              amountCents: c.rows[0].amountCents,
              incoming: c.rows.length,
              existing: c.existing.length,
              matches: c.matches,
            })) || [],
        };
      });
    const months = this.db
      .prepare(
        "SELECT month,COUNT(*) AS count FROM transactions WHERE month>=? AND month<=? GROUP BY month ORDER BY month DESC",
      )
      .all(scope.startMonth, scope.throughMonth)
      .map((m) => ({
        ...m,
        revision: this.db
          .prepare("SELECT MAX(revision) AS value FROM snapshots WHERE month=?")
          .get(m.month).value,
      }));
    return {
      root: this.root,
      scope,
      lastCompleteMonth: lastCompleteMonth(this.now()),
      accounts: this.db.prepare("SELECT * FROM accounts ORDER BY rowid").all(),
      rules: this.db
        .prepare(
          "SELECT r.*,a.name AS account FROM rules r JOIN accounts a ON a.id=r.account_id",
        )
        .all(),
      jobs,
      months,
      history: this.db
        .prepare(
          "SELECT j.id,j.filename,j.source_hash,j.account_id,a.name AS account,j.result,j.created FROM jobs j LEFT JOIN accounts a ON a.id=j.account_id WHERE j.status='complete' ORDER BY j.created DESC,j.rowid DESC",
        )
        .all()
        .map((j) => ({ ...j, result: JSON.parse(j.result) })),
      snapshots: this.db
        .prepare(
          "SELECT id,month,revision,created FROM snapshots ORDER BY month DESC,revision DESC",
        )
        .all(),
      archiveError: this.archiveError,
    };
  }
  detail(id) {
    const tx = this.db.prepare("SELECT * FROM transactions WHERE id=?").get(id);
    if (!tx) throw new Error("Transaction not found.");
    return {
      ...JSON.parse(tx.payload),
      id: tx.id,
      sources: this.db
        .prepare(
          "SELECT o.source_hash AS hash,o.record,s.filename FROM observations o JOIN sources s ON s.hash=o.source_hash WHERE transaction_id=?",
        )
        .all(id),
    };
  }
  snapshot(id) {
    const row = this.db.prepare("SELECT * FROM snapshots WHERE id=?").get(id);
    if (!row) throw new Error("Snapshot not found.");
    return JSON.parse(row.json);
  }
  removeRule(key, schema, accountId) {
    this.db
      .prepare("DELETE FROM rules WHERE key=? AND schema=? AND account_id=?")
      .run(key, schema, accountId);
  }
}
module.exports = { ImportStore, lastCompleteMonth };
