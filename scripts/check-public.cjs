// Guard for a public repository: refuse to commit (or release) content that belongs in the private
// workspace. Checks the staged files by default, or the whole tree with --all, for configuration
// SQL dumps, bank exports, screenshots, Tailscale addresses, email addresses, tokens, user-profile
// and machine paths, and any term listed in private/sensitive-terms.txt (one per line, git-ignored,
// maintained locally).
//   node scripts/check-public.cjs            staged files (pre-commit hook)
//   node scripts/check-public.cjs --all      every tracked file (release script, CI)
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const all = process.argv.includes("--all");
const git = (...argv) => execFileSync("git", argv, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const files = (all ? git("ls-files", "-z") : git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR")).split("\0").filter(Boolean);
const content = (file) => (all ? fs.readFileSync(path.join(root, file)) : Buffer.from(git("show", `:${file}`), "utf8"));
const denylistFile = path.join(root, "private", "sensitive-terms.txt");
const denylist = fs.existsSync(denylistFile) ? fs.readFileSync(denylistFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length >= 4) : [];

const blockedPaths = [
  { test: (f) => /\.sql$/i.test(f), why: "configuration SQL exports belong in the private configuration repository" },
  { test: (f) => /\.(csv|tsv|ofx|qfx|qif|xlsx?|sqlite3?|db|log)$/i.test(f), why: "bank exports, databases and logs never belong in the repository" },
  { test: (f) => /\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(f) && !/^docs\//.test(f), why: "screenshots and captures are the likeliest leak; only docs/ may hold images" },
  { test: (f) => /(^|\/)(private|data|dropbox|inbox|backups|reports|release)\//.test(f), why: "this folder is private by design" },
  { test: (f) => /remote-access\.json$|remote-status\.json$|workspace\.json$|\.env(\..*)?$|\.pem$|\.key$|\.p12$|\.pfx$/i.test(f), why: "local settings and secrets" },
];
const patterns = [
  { re: /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b(?!\/)/g, why: "Tailscale address" },
  { re: /\b[A-Za-z0-9._%+-]+@(?:gmail|outlook|hotmail|icloud|yahoo|proton)\.[a-z]{2,}\b/gi, why: "personal email address" },
  { re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|tskey-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,})\b/g, why: "token" },
  { re: /[A-Za-z]:[\\/]Users[\\/](?!x\b)[^\\/\s"']+/g, why: "user profile path" },
  { re: /[A-Za-z]:[\\/]Working[\\/]/g, why: "machine-specific path" },
  { re: /^INSERT INTO "(?:review_entities|accounts|transaction_aliases|transaction_rules|rules)"/m, why: "configuration SQL rows" },
];
// Synthetic values that tests use on purpose.
const allowed = { "tests/desktop/remote-access.test.cjs": ["100.64.0.1", "100.64.0.2", "100.127.255.255", "100.64.0.999"], "scripts/check-public.cjs": ["100.64.0.1", "100.64.0.2", "100.127.255.255", "100.64.0.999"] };

const findings = [];
for (const file of files) {
  for (const b of blockedPaths) if (b.test(file)) findings.push({ file, why: b.why });
  let text;
  try { const buffer = content(file); if (buffer.includes(0)) continue; text = buffer.toString("utf8"); } catch { continue; }
  for (const p of patterns) {
    const hits = (text.match(p.re) || []).filter((v) => !(allowed[file] || []).includes(v));
    if (hits.length) findings.push({ file, why: `${p.why} (${hits.length})` });
  }
  const lower = text.toLowerCase();
  for (const term of denylist) if (lower.includes(term.toLowerCase())) findings.push({ file, why: `term from private/sensitive-terms.txt (${denylist.indexOf(term) + 1})` });
}
if (findings.length) {
  console.error(`Not public-safe (${all ? "tracked files" : "staged changes"}):`);
  for (const f of findings) console.error(`  ${f.file}: ${f.why}`);
  console.error("Move the data to the private workspace, or use `git commit --no-verify` only for a deliberate exception.");
  process.exit(1);
}
console.log(`Public-safe: ${files.length} ${all ? "tracked" : "staged"} files checked${denylist.length ? ` against ${denylist.length} local terms` : ""}.`);
