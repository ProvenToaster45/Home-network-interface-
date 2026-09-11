# HomeControl agent

This is the piece that actually touches your network — the PWA on Railway is
just a browser tab, and a browser tab can't scan your LAN, send Wake-on-LAN
packets, or reboot your router. This agent runs on something always-on in
your house (Raspberry Pi, old laptop, NAS, mini PC) and does that work; the
app talks to it over the network.

## 1. Install

Needs Node.js 18+ on the machine that will run it (a Pi is fine).

```
git clone <wherever you put this> homecontrol-agent
cd homecontrol-agent
npm install
cp config.example.json config.json
```

Edit `config.json`:
- Set `apiKey` to a long random string (e.g. run `openssl rand -hex 32`). This is the password the app sends on every request — without it, anyone who finds your agent's address could scan your network or reboot your router.
- Set `gateway.ip` to your router's LAN IP (usually `192.168.1.1` or `192.168.0.1`).
- Leave `router.method` as `"none"` for now unless you already know how your router accepts remote reboot commands (see "Router reboot" below).

Run it:
```
npm start
```
You should see `HomeControl agent listening on http://0.0.0.0:5100`.

To keep it running after reboots/disconnects, use a process manager, e.g.:
```
npm install -g pm2
pm2 start server.js --name homecontrol-agent
pm2 save
pm2 startup   # follow the printed instructions to enable on boot
```

## 2. Make it reachable by the app — the part that actually matters

The web app is served over **HTTPS** (Railway). If you just point it at
`http://<pi-ip>:5100`, Safari will silently block the requests — a page
loaded over HTTPS is not allowed to fetch plain HTTP ("mixed content"). You
need the agent reachable over HTTPS with a trusted certificate.

**Recommended: Tailscale Serve** — private, stable, real certificate, works
away from home too, and only your own devices can reach it.

1. Install Tailscale on the agent machine and sign in: https://tailscale.com/download
2. Install the Tailscale app on your iPhone and sign in with the same account.
3. On the agent machine, run:
   ```
   sudo tailscale serve https / http://localhost:5100
   ```
4. Tailscale prints an HTTPS address like `https://your-pi-name.your-tailnet.ts.net`. That's your **Agent URL** — enter it in the HomeControl app's Settings page, along with the `apiKey` from `config.json`.

Because this only works while your iPhone is signed into the same Tailscale account, it's the safest option — nothing is exposed to the open internet.

*Alternative:* a Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:5100`) also gives you an HTTPS URL, but the default quick tunnels are public (anyone with the link can hit your agent) and the address changes every restart — only use this if you understand that tradeoff, and rely on the `apiKey` check to keep it locked down.

## 3. Router reboot (optional, needs your specific hardware)

There's no universal "reboot" command across router brands, so this ships
disabled (`router.method: "none"`) and the app will show "not configured"
if you tap Reboot. To wire it up:

- **If your router runs OpenWRT / has SSH access**: set `router.method` to
  `"ssh"` and fill in `router.ssh` (host, username, password or key path).
  The default command is just `reboot`.
- **If your router has an HTTP API** (some ASUS/Ubiquiti/pfSense setups
  expose one): set `router.method` to `"http"` and fill in the endpoint.
- Otherwise, most consumer routers only support reboot from their own
  app/web UI — the HomeControl button can't replace that, and I won't
  fabricate a command that might not exist.

## 4. VPN toggle (optional)

Same idea: `vpn.method: "command"` runs whatever shell command you give it
(e.g. a WireGuard `wg-quick up/down wg0` script) on the agent machine.
Leave it as `"none"` if you don't have a scriptable VPN setup.

## What this agent does NOT do

- It doesn't control Wi-Fi radios/SSIDs/passwords — that's router-specific
  firmware territory with no common API. Reboot is the one lever most
  routers give you.
- The device scan reads the OS's ARP cache, not an active network sweep —
  it'll show devices that have talked on the LAN recently, not necessarily
  every device that's technically connected.
- The speed test is a single-connection download sample, not a lab-grade
  measurement.
