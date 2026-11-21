const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { ImportStore } = require("../../electron/imports/store.cjs");
const { createWorkspaceService } = require("../../electron/workspace-service.cjs");
const channels = require("../../electron/api-channels.json");

test("backing up writes a complete, consistent copy into backups/ and lists it with the recovery copies", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-backup-")),
    data = path.join(root, "data"),
    s = new ImportStore(data);
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const tag = s.review.entity("category", { name: "Invented groceries", color: "#78976A" });
  s.addAccount("Invented chequing", "pc", "chequing");

  const empty = s.admin.backups();
  assert.equal(empty.lastBackup, null);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.folder, "backups");

  const made = s.admin.backup();
  assert.match(made.name, /^workspace-.*\.sqlite$/);
  assert.equal(made.folder, "backups");
  const file = path.join(data, "backups", made.name);
  assert.ok(fs.existsSync(file));
  assert.ok(made.size > 0);

  // The copy opens on its own and holds what the workspace held at that moment.
  const copy = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(copy.prepare("SELECT name FROM review_entities WHERE id=?").get(tag).name, "Invented groceries");
    assert.equal(copy.prepare("SELECT COUNT(*) n FROM accounts").get().n, 1);
    assert.equal(copy.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally { copy.close(); }

  // Changes after the backup stay out of it; a second backup never overwrites the first.
  s.review.entity("category", { name: "Invented travel", color: "#78976A" });
  const second = s.admin.backup();
  assert.notEqual(second.name, made.name);
  assert.ok(fs.existsSync(file));

  // Recovery copies from the maintenance actions are listed by what made them, newest first.
  fs.mkdirSync(path.join(data, "backups", "admin"), { recursive: true });
  fs.writeFileSync(path.join(data, "backups", "admin", "before-untag-1.json"), JSON.stringify({ action: "untag-all", created: "2026-01-02T03:04:05.000Z", records: [] }));
  fs.writeFileSync(path.join(data, "backups", "admin", "unrelated.txt"), "not a recovery copy");
  const list = s.admin.backups();
  assert.equal(list.items.filter((i) => i.kind === "backup").length, 2);
  const recovery = list.items.find((i) => i.kind === "recovery");
  assert.equal(recovery.what, "Before Reset every tag");
  assert.equal(recovery.created, "2026-01-02T03:04:05.000Z");
  assert.equal(recovery.folder, "backups/admin");
  assert.equal(list.items.length, 3);
  assert.equal(list.lastBackup, list.items.find((i) => i.kind === "backup").created);
  assert.ok(list.items.every((i) => !("path" in i)), "only names and dates reach the page");

  // Through the service: both channels exist and neither counts as a workspace change.
  const events = [];
  const service = createWorkspaceService({ store: s, platform: { reveal: () => { throw new Error("no folders"); } }, emit: (e) => events.push(e) });
  t.after(() => service.dispose());
  const result = await service.invoke("admin:backup");
  assert.equal(result.ok, true);
  assert.equal((await service.invoke("admin:backups")).value.items.filter((i) => i.kind === "backup").length, 3);
  assert.deepEqual(events, []);
  assert.equal(channels.backupWorkspace, "admin:backup");
  assert.equal(channels.workspaceBackups, "admin:backups");
});
