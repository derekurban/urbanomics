const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
function isTailscaleIPv4(value) {
  const parts = String(value).split(".");
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255) &&
    Number(parts[0]) === 100 && Number(parts[1]) >= 64 && Number(parts[1]) <= 127;
}
function createPeerAuthorizer(login, executable = "C:/Program Files/Tailscale/tailscale.exe", lookup) {
  const cache = new Map();
  return async address => {
    if (!isTailscaleIPv4(address)) return false;
    const prior = cache.get(address);
    if (prior && prior.until > Date.now()) return prior.allowed;
    try {
      const identity = lookup ? await lookup(address) : JSON.parse((await run(executable, ["whois", "--json", address], {windowsHide:true, timeout:5000, maxBuffer:1024*1024})).stdout);
      const allowed = identity.UserProfile?.LoginName === login && !!identity.Node && !identity.Node.Tags?.length;
      if (cache.size > 128) cache.clear();
      cache.set(address, {allowed, until:Date.now()+30000});
      return allowed;
    } catch { return false; }
  };
}
module.exports = { isTailscaleIPv4, createPeerAuthorizer };
