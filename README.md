# HomeControl

iPhone Home Network Control Panel — installable as a PWA.

## What's in this build
- Apple meta tags (`apple-mobile-web-app-capable`, status bar style, apple-touch-icon) so "Add to Home Screen" launches full-screen, no Safari chrome.
- Real app icons (192/512/1024 + 180x180 apple-touch-icon) in `icons/`.
- `manifest.webmanifest` filled in with icons, scope, and start_url.
- Safe-area CSS padding so content clears the iPhone notch/Dynamic Island and home indicator.
- Service worker (`sw.js`) bumped to `v2` with cache versioning so updates actually roll out to installed devices.

## Important: this must be served over HTTPS (or localhost), not opened as a file
iOS Safari will not install a service worker or offer a proper "Add to Home Screen" PWA experience from a `file://` URL. You need to host these 6 files (`index.html`, `style.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `icons/`) somewhere reachable from your iPhone. Easiest free options:

- **GitHub Pages** — push this folder to a repo, enable Pages, done.
- **Netlify / Vercel / Cloudflare Pages** — drag-and-drop deploy, free tier, gives you an HTTPS URL instantly.
- **Run it on your own network** — e.g. `python3 -m http.server 8080` on a machine on your LAN, then visit `http://<that-machine's-LAN-IP>:8080` from your iPhone (works without HTTPS since it's plain HTTP on your local network, but the service worker/install prompt is more reliable with real HTTPS).

## Installing on iPhone
1. Open the hosted URL in **Safari** (must be Safari, not Chrome, for the install option to appear).
2. Tap the **Share** icon → **Add to Home Screen**.
3. Launch it from the home screen — it opens full-screen like a native app.

## The one real limitation
A web app (even installed as a PWA) runs in a sandboxed browser context — it cannot reach into your router just because it's on the same Wi-Fi. Every "control" in this UI (reboot, Wi-Fi toggle, device management) is currently a placeholder toast. To make any of it real you need one of:

- Your router's **existing web API** (many consumer routers, e.g. some ASUS/Ubiquiti/pfSense models, expose one) — `app.js` would call that directly from the phone if it's reachable and CORS-friendly.
- A small **local agent/server** you run on your network (e.g. a Raspberry Pi or always-on machine) that the app talks to over HTTP, which in turn does the actual router/SSH/SNMP calls.

For media playback: only connect sources you own or are licensed to distribute.
