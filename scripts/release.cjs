// Cut a release: bump the version, commit and tag it, build the Windows installer on the release
// channel, publish it to the releases repository, then push the commit and tag.
//   node scripts/release.cjs <patch|minor|major|x.y.z> [--no-push] [--dry-run]
// Needs a clean tree on main and a GitHub token (GH_TOKEN, or `gh auth token`).
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2), bump = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run"), push = !args.includes("--no-push");
const fail = (message) => { console.error(message); process.exit(1); };
const run = (command, argv, options = {}) => {
  console.log(`> ${command} ${argv.join(" ")}`);
  if (dryRun) return "";
  // npm and npx are .cmd shims on Windows and need a shell; git takes its arguments directly, so
  // a commit message with spaces survives.
  const result = spawnSync(command, argv, { cwd: root, stdio: "inherit", shell: process.platform === "win32" && command !== "git", ...options });
  if (result.status !== 0) fail(`${command} failed.`);
};
const git = (...argv) => execFileSync("git", argv, { cwd: root, encoding: "utf8" }).trim();

if (!bump) fail("Usage: node scripts/release.cjs <patch|minor|major|x.y.z> [--no-push] [--dry-run]");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const current = pkg.version.split(".").map(Number);
const next = /^\d+\.\d+\.\d+$/.test(bump) ? bump
  : bump === "major" ? `${current[0] + 1}.0.0`
  : bump === "minor" ? `${current[0]}.${current[1] + 1}.0`
  : bump === "patch" ? `${current[0]}.${current[1]}.${current[2] + 1}`
  : fail(`Unknown bump "${bump}".`);
const tag = `v${next}`;

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("Release from main.");
const dirty = git("status", "--porcelain", "--untracked-files=no");
if (dirty) fail(`Commit or stash tracked changes first:\n${dirty}`);
if (git("tag", "--list", tag)) fail(`Tag ${tag} already exists.`);
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) { try { token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim(); } catch {} }
if (!token) fail("No GitHub token. Set GH_TOKEN or sign in with `gh auth login`.");

console.log(`Releasing Urbanomics ${pkg.version} → ${next} (${tag})${dryRun ? " [dry run]" : ""}`);
run("npm", ["version", next, "--no-git-tag-version"]);
run("git", ["add", "package.json", ...(fs.existsSync(path.join(root, "package-lock.json")) ? ["package-lock.json"] : [])]);
run("git", ["commit", "-m", `Release ${tag}`]);
run("git", ["tag", "-a", tag, "-m", `Urbanomics ${tag}`]);
run("npm", ["run", "build"]);
run("npx", ["electron-builder", "--win", "nsis", "--publish", "always", "--config", "electron-builder.release.yml"], { env: { ...process.env, GH_TOKEN: token } });
if (push) run("git", ["push", "origin", "main", "--follow-tags"]);
console.log(`Published ${tag}. Installed copies pick it up on their next check.`);
