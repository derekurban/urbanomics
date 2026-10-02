// Schema 22: a repayment may only reduce an expense that is shared with the payer. Expenses that took
// repayments before any split was agreed get a split that records what each person paid, with the
// remainder as the user's own share. Original payloads are kept under backups/admin before any write.
const fs = require("node:fs");
const path = require("node:path");

function recordSharesForRepayments(db, root, now = new Date()) {
  const items = db.prepare("SELECT transaction_id AS id, payload, version FROM review_items").all()
    .map(r => ({id: r.id, version: r.version, review: JSON.parse(r.payload)}));
  const cash = db.prepare("SELECT id, payload FROM cash_receipts WHERE voidedAt IS NULL").all().map(r => ({id: r.id, review: JSON.parse(r.payload)}));
  const amounts = new Map(db.prepare("SELECT id, payload FROM transactions").all().map(t => [t.id, JSON.parse(t.payload).amountCents]));
  const paid = new Map();
  for (const r of [...items, ...cash]) {
    if (r.review.kind !== "repayment" || !r.review.personId) continue;
    for (const a of r.review.allocations || []) {
      if (a.cents <= 0) continue;
      const byPerson = paid.get(a.id) || {};
      byPerson[r.review.personId] = (byPerson[r.review.personId] || 0) + a.cents;
      paid.set(a.id, byPerson);
    }
  }
  const changes = [], skipped = [];
  for (const item of items) {
    const byPerson = paid.get(item.id);
    if (!byPerson || (item.review.shares && item.review.shares.length) || item.review.kind === "transfer") continue;
    const amount = Math.abs(amounts.get(item.id) || 0), repaid = Object.values(byPerson).reduce((n, c) => n + c, 0);
    if (!amount || repaid > amount) { skipped.push({id: item.id, reason: repaid > amount ? "repayments exceed the expense" : "no amount"}); continue; }
    const shares = [{id: "me", cents: amount - repaid}, ...Object.entries(byPerson).map(([id, cents]) => ({id, cents}))];
    changes.push({id: item.id, version: item.version, before: item.review, after: {...item.review, shares, sharesSource: "recorded", kind: item.review.kind === "unreviewed" ? "expense" : item.review.kind}});
  }
  if (changes.length) {
    const dir = path.join(root, "backups", "admin");
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, `before-shares-migration-${now.toISOString().replace(/[:.]/g, "-")}.json`),
      JSON.stringify({action: "record-shares-for-repayments", created: now.toISOString(), records: changes.map(c => ({id: c.id, version: c.version, review: c.before})), skipped}, null, 1));
    const update = db.prepare("UPDATE review_items SET payload=?, version=?, updated=? WHERE transaction_id=? AND version=?");
    for (const c of changes) update.run(JSON.stringify(c.after), c.version + 1, now.toISOString(), c.id, c.version);
  }
  return {updated: changes.length, skipped};
}
module.exports = {recordSharesForRepayments};
