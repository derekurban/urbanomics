// Read-only design notebook. Shares the app's personal Tailscale identity guard,
// but never opens the ledger or exposes a filesystem directory.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createPeerAuthorizer, isTailscaleIPv4 } = require('../electron/tailscale-auth.cjs');
const repo = path.resolve(__dirname, '..');
const dataDir = process.env.URBANOMICS_DATA_DIR || path.join(repo, 'private', 'desktop');
const remote = JSON.parse(fs.readFileSync(path.join(dataDir, 'remote-access.json'), 'utf8'));
const appURL = new URL(remote.origin);
if (remote.mode !== 'direct' || !isTailscaleIPv4(appURL.hostname) || !remote.login)
  throw new Error('Configure direct personal Tailscale access before starting the notebook.');
const port = Number(process.env.URBANOMICS_NOTEBOOK_PORT || 4176);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid notebook port.');
const origin = `http://${appURL.hostname}:${port}`;
const authorize = createPeerAuthorizer(remote.login, remote.executable);
const escape = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function render(notes) {
  const table = notes.split('\n').filter(line => /^\| /.test(line) && !line.startsWith('| Area') && !line.startsWith('| ---'));
  const sections = table.map(line => {
    const [name, built, open] = line.split('|').slice(1,4).map(s => s.trim());
    const id = 'area-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<details id="${id}"><summary>${escape(name)}</summary><div class="detail-body"><p class="detail-label">Established</p><p>${escape(built)}</p><p class="detail-label open">Open experience questions</p><p>${escape(open)}</p></div></details>`;
  }).join('\n');
  const mermaid = notes.match(/```mermaid\r?\n([\s\S]*?)```/)?.[1] || '';
  return fs.readFileSync(path.join(repo,'docs/experience-site/index.html'),'utf8')
    .replace('__SECTIONS__', sections).replace('__MERMAID__', escape(mermaid));
}
const server = http.createServer(async (req,res) => {
  const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
  const send = (status,type,body) => { res.writeHead(status,{...headers,'Content-Type':type}); res.end(req.method==='HEAD' ? undefined : body); };
  try {
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || !await authorize(req.socket.remoteAddress))
      return send(403,'text/plain; charset=utf-8','Personal Tailscale connection required.');
    if (!['GET','HEAD'].includes(req.method)) return send(405,'text/plain','Read-only notebook.');
    const url = new URL(req.url,origin);
    // Only built, disposable prototype assets. No API or database is connected.
    if (url.pathname === '/lab') { res.writeHead(302,{...headers,Location:'/lab/'}); return res.end(); }
    if (url.pathname === '/lab/' || /^\/lab\/assets\/[a-zA-Z0-9._-]+\.(js|css)$/.test(url.pathname)) {
      const relative = url.pathname === '/lab/' ? 'index.html' : url.pathname.slice('/lab/'.length);
      const file = path.join(repo,'private/ingest-lab',relative);
      if (!fs.existsSync(file)) return send(404,'text/plain','Build the playground first.');
      return send(200,relative.endsWith('.js')?'text/javascript; charset=utf-8':relative.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8',fs.readFileSync(file));
    }
    if (url.pathname === '/app') { res.writeHead(302,{...headers,Location:appURL.origin}); return res.end(); }
    if (!['/','/experience-map.md'].includes(url.pathname)) return send(404,'text/plain','Not found.');
    const notes = fs.readFileSync(path.join(repo,'docs/experience-map.md'),'utf8');
    return url.pathname === '/' ? send(200,'text/html; charset=utf-8',render(notes)) : send(200,'text/markdown; charset=utf-8',notes);
  } catch (error) { console.error(error.message); if (!res.headersSent) send(500,'text/plain','Notebook unavailable.'); else res.end(); }
});
server.on('error', error => { console.error(error.message); process.exitCode=1; });
server.listen(port,appURL.hostname,() => console.log(`Urbanomics experience map: ${origin}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close());
