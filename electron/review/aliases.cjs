const { randomUUID } = require("node:crypto");
const { RE2 } = require("re2-wasm");

function normalizedPattern(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 256)
    throw new Error("Enter a description regex of 1–256 characters.");
  return value.trim();
}
function pattern(value) {
  const source = normalizedPattern(value);
  try {
    return new RE2(source, "iu");
  } catch {
    throw new Error(
      "Invalid regex. Use RE2 syntax without / delimiters; lookarounds and backreferences are not supported.",
    );
  }
}
const matches = (rule, row) =>
  (!rule.accountId || rule.accountId === row.accountId) &&
  rule.regex.test(row.originalDescription ?? row.description);

class AliasStore {
  constructor(imports) {
    this.imports = imports;
    this.db = imports.db;
    // re2-wasm owns compiled expressions in its fixed WASM heap and does not
    // expose a supported disposal API on RE2. Keep one expression for each
    // normalized source for this store's lifetime instead of recompiling every
    // saved rule for each preview/state call.
    this.regexCache = new Map();
  }
  regex(value) {
    const source = normalizedPattern(value);
    let regex = this.regexCache.get(source);
    if (!regex) {
      try {
        regex = new RE2(source, "iu");
      } catch {
        throw new Error(
          "Invalid regex. Use RE2 syntax without / delimiters; lookarounds and backreferences are not supported.",
        );
      }
      this.regexCache.set(source, regex);
    }
    return regex;
  }
  rules() {
    return this.db
      .prepare("SELECT * FROM transaction_aliases ORDER BY rowid")
      .all();
  }
  compile(rules = this.rules()) {
    return rules.map((r) => ({ ...r, regex: this.regex(r.pattern) }));
  }
  rows() {
    return this.db
      .prepare(
        "SELECT t.id,t.account_id,a.name AS account,a.deletedAt,t.payload FROM transactions t JOIN accounts a ON a.id=t.account_id ORDER BY t.date DESC,t.rowid DESC",
      )
      .all()
      .map((t) => ({
        ...JSON.parse(t.payload),
        id: t.id,
        accountId: t.account_id,
        account: t.account,
        deleted: !!t.deletedAt,
      }));
  }
  decorate(rows) {
    const rules = this.compile();
    return rows.map((row) => {
      const found = rules.filter((r) => matches(r, row));
      if (!found.length) return row;
      return {
        ...row,
        originalDescription: row.originalDescription ?? row.description,
        description:
          found.length === 1
            ? found[0].name
            : (row.originalDescription ?? row.description),
        aliasId: found.length === 1 ? found[0].id : "",
        aliasConflicts:
          found.length > 1 ? found.map(({ id, name }) => ({ id, name })) : [],
      };
    });
  }
  validate(values) {
    if (!values || typeof values !== "object")
      throw new Error("Enter an alias and matching rule.");
    const name = typeof values.name === "string" ? values.name.trim() : "";
    if (!name || name.length > 80)
      throw new Error("Enter a readable name of 1–80 characters.");
    const regex = this.regex(values.pattern),
      accountId = values.accountId || "";
    if (
      typeof accountId !== "string" ||
      (accountId &&
        !this.db.prepare("SELECT id FROM accounts WHERE id=?").get(accountId))
    )
      throw new Error("Account no longer exists.");
    if (values.id && !this.rules().some((r) => r.id === values.id))
      throw new Error("This alias no longer exists. Reopen the editor.");
    return {
      id: values.id || "",
      name,
      pattern: values.pattern.trim(),
      accountId,
      regex,
    };
  }
  preview(values) {
    const rule = this.validate(values),
      others = this.compile().filter((r) => r.id !== rule.id);
    const rows = this.rows();
    const found = rows
      .filter((row) => matches(rule, row))
      .map((row) => ({
        id: row.id,
        description: row.description,
        date: row.date,
        account: row.account,
        accountId: row.accountId,
        deleted: row.deleted,
        amountCents: row.amountCents,
        conflicts: others
          .filter((r) => matches(r, row))
          .map(({ id, name, pattern }) => ({ id, name, pattern })),
      }));
    const duplicates = others
      .filter(
        (r) =>
          (!r.accountId || !rule.accountId || r.accountId === rule.accountId) &&
          (r.name.toLowerCase() === rule.name.toLowerCase() ||
            r.pattern === rule.pattern),
      )
      .map(({ id, name, pattern }) => ({ id, name, pattern }));
    return {
      matches: found,
      conflicts: found.filter((r) => r.conflicts.length),
      duplicates,
      checked: rows.length,
    };
  }
  save(values) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rule = this.validate(values),
        existing = this.rules().find((r) => r.id === rule.id);
      if (existing && values.version !== existing.version)
        throw new Error("This alias changed. Close and reopen the editor.");
      const preview = this.preview(values);
      if (preview.conflicts.length || preview.duplicates.length)
        throw new Error(
          "This rule competes with another alias. Refine its regex or account scope before saving.",
        );
      const id = existing?.id || randomUUID();
      this.db
        .prepare(
          "INSERT INTO transaction_aliases (id,name,pattern,accountId,version) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,pattern=excluded.pattern,accountId=excluded.accountId,version=excluded.version",
        )
        .run(
          id,
          rule.name,
          rule.pattern,
          rule.accountId,
          (existing?.version || 0) + 1,
        );
      this.db.exec("COMMIT");
      return id;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  remove(id, version) {
    const existing = this.rules().find((r) => r.id === id);
    if (!existing || existing.version !== version)
      throw new Error(
        "This alias changed or was removed. Refresh and try again.",
      );
    this.db
      .prepare("DELETE FROM transaction_aliases WHERE id=? AND version=?")
      .run(id, version);
  }
  state() {
    const rows = this.decorate(this.rows()),
      rules = this.rules();
    return {
      rules: rules.map((r) => ({
        ...r,
        matched: rows.filter((t) => t.aliasId === r.id).length,
        conflicts: rows.filter((t) =>
          t.aliasConflicts?.some((c) => c.id === r.id),
        ).length,
      })),
      conflicts: rows.filter((t) => t.aliasConflicts?.length),
      unaliased: rows
        .filter((t) => !t.aliasId && !t.aliasConflicts?.length)
        .map(
          ({
            id,
            description,
            accountId,
            account,
            date,
            amountCents,
            deleted,
          }) => ({
            id,
            description,
            accountId,
            account,
            date,
            amountCents,
            deleted,
          }),
        ),
    };
  }
}
module.exports = { AliasStore, pattern };
