const { createWorkspaceService } = require("./workspace-service.cjs");
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { ImportStore } = require("./imports/store.cjs");
const { seedConfiguration } = require("./configuration.cjs");
const { resolveWorkspace } = require("./workspace-location.cjs");
const { createUpdateManager, parseUpdateConfig } = require("./updates.cjs");

// Only an installer built on the release channel updates itself (scripts/release.cjs).
const build = app.isPackaged && require("../package.json").channel === "release" ? "release" : "development";
// An installed release keeps its workspace under application data, or where Urbanomics/workspace.json
// points. Development runs (electron ., unpacked builds) keep the repository workspace unless the
// environment says otherwise, so the two are isolated from each other.
const workspace = resolveWorkspace({
  env: process.env,
  isPackaged: build === "release",
  appData: app.getPath("appData"),
  repoRoot: path.join(__dirname, ".."),
  usePointer: build === "release",
});
const privateRoot = workspace.dataDir, configurationDir = workspace.configurationDir;
const updateConfigFile = path.join(process.resourcesPath || "", "app-update.yml");
const updatesEnabled = build === "release" && fs.existsSync(updateConfigFile);
fs.mkdirSync(privateRoot, { recursive: true });
app.setPath("userData", path.join(privateRoot, "electron"));
app.setPath("logs", path.join(privateRoot, "logs"));
const dev = !app.isPackaged && process.argv.includes("--dev");
const appURL = dev
  ? "http://127.0.0.1:5173/"
  : pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href;
let window,
  store,
  service,
  updates,
  remoteServer,
  quitAfterProcessing = false;
