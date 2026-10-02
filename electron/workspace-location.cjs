// Where the app keeps its workspace. Environment variables win, then the pointer file in the
// per-user application data folder (Urbanomics/workspace.json), then the defaults: the repository
// for a development run, the application data folder for an installed release. An explicit data
// folder without an explicit configuration folder means no configuration SQL export, as before.
const fs = require("node:fs");
const path = require("node:path");

function readPointer(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : "");

function resolveWorkspace({ env = process.env, isPackaged, appData, repoRoot, pointer } = {}) {
  const pointerFile = path.join(appData, "Urbanomics", "workspace.json");
  const pointed = pointer === undefined ? readPointer(pointerFile) : pointer || {};
  const envData = text(env.URBANOMICS_DATA_DIR), envConfig = text(env.URBANOMICS_CONFIG_DIR);
  const pointedData = text(pointed.dataDir), pointedConfig = text(pointed.configurationDir);
  const dataDir = envData || pointedData || (isPackaged ? path.join(appData, "Urbanomics", "private") : path.join(repoRoot, "private", "desktop"));
  const explicitData = !!(envData || pointedData);
  const configurationDir = envConfig || pointedConfig || (explicitData ? null : isPackaged ? path.join(appData, "Urbanomics", "configuration") : path.join(repoRoot, "configuration"));
  return {
    dataDir,
    configurationDir,
    pointerFile,
    source: envData ? "environment" : pointedData ? "pointer" : "default",
    updateToken: text(env.URBANOMICS_UPDATE_TOKEN) || text(pointed.updateToken),
  };
}

module.exports = { resolveWorkspace, readPointer };
