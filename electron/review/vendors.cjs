// Vendors replace aliases and transaction rules (schema 23). A vendor is a readable name, one or more
// matchers over the original bank description, and optionally a tag and a person:
// - A transaction matched by exactly one vendor shows under the vendor's name. Matched by two, it keeps its
//   bank description and is listed as a clash until one vendor is made more specific. No vendor wins by order.
// - New imports matched by a vendor get its tag (when it fits the direction and the row has no tags) and its
//   person ("Paid <person>", money out only, when the row has none). Nothing set by hand is overwritten.
// - Transactions you already have change only when you ask, from the vendor editor; that change can be undone.
// Bank descriptions, identities, fingerprints and snapshots are never rewritten.
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { RE2 } = require("re2-wasm");
const { compileMatcher, decompilePattern, normalizeMatchers } = require("./vendor-model.mjs");
const { needsTagging, savedTags } = require("./system-tags.mjs");
const { tagType, tagFits } = require("./tag-model.mjs");

const MAX_NAME = 80;

class VendorStore {
  constructor(imports) {
    this.imports = imports;
    this.db = imports.db;
    // re2-wasm keeps compiled expressions in a fixed heap with no disposal API, so each pattern is compiled once.
    this.regexCache = new Map();
    // The last few "apply to transactions you already have" batches, so the toast can undo them.
    this.batches = new Map();
  }
  regex(pattern) {
    const source = String(pattern || "").trim();
    if (!source || source.length > 256) throw new Error("Keep each matcher under 200 characters.");
    let regex = this.regexCache.get(source);
    if (!regex) {
      try { regex = new RE2(source, "iu"); }
      catch { throw new Error(`“${source}” isn't a pattern Urbanomics can read. Use plain words, or RE2 syntax without lookarounds or backreferences.`); }
      this.regexCache.set(source, regex);
    }
    return regex;
  }
  list() {
    return this.db.prepare("SELECT * FROM vendors ORDER BY name COLLATE NOCASE, id").all()
      .map((v) => ({ id: v.id, name: v.name, matchers: JSON.parse(v.matchers), tagId: v.tagId, personId: v.personId, version: v.version }));
  }
  compile(vendors = this.list()) {
    return vendors.map((v) => ({ ...v, regexes: v.matchers.map((m) => this.regex(compileMatcher(m))) }));
  }
  static matches(vendor, row) {
    const text = row.originalDescription ?? row.description;
    return vendor.regexes.some((r) => r.test(text));
  }
  rows() {
    return this.db.prepare("SELECT t.id,t.account_id,a.name AS account,a.deletedAt,t.payload FROM transactions t JOIN accounts a ON a.id=t.account_id ORDER BY t.date DESC,t.rowid DESC").all()
      .map((t) => ({ ...JSON.parse(t.payload), id: t.id, accountId: t.account_id, account: t.account, deleted: !!t.deletedAt }));
  }
  /* Rows under their vendor's name. vendorId is set only for a single match; vendorConflicts lists a clash. */
  decorate(rows, vendors = this.compile()) {
    if (!vendors.length) return rows;
    return rows.map((row) => {
      const found = vendors.filter((v) => VendorStore.matches(v, row));
      if (!found.length) return row;
      const original = row.originalDescription ?? row.description;
      return {
        ...row,
        originalDescription: original,
        description: found.length === 1 ? found[0].name : original,
        vendorId: found.length === 1 ? found[0].id : "",
        vendorConflicts: found.length > 1 ? found.map(({ id, name }) => ({ id, name })) : [],
      };
    });
  }
  normalize(values) {
    if (!values || typeof values !== "object") throw new Error("Enter a vendor name and which descriptions it covers.");
    const name = typeof values.name === "string" ? values.name.trim() : "";
    if (!name || name.length > MAX_NAME) throw new Error("Give the vendor a name of 1–80 characters.");
    const matchers = normalizeMatchers(values.matchers);
    for (const m of matchers) this.regex(compileMatcher(m));
    const entities = this.imports.review.entities();
    const tagId = typeof values.tagId === "string" ? values.tagId : "", personId = typeof values.personId === "string" ? values.personId : "";
    if (tagId && !entities.some((e) => e.id === tagId && e.kind === "category")) throw new Error("That tag is no longer available. Choose another.");
    if (personId && !entities.some((e) => e.id === personId && e.kind === "person")) throw new Error("That person is no longer available. Choose another.");
    if (values.id && !this.list().some((v) => v.id === values.id)) throw new Error("This vendor no longer exists. Reopen the editor.");
    return { id: values.id || "", name, matchers, tagId, personId };
  }
  /* What a fill-only vendor would add to one row: { tagId?, personId? } and, when nothing, why. */
  change(row, vendor, entities) {
    const changes = {}, reasons = [];
    if (row.deleted || row.manual) return { changes, reasons: ["Not in an active account."] };
    if (row.review.kind === "transfer") return { changes, reasons: ["It's a linked transfer, so it isn't tagged."] };
    if (vendor.tagId) {
      const tag = entities.find((e) => e.id === vendor.tagId);
      if (!tag || !tagFits(row, tag)) reasons.push(row.amountCents > 0 ? "The tag is for money out." : "The tag is for money in.");
      else if (needsTagging(row) && row.amountCents !== 0 && (!row.review.tags.length || row.tagsAutomatic) && !(row.review.allocationMode === "layers" && row.review.allocations?.some((a) => a.cents > 0)))
        changes.tagId = vendor.tagId;
      else if (!(savedTags(row).length === 1 && savedTags(row)[0].id === vendor.tagId)) reasons.push("It already has other tags.");
    }
    if (vendor.personId && row.amountCents < 0) {
      const existing = row.review.personId || row.review.assignedPersonId;
      if (!existing) changes.personId = vendor.personId;
      else if (existing !== vendor.personId) reasons.push("It already has another person.");
    }
    return { changes, reasons };
  }
  /* Rows a vendor matches alone, with what it would add. Clashing rows get nothing. */
  candidates(records, vendors, only = null) {
    const compiled = this.compile(vendors), entities = this.imports.review.entities();
    const out = [];
    for (const row of records) {
      if (row.deleted || row.manual) continue;
      const found = compiled.filter((v) => VendorStore.matches(v, row));
      if (found.length !== 1 || (only && found[0].id !== only)) continue;
      const vendor = found[0];
      if (!vendor.tagId && !vendor.personId) continue;
      const { changes } = this.change(row, vendor, entities);
      if (Object.keys(changes).length) out.push({ id: row.id, version: row.version, vendorId: vendor.id, changes });
    }
    return out;
  }
  /* Writes fill-only changes and returns what was written, so it can be undone. */
  writeCandidates(candidates, records) {
    const byId = new Map(records.map((r) => [r.id, r])), written = [];
    for (const c of candidates) {
      const row = byId.get(c.id);
      if (!row) continue;
      const review = { ...row.review, tags: savedTags(row) };
      if (c.changes.tagId) review.tags = [{ id: c.changes.tagId, cents: Math.abs(row.amountCents) }];
      if (c.changes.personId) review.assignedPersonId = c.changes.personId;
      const before = this.db.prepare("SELECT payload FROM review_items WHERE transaction_id=?").get(row.id)?.payload ?? null;
      this.imports.review.write(row.id, review, row.version);
      this.db.prepare("INSERT INTO transaction_rule_applications(id,transaction_id,created,payload) VALUES(?,?,?,?)")
        .run(randomUUID(), row.id, this.imports.now().toISOString(), JSON.stringify({ vendor: c.vendorId, changes: c.changes, previousVersion: row.version }));
      written.push({ id: row.id, version: row.version + 1, before });
    }
    return written;
  }
  preview(values) {
    const draft = this.normalize(values), compiled = this.compile(this.list().filter((v) => v.id !== draft.id));
    const self = this.compile([{ ...draft, id: draft.id || "draft", version: 0 }])[0];
    const entities = this.imports.review.entities();
    const records = this.imports.review.state().records.filter((r) => !r.manual);
    const matches = [];
    for (const row of records) {
      if (!VendorStore.matches(self, row)) continue;
      const others = compiled.filter((v) => VendorStore.matches(v, row)).map(({ id, name }) => ({ id, name }));
      const { changes, reasons } = others.length ? { changes: {}, reasons: [] } : this.change(row, self, entities);
      matches.push({
        id: row.id, description: row.originalDescription ?? row.description, date: row.date, account: row.account, accountId: row.accountId,
        deleted: row.deleted, amountCents: row.amountCents, currency: row.currency, conflicts: others, changes, reason: reasons.join(" "),
        // Which of this vendor's matchers caught it, for the proof under each one.
        matchers: self.regexes.map((r, i) => (r.test(row.originalDescription ?? row.description) ? i : -1)).filter((i) => i >= 0),
      });
    }
    const duplicates = this.list().filter((v) => v.id !== draft.id && v.name.toLowerCase() === draft.name.toLowerCase()).map(({ id, name }) => ({ id, name }));
    return {
      matches,
      conflicts: matches.filter((m) => m.conflicts.length),
      duplicates,
      ready: matches.filter((m) => !m.deleted && Object.keys(m.changes).length).length,
      checked: records.length,
    };
  }
  /* Saves the vendor; with applyExisting, also fills its tag and person on the transactions you already have. */
  save(values, options = {}) {
    return this.imports.review.atomic(() => {
      const vendor = this.normalize(values), existing = vendor.id ? this.list().find((v) => v.id === vendor.id) : null;
      if (existing && values.version !== existing.version) throw new Error("This vendor changed. Close and reopen the editor.");
      const check = this.preview(values);
      if (check.duplicates.length) throw new Error(`Another vendor is already called “${check.duplicates[0].name}”.`);
      if (check.conflicts.length) throw new Error(`${check.conflicts.length === 1 ? "A transaction" : `${check.conflicts.length} transactions`} would also match ${[...new Set(check.conflicts.flatMap((m) => m.conflicts.map((c) => c.name)))].join(", ")}. Make a matcher more specific so each transaction has one vendor.`);
      const id = existing?.id || randomUUID();
      this.db.prepare("INSERT INTO vendors (id,name,matchers,tagId,personId,version) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,matchers=excluded.matchers,tagId=excluded.tagId,personId=excluded.personId,version=excluded.version")
        .run(id, vendor.name, JSON.stringify(vendor.matchers), vendor.tagId, vendor.personId, (existing?.version || 0) + 1);
      let applied = 0, batch = null;
      if (options.applyExisting === true && (vendor.tagId || vendor.personId)) {
        const records = this.imports.review.state().records;
        const written = this.writeCandidates(this.candidates(records, this.list(), id), records);
        applied = written.length;
        if (written.length) batch = this.remember(written);
      }
      return { id, applied, batch };
    });
  }
  remember(written) {
    const id = randomUUID();
    this.batches.set(id, written);
    if (this.batches.size > 10) this.batches.delete(this.batches.keys().next().value);
    return id;
  }
  /* Undo an apply: rows changed since keep their newer edits. */
  undoApply(batchId) {
    const written = this.batches.get(batchId);
    if (!written) throw new Error("That change can no longer be undone.");
    return this.imports.review.atomic(() => {
      let restored = 0, kept = 0;
      for (const w of written) {
        const row = this.db.prepare("SELECT version FROM review_items WHERE transaction_id=?").get(w.id);
        if (!row || row.version !== w.version) { kept++; continue; }
        // Versions only move forward, so an editor still holding the applied version is refused, not overwritten.
        this.db.prepare("UPDATE review_items SET payload=?,version=version+1,updated=? WHERE transaction_id=?").run(w.before ?? "{}", this.imports.now().toISOString(), w.id);
        restored++;
      }
      this.batches.delete(batchId);
      return { restored, kept };
    });
  }
  remove(id, version) {
    const existing = this.list().find((v) => v.id === id);
    if (!existing || existing.version !== version) throw new Error("This vendor changed or was removed. Refresh and try again.");
    this.db.prepare("DELETE FROM vendors WHERE id=? AND version=?").run(id, version);
  }
  /* Called only for newly inserted identities, inside the import transaction. */
  applyNew(ids) {
    if (!ids.length || !this.list().some((v) => v.tagId || v.personId)) return;
    const wanted = new Set(ids), records = this.imports.review.state().records.filter((r) => wanted.has(r.id));
    return this.writeCandidates(this.candidates(records, this.list()), records).length;
  }
  /* Apply every vendor to the transactions you already have (fill-only), checked against the state it was shown. */
  token() {
    const records = this.imports.review.state().records;
    return createHash("sha256").update(JSON.stringify({ vendors: this.list(), records: records.map((r) => [r.id, r.version, r.deleted, r.originalDescription ?? r.description, r.amountCents]) })).digest("hex");
  }
  applyAll(token) {
    return this.imports.review.atomic(() => {
      if (typeof token !== "string" || token !== this.token()) throw new Error("Transactions or vendors changed. Refresh and try again.");
      const records = this.imports.review.state().records;
      const written = this.writeCandidates(this.candidates(records, this.list()), records);
      return { applied: written.length, batch: written.length ? this.remember(written) : null };
    });
  }
  /* "Paid <person>" on one transaction, set by hand on the Organize desk. */
  assignPerson(id, version, personId) {
    return this.imports.review.atomic(() => {
      const row = this.imports.review.current(id, version);
      if (personId && !this.imports.review.entities().some((e) => e.kind === "person" && e.id === personId)) throw new Error("Choose an existing person.");
      this.imports.review.write(id, { ...row.review, assignedPersonId: personId || "" }, row.version);
    });
  }
  state() {
    const vendors = this.list(), compiled = this.compile(vendors);
    const rows = this.decorate(this.rows(), compiled);
    const counts = new Map(), clashes = new Map();
    for (const r of rows) {
      if (r.vendorId) counts.set(r.vendorId, (counts.get(r.vendorId) || 0) + 1);
      for (const c of r.vendorConflicts || []) clashes.set(c.id, (clashes.get(c.id) || 0) + 1);
    }
    const records = this.imports.review.state().records, waiting = new Map();
    for (const c of this.candidates(records, vendors)) waiting.set(c.vendorId, (waiting.get(c.vendorId) || 0) + 1);
    const pick = ({ id, description, originalDescription, accountId, account, date, amountCents, currency, deleted }) => ({ id, description: originalDescription ?? description, accountId, account, date, amountCents, currency, deleted });
    return {
      vendors: vendors.map((v) => ({ ...v, matched: counts.get(v.id) || 0, conflicts: clashes.get(v.id) || 0, waiting: waiting.get(v.id) || 0 })),
      conflicts: rows.filter((r) => r.vendorConflicts?.length).map((r) => ({ ...pick(r), vendorConflicts: r.vendorConflicts })),
      unmatched: rows.filter((r) => !r.vendorId && !r.vendorConflicts?.length).map(pick),
      token: this.token(),
    };
  }