const logUpdates = (status, details) => {
  try {
    const dir = path.join(privateRoot, "logs"); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "updates.log");
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, file + ".previous");
    fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), status, details: typeof details === "string" ? details : { ...details } }) + "\n");
  } catch {}
};
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const freshWorkspace = !fs.existsSync(
        path.join(privateRoot, "urbanomics.sqlite"),
      );
      store = new ImportStore(privateRoot);
      const emptyWorkspace = [
        "import_layouts",
        "accounts",
        "rules",
        "review_entities",
        "transaction_aliases",
        "transaction_rules",
        "transfer_lab_config",
        "transactions",
        "sources",
        "review_items",
        "cash_receipts",
      ].every(
        (table) =>
          store.db.prepare(`SELECT COUNT(*) n FROM "${table}"`).get().n === 0,
      );
      if ((freshWorkspace || emptyWorkspace) && configurationDir && !store.db.prepare("SELECT 1 FROM settings WHERE key='workspaceReset'").get()) {
        const localSeed = path.join(configurationDir, "workspace.sql"),
          bundledSeed = path.join(
            __dirname,
            "..",
            "configuration",
            "workspace.sql",
          );
        const seed = fs.existsSync(localSeed) ? localSeed : bundledSeed;
        if (fs.existsSync(seed)) seedConfiguration(store.db, seed);
      }
      store.scanDropbox();
      updates = createUpdateManager({
        autoUpdater: updatesEnabled ? require("electron-updater").autoUpdater : null,
        enabled: updatesEnabled,
        version: app.getVersion(),
        build,
        token: workspace.updateToken,
        config: updatesEnabled ? parseUpdateConfig(fs.readFileSync(updateConfigFile, "utf8")) : null,
        emit: (name, value) => { if (window && !window.isDestroyed()) window.webContents.send("workspace:" + name, value); },
        log: logUpdates,
      });
      logUpdates("start", { build, version: app.getVersion(), updates: updatesEnabled, workspace: workspace.source });
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, respond) => respond(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const allowed =
          url.protocol === "file:" ||
          (dev &&
            ["http:", "ws:"].includes(url.protocol) &&
            url.hostname === "127.0.0.1" &&
            url.port === "5173");
        callback({ cancel: !allowed });
      });
      service = createWorkspaceService({
        store,
        privateRoot,
        configurationDir,
        emit: (name, value) => {
          if (window && !window.isDestroyed())
            window.webContents.send("workspace:" + name, value);
        },
        onIdle: () => {
          if (quitAfterProcessing) app.quit();
        },
        platform: {
          updates,
          choose: async (folder) => {
            const response = await dialog.showOpenDialog(window, {
              title: folder
                ? "Choose a folder of bank exports"
                : "Choose bank CSVs",
              properties: folder
                ? ["openDirectory"]
                : ["openFile", "multiSelections"],
              filters: folder
                ? undefined
                : [{ name: "Bank exports", extensions: ["csv"] }],
            });
            return response.canceled ? [] : response.filePaths;
          },
          reveal: async (kind, id) => {
            if (kind === "source") {
              if (
                typeof id !== "string" ||
                !/^[a-f0-9]{64}$/.test(id) ||
                !store.db
                  .prepare("SELECT hash FROM sources WHERE hash=?")
                  .get(id)
              )
                throw new Error("Source not found.");
              shell.showItemInFolder(
                path.join(privateRoot, "archive", "sources", `${id}.csv`),
              );
            } else {
              const folders = {
                private: privateRoot,
                dropbox: path.join(privateRoot, "dropbox"),
                archive: path.join(privateRoot, "archive"),
                sources: path.join(privateRoot, "archive/sources"),
                snapshots: path.join(privateRoot, "archive/snapshots"),
              };
              let location = folders[kind];
              if (kind === "month") {
                if (
                  typeof id !== "string" ||
                  !/^(?:19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(id)
                )
                  throw new Error("Invalid archive month.");
                location = path.join(privateRoot, "archive/snapshots", id);
              } else if (kind === "snapshot-file") {
                const snapshot = store.db
                  .prepare("SELECT * FROM snapshots WHERE id=?")
                  .get(id);
                if (!snapshot) throw new Error("Snapshot not found.");
                shell.showItemInFolder(
                  path.join(
                    privateRoot,
                    "archive/snapshots",
                    snapshot.month,
                    `r${String(snapshot.revision).padStart(4, "0")}-${snapshot.id}.json`,
                  ),
                );
                return;
              }
              if (!location || !fs.existsSync(location))
                throw new Error("Archive folder not found.");
              const error = await shell.openPath(location);
              if (error) throw new Error(error);
            }
          },
        },
      });
      service.syncConfiguration();
      const remoteConfig = path.join(privateRoot, "remote-access.json");
      if (fs.existsSync(remoteConfig)) {
        try {
          const remote = JSON.parse(fs.readFileSync(remoteConfig, "utf8"));
          if (remote.enabled) {
            remoteServer = await require("./web-server.cjs").startWebServer({
              root: privateRoot, port: remote.port || 4174, seed: false,
              sharedStore: store, sharedService: service, remote,
            });
            fs.writeFileSync(path.join(privateRoot, "remote-status.json"), JSON.stringify({ok:true,url:remote.origin,started:new Date().toISOString()}));
          }
        } catch (error) {
          fs.writeFileSync(path.join(privateRoot, "remote-status.json"), JSON.stringify({ok:false,error:error.message}));
        }
      }
      for (const channel of service.channels)
        ipcMain.handle(channel, async (event, ...args) => {
          if (
            event.sender !== window?.webContents ||
            event.senderFrame !== event.sender.mainFrame ||
            event.senderFrame.url !== appURL
          )
            throw new Error("Untrusted application frame.");
          return service.invoke(channel, ...args);
        });
      window = new BrowserWindow({
        title: build === "release" ? "Urbanomics" : "Urbanomics (development)",
        icon: path.join(__dirname, "..", "assets", "icons", build === "release" ? "icon.png" : "icon-dev.png"),
        width: 1360,
        height: 900,
        minWidth: 900,
        minHeight: 640,
        backgroundColor: "#f6f6f6", // design system --bg (light)
        show: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          devTools: !app.isPackaged,
        },
      });
      // Keep renderer diagnostics locally so a failed view can be traced after restart.
      const logRenderer = (type, details) => {
        try {
          const dir=path.join(privateRoot,'logs');fs.mkdirSync(dir,{recursive:true});
          const file=path.join(dir,'renderer.log');
          if(fs.existsSync(file)&&fs.statSync(file).size>1024*1024)fs.renameSync(file,file+'.previous');
          fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),type,details})+'\n');
        } catch {}
      };
      window.webContents.on('console-message', (details) => {
        if(details.level==='error')logRenderer('console',details.message);
      });
      window.webContents.on('render-process-gone',(_event,details)=>logRenderer('render-process-gone',details));
      window.webContents.on('did-fail-load',(_event,code,description)=>logRenderer('load-failed',{code,description}));
      window.setMenu(null);
      window.on("focus", () => {
        if (service?.processing) return;
        try {
          store.scanDropbox();
          window.webContents.send("workspace:changed");
        } catch (error) {
          window.webContents.send("workspace:changed", error.message);
        }
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== appURL) event.preventDefault();
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      window.once("ready-to-show", () => window.show());
      await window.loadURL(appURL);
      updates.start();
    })
    .catch((error) => {
      dialog.showErrorBox("Urbanomics could not start", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (service?.processing) {
      event.preventDefault();
      quitAfterProcessing = true;
      return;
    }
    if (remoteServer) {
      event.preventDefault();
      const closing = remoteServer;
      remoteServer = null;
      closing.close().finally(() => app.quit());
      return;
    }
    store?.close();
    store = null;
  });
}
