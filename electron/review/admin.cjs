const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
class AdminStore {
  constructor(imports) {
    this.imports = imports;
  }
  previewReset(){return require('./admin-reset.cjs').previewReset(this.imports);}
  resetWorkspace(token,confirmation){return require('./admin-reset.cjs').resetWorkspace(this.imports,token,confirmation);}
  tagged() {
    return this.imports.review
      .records()
      .filter((row) => row.review.tags.length);
  }
  transfers() {
    return this.imports.review.records().filter(row => row.review.kind === "transfer" || row.review.transferId);
  }
  previewUnlink(rows = this.transfers()) {
    const byId = new Map(rows.map(row => [row.id, row]));
    const paired = rows.filter(row => {
      const other = byId.get(row.review.transferId);
      return other && other.id !== row.id && other.review.transferId === row.id;
    });
    return {
      count: rows.length,
      pairs: paired.length / 2,
      unpaired: rows.length - paired.length,
      archived: rows.filter(row => row.deleted).length,
      token: createHash("sha256").update(JSON.stringify(["unlink-all-transfers", rows.map(row =>
        [row.id, row.version, row.deleted, row.review]).sort((a,b) => a[0].localeCompare(b[0]))])).digest("hex"),
    };
  }
  unlinkAll(token) {
    return this.imports.review.atomic(() => {
      const rows = this.transfers(), current = this.previewUnlink(rows);
      if (typeof token !== "string" || token !== current.token)
        throw new Error("Transactions changed. Close this dialog and preview the action again.");
      if (!rows.length) return { count: 0, pairs: 0, backup: null };
      const directory = path.join(this.imports.root, "backups", "admin");
      fs.mkdirSync(directory, { recursive: true });
      const backup = path.join(directory, "before-unlink-transfers-" + randomUUID() + ".json");
      const fd = fs.openSync(backup, "wx");
      try {
        fs.writeFileSync(fd, JSON.stringify({ action: "unlink-all-transfers", created: this.imports.now().toISOString(),
          records: rows.map(({id, version, review, manual}) => ({id, version, review, manual: !!manual})),
        }, null, 2));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      // Write each side once, including archived accounts and incomplete legacy
      // links. Preserve tags, events, person associations and unrelated purposes.
      for (const row of rows) this.imports.review.write(row.id, {
        ...row.review,
        ...(row.review.kind === "transfer" ? {kind: "unreviewed", reviewed: false} : {}),
        transferId: "", transferFeeCents: 0, transferExcessCents: 0,
      }, row.version);
      return {count: rows.length, pairs: current.pairs, backup};
    });
  }
  /* Every split, repayment and deduction: expenses with shares and receipts (bank or cash) with allocations. */
  shared() {
    return this.imports.review.records().filter(row => (row.review.shares && row.review.shares.length) || row.review.sharesSource || row.review.kind === "repayment" || (row.review.allocations || []).some(a => a.cents > 0));
  }
  previewShares(rows = this.shared()) {
    const repayments = rows.filter(row => row.review.kind === "repayment" || (row.review.allocations || []).some(a => a.cents > 0));
    return {
      count: rows.length,
      shared: rows.filter(row => row.review.shares && row.review.shares.length).length,
      repayments: repayments.length,
      cash: repayments.filter(row => row.manual).length,
      archived: rows.filter(row => row.deleted).length,
      token: createHash("sha256").update(JSON.stringify(["clear-shares", rows.map(row => [row.id, row.version, row.deleted, row.review]).sort((a, b) => a[0].localeCompare(b[0]))])).digest("hex"),
    };
  }
  clearShares(token) {
    return this.imports.review.atomic(() => {
      const rows = this.shared(), current = this.previewShares(rows);
      if (typeof token !== "string" || token !== current.token)
        throw new Error("Transactions changed. Close this dialog and preview the action again.");
      if (!rows.length) return { count: 0, shared: 0, repayments: 0, backup: null };
      const directory = path.join(this.imports.root, "backups", "admin");
      fs.mkdirSync(directory, { recursive: true });
      const backup = path.join(directory, "before-clear-shares-" + randomUUID() + ".json");
      const fd = fs.openSync(backup, "wx");
      try {
        fs.writeFileSync(fd, JSON.stringify({ action: "clear-shares", created: this.imports.now().toISOString(),
          records: rows.map(({id, version, review, manual}) => ({id, version, review, manual: !!manual})),
        }, null, 2));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      // Expenses lose their split; repayments become income (with income tags) or unsorted. Tags, events and transfers stay.
      for (const row of rows) {
        const review = { ...row.review, shares: null, allocations: [], remainder: 0 };
        delete review.sharesSource;
        if (row.review.kind === "repayment") {
          review.personId = "";
          review.kind = row.review.tags.some(p => p.cents > 0) ? "income" : "unreviewed";
          review.reviewed = review.kind !== "unreviewed";
        }
        this.imports.review.write(row.id, review, row.version);
      }
      return { count: rows.length, shared: current.shared, repayments: current.repayments, backup };
    });
  }
  preview(rows = this.tagged()) {
    return {
      count: rows.length,
      archived: rows.filter((r) => r.deleted).length,
      cash: rows.filter((r) => r.manual).length,
      token: createHash("sha256")
        .update(
          JSON.stringify(
            rows
              .map((r) => [r.id, r.version, r.review])
              .sort((a, b) => a[0].localeCompare(b[0])),
          ),
        )
        .digest("hex"),
    };
  }
  untagAll(token) {
    return this.imports.review.atomic(() => {
      const rows = this.tagged(),
        current = this.preview(rows);
      if (typeof token !== "string" || token !== current.token)
        throw new Error(
          "Transactions changed. Close this dialog and preview the action again.",
        );
      if (!rows.length) return { count: 0, backup: null };
      const directory = path.join(this.imports.root, "backups", "admin");
      fs.mkdirSync(directory, { recursive: true });
      const backup = path.join(
        directory,
        "before-untag-" + randomUUID() + ".json",
      );
      const fd = fs.openSync(backup, "wx");
      try {
        fs.writeFileSync(
          fd,
          JSON.stringify(
            {
              action: "untag-all",
              created: this.imports.now().toISOString(),
              records: rows.map(({ id, version, review, manual }) => ({
                id,
                version,
                review,
                manual: !!manual,
              })),
            },
            null,
            2,
          ),
        );
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      for (const row of rows)
        this.imports.review.write(
          row.id,
          { ...row.review, tags: [], templateReview: undefined },
          row.version,
        );
      return { count: rows.length, backup };
    });
  }
}
module.exports = { AdminStore };
