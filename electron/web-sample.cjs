const fs = require("node:fs"),
  path = require("node:path");
const { csv } = require("./imports/parsers.cjs");
function seedWebSample(store) {
  store.addAccount("Sample chequing", "pc", "chequing", {
    prefixRegex: "sample",
    color: "#658e83",
  });
  const bucket = store.review.entity("bucket", {
    name: "Food",
    color: "#89b78a",
    gradientStart: "#4a936d",
    gradientEnd: "#cae2a5",
  });
  const groceries = store.review.entity("category", {
    name: "Groceries",
    color: "#89b78a",
    parentId: bucket,
  });
  const dining = store.review.entity("category", {
    name: "Restaurants",
    color: "#89b78a",
    parentId: bucket,
  });
  const paycheck = store.review.entity("category", {
    name: "Paycheck",
    flowType: "income",
    color: "#89b78a",
  });
  const now = new Date(),
    year = now.getFullYear(),
    month = now.getMonth() + 1;
  for (let offset = 2; offset >= 0; offset--) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 15));
    const m = String(date.getUTCMonth() + 1).padStart(2, "0"),
      y = date.getUTCFullYear();
    const rows = [
      ["Green market", -80 - offset * 5],
      ["Corner grocer", -45 - offset * 2],
      ["Local foods", -30 - offset * 3],
      ["Juniper dinner", -120 - offset * 10],
      ["Sample paycheck", 2400],
    ];
    const file = path.join(store.root, `sample-${y}-${m}.csv`);
    fs.writeFileSync(
      file,
      csv([
        ["Description", "Type", "Card Holder Name", "Date", "Time", "Amount"],
        ...rows.map(([name, amount]) => [
          name,
          "SYNTHETIC",
          "SAMPLE",
          `${m}/15/${y}`,
          "12:00 AM",
          String(amount),
        ]),
      ]),
    );
    store.enqueue([file]);
    fs.unlinkSync(file);
  }
  for (const row of store.review.records()) {
    const tag =
      row.amountCents > 0
        ? paycheck
        : row.description === "Juniper dinner"
          ? dining
          : groceries;
    store.review.organize([
      {
        id: row.id,
        version: row.version,
        tags: [{ id: tag, cents: Math.abs(row.amountCents) }],
      },
    ]);
  }
  for (const row of store.review.records().filter((r) => r.amountCents > 0))
    store.review.financial(row.id, row.version, {
      kind: "income",
      incomeType: "paycheck",
    });
}
module.exports = { seedWebSample };
