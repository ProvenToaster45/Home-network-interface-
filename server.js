// HomeControl local agent
// Runs on a Pi / always-on machine on your LAN. The HomeControl PWA (hosted on
// Railway) talks to this agent to do things a browser sandbox can't: scan the
// LAN, send Wake-on-LAN packets, ping hosts, and (if you configure it) reboot
// your router or toggle a VPN.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
const ping = require('ping');
const wol = require('wol');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('\nMissing config.json.\nCopy config.example.json to config.json and fill in your values first.\n');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const app = express();
app.use(cors());
app.use(express.json());

const startedAt = Date.now();

// ---- auth ----------------------------------------------------------------
// Every request (except /api/health) must send the shared key so a stranger
// who finds your tunnel URL can't scan your LAN or reboot your router.
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  const key = req.header('x-api-key');
  if (!config.apiKey || config.apiKey === 'REPLACE_WITH_A_LONG_RANDOM_STRING') {
    return res.status(500).json({ error: 'Agent has no apiKey configured. Edit config.json.' });
  }
  if (key !== config.apiKey) {
    return res.status(401).json({ error: 'Missing or invalid x-api-key header.' });
  }
  next();
});

// ---- health (no auth, used by the web app to check reachability) ---------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
});

// ---- status ----------------------------------------------------------------
app.get('/api/status', async (req, res) => {
  try {
    const target = config.gateway?.ip || '1.1.1.1';
    const result = await ping.promise.probe(target, { timeout: 3 });
    const nets = os.networkInterfaces();
    let localIp = null;
    for (const iface of Object.values(nets)) {
      for (const addr of iface || []) {
        if (addr.family === 'IPv4' && !addr.internal) { localIp = addr.address; break; }
      }
      if (localIp) break;
    }
    res.json({
      internetUp: result.alive,
      latencyMs: result.alive ? Math.round(parseFloat(result.time)) : null,
      gatewayIp: target,
      agentLocalIp: localIp,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      hostname: os.hostname(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- ping any host ---------------------------------------------------------
app.post('/api/ping', async (req, res) => {
  const host = (req.body && req.body.host) || config.gateway?.ip;
  if (!host) return res.status(400).json({ error: 'Provide { host } in the request body.' });
  try {
    const result = await ping.promise.probe(host, { timeout: 3 });
    res.json({ host, alive: result.alive, latencyMs: result.alive ? Math.round(parseFloat(result.time)) : null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- device scan (reads the OS ARP table — devices that have talked to
// this machine recently show up here; it will not see every device on a
// large/segmented network, just what the local ARP cache knows about) ------
app.get('/api/devices', (req, res) => {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'arp' : 'arp';
  const args = isWin ? ['-a'] : ['-a'];
  execFile(cmd, args, (err, stdout) => {
    if (err) return res.status(500).json({ error: 'Could not read ARP table: ' + String(err) });
    const devices = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
      // Linux/macOS: "hostname (192.168.1.23) at aa:bb:cc:dd:ee:ff [ether] on eth0"
      // Windows:     "  192.168.1.23          aa-bb-cc-dd-ee-ff     dynamic"
      let match = line.match(/\(([\d.]+)\)\s+at\s+([0-9a-f:]{17})/i);
      if (!match) match = line.match(/([\d.]+)\s+([0-9a-f-]{17})/i);
      if (match) {
        const ip = match[1];
        const mac = match[2].replace(/-/g, ':').toLowerCase();
        if (mac === 'ff:ff:ff:ff:ff:ff' || ip.startsWith('224.') || ip.startsWith('239.')) continue;
        const hostMatch = line.match(/^([^\s(]+)\s+\(/);
        devices.push({ ip, mac, hostname: hostMatch ? hostMatch[1] : null });
      }
    }
    res.json({ devices, note: 'Read from the ARP cache — devices that have been quiet a while may not appear until they talk on the network again.' });
  });
});

// ---- wake-on-lan ------------------------------------------------------------
app.post('/api/wake', (req, res) => {
  const mac = req.body && req.body.mac;
  if (!mac) return res.status(400).json({ error: 'Provide { mac } in the request body.' });
  wol.wake(mac, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json({ sent: true, mac });
  });
});

// ---- lightweight speed test (approximate — downloads a fixed-size file
// from a public, high-bandwidth test endpoint and times it) -----------------
app.get('/api/speedtest', async (req, res) => {
  const testUrl = 'https://speed.cloudflare.com/__down?bytes=25000000'; // 25MB
  try {
    const start = Date.now();
    const response = await fetch(testUrl);
    if (!response.ok) throw new Error('Test endpoint returned ' + response.status);
    const buf = await response.arrayBuffer();
    const seconds = (Date.now() - start) / 1000;
    const mbps = (buf.byteLength * 8) / seconds / 1_000_000;
    res.json({ downloadMbps: Math.round(mbps * 10) / 10, note: 'Approximate — one download sample, not an averaged multi-connection test.' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- router reboot (only works if you configured router.method) -----------
app.post('/api/router/reboot', async (req, res) => {
  const r = config.router || { method: 'none' };
  if (r.method === 'none') {
    return res.status(501).json({ error: "Router reboot isn't configured. Set router.method to 'ssh' or 'http' in config.json." });
  }
  if (r.method === 'ssh') {
    const { Client } = require('ssh2');
    const conn = new Client();
    const connectOpts = {
      host: r.ssh.host, port: r.ssh.port || 22, username: r.ssh.username,
    };
    if (r.ssh.privateKeyPath) connectOpts.privateKey = fs.readFileSync(r.ssh.privateKeyPath);
    else connectOpts.password = r.ssh.password;
    conn.on('ready', () => {
      conn.exec(r.ssh.command || 'reboot', (err) => {
        conn.end();
        if (err) return res.status(500).json({ error: String(err) });
        res.json({ ok: true });
      });
    }).on('error', (err) => {
      res.status(500).json({ error: String(err) });
    }).connect(connectOpts);
    return;
  }
  if (r.method === 'http') {
    try {
      const resp = await fetch(r.http.url, { method: r.http.method || 'POST', headers: r.http.headers || {} });
      res.json({ ok: resp.ok, status: resp.status });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
    return;
  }
  res.status(400).json({ error: 'Unknown router.method in config.json' });
});

// ---- vpn toggle (only works if you configured vpn.method) ------------------
app.post('/api/vpn/:action', (req, res) => {
  const v = config.vpn || { method: 'none' };
  const action = req.params.action; // 'up' | 'down' | 'status'
  if (v.method === 'none') {
    return res.status(501).json({ error: "VPN control isn't configured. Set vpn.method to 'command' in config.json." });
  }
  const cmdMap = { up: v.upCommand, down: v.downCommand, status: v.statusCommand };
  const cmd = cmdMap[action];
  if (!cmd) return res.status(400).json({ error: `No command configured for action '${action}'.` });
  execFile('/bin/sh', ['-c', cmd], (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: String(err), stderr });
    res.json({ ok: true, output: stdout.trim() });
  });
});

const port = config.port || 5100;
app.listen(port, () => {
  console.log(`HomeControl agent listening on http://0.0.0.0:${port}`);
  console.log('Point the HomeControl app at this machine\'s address in Settings.');
});
