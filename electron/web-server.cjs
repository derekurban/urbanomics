const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const { ImportStore } = require("./imports/store.cjs");
const { createWorkspaceService } = require("./workspace-service.cjs");
const channels = require("./api-channels.json");
const repo = path.resolve(__dirname, "..");
const { isTailscaleIPv4, createPeerAuthorizer } = require("./tailscale-auth.cjs");
async function startWebServer({
  root = path.join(repo, "private/browser"),
  port = 4173,
  seed = true,
  sharedService,
  sharedStore,
  remote = null,
} = {}) {
  root = path.resolve(root);
  const shared = !!sharedService;
  const direct = remote?.mode === "direct";
  const directURL = direct ? new URL(remote.origin) : null;
  const remoteValid = direct ? directURL.protocol === "http:" && isTailscaleIPv4(directURL.hostname) && Number(directURL.port) === port && directURL.origin === remote.origin : /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net(?::\d+)?$/.test(remote?.origin || "");
  const authorizePeer = direct ? createPeerAuthorizer(remote.login, remote.executable) : null;
  if (shared !== !!sharedStore) throw new Error("Supply both the desktop service and store.");
  if (remote && (!shared || !remoteValid || !remote.login))
    throw new Error("Remote access requires a desktop service and an exact Tailscale origin and user.");
  if (!shared && root.toLowerCase() === path.join(repo, "private/desktop").toLowerCase())
    throw new Error("Use a separate browser verification workspace.");
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, "web-server.lock");
  if (!shared && fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (error) {
      if (error.code !== "ESRCH") alive = true;
    }
    if (alive) throw new Error("This browser workspace is already open.");
    fs.unlinkSync(lock);
  }
  if (!shared) fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
  let store = sharedStore;
  try {
    if (!shared) store = new ImportStore(root);
    if (!shared && seed && !store.db.prepare("SELECT COUNT(*) n FROM accounts").get().n)
      require("./web-sample.cjs").seedWebSample(store);
    if (!shared) store.scanDropbox();
  } catch (error) {
    if (!shared) { fs.unlinkSync(lock); store?.close(); }
    throw error;
  }
  const clients = new Set(),
    token = randomBytes(32).toString("hex");
  const emit = (event, value) => {
    for (const res of clients)
      res.write(`event: ${event}\ndata: ${JSON.stringify(value ?? null)}\n\n`);
  };
  const service = sharedService || createWorkspaceService({
    store,
    privateRoot: root,
    configurationDir: path.join(root, "configuration"),
    platform: {
      choose: () => {
        throw new Error("Use the browser file picker.");
      },
      reveal: () => {
        throw new Error(
          "Opening local folders is available in Electron. Uploaded records and source details can be inspected here.",
        );
      },
    },
  });
  const unsubscribe = service.subscribe(emit);
  if (!shared) service.syncConfiguration();
  let origin;
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  async function body(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new Error("Upload exceeds the size limit.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const server = http.createServer(async (req, res) => {
    try {
      // Only Tailscale Serve may identify a remote user. The upstream listens on loopback;
      // Serve strips client-supplied identity headers before adding its verified identity.
      const remoteRequest = !!remote;
      const requestOrigin = remoteRequest ? remote.origin : origin;
      if (
        req.headers.host !== new URL(requestOrigin).host ||
        (req.headers.origin && req.headers.origin !== requestOrigin) ||
        (remoteRequest && (direct ? !await authorizePeer(req.socket.remoteAddress) : req.headers["tailscale-user-login"] !== remote.login))
      )
        return json(res, 403, { ok: false, error: "Untrusted origin." });
      const url = new URL(req.url, requestOrigin);
      if (req.method === "GET" && url.pathname === "/api/session")
        return json(res, 200, { token, workspaceMode: shared ? "desktop" : "sample" });
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.write(": connected\n\n");
        clients.add(res);
        const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20000);
        req.on("close", () => { clearInterval(heartbeat); clients.delete(res); });
        return;
      }
      if (
        req.method === "POST" &&
        ["/api/call", "/api/upload"].includes(url.pathname)
      ) {
        if (
          req.headers["x-urbanomics-token"] !== token ||
          req.headers.origin !== requestOrigin
        )
          return json(res, 403, { ok: false, error: "Untrusted request." });
        if (url.pathname === "/api/upload") {
          if (req.headers["content-type"] !== "application/octet-stream")
            return json(res, 415, {
              ok: false,
              error: "Expected a CSV upload.",
            });
          const name = decodeURIComponent(req.headers["x-file-name"] || "");
          if (
            !name ||
            name !== path.win32.basename(name) ||
            name !== path.posix.basename(name) ||
            !/\.csv$/i.test(name) ||
            name.length > 180 ||
            /[<>:"|?*\x00-\x1f]/.test(name)
          )
            return json(res, 400, {
              ok: false,
              error: "Choose a CSV with a valid filename.",
            });
          const bytes = await body(req, 20 * 1024 * 1024);
          const folder = path.join(root, "web-uploads", randomUUID()),
            file = path.join(folder, name);
          fs.mkdirSync(folder, { recursive: true });
          fs.writeFileSync(file, bytes);
          try {
            return json(
              res,
              200,
              await service.invoke("workspace:ingest", [file]),
            );
          } finally {
            fs.unlinkSync(file);
            fs.rmdirSync(folder);
          }
        }
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return json(res, 415, { ok: false, error: "Expected JSON." });
        const { method, args = [] } = JSON.parse(
          (await body(req, 2 * 1024 * 1024)).toString("utf8"),
        );
        if (
          !Object.hasOwn(channels, method) ||
          ["drop", "choose", ...(shared ? ["reveal"] : [])].includes(method) ||
          !Array.isArray(args) ||
          args.length > 16
        )
          return json(res, 400, { ok: false, error: "Unknown operation." });
        const result = await service.invoke(channels[method], ...args);
        return json(res, 200, result);
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/files/")) {
        const [, , , kind, id] = url.pathname.split("/");
        let file, filename;
        if (kind === "source" && /^[a-f0-9]{64}$/.test(id || "") && store.db.prepare("SELECT hash FROM sources WHERE hash=?").get(id)) {
          file = path.join(root, "archive/sources", id + ".csv"); filename = `source-${id.slice(0,12)}.csv`;
        } else if (kind === "snapshot" && /^[a-f0-9-]{36}$/.test(id || "")) {
          const snapshot = store.db.prepare("SELECT * FROM snapshots WHERE id=?").get(id);
          if (snapshot) { file = path.join(root, "archive/snapshots", snapshot.month, `r${String(snapshot.revision).padStart(4,"0")}-${snapshot.id}.json`); filename = `snapshot-${snapshot.month}.json`; }
        }
        if (!file || !fs.existsSync(file)) return json(res, 404, {ok:false,error:"Archive file not found."});
        res.writeHead(200, {"Content-Type":"application/octet-stream", "Content-Disposition":`attachment; filename="${filename}"`, "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
        fs.createReadStream(file).pipe(res); return;
      }
      if (req.method !== "GET" || url.pathname.startsWith("/api/"))
        return json(res, 404, { ok: false, error: "Not found." });
      // Serve only built application assets; never expose workspace files or source paths.
      const relative =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname.slice(1));
      if (
        relative !== "index.html" &&
        !/^assets\/[a-zA-Z0-9._-]+$/.test(relative)
      )
        return json(res, 404, { ok: false, error: "Not found." });
      const file = path.join(repo, "dist", relative);
      if (!fs.existsSync(file))
        return json(res, 404, {
          ok: false,
          error: "Build the app first with npm run build.",
        });
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
      };
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      });
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      if (!res.headersSent) json(res, 400, { ok: false, error: error.message });
      else res.end();
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, direct ? directURL.hostname : "127.0.0.1", () => {
        origin = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  } catch (error) {
    unsubscribe();
    if (!shared) { store.close(); fs.unlinkSync(lock); }
    throw error;
  }
  return {
    origin,
    service,
    store,
    async close() {
      unsubscribe();
      for (const res of clients) res.end();
      server.closeIdleConnections();
      await new Promise((resolve) => server.close(resolve));
      if (!shared) { store.close(); fs.unlinkSync(lock); }
    },
  };
}
module.exports = { startWebServer };
if (require.main === module)
  startWebServer({ port: Number(process.env.PORT || 4173) })
    .then((app) => {
      console.log(
        `Urbanomics browser verification: ${app.origin} (separate local workspace)`,
      );
      let closing = false;
      for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, async () => {
          if (closing) return;
          closing = true;
          await app.close();
          process.exit();
        });
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
