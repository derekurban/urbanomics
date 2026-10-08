// The Codex CLI bridge. Finds the CLI (or installs it with npm), signs in with ChatGPT through the CLI's
// own app server, lists the models the account can use, and runs one structured prompt per request with
// `codex exec`. The native binary is spawned directly (never through a shell); prompts go in on stdin and
// the answer must match a JSON schema. Runs are ephemeral, read-only and start in an empty folder, so
// Codex sees only what the prompt contains.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const WIN = process.platform === "win32";
const TARGET = {
  "win32-x64": "x86_64-pc-windows-msvc", "win32-arm64": "aarch64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin", "darwin-arm64": "aarch64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-musl", "linux-arm64": "aarch64-unknown-linux-musl",
}[`${process.platform}-${process.arch}`];
const PLATFORM_PACKAGE = `codex-${process.platform}-${process.arch}`;
const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const validModel = (m) => typeof m === "string" && /^[A-Za-z0-9][\w.:-]{0,79}$/.test(m);

/* Folders to look in. An explicit prefix (tests, or a private install) is the only place searched. */
function searchDirs(env) {
  if (env.URBANOMICS_CODEX_PREFIX) {
    const prefix = path.resolve(env.URBANOMICS_CODEX_PREFIX);
    return [WIN ? prefix : path.join(prefix, "bin")];
  }
  const dirs = (env.PATH || env.Path || "").split(path.delimiter).filter(Boolean);
  if (WIN && env.APPDATA) dirs.push(path.join(env.APPDATA, "npm"));
  if (!WIN) {
    const home = os.homedir();
    dirs.push(path.join(home, ".local/bin"), path.join(home, ".npm-global/bin"), "/usr/local/bin", "/opt/homebrew/bin");
  }
  return [...new Set(dirs)];
}
/* The npm package keeps the real binary in a platform package; run that rather than the Node shim. */
function nativeFrom(packageRoot) {
  const bases = [
    path.join(packageRoot, "node_modules", "@openai", PLATFORM_PACKAGE, "vendor"),
    path.join(packageRoot, "..", PLATFORM_PACKAGE, "vendor"),
    path.join(packageRoot, "vendor"),
  ];
  for (const base of bases) {
    const exe = path.join(base, TARGET || "", "bin", WIN ? "codex.exe" : "codex");
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}
function locate(env) {
  for (const dir of searchDirs(env)) {
    try {
      const shim = path.join(dir, WIN ? "codex.cmd" : "codex");
      const pkg = WIN ? path.join(dir, "node_modules", "@openai", "codex") : path.join(dir, "..", "lib", "node_modules", "@openai", "codex");
      if (fs.existsSync(shim) && fs.existsSync(pkg)) {
        const root = fs.realpathSync(pkg), exe = nativeFrom(root);
        if (exe) return { path: exe, packageRoot: root };
      }
      const exe = path.join(dir, WIN ? "codex.exe" : "codex");
      if (fs.existsSync(exe) && fs.statSync(exe).isFile()) return { path: exe, packageRoot: null };
    } catch {}
  }
  return null;
}
/* npm, run as `node npm-cli.js` so no shell is involved. */
function locateNpm(env) {
  for (const dir of (env.PATH || env.Path || "").split(path.delimiter).filter(Boolean)) {
    const node = path.join(dir, WIN ? "node.exe" : "node");
    if (!fs.existsSync(node)) continue;
    for (const cli of [path.join(dir, "node_modules", "npm", "bin", "npm-cli.js"), path.join(dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")])
      if (fs.existsSync(cli)) return { node, cli };
  }
  return null;
}

function run(exe, args, { env, cwd, input, timeout = 60000, onLine } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(exe, args, { env, cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "", stderr = "", done = false;
    const timer = setTimeout(() => { if (!done) { child.kill(); reject(new Error("Codex took too long to answer. Try a faster model or a lower reasoning level.")); done = true; } }, timeout);
    child.stdout.on("data", (d) => { stdout += d; if (onLine) for (const line of String(d).split(/\r?\n/)) if (line.trim()) onLine(line); });
    child.stderr.on("data", (d) => { stderr += d; if (onLine) for (const line of String(d).split(/\r?\n/)) if (line.trim()) onLine(line); });
    child.on("error", (error) => { if (done) return; done = true; clearTimeout(timer); reject(error); });
    child.on("close", (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
}

/* A small JSON-RPC client for `codex app-server` over stdio: account, sign-in and model list. */
class AppServer {
  constructor(exe, env, onNotification) {
    this.exe = exe; this.env = env; this.onNotification = onNotification;
    this.pending = new Map(); this.next = 1; this.ready = null; this.child = null;
  }
  start() {
    if (this.ready) return this.ready;
    this.child = spawn(this.exe, ["app-server"], { env: this.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdin.on("error", () => {});
    this.child.stderr.on("data", () => {});
    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer); this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || "Codex refused the request.")); else resolve(message.result);
      } else if (message.method) this.onNotification(message.method, message.params || {});
    });
    const fail = (error) => {
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(error); }
      this.pending.clear(); this.ready = null; this.child = null;
    };
    this.child.on("error", (error) => fail(error));
    this.child.on("close", () => fail(new Error("The Codex app server stopped.")));
    this.ready = this.call("initialize", { clientInfo: { name: "urbanomics", title: "Urbanomics", version: "1" } }, 20000)
      .then((result) => { this.send({ method: "initialized" }); return result; });
    this.ready.catch(() => this.stop());
    return this.ready;
  }
  send(message) { this.child?.stdin.write(JSON.stringify(message) + "\n"); }
  call(method, params, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (!this.child) { reject(new Error("The Codex app server is not running.")); return; }
      const id = this.next++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Codex did not answer in time.")); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async request(method, params, timeout) { await this.start(); return this.call(method, params, timeout); }
  stop() { try { this.child?.kill(); } catch {} this.child = null; this.ready = null; }
}

function createCodex({ env = process.env, log = () => {} } = {}) {
  let found, foundAt = 0, version = null, server = null, idle = null, models = null, modelsAt = 0;
  let login = { pending: false, loginId: null, authUrl: null, error: "", completedAt: null };
  let install = { running: false, log: [], error: "", finishedAt: null };
  const children = new Set();
  let active = 0, limit = 4;
  const waiting = [];

  function binary(refresh = false) {
    if (refresh || !found || Date.now() - foundAt > 30000) {
      const next = locate(env);
      if (next?.path !== found?.path) { version = null; server?.stop(); server = null; models = null; }
      found = next; foundAt = Date.now();
    }
    return found;
  }
  const childEnv = (exe) => {
    const value = { ...env };
    delete value.CODEX_MANAGED_BY_BUN; delete value.CODEX_MANAGED_BY_PNPM; delete value.ELECTRON_RUN_AS_NODE;
    if (exe.packageRoot) { value.CODEX_MANAGED_PACKAGE_ROOT = exe.packageRoot; value.CODEX_MANAGED_BY_NPM = "1"; }
    return value;
  };
  function app() {
    const exe = binary();
    if (!exe) throw new Error("Install the Codex CLI first.");
    if (!server) server = new AppServer(exe.path, childEnv(exe), (method, params) => {
      if (method === "account/login/completed") {
        login = { ...login, pending: false, error: params.success ? "" : params.error || "Sign-in didn't finish.", completedAt: Date.now() };
        models = null;
      }
    });
    clearTimeout(idle);
    idle = setTimeout(() => { if (!login.pending) { server?.stop(); server = null; } }, 10 * 60 * 1000);
    idle.unref?.();
    return server;
  }
  async function readVersion() {
    const exe = binary();
    if (!exe) return null;
    if (version) return version;
    const result = await run(exe.path, ["--version"], { env: childEnv(exe), timeout: 15000 });
    version = (result.stdout.match(/\d+\.\d+\.\d+[\w.-]*/) || [result.stdout.trim()])[0] || null;
    return version;
  }

  async function status({ refresh = false } = {}) {
    const exe = binary(refresh);
    const base = { installed: !!exe, path: exe?.path || "", version: null, account: null, signedIn: false, login: { ...login }, install: { ...install, log: install.log.slice(-12) }, canInstall: !!locateNpm(env), error: "" };
    if (!exe) return base;
    try {
      base.version = await readVersion();
      const result = await app().request("account/read", {}, 20000);
      base.account = result?.account ? { type: result.account.type, email: result.account.email || "", plan: result.account.planType || "" } : null;
      base.signedIn = !!result?.account;
    } catch (error) {
      base.error = error.message;
    }
    return base;
  }
  async function startLogin() {
    if (login.pending && login.authUrl) return { authUrl: login.authUrl };
    const result = await app().request("account/login/start", { type: "chatgpt" }, 30000);
    if (!result?.authUrl) throw new Error("Codex didn't return a sign-in page.");
    login = { pending: true, loginId: result.loginId, authUrl: result.authUrl, error: "", completedAt: null };
    return { authUrl: result.authUrl };
  }
  async function cancelLogin() {
    if (login.pending && login.loginId) await app().request("account/login/cancel", { loginId: login.loginId }, 15000).catch(() => {});
    login = { pending: false, loginId: null, authUrl: null, error: "", completedAt: null };
    return true;
  }
  async function logout() {
    await app().request("account/logout", {}, 20000);
    models = null;
    return true;
  }
  async function listModels() {
    if (models && Date.now() - modelsAt < 10 * 60 * 1000) return models;
    const result = await app().request("model/list", {}, 30000);
    models = (result?.data || []).filter((m) => !m.hidden && validModel(m.model || m.id)).map((m) => ({
      id: m.model || m.id,
      name: m.displayName || m.model || m.id,
      description: m.description || "",
      efforts: (m.supportedReasoningEfforts || []).map((e) => ({ id: e.reasoningEffort, description: e.description || "" })).filter((e) => EFFORTS.includes(e.id)),
      defaultEffort: m.defaultReasoningEffort || null,
      isDefault: !!m.isDefault,
    }));
    modelsAt = Date.now();
    return models;
  }
  async function installCli() {
    if (install.running) throw new Error("Codex is already installing.");
    const npm = locateNpm(env);
    if (!npm) throw new Error("Installing Codex needs Node.js and npm. Install Node.js from nodejs.org, then try again.");
    install = { running: true, log: [], error: "", finishedAt: null };
    const args = [npm.cli, "install", "--global", "--no-fund", "--no-audit", "@openai/codex@latest"];
    if (env.URBANOMICS_CODEX_PREFIX) args.push("--prefix", path.resolve(env.URBANOMICS_CODEX_PREFIX));
    try {
      const result = await run(npm.node, args, { env, timeout: 10 * 60 * 1000, onLine: (line) => { install.log.push(line.slice(0, 300)); if (install.log.length > 200) install.log.shift(); } });
      if (result.code !== 0) throw new Error(`npm couldn't install Codex (exit ${result.code}). ${result.stderr.trim().split(/\r?\n/).slice(-2).join(" ")}`.trim());
      if (!binary(true)) throw new Error("npm finished, but Codex isn't where npm installs global commands. Check your npm prefix.");
      install = { ...install, running: false, finishedAt: Date.now() };
      return status();
    } catch (error) {
      install = { ...install, running: false, error: error.message, finishedAt: Date.now() };
      throw error;
    }
  }

  /* One structured answer. Runs beyond the limit (Organize's slots, 1–8) wait their turn. */
  async function exec({ prompt, schema, model, effort, timeout = 4 * 60 * 1000 }) {
    const exe = binary();
    if (!exe) throw new Error("Install the Codex CLI first (Settings, Codex).");
    if (model && !validModel(model)) throw new Error("Choose a model from the list.");
    if (effort && !EFFORTS.includes(effort)) throw new Error("Choose a reasoning level from the list.");
    while (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    active++;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-codex-"));
    const started = Date.now();
    try {
      fs.writeFileSync(path.join(dir, "schema.json"), JSON.stringify(schema));
      const args = ["exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only", "--json", "--color", "never",
        "--output-schema", path.join(dir, "schema.json"), "-C", dir];
      if (model) args.push("-m", model);
      if (effort) args.push("-c", `model_reasoning_effort="${effort}"`);
      args.push("-");
      const result = await new Promise((resolve, reject) => {
        const child = spawn(exe.path, args, { env: childEnv(exe), cwd: dir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        children.add(child);
        let out = "", err = "", finished = false;
        const timer = setTimeout(() => { if (!finished) { finished = true; child.kill(); log("exec-timeout", { model, effort, ms: timeout }); reject(new Error("Codex took too long to answer. Try a faster model or a lower reasoning level.")); } }, timeout);
        child.stdout.on("data", (d) => { out += d; });
        child.stderr.on("data", (d) => { err += d; });
        child.on("error", (e) => { if (!finished) { finished = true; clearTimeout(timer); reject(e); } });
        child.on("close", (code) => { children.delete(child); if (!finished) { finished = true; clearTimeout(timer); resolve({ code, out, err }); } });
        child.stdin.on("error", () => {});
        child.stdin.end(prompt);
      });
      let text = null, usage = null, failure = "";
      for (const line of result.out.split(/\r?\n/)) {
        if (!line.trim().startsWith("{")) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "item.completed" && event.item?.type === "agent_message") text = event.item.text;
        else if (event.type === "turn.completed") usage = event.usage || null;
        else if (event.type === "turn.failed") failure = event.error?.message || "Codex couldn't finish.";
        else if (event.type === "error" && event.message) failure = event.message;
      }
      if (failure || text === null) {
        const detail = failure || result.err.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || `Codex stopped (exit ${result.code}).`;
        log("exec-failed", { model, effort, detail });
        throw new Error(/log ?in|sign ?in|auth|401/i.test(detail) ? "Codex isn't signed in. Sign in under Settings, Codex." : friendly(detail));
      }
      let value;
      try { value = JSON.parse(text); } catch { throw new Error("Codex answered in a form the app couldn't read. Try again."); }
      return { value, usage, ms: Date.now() - started, model: model || null, effort: effort || null };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      active--;
      waiting.shift()?.();
    }
  }
  function friendly(detail) {
    const text = String(detail).replace(/\s+/g, " ").trim();
    const status = text.match(/unexpected status (\d{3})/i);
    if (status) return `Codex's service turned the request away (${status[1]}). It usually passes after a short wait.`;
    try { const parsed = JSON.parse(text); if (parsed?.error?.message) return parsed.error.message; } catch {}
    return text.length > 400 ? text.slice(0, 400) + "…" : text;
  }
  function dispose() {
    for (const child of children) try { child.kill(); } catch {}
    children.clear();
    server?.stop(); server = null;
    clearTimeout(idle);
  }
  const setConcurrency = (n) => { limit = Math.max(1, Math.min(8, Math.round(Number(n) || 4))); while (active < limit && waiting.length) waiting.shift()(); };
  return { setConcurrency, status, startLogin, cancelLogin, logout, listModels, installCli, exec, dispose, locate: () => binary(true) };
}
module.exports = { createCodex, locate, EFFORTS };
