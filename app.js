// HomeControl app logic — talks to the local agent (see /agent in the repo)
// for anything that needs real network access. Settings holds the agent's
// URL + API key in localStorage; every /api call below goes through agentFetch().

const $ = (id) => document.getElementById(id);

// ---------- toast ----------
function toast(s) {
  $('toast').textContent = s;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2200);
}

// ---------- clock ----------
function tick() { $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
setInterval(tick, 1000); tick();

// ---------- settings / agent connection ----------
function getAgentUrl() { return (localStorage.agentUrl || '').replace(/\/+$/, ''); }
function getAgentKey() { return localStorage.agentKey || ''; }

async function agentFetch(path, opts = {}) {
  const base = getAgentUrl();
  if (!base) throw new Error('No agent configured — set it up in Settings.');
  const res = await fetch(base + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': getAgentKey(), ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) {
    const msg = (body && body.error) || `Agent returned ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

function setAgentPill(state, text) {
  const el = $('agentPill');
  el.className = 'agentpill ' + state;
  el.textContent = text;
}

async function checkAgent() {
  const base = getAgentUrl();
  if (!base) { setAgentPill('bad', '● no agent set'); return false; }
  setAgentPill('checking', '● checking agent…');
  try {
    const res = await fetch(base + '/api/health');
    if (!res.ok) throw new Error();
    setAgentPill('ok', '● agent online');
    return true;
  } catch (_) {
    setAgentPill('bad', '● agent unreachable');
    return false;
  }
}

// ---------- view routing ----------
const views = ['home', 'devices', 'network', 'settings'];
const titles = {
  home: ['HomeControl', 'Your network, without the tiny router screens from 2009.'],
  devices: ['Devices', 'Everything the agent has seen on your LAN recently.'],
  network: ['Network', 'Speed, gateway info, and router controls.'],
  settings: ['Settings', 'Point the app at your local agent.'],
};
function showView(name) {
  views.forEach((v) => { $('view-' + v).hidden = v !== name; });
  document.querySelectorAll('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('pageTitle').textContent = titles[name][0];
  $('pageSubtitle').textContent = titles[name][1];
  if (name === 'devices') loadDevices();
  if (name === 'network') loadNetworkView();
  if (name === 'home') loadHome();
}
document.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => showView(el.dataset.view)));

// ---------- modal helpers ----------
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', (e) => {
  closeModal(e.target.closest('.modal').id);
}));

// ---------- HOME ----------
async function loadHome() {
  const ok = await checkAgent();
  if (!ok) {
    $('internetValue').textContent = '—';
    $('internetPill').textContent = '● agent offline';
    return;
  }
  try {
    const s = await agentFetch('/api/status');
    $('internetValue').textContent = s.internetUp ? 'Online' : 'Offline';
    $('internetPill').textContent = s.internetUp ? '● Connected' : '● Down';
    $('internetPill').style.color = s.internetUp ? 'var(--green)' : 'var(--red)';
    $('gatewayIp').textContent = s.gatewayIp || '—';
    $('agentUptime').textContent = formatUptime(s.uptimeSeconds);
    $('latValue').textContent = s.latencyMs != null ? s.latencyMs : '—';
    $('agentValue').textContent = 'Online';
    $('agentHost').textContent = s.hostname || '—';
  } catch (err) {
    toast(err.message);
  }
  try {
    const d = await agentFetch('/api/devices');
    $('deviceCount').textContent = d.devices.length;
  } catch (_) { $('deviceCount').textContent = '—'; }

  // VPN label reflects config without triggering an action
  $('qaVpnLabel').textContent = 'Tap for status';
}

function formatUptime(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

$('btnTestConnection').addEventListener('click', async () => {
  toast('Testing connection…');
  await loadHome();
  toast('Done');
});

// Quick actions
$('qaWake').addEventListener('click', async () => {
  openModal('wakeModal');
  $('wakeDeviceList').innerHTML = '<div class="empty"><span class="spinner"></span> Loading devices…</div>';
  try {
    const d = await agentFetch('/api/devices');
    if (!d.devices.length) { $('wakeDeviceList').innerHTML = '<div class="empty">No devices seen recently.</div>'; return; }
    $('wakeDeviceList').innerHTML = '';
    d.devices.forEach((dev) => {
      const row = document.createElement('div');
      row.className = 'wake-item';
      row.innerHTML = `<div><div style="font-weight:600">${dev.hostname || dev.ip}</div><div class="small">${dev.mac}</div></div>`;
      const btn = document.createElement('button');
      btn.className = 'secondary'; btn.textContent = 'Wake';
      btn.onclick = () => sendWake(dev.mac);
      row.appendChild(btn);
      $('wakeDeviceList').appendChild(row);
    });
  } catch (err) {
    $('wakeDeviceList').innerHTML = `<div class="empty">${err.message}</div>`;
  }
});
$('wakeManualBtn').addEventListener('click', () => {
  const mac = $('wakeManualMac').value.trim();
  if (!mac) return toast('Enter a MAC address');
  sendWake(mac);
});
async function sendWake(mac) {
  try {
    await agentFetch('/api/wake', { method: 'POST', body: JSON.stringify({ mac }) });
    toast('Wake packet sent to ' + mac);
    closeModal('wakeModal');
  } catch (err) { toast(err.message); }
}

$('qaPing').addEventListener('click', () => { $('pingHost').value = ''; $('pingResult').textContent = ''; openModal('pingModal'); });
$('pingRunBtn').addEventListener('click', async () => {
  const host = $('pingHost').value.trim();
  if (!host) return toast('Enter a host or IP');
  $('pingResult').innerHTML = '<span class="spinner"></span> Pinging…';
  try {
    const r = await agentFetch('/api/ping', { method: 'POST', body: JSON.stringify({ host }) });
    $('pingResult').textContent = r.alive ? `${host} is up — ${r.latencyMs} ms` : `${host} did not respond`;
  } catch (err) { $('pingResult').textContent = err.message; }
});

$('qaVpn').addEventListener('click', async () => {
  try {
    const r = await agentFetch('/api/vpn/status', { method: 'POST' });
    toast(r.output || 'VPN status checked');
  } catch (err) { toast(err.message); }
});

$('qaReboot').addEventListener('click', () => confirmReboot());
$('btnReboot').addEventListener('click', () => confirmReboot());
async function confirmReboot() {
  if (!confirm('Reboot the router now? Devices will briefly lose connectivity.')) return;
  try {
    await agentFetch('/api/router/reboot', { method: 'POST' });
    toast('Reboot command sent');
  } catch (err) { toast(err.message); }
}

// ---------- DEVICES ----------
let allDevices = [];
async function loadDevices() {
  $('deviceList').innerHTML = '<div class="empty"><span class="spinner"></span> Scanning ARP table…</div>';
  try {
    const d = await agentFetch('/api/devices');
    allDevices = d.devices;
    renderDevices(allDevices);
  } catch (err) {
    $('deviceList').innerHTML = `<div class="empty">${err.message}</div>`;
  }
}
function renderDevices(list) {
  if (!list.length) { $('deviceList').innerHTML = '<div class="empty">No devices found.</div>'; return; }
  $('deviceList').innerHTML = '';
  list.forEach((dev) => {
    const row = document.createElement('div');
    row.className = 'device-row';
    row.innerHTML = `
      <span class="dot"></span>
      <div class="meta"><div class="name">${dev.hostname || dev.ip}</div><div class="ip">${dev.ip} · ${dev.mac}</div></div>
    `;
    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex'; btnGroup.style.gap = '8px';
    const pingBtn = document.createElement('button');
    pingBtn.className = 'secondary'; pingBtn.textContent = 'Ping';
    pingBtn.onclick = async () => {
      pingBtn.disabled = true; pingBtn.textContent = '…';
      try {
        const r = await agentFetch('/api/ping', { method: 'POST', body: JSON.stringify({ host: dev.ip }) });
        toast(r.alive ? `${dev.ip} — ${r.latencyMs} ms` : `${dev.ip} did not respond`);
      } catch (err) { toast(err.message); }
      pingBtn.disabled = false; pingBtn.textContent = 'Ping';
    };
    const wakeBtn = document.createElement('button');
    wakeBtn.className = 'secondary'; wakeBtn.textContent = 'Wake';
    wakeBtn.onclick = () => sendWake(dev.mac);
    btnGroup.appendChild(pingBtn); btnGroup.appendChild(wakeBtn);
    row.appendChild(btnGroup);
    $('deviceList').appendChild(row);
  });
}
$('deviceSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderDevices(allDevices.filter((d) => (d.hostname || '').toLowerCase().includes(q) || d.ip.includes(q) || d.mac.includes(q)));
});
$('btnRescan').addEventListener('click', loadDevices);

// ---------- NETWORK ----------
async function loadNetworkView() {
  try {
    const s = await agentFetch('/api/status');
    $('netGateway').textContent = s.gatewayIp || '—';
    $('netAgentHost').textContent = s.hostname || '—';
    $('netAgentIp').textContent = s.agentLocalIp || '—';
    $('netAgentUptime').textContent = formatUptime(s.uptimeSeconds);
  } catch (err) {
    toast(err.message);
  }
}
$('btnSpeedtest').addEventListener('click', async () => {
  $('netDl').innerHTML = '<span class="spinner"></span>';
  $('netSpeedNote').textContent = 'Downloading a 25MB test file — a few seconds…';
  try {
    const r = await agentFetch('/api/speedtest');
    $('netDl').textContent = r.downloadMbps + ' Mbps';
    $('dlValue').textContent = r.downloadMbps;
    $('netSpeedNote').textContent = r.note;
  } catch (err) {
    $('netDl').textContent = '—';
    $('netSpeedNote').textContent = err.message;
  }
});

// ---------- SETTINGS ----------
$('agentUrl').value = localStorage.agentUrl || '';
$('agentKey').value = localStorage.agentKey || '';
$('btnSaveAgent').addEventListener('click', async () => {
  localStorage.agentUrl = $('agentUrl').value.trim();
  localStorage.agentKey = $('agentKey').value.trim();
  $('settingsStatus').textContent = 'Testing…';
  const ok = await checkAgent();
  $('settingsStatus').textContent = ok ? 'Connected ✓' : 'Could not reach agent';
  if (ok) toast('Agent saved');
});

// ---------- boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
checkAgent();
loadHome();
