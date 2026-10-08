const { contextBridge, ipcRenderer, webUtils } = require("electron");
async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld("urbanomics", {
  stageChoose: (...args)=>invoke("imports:choose",...args),
  detectImportDates: (id,column,delimiter) => invoke("imports:detect-dates", id,column,delimiter),
  inspectImport: (...args)=>invoke("imports:inspect",...args),
  importLayouts: (...args)=>invoke("imports:layouts",...args),
  previewImportLayout: (...args)=>invoke("imports:preview-layout",...args),
  saveImportLayout: (...args)=>invoke("imports:save-layout",...args),
  applyImportLayout: (...args)=>invoke("imports:apply-layout",...args),
  removeImportLayout: (...args)=>invoke("imports:remove-layout",...args),
  assignImportAccount: (...args)=>invoke("imports:assign",...args),
  processImportBatch: (...args)=>invoke("imports:process",...args),
  stageDrop: (files)=>invoke("imports:stage",files.map(file=>webUtils.getPathForFile(file)).filter(Boolean)),
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
  previewWorkspaceReset: () => invoke("admin:reset-preview"),
  resetWorkspace: (token,confirmation) => invoke("admin:reset",token,confirmation),
  previewUntagAll: () => invoke("admin:untag-preview"),
  untagAll: (token) => invoke("admin:untag-all", token),
  previewUnlinkAll: () => invoke("admin:unlink-preview"),
  unlinkAllTransfers: (token) => invoke("admin:unlink-all", token),
  previewClearShares: () => invoke("admin:shares-preview"),
  clearAllShares: (token) => invoke("admin:shares-clear", token),
  reviewState: () => invoke("review:state"),
  transactionRuleCoverage: (id) => invoke("transaction-rules:coverage", id),
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
  saveAllocation: (id, version, values) => invoke("review:allocation", id, version, values),
  followEventSplit: (id, version) => invoke("review:event-split", id, version),
  linkTransfer: (outId, outVersion, inId, inVersion, band, groups) =>
    invoke("review:transfer-link", outId, outVersion, inId, inVersion, band, groups),
  unlinkTransfer: (id, version, counterpartVersion) =>
    invoke("review:transfer-unlink", id, version, counterpartVersion),
  scan: (manualLayouts = false) => invoke("workspace:scan", manualLayouts),
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
  mergeTags: (sourceId, targetId) => invoke("review:merge-tags", sourceId, targetId),
  codexState: (refresh) => invoke("ai:state", refresh === true),
  codexModels: () => invoke("ai:models"),
  saveCodexSettings: (values) => invoke("ai:settings", values),
  installCodex: () => invoke("ai:install"),
  signInCodex: () => invoke("ai:login"),
  cancelCodexSignIn: () => invoke("ai:login-cancel"),
  signOutCodex: () => invoke("ai:logout"),
  testCodex: () => invoke("ai:test"),
  suggestTags: (mode) => invoke("ai:suggest-tags", mode),
  suggestAliases: () => invoke("ai:suggest-aliases"),
  suggestOrganize: (context) => invoke("ai:suggest-organize", context),
  suggestOrganizeBatch: (contexts) => invoke("ai:suggest-organize-batch", contexts),
  updatesState: () => invoke("updates:state"),
  checkForUpdates: () => invoke("updates:check"),
  installUpdate: () => invoke("updates:install"),
  onUpdate: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("workspace:update", listener);
    return () => ipcRenderer.removeListener("workspace:update", listener);
  },
});
