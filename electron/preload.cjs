const { contextBridge, ipcRenderer, webUtils } = require("electron");
async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld("urbanomics", {
  state: () => invoke("workspace:state"),
  transferLabState: () => invoke("transfer-lab:state"),
  saveTransferLab: (values, version) =>
    invoke("transfer-lab:save", values, version),
  previewTransferLab: (values, simulation) =>
    invoke("transfer-lab:preview", values, simulation),
  validateTransferLab: (values, token, keys) =>
    invoke("transfer-lab:validate", values, token, keys),
  applyTransferLab: (values, token, keys) =>
    invoke("transfer-lab:apply", values, token, keys),
  previewUntagAll: () => invoke("admin:untag-preview"),
  untagAll: (token) => invoke("admin:untag-all", token),
  reviewState: () => invoke("review:state"),
  transactionRulesState: () => invoke("transaction-rules:state"),
  previewTransactionRule: (values) =>
    invoke("transaction-rules:preview", values),
  saveTransactionRule: (values) => invoke("transaction-rules:save", values),
  removeTransactionRule: (id, version) =>
    invoke("transaction-rules:remove", id, version),
  applyTransactionRules: (token) => invoke("transaction-rules:apply", token),
  assignTransactionPerson: (id, version, personId) =>
    invoke("transaction-rules:person", id, version, personId),
  aliases: () => invoke("aliases:state"),
  previewAlias: (values) => invoke("aliases:preview", values),
  saveAlias: (values) => invoke("aliases:save", values),
  removeAlias: (id, version) => invoke("aliases:remove", id, version),
  starterHierarchy: () => invoke("review:hierarchy-starter"),
  reorderTags: (ids, expected) => invoke("review:tag-order", ids, expected),
  saveEntity: (kind, values) => invoke("review:entity", kind, values),
  removeEntity: (id) => invoke("review:entity-remove", id),
  organize: (changes) => invoke("review:organize", changes),
  saveCash: (values) => invoke("review:cash-save", values),
  voidCash: (id, version) => invoke("review:cash-void", id, version),
  saveFinancial: (id, version, values) =>
    invoke("review:financial", id, version, values),
  linkTransfer: (outId, outVersion, inId, inVersion, band) =>
    invoke("review:transfer-link", outId, outVersion, inId, inVersion, band),
  unlinkTransfer: (id, version, counterpartVersion) =>
    invoke("review:transfer-unlink", id, version, counterpartVersion),
  scan: () => invoke("workspace:scan"),
  process: () => invoke("workspace:process"),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("workspace:progress", listener);
    return () => ipcRenderer.removeListener("workspace:progress", listener);
  },
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
  addAccount: (name, schema, kind, options) =>
    invoke("workspace:account", name, schema, kind, options),
  updateAccount: (id, values) => invoke("workspace:account-update", id, values),
  deleteAccount: (id) => invoke("workspace:account-delete", id),
  restoreAccount: (id) => invoke("workspace:account-restore", id),
  testPrefix: (pattern, filename) =>
    invoke("workspace:prefix-test", pattern, filename),
  route: (id, account, remember) =>
    invoke("workspace:route", id, account, remember),
  resolve: (id, choices) => invoke("workspace:resolve", id, choices),
  dismiss: (id) => invoke("workspace:dismiss", id),
  transactions: (month) => invoke("workspace:transactions", month),
  detail: (id) => invoke("workspace:detail", id),
  snapshot: (id) => invoke("workspace:snapshot", id),
  removeRule: (key, schema, account) =>
    invoke("workspace:rule-remove", key, schema, account),
  reveal: (kind, id) => invoke("workspace:reveal", kind, id),
});
