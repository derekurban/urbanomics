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
const {
  exportConfiguration,
  seedConfiguration,
} = require("./configuration.cjs");

const privateRoot =
  process.env.URBANOMICS_DATA_DIR ||
  (app.isPackaged
    ? path.join(app.getPath("appData"), "Urbanomics", "private")
    : path.join(__dirname, "..", "private", "desktop"));
const configurationDir =
  process.env.URBANOMICS_CONFIG_DIR ||
  (!process.env.URBANOMICS_DATA_DIR
    ? app.isPackaged
      ? path.join(app.getPath("appData"), "Urbanomics", "configuration")
      : path.join(__dirname, "..", "configuration")
    : null);
let configurationError = "";
function syncConfiguration() {
  if (!configurationDir) return;
  try {
    exportConfiguration(store.db, configurationDir);
    configurationError = "";
  } catch (error) {
    configurationError =
      "Configuration saved locally, but its SQL copy could not be updated. Use Refresh to retry. " +
      error.message;
  }
}
const configurationChanges = new Set([
  "aliases:save",
  "aliases:remove",
  "review:entity",
  "review:entity-remove",
  "workspace:account",
  "workspace:account-update",
  "workspace:account-delete",
  "workspace:account-restore",
  "workspace:route",
  "workspace:scan",
]);
fs.mkdirSync(privateRoot, { recursive: true });
app.setPath("userData", path.join(privateRoot, "electron"));
app.setPath("logs", path.join(privateRoot, "logs"));
const dev = !app.isPackaged && process.argv.includes("--dev");
const appURL = dev
  ? "http://127.0.0.1:5173/"
  : pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href;
let window,
  store,
  processing = false,
  quitAfterProcessing = false;
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
        "accounts",
        "rules",
        "review_entities",
        "transaction_aliases",
        "transactions",
        "sources",
        "review_items",
        "cash_receipts",
      ].every(
        (table) =>
          store.db.prepare(`SELECT COUNT(*) n FROM "${table}"`).get().n === 0,
      );
      if ((freshWorkspace || emptyWorkspace) && configurationDir) {
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
      syncConfiguration();
      store.scanDropbox();
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
      const handle = (channel, fn) =>
        ipcMain.handle(channel, async (event, ...args) => {
          if (
            event.sender !== window?.webContents ||
            event.senderFrame !== event.sender.mainFrame ||
            event.senderFrame.url !== appURL
          )
            throw new Error("Untrusted application frame.");
          try {
            if (
              processing &&
              ![
                "workspace:state",
                "review:state",
                "aliases:state",
                "aliases:preview",
                "workspace:transactions",
                "workspace:detail",
                "workspace:snapshot",
                "workspace:reveal",
                "workspace:prefix-test",
              ].includes(channel)
            )
              throw new Error("Wait for Dropbox processing to finish.");
            const value = await fn(...args);
            if (configurationChanges.has(channel)) syncConfiguration();
            return { ok: true, value };
          } catch (error) {
            return { ok: false, error: error.message };
          }
        });
      handle("workspace:state", () => ({
        ...store.state(),
        configurationError,
      }));
      handle("review:state", () => store.review.state());
      handle("aliases:state", () => store.aliases.state());
      handle("aliases:preview", (values) => store.aliases.preview(values));
      handle("aliases:save", (values) => store.aliases.save(values));
      handle("aliases:remove", (id, version) =>
        store.aliases.remove(id, version),
      );
      handle("review:entity", (kind, values) =>
        store.review.entity(kind, values),
      );
      handle("review:entity-remove", (id) => store.review.removeEntity(id));
      handle("review:organize", (changes) => store.review.organize(changes));
      handle("review:cash-save", (values) => store.review.saveCash(values));
      handle("review:cash-void", (id, version) =>
        store.review.voidCash(id, version),
      );
      handle("review:financial", (id, version, values) =>
        store.review.financial(id, version, values),
      );
      handle(
        "review:transfer-link",
        (outId, outVersion, inId, inVersion, band) =>
          store.review.linkTransfer(outId, outVersion, inId, inVersion, band),
      );
      handle("review:transfer-unlink", (id, version, counterpartVersion) =>
        store.review.unlinkTransfer(id, version, counterpartVersion),
      );
      const processFiles = async (ids = null) => {
        processing = true;
        try {
          return await store.processReadyWithProgress((progress) => {
            if (!window.isDestroyed())
              window.webContents.send("workspace:progress", progress);
          }, ids);
        } finally {
          processing = false;
          if (quitAfterProcessing) app.quit();
        }
      };
      const importFiles = async (files) => {
        const received = store.enqueue(files, { stage: true, process: false });
        const ready = received.ids.filter(
          (id) => store.job(id).status === "queued",
        );
        return {
          ...received,
          result: ready.length ? await processFiles(ready) : null,
        };
      };
      handle("workspace:ingest", importFiles);
      handle("workspace:scan", () => {
        store.recover();
        return store.scanDropbox();
      });
      handle("workspace:process", () => processFiles());
      handle("workspace:clear", () => store.clearDropbox());
      handle("workspace:choose", async (folder) => {
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
        return response.canceled
          ? { ids: [], skipped: 0 }
          : importFiles(response.filePaths);
      });
      handle("workspace:account", (name, schema, kind, options) =>
        store.addAccount(name, schema, kind, options),
      );
      handle("workspace:account-update", (id, values) =>
        store.updateAccount(id, values),
      );
      handle("workspace:account-delete", (id) => store.deleteAccount(id));
      handle("workspace:account-restore", (id) => store.restoreAccount(id));
      handle("workspace:prefix-test", (pattern, filename) =>
        store.testPrefix(pattern, filename),
      );
      handle("workspace:route", async (id, account, remember) => {
        store.resolveAccount(id, account, remember === true, {
          process: false,
        });
        return { result: await processFiles([id]) };
      });
      handle("workspace:resolve", (id, choices) => {
        if (!choices || typeof choices !== "object" || Array.isArray(choices))
          throw new Error("Invalid match decisions.");
        return store.process(id, choices);
      });
      handle("workspace:dismiss", (id) => store.dismiss(id));
      handle("workspace:transactions", (month) =>
        store.aliases.decorate(store.transactions(month)),
      );
      handle("workspace:detail", (id) => store.detail(id));
      handle("workspace:snapshot", (id) => store.snapshot(id));
      handle("workspace:rule-remove", (key, schema, account) =>
        store.removeRule(key, schema, account),
      );
      handle("workspace:reveal", async (kind, id) => {
        if (kind === "source") {
          if (
            typeof id !== "string" ||
            !/^[a-f0-9]{64}$/.test(id) ||
            !store.db.prepare("SELECT hash FROM sources WHERE hash=?").get(id)
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
      });
      window = new BrowserWindow({
        title: "Urbanomics",
        width: 1360,
        height: 900,
        minWidth: 900,
        minHeight: 640,
        backgroundColor: "#f7f8f4",
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
      window.setMenu(null);
      window.on("focus", () => {
        if (processing) return;
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
    })
    .catch((error) => {
      dialog.showErrorBox("Urbanomics could not start", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (processing) {
      event.preventDefault();
      quitAfterProcessing = true;
      return;
    }
    store?.close();
    store = null;
  });
}
