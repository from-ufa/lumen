# Lumen — Ergo Node Dashboard

**Lumen** is the Ergo Node Dashboard — immersive visualizer for **your** Ergo node: 3D peer constellation, world map (GeoIP), live metrics, real block TX counts, mempool → SigmaSpace, Share Card.

> **Full project handoff (for AI / humans):** see **[LUMEN.md](./LUMEN.md)**  
> **Server (node + oracles):** `/root/SERVER.md` on production host

## Production (this server)

| | |
|--|--|
| Path | `/home/aether` |
| Service | `systemctl status aether` |
| Bind | `0.0.0.0:3000` (`proxy.ts` guards access) |
| Proxy | `/api/node/*` → Ergo REST `127.0.0.1:9053` |
| Public Mode | file `.aether-public-password` (chmod 600); set via NODE SETTINGS |

### Local / SSH tunnel (always works)

```bash
ssh -L 3000:127.0.0.1:3000 root@80.209.232.82 -N
# open http://localhost:3000
```

Localhost requests skip auth even when Public Mode is on.

## How to open publicly

1. Bind is already `0.0.0.0:3000`. Password is **not** in systemd env.

2. Set / change password (easiest):

```text
Open Lumen on localhost (SSH tunnel) → NODE SETTINGS → Public Access
→ enter password (min 10 chars) → SET / CHANGE PUBLIC PASSWORD
```

Or from the shell:

```bash
printf '%s\n' 'your-long-secret' > /home/aether/.aether-public-password
chmod 600 /home/aether/.aether-public-password
# no rebuild needed — proxy reads the file on every request
```

3. Open from the internet:

| Method | How |
|--------|-----|
| Browser Basic Auth | `http://YOUR_IP:3000` → any username + public password |
| One-shot link | `http://YOUR_IP:3000/?password=YOUR_SECRET` (sets httpOnly cookie) |
| Header | `X-Aether-Password: YOUR_SECRET` |

4. UI: **PUBLIC** badge when password file is non-empty; **SHARE MY NODE** for link/PNG card.

Empty / missing `.aether-public-password` → remote requests **401**, localhost still works.

> Firewall: ensure port **3000/tcp** is allowed if you want external access.  
> Do not expose the Ergo REST port (`9053`) without API key / firewall; Lumen proxies it server-side.

## Dev

```bash
cd /home/aether
npm install    # .npmrc has legacy-peer-deps=true
# optional: echo 'AETHER_PUBLIC_PASSWORD=devpass' > .env.local
npm run dev    # or: npm run build && npm start
```

Default node URL in UI: **`/api/node`** (do not use bare `localhost:9053` from a remote browser without tunnel/CORS).

## Mobile & PWA

- Responsive layout for ~375–430px (top bar wrap, 2-col metrics, shorter viz height)
- Installable: open in browser → **Add to Home Screen** (manifest + icons, no service worker yet)
- Icons: `/public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- Manifest: `/manifest.webmanifest` (via `app/manifest.ts`)

## Stack

Next.js 16 · React 19 · R3F 9 · Leaflet · geoip-lite · TanStack Query · Framer Motion · html-to-image · qrcode.react

## License / community

Built for Ergo node runners. Not affiliated with Ergo Platform foundation.
