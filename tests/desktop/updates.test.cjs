// Releases and updates: where a build keeps its workspace, and how the update manager moves
// through its states against the updater without touching the network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { resolveWorkspace } = require("../../electron/workspace-location.cjs");
const { createUpdateManager, parseUpdateConfig, friendly } = require("../../electron/updates.cjs");

const appData = path.join("C:", "Users", "x", "AppData", "Roaming"), repoRoot = path.join("D:", "repo");

test("workspace location: environment, then pointer file, then build defaults", () => {
  const dev = resolveWorkspace({ env: {}, isPackaged: false, appData, repoRoot, pointer: {} });
  assert.deepEqual([dev.dataDir, dev.configurationDir, dev.source], [path.join(repoRoot, "private", "desktop"), path.join(repoRoot, "configuration"), "default"]);
  const release = resolveWorkspace({ env: {}, isPackaged: true, appData, repoRoot, pointer: {} });
  assert.deepEqual([release.dataDir, release.configurationDir], [path.join(appData, "Urbanomics", "private"), path.join(appData, "Urbanomics", "configuration")]);
  const pointed = resolveWorkspace({ env: {}, isPackaged: true, appData, repoRoot, pointer: { dataDir: "D:\\ledger", configurationDir: "D:\\repo\\configuration", updateToken: " t0k " } });
  assert.deepEqual([pointed.dataDir, pointed.configurationDir, pointed.source, pointed.updateToken], ["D:\\ledger", "D:\\repo\\configuration", "pointer", "t0k"]);
  const pointedDataOnly = resolveWorkspace({ env: {}, isPackaged: true, appData, repoRoot, pointer: { dataDir: "D:\\ledger" } });
  assert.equal(pointedDataOnly.configurationDir, null, "an explicit data folder without a configuration folder exports nothing");
  const env = resolveWorkspace({ env: { URBANOMICS_DATA_DIR: "E:\\d", URBANOMICS_CONFIG_DIR: "E:\\c", URBANOMICS_UPDATE_TOKEN: "env" }, isPackaged: true, appData, repoRoot, pointer: { dataDir: "D:\\ledger", updateToken: "file" } });
  assert.deepEqual([env.dataDir, env.configurationDir, env.source, env.updateToken], ["E:\\d", "E:\\c", "environment", "env"]);
  const envDataOnly = resolveWorkspace({ env: { URBANOMICS_DATA_DIR: "E:\\synthetic" }, isPackaged: true, appData, repoRoot, pointer: { dataDir: "D:\\ledger", configurationDir: "D:\\real\\configuration" } });
  assert.equal(envDataOnly.configurationDir, null, "a synthetic data folder from the environment never exports into the pointer file's real configuration");
  const pointedConfigOnly = resolveWorkspace({ env: {}, isPackaged: true, appData, repoRoot, pointer: { configurationDir: "D:\\real\\configuration" } });
  assert.deepEqual([pointedConfigOnly.dataDir, pointedConfigOnly.configurationDir], [path.join(appData, "Urbanomics", "private"), "D:\\real\\configuration"]);
  assert.equal(resolveWorkspace({ env: {}, isPackaged: false, appData, repoRoot, pointer: null }).pointerFile, path.join(appData, "Urbanomics", "workspace.json"));
});

test("update config and error wording", () => {
  assert.deepEqual(parseUpdateConfig("provider: github\nowner: derekurban\nrepo: 'urbanomics-releases'\nupdaterCacheDirName: urbanomics-updater\n"), { provider: "github", owner: "derekurban", repo: "urbanomics-releases" });
  assert.match(friendly(new Error("HttpError: 404 Not Found")), /release feed could not be found/);
  assert.match(friendly(new Error("net::ERR_INTERNET_DISCONNECTED")), /No connection/);
  assert.equal(friendly(new Error("odd\nsecond line")), "odd");
});

function fakeUpdater() {
  const updater = new EventEmitter();
  updater.calls = [];
  updater.setFeedURL = (options) => updater.calls.push(["feed", options]);
  updater.checkForUpdates = async () => { updater.calls.push(["check"]); updater.emit("checking-for-update"); return null; };
  updater.quitAndInstall = (...a) => updater.calls.push(["install", ...a]);
  return updater;
}

