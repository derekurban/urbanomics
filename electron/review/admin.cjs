const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
class AdminStore {
  constructor(imports) {
    this.imports = imports;
  }
  tagged() {
    return this.imports.review
      .records()
      .filter((row) => row.review.tags.length);
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
          { ...row.review, tags: [] },
          row.version,
        );
      return { count: rows.length, backup };
    });
  }
}
module.exports = { AdminStore };
