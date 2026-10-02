// Release updates. Only an installed release build (package metadata channel "release", with
// electron-builder's app-update.yml beside the app) checks GitHub Releases; development runs,
// unpacked builds and the browser host report that updates are not available. The renderer
// receives every state change and can ask for a check or a restart. A downloaded update
// installs when the user restarts from the app or quits; nothing installs on its own.
const CHECK_DELAY = 15 * 1000, CHECK_EVERY = 6 * 60 * 60 * 1000;

function parseUpdateConfig(text) {
  const get = (key) => text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim().replace(/^['"]|['"]$/g, "") || "";
  return { provider: get("provider"), owner: get("owner"), repo: get("repo") };
}
function friendly(error) {
  const message = String(error?.message || error || "Update check failed.");
  if (/404|cannot find|not found|HttpError: 404/i.test(message)) return "The release feed could not be found. Check that the releases repository is reachable.";
  if (/ENOTFOUND|ECONN|ETIMEDOUT|net::ERR|network/i.test(message)) return "No connection to the release feed. Try again when you are online.";
  return message.split("\n")[0].slice(0, 200);
}
const unavailable = (state) => ({
  state: () => ({ ...state }),
  check: async () => ({ ...state }),
  install() { throw new Error("Updates are not available in this build."); },
  start() {}, stop() {},
});

function createUpdateManager({ autoUpdater, enabled, version, build, emit = () => {}, log = () => {}, token = "", config = null, timers = { setTimeout, setInterval, clearTimeout, clearInterval }, now = () => new Date().toISOString() }) {
  const state = { supported: !!(enabled && autoUpdater), build, version, status: "idle", latest: null, percent: 0, error: "", checkedAt: null };
  if (!state.supported) return unavailable(state);
  const set = (patch) => { Object.assign(state, patch); log(state.status, patch); emit("update", { ...state }); };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = { info: (m) => log("info", m), warn: (m) => log("warn", m), error: (m) => log("error", m), debug: () => {} };
  if (token && config?.owner && config?.repo) autoUpdater.setFeedURL({ provider: "github", owner: config.owner, repo: config.repo, private: true, token });
  autoUpdater.on("checking-for-update", () => set({ status: "checking", error: "" }));
  autoUpdater.on("update-available", (info) => set({ status: "downloading", latest: info?.version || null, percent: 0, error: "" }));
  autoUpdater.on("update-not-available", (info) => set({ status: "current", latest: info?.version || version, percent: 0, error: "", checkedAt: now() }));
  autoUpdater.on("download-progress", (progress) => set({ status: "downloading", percent: Math.max(0, Math.min(100, Math.round(progress?.percent || 0))) }));
  autoUpdater.on("update-downloaded", (info) => set({ status: "ready", latest: info?.version || state.latest, percent: 100, error: "", checkedAt: now() }));
  autoUpdater.on("error", (error) => { if (state.status !== "ready") set({ status: "error", error: friendly(error), checkedAt: now() }); else log("error", friendly(error)); });
  let timer = null, interval = null;
  async function check() {
    if (state.status === "checking" || state.status === "downloading") return { ...state };
    try { await autoUpdater.checkForUpdates(); }
    catch (error) { if (state.status !== "ready") set({ status: "error", error: friendly(error), checkedAt: now() }); }
    return { ...state };
  }
  function install() {
    if (state.status !== "ready") throw new Error("No update is ready to install.");
    autoUpdater.quitAndInstall(true, true);
  }
  function start() {
    stop();
    timer = timers.setTimeout(() => { check().catch(() => {}); }, CHECK_DELAY);
    interval = timers.setInterval(() => { check().catch(() => {}); }, CHECK_EVERY);
  }
  function stop() {
    if (timer) timers.clearTimeout(timer);
    if (interval) timers.clearInterval(interval);
    timer = interval = null;
  }
  return { state: () => ({ ...state }), check, install, start, stop };
}

module.exports = { createUpdateManager, parseUpdateConfig, friendly, CHECK_DELAY, CHECK_EVERY };
