const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Explicit columns only: never export ledger rows, source files, reviews,
// allocations, snapshot payloads, receipts, caches, or historical settings.
const tables = {
  transfer_lab_config: ["id", "maxDays", "basisPoints", "routes", "version"],
  accounts: [
    "id",
    "name",
    "schema",
    "kind",
    "prefixRegex",
    "color",
    "deletedAt",
  ],
  rules: ["key", "schema", "account_id"],
  review_entities: [
    "id",
    "kind",
    "name",
    "color",
    "tags",
    "startDate",
    "endDate",
  ],
  transaction_aliases: ["id", "name", "pattern", "version"],
  transaction_rules: [
    "id",
    "name",
    "pattern",
    "categoryId",
    "personId",
    "direction",
    "enabled",
    "version",
  ],
};
const quote = (value) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : "'" + String(value).replace(/'/g, "''") + "'";

function configurationSQL(db) {
  const lines = [
    "-- Urbanomics configuration v1. Apply only to an empty, initialized workspace.",
    "-- Accounts, filename rules, categories, events, people, aliases, transaction rules and transfer-lab setup only.",
    "BEGIN IMMEDIATE;",
  ];
  for (const [table, columns] of Object.entries(tables)) {
    // Sort by stable identity so repeated exports make no incidental Git changes.
    const rows = db
      .prepare(
        `SELECT ${columns.map((c) => '"' + c + '"').join(",")} FROM "${table}" ORDER BY ${columns.map((c) => '"' + c + '"').join(",")}`,
      )
      .all();
    for (const row of rows) {
      // The legacy tags field is not configuration: former category memberships
      // must not revive through a configuration seed.
      if (table === "review_entities") row.tags = "[]";
      lines.push(
        `INSERT INTO "${table}" (${columns.map((c) => '"' + c + '"').join(", ")}) VALUES (${columns.map((c) => quote(row[c])).join(", ")});`,
      );
    }
  }
  return lines.concat("COMMIT;", "").join("\n");
}

function exportConfiguration(db, directory) {
  const sql = configurationSQL(db),
    file = path.join(directory, "workspace.sql");
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === sql) return file;
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    const fd = fs.openSync(temp, "wx");
    try {
      fs.writeFileSync(fd, sql);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return file;
}

function seedConfiguration(db, file) {
  // This is a trusted, version-controlled SQL artifact, not an upload format.
  // Never apply it on top of a user's existing workspace.
  for (const table of [
    ...Object.keys(tables),
    "transactions",
    "sources",
    "review_items",
    "cash_receipts",
  ])
    if (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n)
      throw new Error("Configuration can only seed an empty workspace.");
  const sql = fs.readFileSync(file, "utf8");
  if (!sql.startsWith("-- Urbanomics configuration v1."))
    throw new Error("Unrecognized configuration SQL file.");
  try {
    db.exec(sql);
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}
module.exports = { configurationSQL, exportConfiguration, seedConfiguration };
