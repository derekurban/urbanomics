const { exportConfiguration } = require("./configuration.cjs");
function createWorkspaceService({
  store,
  configurationDir,
  platform,
  emit: platformEmit = () => {},
  onIdle = () => {},
}) {
  let processing = false;
  const subscribers = new Set();
  const emit = (event, value) => {
    platformEmit(event, value);
    for (const callback of subscribers) callback(event, value);
  };
  const readOnly = new Set([
    "workspace:state", "review:state", "transfer-lab:state", "transfer-lab:preview", "transfer-lab:validate",
    "aliases:state", "aliases:preview", "transaction-rules:coverage", "transaction-rules:state", "transaction-rules:preview",
    "admin:reset-preview", "admin:untag-preview", "admin:unlink-preview", "admin:shares-preview", "workspace:transactions", "workspace:detail", "workspace:snapshot",
    "workspace:reveal", "workspace:prefix-test", "imports:inspect", "imports:detect-dates", "imports:preview-layout", "imports:layouts",
    "updates:state", "updates:check", "updates:install",
  ]);
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
    "admin:reset", "imports:save-layout", "imports:remove-layout", "imports:assign",
    "transfer-lab:save",
    "transaction-rules:save",
    "transaction-rules:remove",
    "aliases:save",
    "aliases:remove",
    "review:entity",
    "review:tag-order",
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
  handle("transaction-rules:coverage", (id) => store.transactionRules.coverage(id));
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
  handle("admin:reset-preview", () => store.admin.previewReset());
  handle("admin:reset", (token,confirmation) => store.admin.resetWorkspace(token,confirmation));
  handle("admin:untag-preview", () => store.admin.preview());
  handle("admin:untag-all", (token) => store.admin.untagAll(token));
  handle("admin:unlink-preview", () => store.admin.previewUnlink());
  handle("admin:unlink-all", (token) => store.admin.unlinkAll(token));
  handle("admin:shares-preview", () => store.admin.previewShares());
  handle("admin:shares-clear", (token) => store.admin.clearShares(token));
  handle("review:entity", (kind, values) => store.review.entity(kind, values));
  handle("review:tag-order", (ids, expected) => store.review.reorderTags(ids, expected));
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
  handle("review:allocation", (id, version, values) => store.review.allocation(id, version, values));
  handle("review:event-split", (id, version) => store.review.followEventSplit(id, version));
  handle("review:transfer-link", (outId, outVersion, inId, inVersion, band, groups) =>
    store.review.linkTransfer(outId, outVersion, inId, inVersion, band, groups),
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
  handle("imports:stage", (files) => store.enqueue(files,{stage:true,process:false,manualLayouts:true}));
  handle("imports:choose", async (folder) => {const files=await platform.choose(folder);return files.length?store.enqueue(files,{stage:true,process:false,manualLayouts:true}):{ids:[],skipped:0};});
  handle("imports:inspect", (id)=>store.layouts.inspect(id));
  handle("imports:detect-dates", (id,column,delimiter)=>store.layouts.detectDates(id,column,delimiter));
  handle("imports:layouts", ()=>store.layouts.list());
  handle("imports:preview-layout", (id,values)=>store.layouts.preview(id,values));
  handle("imports:save-layout", (id,values)=>store.layouts.save(id,values));
  handle("imports:apply-layout", (id,templateId)=>store.review.atomic(()=>store.layouts.apply(id,templateId)));
  handle("imports:remove-layout", "imports:assign", (id,version)=>store.layouts.remove(id,version));
  handle("imports:assign", (id,accountId)=>store.review.atomic(()=>store.resolveAccount(id,accountId,false,{process:false,allowLayout:true})));
  handle("imports:process", async (ids)=>{
    if(!Array.isArray(ids)||!ids.length||ids.length>250||new Set(ids).size!==ids.length)throw Error('Choose a batch of up to 250 unique uploads.');
    // Validate every file before starting any of the batch; per-file durable commits retain recovery semantics.
    for(const id of ids){const job=store.job(id);if(job.status!=='queued'||!job.account_id)throw Error('Choose a valid layout and account for every file before importing.');const account=store.db.prepare('SELECT * FROM accounts WHERE id=? AND deletedAt IS NULL').get(job.account_id);const plan=store.plan(job);if(!account||(account.schema!==plan.parsed.schema&&!store.db.prepare("SELECT 1 FROM account_import_layouts WHERE account_id=? AND schema=?").get(account.id,plan.parsed.schema)))throw Error('An upload account or layout has changed. Review the batch again.');}
    return processFiles(ids);
  });
  handle("workspace:scan", (manualLayouts = false) => {
    store.recover();
    return store.scanDropbox(manualLayouts === true);
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
  // Release updates live in the Electron main process; the browser host has none to offer.
  const noUpdates = { supported: false, build: "browser", version: null, status: "idle", latest: null, percent: 0, error: "", checkedAt: null };
  handle("updates:state", () => platform.updates ? platform.updates.state() : noUpdates);
  handle("updates:check", () => platform.updates ? platform.updates.check() : noUpdates);
  handle("updates:install", () => { if (!platform.updates) throw new Error("Updates are managed by the desktop app."); platform.updates.install(); return true; });

  return {
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
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
            "transaction-rules:coverage", "transaction-rules:state",
            "transaction-rules:preview",
            "workspace:transactions",
            "workspace:detail",
            "workspace:snapshot",
            "workspace:reveal",
            "workspace:prefix-test",
            "updates:state", "updates:check",
          ].includes(channel)
        )
          throw new Error("Wait for Dropbox processing to finish.");
        const value = await handlers.get(channel)(...args);
        if (configurationChanges.has(channel)) syncConfiguration();
        if (!readOnly.has(channel)) emit("changed");
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    channels: [...handlers.keys()],
  };
}
module.exports = { createWorkspaceService };
