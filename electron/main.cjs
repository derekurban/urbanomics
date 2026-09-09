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

const privateRoot =
  process.env.URBANOMICS_DATA_DIR ||
  (app.isPackaged
    ? path.join(app.getPath("appData"), "Urbanomics", "private")
    : path.join(__dirname, "..", "private", "desktop"));
fs.mkdirSync(privateRoot, { recursive: true });
app.setPath("userData", path.join(privateRoot, "electron"));
app.setPath("logs", path.join(privateRoot, "logs"));
const dev = !app.isPackaged && process.argv.includes("--dev");
const appURL = dev
  ? "http://127.0.0.1:5173/"
  : pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href;
let window, store;
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
      store = new ImportStore(privateRoot);
      store.processPending();
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
            return { ok: true, value: await fn(...args) };
          } catch (error) {
            return { ok: false, error: error.message };
          }
        });
      handle("workspace:state", () => store.state());
      handle("workspace:ingest", (files) => store.enqueue(files));
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
          : store.enqueue(response.filePaths);
      });
      handle("workspace:account", (name, schema, kind) =>
        store.addAccount(name, schema, kind),
      );
      handle("workspace:route", (id, account, remember) =>
        store.resolveAccount(id, account, remember === true),
      );
      handle("workspace:resolve", (id, choices) => {
        if (!choices || typeof choices !== "object" || Array.isArray(choices))
          throw new Error("Invalid match decisions.");
        return store.process(id, choices);
      });
      handle("workspace:dismiss", (id) => store.dismiss(id));
      handle("workspace:scope", (start, through) =>
        store.setScope(start, through),
      );
      handle("workspace:transactions", (month) => store.transactions(month));
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
        } else if (kind === "archive")
          await shell.openPath(path.join(privateRoot, "archive"));
        else if (kind === "private") await shell.openPath(privateRoot);
        else throw new Error("Unknown location.");
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
  app.on("before-quit", () => {
    store?.close();
    store = null;
  });
}