test("development and browser builds report updates as unavailable", async () => {
  const emitted = [];
  const manager = createUpdateManager({ autoUpdater: null, enabled: false, version: "0.2.0", build: "development", emit: (n, v) => emitted.push([n, v]) });
  assert.deepEqual(manager.state(), { supported: false, build: "development", version: "0.2.0", status: "idle", latest: null, percent: 0, error: "", checkedAt: null });
  assert.equal((await manager.check()).supported, false);
  assert.throws(() => manager.install(), /not available/);
  manager.start(); manager.stop();
  assert.deepEqual(emitted, []);
});

test("an installed release checks, downloads, reports progress and installs on request", async () => {
  const updater = fakeUpdater(), emitted = [], logged = [], timers = { setTimeout: (fn, ms) => { timers.delays.push(ms); return 1; }, setInterval: (fn, ms) => { timers.delays.push(ms); return 2; }, clearTimeout: () => timers.cleared.push("t"), clearInterval: () => timers.cleared.push("i"), delays: [], cleared: [] };
  const manager = createUpdateManager({ autoUpdater: updater, enabled: true, version: "0.2.0", build: "release", emit: (n, v) => emitted.push([n, v.status, v.percent, v.latest]), log: (...a) => logged.push(a), timers, now: () => "2026-10-02T20:00:00.000Z", token: "secret", config: { provider: "github", owner: "derekurban", repo: "urbanomics-releases" } });
  assert.deepEqual(updater.calls[0], ["feed", { provider: "github", owner: "derekurban", repo: "urbanomics-releases", private: true, token: "secret" }], "a token switches the feed to the private provider");
  assert.equal(updater.autoDownload, true); assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(manager.state().supported, true);
  assert.throws(() => manager.install(), /No update is ready/);
  const checked = await manager.check();
  assert.equal(checked.status, "checking");
  updater.emit("update-available", { version: "0.2.1" });
  assert.equal((await manager.check()).status, "downloading", "a second check during a download is ignored");
  assert.equal(updater.calls.filter((c) => c[0] === "check").length, 1);
  updater.emit("download-progress", { percent: 42.6 });
  assert.equal(manager.state().percent, 43);
  updater.emit("update-downloaded", { version: "0.2.1" });
  assert.deepEqual([manager.state().status, manager.state().latest, manager.state().checkedAt], ["ready", "0.2.1", "2026-10-02T20:00:00.000Z"]);
  updater.emit("error", new Error("late failure"));
  assert.equal(manager.state().status, "ready", "a late error does not undo a downloaded update");
  manager.install();
  assert.deepEqual(updater.calls.at(-1), ["install", true, true]);
  assert.deepEqual(emitted.map((e) => e[1]), ["checking", "downloading", "downloading", "ready"]);
  manager.start();
  assert.deepEqual(timers.delays, [15000, 6 * 60 * 60 * 1000]);
  manager.stop();
  assert.deepEqual(timers.cleared, ["t", "i"]);
  assert.ok(logged.some((l) => l[0] === "ready"));
});

test("a failed check reports a readable error and stays checkable", async () => {
  const updater = fakeUpdater();
  updater.checkForUpdates = async () => { updater.emit("checking-for-update"); throw new Error("HttpError: 404 Not Found"); };
  const manager = createUpdateManager({ autoUpdater: updater, enabled: true, version: "0.2.0", build: "release", now: () => "now" });
  const state = await manager.check();
  assert.deepEqual([state.status, state.checkedAt], ["error", "now"]);
  assert.match(state.error, /release feed could not be found/);
  assert.equal(updater.calls.filter((c) => c[0] === "feed").length, 0, "no token means the public provider from app-update.yml");
  updater.checkForUpdates = async () => { updater.emit("checking-for-update"); updater.emit("update-not-available", { version: "0.2.0" }); };
  assert.equal((await manager.check()).status, "current");
});
