// Cut a release: bump the version, commit and tag it, build the Windows installer on the release
// channel, publish it to the releases repository, then push the commit and tag.
//   node scripts/release.cjs <patch|minor|major|x.y.z> [--no-push] [--dry-run]
//   node scripts/release.cjs --republish        (build and publish the current version again)
// Needs a clean tree on main and a GitHub token (GH_TOKEN, or `gh auth token`). The tag and the
// GitHub release are created in the releases repository before electron-builder uploads, because
// GitHub refuses a published release without an existing tag and electron-builder uploads each
// artifact through its own publisher.
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2), bump = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run"), push = !args.includes("--no-push"), republish = args.includes("--republish");
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

function publishTarget() {
  const text = fs.readFileSync(path.join(root, "electron-builder.yml"), "utf8");
  const block = text.slice(text.indexOf("\npublish:"));
  const get = (key) => block.match(new RegExp(`^\\s+${key}:\\s*(.+)$`, "m"))?.[1].trim();
  return { owner: get("owner"), repo: get("repo") };
}
async function ensureRelease({ owner, repo }, tag, token) {
  const api = async (route, init = {}) => {
    const response = await fetch("https://api.github.com" + route, { ...init, headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "urbanomics-release", "Content-Type": "application/json", ...(init.headers || {}) } });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
  };
  const existing = await api(`/repos/${owner}/${repo}/releases/tags/${tag}`);
  if (existing.ok) { console.log(`Release ${tag} already exists in ${owner}/${repo}; uploading into it.`); return; }
  const repository = await api(`/repos/${owner}/${repo}`);
  if (!repository.ok) fail(`Cannot read ${owner}/${repo}: ${repository.status}.`);
  const head = await api(`/repos/${owner}/${repo}/git/ref/heads/${repository.body.default_branch}`);
  if (!head.ok) fail(`${owner}/${repo} has no commits on ${repository.body.default_branch}; add a README first.`);
  const ref = await api(`/repos/${owner}/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: head.body.object.sha }) });
  if (!ref.ok && !/already exists/i.test(ref.body.message || "")) fail(`Could not create tag ${tag} in ${owner}/${repo}: ${ref.body.message || ref.status}.`);
  const release = await api(`/repos/${owner}/${repo}/releases`, { method: "POST", body: JSON.stringify({ tag_name: tag, name: tag.replace(/^v/, ""), draft: false, prerelease: false, body: `Urbanomics ${tag}` }) });
  if (!release.ok) fail(`Could not create release ${tag}: ${release.body.message || release.status}.`);
  console.log(`Created release ${tag} in ${owner}/${repo}.`);
}

async function main() {
  if (!bump && !republish) fail("Usage: node scripts/release.cjs <patch|minor|major|x.y.z> [--no-push] [--dry-run] | --republish");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const current = pkg.version.split(".").map(Number);
  const next = republish ? pkg.version
    : /^\d+\.\d+\.\d+$/.test(bump) ? bump
    : bump === "major" ? `${current[0] + 1}.0.0`
    : bump === "minor" ? `${current[0]}.${current[1] + 1}.0`
    : bump === "patch" ? `${current[0]}.${current[1]}.${current[2] + 1}`
    : fail(`Unknown bump "${bump}".`);
  const tag = `v${next}`;

  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("Release from main.");
  const dirty = git("status", "--porcelain", "--untracked-files=no");
  if (dirty) fail(`Commit or stash tracked changes first:\n${dirty}`);
  if (republish) { if (!git("tag", "--list", tag)) fail(`Tag ${tag} does not exist; cut the release first.`); }
  else if (git("tag", "--list", tag)) fail(`Tag ${tag} already exists.`);
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) { try { token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim(); } catch {} }
  if (!token) fail("No GitHub token. Set GH_TOKEN or sign in with `gh auth login`.");
  const target = publishTarget();
  if (!target.owner || !target.repo) fail("electron-builder.yml has no publish owner/repo.");

  console.log(`${republish ? "Republishing" : "Releasing"} Urbanomics ${pkg.version}${republish ? "" : ` → ${next}`} (${tag})${dryRun ? " [dry run]" : ""}`);
  if (!republish) {
    run("npm", ["version", next, "--no-git-tag-version"]);
    run("git", ["add", "package.json", ...(fs.existsSync(path.join(root, "package-lock.json")) ? ["package-lock.json"] : [])]);
    run("git", ["commit", "-m", `Release ${tag}`]);
    run("git", ["tag", "-a", tag, "-m", `Urbanomics ${tag}`]);
  }
  run("npm", ["run", "build"]);
  if (!dryRun) await ensureRelease(target, tag, token);
  run("npx", ["electron-builder", "--win", "nsis", "--publish", "always", "--config", "electron-builder.release.yml"], { env: { ...process.env, GH_TOKEN: token } });
  if (push) run("git", ["push", "origin", "main", "--follow-tags"]);
  console.log(`Published ${tag}. Installed copies pick it up on their next check.`);
}
main().catch((error) => fail(error.message));
