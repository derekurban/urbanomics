import channels from "../electron/api-channels.json";
if (!window.urbanomics && ["http:", "https:"].includes(location.protocol)) {
  let session;
  const getSession = () => session ||= fetch("/api/session").then(async (r) => {
    if (!r.ok) throw new Error("Cannot connect. Check Tailscale and keep Urbanomics open on your desktop.");
    const value = await r.json();
    window.urbanomics.workspaceMode = value.workspaceMode;
    return value;
  }).catch(error => { session = null; throw error; });
  const listeners = { progress: new Set(), changed: new Set() };
  const events = new EventSource("/api/events");
  events.addEventListener("open", () => {
    session = null;
    window.dispatchEvent(new CustomEvent("urbanomics-connection", {detail:true}));
    for (const callback of listeners.changed) callback();
  });
  events.addEventListener("error", () => window.dispatchEvent(new CustomEvent("urbanomics-connection", {detail:false})));
  for (const type of Object.keys(listeners))
    events.addEventListener(type, (event) => {
      for (const callback of listeners[type]) callback(JSON.parse(event.data));
    });
  const response = async (res) => {
    const value = await res.json();
    if (!res.ok || !value.ok) throw new Error(value.error || "Request failed.");
    return value.value;
  };
  const invoke = async (method, args) =>
    response(
      await fetch("/api/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Urbanomics-Token": (await getSession()).token,
        },
        body: JSON.stringify({ method, args }),
      }),
    );
  const drop = async (files, stage = false) => {
    if (files.length > 250)
      throw new Error("Choose up to 250 CSV files at a time.");
    const received = { ids: [], skipped: 0 };
    for (const file of files) {
      if (
        !/\.csv$/i.test(file.name) ||
        file.size > 20 * 1024 * 1024 ||
        file.webkitRelativePath?.split("/").length > 2
      ) {
        received.skipped++;
        continue;
      }
      const value = await response(
        await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Stage-Only": stage ? "true" : "false",
            "X-Urbanomics-Token": (await getSession()).token,
          },
          body: file,
        }),
      );
      received.ids.push(...value.ids);
      received.skipped += value.skipped || 0;
      if (value.result) {
        const prior = received.result;
        received.result = { ...value.result };
        if (prior) {
          for (const field of [
            "attempted",
            "completed",
            "added",
            "matched",
            "excluded",
          ])
            received.result[field] =
              (prior[field] || 0) + (value.result[field] || 0);
          received.result.months = [
            ...new Set([...prior.months, ...value.result.months]),
          ];
          received.result.files = [
            ...(prior.files || []),
            ...(value.result.files || []),
          ];
        }
      }
    }
    return received;
  };
  const choose = (folder = false, stage = false) =>
      new Promise((resolve, reject) => {
        const input = document.createElement("input"); input.type="file"; input.accept=".csv"; input.multiple=true; if(folder)input.webkitdirectory=true; input.hidden=true;document.body.append(input);
        input.addEventListener("cancel",()=>{input.remove();resolve({ids:[],skipped:0});},{once:true});
        input.addEventListener("change",async()=>{try{resolve(await drop([...input.files],stage));}catch(e){reject(e);}finally{input.remove();}},{once:true});input.click();
      });
  window.urbanomics = {
    ...Object.fromEntries(
      Object.keys(channels).map((method) => [
        method,
        (...args) => invoke(method, args),
      ]),
    ),
    host: "browser",
    workspaceMode: "sample",
    reveal: async (kind, id) => {
      const type = kind === "source" ? "source" : kind === "snapshot-file" ? "snapshot" : null;
      if (!type) throw new Error("Use Upload history or Archive to browse desktop files. Folder windows open only on the desktop.");
      const response = await fetch(`/api/files/${type}/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Archive file unavailable. Reconnect to your desktop and try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "archive-file";
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
    onProgress: (callback) => {
      listeners.progress.add(callback);
      return () => listeners.progress.delete(callback);
    },
    onChanged: (callback) => {
      listeners.changed.add(callback);
      return () => listeners.changed.delete(callback);
    },
    onUpdate: () => () => {},
    drop,
    choose: (folder=false)=>choose(folder),
    stageChoose: (folder=false)=>choose(folder,true),
    stageDrop: (files)=>drop(files,true),
  };
}
