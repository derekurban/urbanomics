const { createHash } = require("node:crypto");
const {
  suggestedRoutes,
  unlinkedTransferCopy,
  transferLabCandidates,
  transferLabBacktest,
} = require("./transfer-lab-model.mjs");
class TransferLabStore {
  constructor(imports) {
    this.imports = imports;
    this.db = imports.db;
  }
  accounts() {
    return this.db
      .prepare("SELECT * FROM accounts WHERE deletedAt IS NULL ORDER BY rowid")
      .all();
  }
  config() {
    const row = this.db
        .prepare("SELECT * FROM transfer_lab_config WHERE id=1")
        .get(),
      accounts = this.accounts();
    const active = new Set(accounts.map((a) => a.id));
    return row
      ? {
          ...row,
          routes: JSON.parse(row.routes).filter(
            (r) => active.has(r.from) && active.has(r.to),
          ),
        }
      : {
          id: 1,
          version: 0,
          maxDays: 1,
          basisPoints: 0,
          routes: suggestedRoutes(accounts),
        };
  }
  normalize(values) {
    if (
      !values ||
      !Number.isInteger(values.maxDays) ||
      values.maxDays < 0 ||
      values.maxDays > 31 ||
      !Number.isInteger(values.basisPoints) ||
      values.basisPoints < 0 ||
      values.basisPoints > 1000 ||
      !Array.isArray(values.routes)
    )
      throw new Error(
        "Choose 0–31 calendar days and 0–10% amount tolerance, with up to two decimals.",
      );
    const ids = new Set(this.accounts().map((a) => a.id)),
      seen = new Set(),
      routes = [];
    for (const r of values.routes) {
      if (!r || r.from === r.to || !ids.has(r.from) || !ids.has(r.to))
        throw new Error(
          "Routes must connect two different active accounts. Refresh the setup.",
        );
      const key = JSON.stringify([r.from, r.to]);
      if (!seen.has(key)) {
        routes.push({ from: r.from, to: r.to });
        seen.add(key);
      }
    }
    routes.sort(
      (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    );
    return { maxDays: values.maxDays, basisPoints: values.basisPoints, routes };
  }
  state() {
    return { accounts: this.accounts(), config: this.config() };
  }
  save(values, version) {
    return this.imports.review.atomic(() => {
      const config = this.normalize(values);
      if (this.config().version !== version)
        throw new Error("Transfer setup changed. Reload before saving.");
      this.db
        .prepare(
          "INSERT INTO transfer_lab_config(id,maxDays,basisPoints,routes,version) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET maxDays=excluded.maxDays,basisPoints=excluded.basisPoints,routes=excluded.routes,version=excluded.version",
        )
        .run(
          config.maxDays,
          config.basisPoints,
          JSON.stringify(config.routes),
          version + 1,
        );
      return this.config();
    });
  }
  preview(values, simulation = false) {
    if (typeof simulation !== "boolean")
      throw new Error("Choose a valid preview mode.");
    const settings = this.normalize(values),
      records = this.imports.review.records(),
      accounts = this.accounts();
    const token = createHash("sha256")
      .update(
        JSON.stringify({
          settings,
          accounts,
          config: this.config(),
          records,
          simulation,
        }),
      )
      .digest("hex");
    return {
      ...transferLabCandidates(
        simulation ? unlinkedTransferCopy(records) : records,
        settings,
      ),
      simulation,
      backtest: transferLabBacktest(records, settings),
      settings,
      token,
    };
  }
  selection(values, token, keys, simulation) {
    const preview = this.preview(values, simulation);
    if (token !== preview.token)
      throw new Error(
        "Transactions or setup changed. Run the preview again before linking.",
      );
    if (
      !Array.isArray(keys) ||
      !keys.length ||
      new Set(keys).size !== keys.length
    )
      throw new Error("Select one or more distinct pairs.");
    const edges = new Map(preview.edges.map((e) => [e.key, e])),
      used = new Set();
    const chosen = keys.map((key) => {
      const e = edges.get(key);
      if (!e)
        throw new Error(
          "A selected pair no longer qualifies. Run the preview again.",
        );
      for (const id of [e.outgoing.id, e.incoming.id]) {
        if (used.has(id))
          throw new Error(
            "A transaction can only belong to one selected pair.",
          );
        used.add(id);
      }
      return e;
    });
    return { preview, chosen };
  }
  validate(values, token, keys) {
    const { chosen } = this.selection(values, token, keys, true);
    return { validated: chosen.length, simulation: true };
  }
  apply(values, token, keys) {
    return this.imports.review.atomic(() => {
      const { preview, chosen } = this.selection(values, token, keys, false);
      for (const { outgoing, incoming } of chosen)
        this.imports.review.financialWrite(
          outgoing.id,
          outgoing.version,
          { kind: "transfer", reviewed: true, transferId: incoming.id },
          preview.settings.basisPoints,
        );
      return { linked: chosen.length };
    });
  }
}
module.exports = { TransferLabStore };
