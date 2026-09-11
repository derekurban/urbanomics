const { randomUUID, createHash } = require("node:crypto");

class TransactionRuleStore {
  constructor(imports) {
    this.imports = imports;
    this.db = imports.db;
  }
  rules() {
    return this.db
      .prepare("SELECT * FROM transaction_rules ORDER BY name,id")
      .all()
      .map((r) => ({ ...r, enabled: !!r.enabled }));
  }
  normalize(values, preview = false) {
    if (!values || typeof values !== "object")
      throw new Error("Enter a rule and its mapping.");
    const name = typeof values.name === "string" ? values.name.trim() : "";
    const pattern =
      typeof values.pattern === "string" ? values.pattern.trim() : "";
    if ((!preview && !name) || name.length > 80)
      throw new Error("Give the rule a name of up to 80 characters.");
    this.imports.aliases.regex(pattern);
    const categoryId = values.categoryId || "",
      personId = values.personId || "",
      direction = values.direction || "any";
    if (
      !["any", "in", "out"].includes(direction) ||
      (values.enabled !== undefined && typeof values.enabled !== "boolean")
    )
      throw new Error("Choose a valid rule direction and enabled state.");
    const entities = this.imports.review.entities();
    if (!categoryId && !personId)
      throw new Error("Choose a category, a person, or both.");
    if (
      categoryId &&
      !entities.some((e) => e.id === categoryId && e.kind === "category")
    )
      throw new Error("This category is no longer available.");
    if (
      personId &&
      !entities.some((e) => e.id === personId && e.kind === "person")
    )
      throw new Error("This person is no longer available.");
    return {
      id: values.id || "",
      name: name || "Draft rule",
      pattern,
      categoryId,
      personId,
      direction,
      enabled: values.enabled !== false,
    };
  }
  save(values) {
    return this.imports.review.atomic(() => {
      const r = this.normalize(values),
        old = r.id ? this.rules().find((x) => x.id === r.id) : null;
      if (r.id && (!old || old.version !== values.version))
        throw new Error("This rule changed. Refresh before saving.");
      if (
        this.rules().some(
          (x) => x.id !== r.id && x.name.toLowerCase() === r.name.toLowerCase(),
        )
      )
        throw new Error("A rule with that name already exists.");
      const id = old?.id || randomUUID();
      this.db
        .prepare(
          "INSERT INTO transaction_rules(id,name,pattern,categoryId,personId,direction,enabled,version) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,pattern=excluded.pattern,categoryId=excluded.categoryId,personId=excluded.personId,direction=excluded.direction,enabled=excluded.enabled,version=excluded.version",
        )
        .run(
          id,
          r.name,
          r.pattern,
          r.categoryId,
          r.personId,
          r.direction,
          +r.enabled,
          (old?.version || 0) + 1,
        );
      return id;
    });
  }
  remove(id, version) {
    const result = this.db
      .prepare("DELETE FROM transaction_rules WHERE id=? AND version=?")
      .run(id, version);
    if (!result.changes)
      throw new Error("This rule changed. Refresh before removing it.");
  }
  candidates(records, rules) {
    const compiled = rules
      .filter((r) => r.enabled)
      .map((r) => ({ ...r, regex: this.imports.aliases.regex(r.pattern) }));
    return records
      .filter((t) => !t.deleted && !t.manual)
      .flatMap((row) => {
        const matched = compiled.filter(
          (r) =>
            (r.direction === "any" ||
              (r.direction === "in"
                ? row.amountCents > 0
                : row.amountCents < 0)) &&
            r.regex.test(row.originalDescription ?? row.description),
        );
        if (!matched.length) return [];
        const categoryIds = [
            ...new Set(matched.map((r) => r.categoryId).filter(Boolean)),
          ],
          personIds = [
            ...new Set(matched.map((r) => r.personId).filter(Boolean)),
          ];
        const changes = {},
          reasons = [];
        let status = "unchanged";
        if (categoryIds.length > 1 || personIds.length > 1) status = "conflict";
        else if (row.review.kind === "transfer") {
          status = "protected";
          reasons.push("Linked transfer assignments are preserved.");
        } else {
          const categoryId = categoryIds[0],
            personId = personIds[0];
          if (categoryId) {
            if (!row.review.tags.length && row.amountCents !== 0)
              changes.categoryId = categoryId;
            else if (
              !(
                row.review.tags.length === 1 &&
                row.review.tags[0].id === categoryId &&
                row.review.tags[0].cents === Math.abs(row.amountCents)
              )
            )
              reasons.push(
                "Existing categories or a zero amount are protected.",
              );
          }
          const existingPerson =
            row.review.personId || row.review.assignedPersonId;
          if (personId) {
            if (!existingPerson) changes.personId = personId;
            else if (existingPerson !== personId)
              reasons.push("Existing person assignment is protected.");
          }
          status = Object.keys(changes).length
            ? "ready"
            : reasons.length
              ? "protected"
              : "unchanged";
        }
        return [
          {
            id: row.id,
            date: row.date,
            description: row.description,
            account: row.account,
            amountCents: row.amountCents,
            currency: row.currency,
            version: row.version,
            status,
            reason:
              status === "conflict"
                ? "Matching rules propose different mappings."
                : reasons.join(" ") ||
                  (status === "ready"
                    ? "Fill unassigned fields."
                    : "Mappings already assigned."),
            changes,
            rules: matched.map((r) => r.name),
            ruleIds: matched.map((r) => r.id),
            conflicts: status === "conflict" ? matched.map((r) => r.name) : [],
          },
        ];
      });
  }
  state() {
    const rules = this.rules(),
      { records, entities } = this.imports.review.state();
    const token = createHash("sha256")
      .update(
        JSON.stringify({
          rules,
          entities,
          records: records.map((r) => [
            r.id,
            r.version,
            r.deleted,
            r.originalDescription ?? r.description,
            r.amountCents,
            r.date,
            r.currency,
            r.accountId,
          ]),
        }),
      )
      .digest("hex");
    return {
      rules,
      records,
      entities,
      candidates: this.candidates(records, rules),
      token,
    };
  }
  preview(values) {
    const draft = this.normalize(values, true),
      state = this.state();
    const rules = [
      ...state.rules.filter((r) => r.id !== draft.id),
      { ...draft, id: draft.id || "draft", enabled: true },
    ];
    const matches = this.candidates(state.records, rules).filter((c) =>
      c.ruleIds.includes(draft.id || "draft"),
    );
    return {
      matches,
      checked: state.records.filter((r) => !r.deleted && !r.manual).length,
      token: state.token,
    };
  }
  writeCandidates(candidates, records) {
    const byId = new Map(records.map((r) => [r.id, r]));
    const result = { applied: 0, conflicts: 0, protected: 0, unchanged: 0 };
    for (const c of candidates) {
      if (c.status !== "ready") {
        result[c.status === "conflict" ? "conflicts" : c.status]++;
        continue;
      }
      const row = byId.get(c.id),
        review = { ...row.review };
      if (c.changes.categoryId)
        review.tags = [
          { id: c.changes.categoryId, cents: Math.abs(row.amountCents) },
        ];
      if (c.changes.personId) review.assignedPersonId = c.changes.personId;
      this.imports.review.write(row.id, review, row.version);
      this.db
        .prepare(
          "INSERT INTO transaction_rule_applications(id,transaction_id,created,payload) VALUES(?,?,?,?)",
        )
        .run(
          randomUUID(),
          row.id,
          this.imports.now().toISOString(),
          JSON.stringify({
            rules: c.ruleIds,
            changes: c.changes,
            previousVersion: row.version,
          }),
        );
      result.applied++;
    }
    return result;
  }
  apply(token) {
    return this.imports.review.atomic(() => {
      const state = this.state();
      if (typeof token !== "string" || token !== state.token)
        throw new Error(
          "Transactions or rules changed. Refresh the matches before applying.",
        );
      return this.writeCandidates(state.candidates, state.records);
    });
  }
  // Called only for newly inserted identities, inside the import transaction.
  applyNew(ids) {
    if (!ids.length || !this.rules().some((r) => r.enabled)) return;
    const wanted = new Set(ids),
      records = this.imports.review.records().filter((r) => wanted.has(r.id));
    return this.writeCandidates(
      this.candidates(records, this.rules()),
      records,
    );
  }
  assignPerson(id, version, personId) {
    return this.imports.review.atomic(() => {
      const row = this.imports.review.current(id, version);
      if (
        personId &&
        !this.imports.review
          .entities()
          .some((e) => e.kind === "person" && e.id === personId)
      )
        throw new Error("Choose an existing person.");
      this.imports.review.write(
        id,
        { ...row.review, assignedPersonId: personId || "" },
        row.version,
      );
    });
  }
}
module.exports = { TransactionRuleStore };
