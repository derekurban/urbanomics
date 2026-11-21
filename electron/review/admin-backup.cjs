// Settings → Maintenance → Back up the workspace. A backup is SQLite's own consistent copy of the open
// database (VACUUM INTO), never a file copy of a live database, written to the private workspace's backups/
// folder. The list also shows the recovery copies the maintenance actions write before they change anything.
const fs = require("node:fs"), path = require("node:path");

const recovery = [
  ["before-untag-", "Before Reset every tag", "tags"],
  ["before-clear-shares-", "Before Clear all splits and repayments", "splits"],
  ["before-unlink-transfers-", "Before Unlink every transfer", "transfers"],
];
// Local time, so the name matches the date the page shows: workspace-2026-11-21_15-44-12.sqlite.
const two = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;

function folder(store) {
  const dir = path.join(store.root, "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** A complete copy of the workspace database, consistent at one moment. */
function backupWorkspace(store) {
  const dir = folder(store), created = store.now();
  let name = `workspace-${stamp(created)}.sqlite`, n = 1;
  while (fs.existsSync(path.join(dir, name))) name = `workspace-${stamp(created)}-${++n}.sqlite`;
  const file = path.join(dir, name);
  store.db.prepare("VACUUM INTO ?").run(file);
  return { name, folder: "backups", created: created.toISOString(), size: fs.statSync(file).size };
}

function createdOf(file, fallback) {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 400), match = head.match(/"created":\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {}
  return fallback;
}

/** Workspace backups and recovery copies, newest first. Names and dates only; never their contents. */
function listBackups(store) {
  const dir = folder(store), items = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
    if (entry.isFile() && /^workspace-.*\.sqlite$/.test(entry.name)) {
      const stat = fs.statSync(path.join(dir, entry.name));
      items.push({ kind: "backup", what: "Backup of the whole workspace", name: entry.name, folder: "backups", created: stat.mtime.toISOString(), size: stat.size });
    }
  const admin = path.join(dir, "admin");
  if (fs.existsSync(admin))
    for (const entry of fs.readdirSync(admin, { withFileTypes: true })) {
      const kind = entry.isFile() && recovery.find(([prefix]) => entry.name.startsWith(prefix) && entry.name.endsWith(".json"));
      if (!kind) continue;
      const file = path.join(admin, entry.name), stat = fs.statSync(file);
      items.push({ kind: "recovery", action: kind[2], what: kind[1], name: entry.name, folder: "backups/admin", created: createdOf(file, stat.mtime.toISOString()), size: stat.size });
    }
  const resets = path.join(store.root, "archive", "workspace-resets");
  if (fs.existsSync(resets))
    for (const entry of fs.readdirSync(resets, { withFileTypes: true })) {
      const db = path.join(resets, entry.name, "workspace.sqlite");
      if (!entry.isDirectory() || !fs.existsSync(db)) continue;
      const stat = fs.statSync(db);
      items.push({ kind: "recovery", action: "reset", what: "Before Start from scratch", name: "workspace.sqlite", folder: `archive/workspace-resets/${entry.name}`, created: createdOf(path.join(resets, entry.name, "manifest.json"), stat.mtime.toISOString()), size: stat.size });
    }
  items.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const last = items.find((i) => i.kind === "backup");
  return { folder: "backups", database: "urbanomics.sqlite", lastBackup: last ? last.created : null, items };
}

module.exports = { backupWorkspace, listBackups };