  /* Aliases and transaction rules become vendors, once. Runs when a workspace opens (and after a configuration
     seed written by an older version). The old definitions are kept in a private recovery copy, then cleared:
     - each alias becomes a vendor with the same id and name, its pattern as one matcher;
     - a rule that picks aliases gives those vendors its tag and person; two rules giving one vendor different
       tags (or people) cancel out, as they did before (a clash applied nothing);
     - a regex rule whose pattern is an alias's, or whose current matches all fall under one alias, gives that
       vendor its tag and person; otherwise it becomes a vendor of its own, named after the rule;
     - switched-off rules make no vendor and give no tag; a rule's proportional template keeps only a single
       full-amount tag and its person. */
  convertLegacy() {
    const has = (table) => this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!has("transaction_aliases") || !has("transaction_rules")) return null;
    const aliases = this.db.prepare("SELECT * FROM transaction_aliases ORDER BY rowid").all();
    const rules = this.db.prepare("SELECT * FROM transaction_rules ORDER BY name,id").all();
    if (!aliases.length && !rules.length) return null;
    const entities = this.db.prepare("SELECT id,kind FROM review_entities").all();
    const isTag = (id) => !!id && entities.some((e) => e.id === id && e.kind === "category");
    const isPerson = (id) => !!id && entities.some((e) => e.id === id && e.kind === "person");
    const vendors = [], taken = new Set(this.list().map((v) => v.name.toLowerCase()));
    const uniqueName = (name) => {
      let base = String(name || "Vendor").trim().slice(0, MAX_NAME) || "Vendor", candidate = base, n = 2;
      while (taken.has(candidate.toLowerCase())) candidate = `${base.slice(0, MAX_NAME - 4)} (${n++})`;
      taken.add(candidate.toLowerCase());
      return candidate;
    };
    for (const a of aliases) vendors.push({ id: a.id, name: uniqueName(a.name), matchers: [decompilePattern(a.pattern)], tag: new Set(), person: new Set(), pattern: String(a.pattern).trim() });
    const compiled = vendors.map((v) => { try { return { v, regex: new RE2(v.pattern, "iu") }; } catch { return { v, regex: null }; } });
    const rows = this.rows().filter((r) => !r.deleted);
    const ownerOf = (text) => { const found = compiled.filter((c) => c.regex?.test(text)); return found.length === 1 ? found[0].v : null; };
    const notes = [];
    for (const raw of rules) {
      const rule = { ...raw, aliasIds: JSON.parse(raw.aliasIds || "[]"), template: raw.template ? JSON.parse(raw.template) : null, enabled: !!raw.enabled };
      if (!rule.enabled) { notes.push(`Rule “${rule.name}” was switched off and was not converted.`); continue; }
      let tagId = rule.categoryId;
      if (rule.template) {
        const only = rule.template.tags?.length === 1 && rule.template.tags[0].weight === 10000 && !rule.template.groups?.length;
        tagId = only ? rule.template.tags[0].id : "";
        if (!only) notes.push(`Rule “${rule.name}” split its tags or added events; its vendor keeps only its person.`);
      }
      tagId = isTag(tagId) ? tagId : "";
      const personId = isPerson(rule.personId) ? rule.personId : "";
      let targets = [];
      if (rule.matchType === "aliases") targets = vendors.filter((v) => rule.aliasIds.includes(v.id));
      else {
        const pattern = String(rule.pattern || "").trim(), same = vendors.find((v) => v.pattern === pattern);
        if (same) targets = [same];
        else {
          let regex = null;
          try { regex = new RE2(pattern, "iu"); } catch {}
          const hit = regex ? rows.filter((r) => regex.test(r.originalDescription ?? r.description)) : [];
          const owners = new Set(hit.map((r) => ownerOf(r.originalDescription ?? r.description)));
          if (hit.length && owners.size === 1 && !owners.has(null)) targets = [[...owners][0]];
          else if (regex) {
            const v = { id: randomUUID(), name: uniqueName(rule.name), matchers: [decompilePattern(pattern)], tag: new Set(), person: new Set(), pattern };
            vendors.push(v);
            compiled.push({ v, regex });
            targets = [v];
          }
        }
      }
      for (const v of targets) { if (tagId) v.tag.add(tagId); if (personId) v.person.add(personId); }
    }
    const recovery = path.join(this.imports.root, "backups", "admin");
    fs.mkdirSync(recovery, { recursive: true });
    const file = path.join(recovery, "before-vendors-" + randomUUID() + ".json");
    fs.writeFileSync(file, JSON.stringify({ action: "aliases-and-rules-to-vendors", created: this.imports.now().toISOString(), aliases, rules, notes }, null, 2), { flag: "wx" });
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.db.prepare("INSERT INTO vendors (id,name,matchers,tagId,personId,version) VALUES (?,?,?,?,?,1)");
      for (const v of vendors) {
        if (v.tag.size > 1) notes.push(`Rules gave “${v.name}” different tags, so it has none.`);
        if (v.person.size > 1) notes.push(`Rules gave “${v.name}” different people, so it has none.`);
        insert.run(v.id, v.name, JSON.stringify(v.matchers), v.tag.size === 1 ? [...v.tag][0] : "", v.person.size === 1 ? [...v.person][0] : "");
      }
      this.db.exec("DELETE FROM transaction_rules; DELETE FROM transaction_aliases;");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    fs.writeFileSync(file, JSON.stringify({ action: "aliases-and-rules-to-vendors", created: this.imports.now().toISOString(), aliases, rules, notes, vendors: vendors.length }, null, 2));
    return { vendors: vendors.length, notes, recovery: file };
  }
}
module.exports = { VendorStore };
