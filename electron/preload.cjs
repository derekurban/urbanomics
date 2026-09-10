const { contextBridge, ipcRenderer, webUtils } = require("electron");
async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld("urbanomics", {
  state: () => invoke("workspace:state"),
  scan: () => invoke("workspace:scan"),
  process: () => invoke("workspace:process"),
  clear: () => invoke("workspace:clear"),
  onChanged: (callback) => {
    const listener = (_event, error) => callback(error);
    ipcRenderer.on("workspace:changed", listener);
    return () => ipcRenderer.removeListener("workspace:changed", listener);
  },
  drop: (files) =>
    invoke(
      "workspace:ingest",
      files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
    ),
  choose: (folder) => invoke("workspace:choose", folder === true),
  addAccount: (name, schema, kind) =>
    invoke("workspace:account", name, schema, kind),
  route: (id, account, remember) =>
    invoke("workspace:route", id, account, remember),
  resolve: (id, choices) => invoke("workspace:resolve", id, choices),
  dismiss: (id) => invoke("workspace:dismiss", id),
  setScope: (start, through) => invoke("workspace:scope", start, through),
  transactions: (month) => invoke("workspace:transactions", month),
  detail: (id) => invoke("workspace:detail", id),
  snapshot: (id) => invoke("workspace:snapshot", id),
  removeRule: (key, schema, account) =>
    invoke("workspace:rule-remove", key, schema, account),
  reveal: (kind, id) => invoke("workspace:reveal", kind, id),
});
