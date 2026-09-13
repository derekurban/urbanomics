const { exportConfiguration } = require("./configuration.cjs");
function createWorkspaceService({
  store,
  configurationDir,
  platform,
  emit = () => {},
  onIdle = () => {},
}) {
  let processing = false;
  const handlers = new Map();
  const handle = (channel, fn) => handlers.set(channel, fn);
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
    "transfer-lab:save",
    "transaction-rules:save",
    "transaction-rules:remove",
    "aliases:save",
    "aliases:remove",
    "review:entity",
    "review:hierarchy-starter",
    "review:entity-remove",
    "workspace:account",
    "workspace:account-update",
    "workspace:account-delete",
    "workspace:account-restore",
    "workspace:route",
    "workspace:scan",
  ]);
  handle("workspace:state", () => ({
    ...store.state(),
    configurationError,
  }));
  handle("transfer-lab:state", () => store.transferLab.state());
  handle("transfer-lab:save", (values, version) =>
    store.transferLab.save(values, version),
  );
  handle("transfer-lab:preview", (values, simulation) =>
    store.transferLab.preview(values, simulation),
  );
  handle("transfer-lab:validate", (values, token, keys) =>
    store.transferLab.validate(values, token, keys),
  );
  handle("transfer-lab:apply", (values, token, keys) =>
    store.transferLab.apply(values, token, keys),
  );
  handle("review:state", () => store.review.state());
  handle("aliases:state", () => store.aliases.state());
  handle("transaction-rules:state", () => store.transactionRules.state());
  handle("transaction-rules:preview", (values) =>
    store.transactionRules.preview(values),
  );
  handle("transaction-rules:save", (values) =>
    store.transactionRules.save(values),
  );
  handle("transaction-rules:remove", (id, version) =>
    store.transactionRules.remove(id, version),
  );
  handle("transaction-rules:apply", (token) =>
    store.transactionRules.apply(token),
  );
  handle("transaction-rules:person", (id, version, personId) =>
    store.transactionRules.assignPerson(id, version, personId),
  );
  handle("aliases:preview", (values) => store.aliases.preview(values));
  handle("aliases:save", (values) => store.aliases.save(values));
  handle("aliases:remove", (id, version) => store.aliases.remove(id, version));
  handle("admin:untag-preview", () => store.admin.preview());
  handle("admin:untag-all", (token) => store.admin.untagAll(token));
  handle("review:entity", (kind, values) => store.review.entity(kind, values));
  handle("review:hierarchy-starter", () => store.review.starterHierarchy());
  handle("review:entity-remove", (id) => store.review.removeEntity(id));
  handle("review:organize", (changes) => store.review.organize(changes));
  handle("review:cash-save", (values) => store.review.saveCash(values));
  handle("review:cash-void", (id, version) =>
    store.review.voidCash(id, version),
  );
  handle("review:financial", (id, version, values) =>
    store.review.financial(id, version, values),
  );
  handle("review:transfer-link", (outId, outVersion, inId, inVersion, band) =>
    store.review.linkTransfer(outId, outVersion, inId, inVersion, band),
  );
  handle("review:transfer-unlink", (id, version, counterpartVersion) =>
    store.review.unlinkTransfer(id, version, counterpartVersion),
  );
  const processFiles = async (ids = null) => {
    processing = true;
    try {
      return await store.processReadyWithProgress((progress) => {
        emit("progress", progress);
      }, ids);
    } finally {
      processing = false;
      onIdle();
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
    const files = await platform.choose(folder);
    return files.length ? importFiles(files) : { ids: [], skipped: 0 };
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
  handle("workspace:reveal", (...args) => platform.reveal(...args));

  return {
    get processing() {
      return processing;
    },
    syncConfiguration,
    async invoke(channel, ...args) {
      try {
        if (!handlers.has(channel))
          throw new Error("Unknown workspace operation.");
        if (
          processing &&
          ![
            "workspace:state",
            "review:state",
            "transfer-lab:state",
            "transfer-lab:preview",
            "transfer-lab:validate",
            "aliases:state",
            "aliases:preview",
            "transaction-rules:state",
            "transaction-rules:preview",
            "workspace:transactions",
            "workspace:detail",
            "workspace:snapshot",
            "workspace:reveal",
            "workspace:prefix-test",
          ].includes(channel)
        )
          throw new Error("Wait for Dropbox processing to finish.");
        const value = await handlers.get(channel)(...args);
        if (configurationChanges.has(channel)) syncConfiguration();
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    channels: [...handlers.keys()],
  };
}
module.exports = { createWorkspaceService };
