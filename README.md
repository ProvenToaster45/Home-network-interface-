# HomeControl

iPhone Home Network Control Panel — installable PWA + a local agent that does
the real network work.

## How it fits together
- **This folder** is the app UI, deployed on Railway (already live for you).
- **/agent** (in this same repo, one level up from this folder if you kept
  the layout — otherwise wherever you put it) is a small server you run on
  a Raspberry Pi or always-on machine on your home network. It's the only
  piece that can actually touch your LAN: scanning devices, sending
  Wake-on-LAN packets, pinging hosts, running a speed test, and (if you
  configure it) rebooting your router.

**Nothing works until you set up the agent and point Settings at it.**
See `agent/README.md` for the full setup — the short version:
1. `npm install` the agent on your Pi, copy `config.example.json` to
   `config.json`, set an `apiKey`.
2. Run it with `npm start` (or pm2 for auto-restart).
3. Get an HTTPS address for it — Tailscale Serve is the recommended way
   (`sudo tailscale serve https / http://localhost:5100`), since this app is
   served over HTTPS and browsers block plain-HTTP calls from an HTTPS page.
4. In the app's Settings tab, enter that HTTPS address and the API key, tap
   "Save & test".

Once connected: Home shows live internet/latency/device-count, Devices lists
what the agent's ARP scan sees (with Ping/Wake per device), Network runs a
real speed test, and Reboot works only if you've configured `router.method`
in the agent's config (there's no universal router-reboot command across
brands, so it's off by default rather than faking it).

## Installing on iPhone
Open the hosted URL in **Safari**, tap Share → **Add to Home Screen**.

## What's still a placeholder
- Wi-Fi radio controls (SSID/password changes) — no common API across router
  brands, not implemented.
- VPN toggle — only works if you fill in `vpn.method` in the agent config
  with your own up/down commands.
