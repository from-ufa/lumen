# Lumen — Ergo Node Dashboard

**Handoff / context pack** for humans and AI sessions.  
Snapshot: **2026-07-24**. Read this first, then code.

> **Rebrand:** product was **Aether → Lumen** (2026-07-24).  
> Paths and systemd still use legacy names: `/home/aether`, `aether.service`, `aether-crawl.*`.  
> Auth accepts Lumen + legacy Aether cookie/header/password file names.

| | |
|--|--|
| **Product** | **Lumen** — Ergo Node Dashboard |
| **Tagline** | The living pulse of your Ergo node |
| **Version** | 0.1.0 (`package.json` name: `lumen`) |
| **Domain** | **https://ergolumen.net** (www → same) |
| **Host** | `toa.c.hostens.cloud` / `80.209.232.82` |
| **App dir** | `/home/aether` |
| **GitHub** | `from-ufa/aether` (repo name unchanged) |
| **UI** | Public: **https://ergolumen.net** · Local: `http://127.0.0.1:3000` |
| **Edge** | **Caddy** HTTPS (Let’s Encrypt) → `127.0.0.1:3000` |
| **Bridge WSS** | **wss://ergolumen.net/ws/bridge** → `127.0.0.1:3100/bridge` |
| **Related** | `/root/SERVER.md` (host / Ergo / oracles / Telegram) |

### Public URLs (canonical)

| Use | URL |
|-----|-----|
| Dashboard | `https://ergolumen.net` |
| Bridge install assets | `https://ergolumen.net/bridge/*` (install.sh, context.tar, …) |
| Bridge WebSocket | `wss://ergolumen.net/ws/bridge` |
| Bridge hub (loopback only) | `http://127.0.0.1:3100` (not public) |
| Next (loopback) | `http://127.0.0.1:3000` |

### Caddy

| | |
|--|--|
| Config | `/etc/caddy/Caddyfile` |
| Unit | `caddy.service` (enabled) |
| Logs | `/var/log/caddy/ergolumen.log` |
| Certs | automatic Let’s Encrypt for `ergolumen.net` + `www` |
| Notes | `nginx` on :80 was **stopped/disabled** (config backup `/root/nginx-backup-ergolumen/`). Legacy `/devnet/` proxy kept in Caddy. |

```bash
systemctl status caddy
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

---

## 1. What Lumen is

**Lumen** is a **read-only** web dashboard for an **Ergo mainnet node** operator.

It shows:

- Node status (`/info`: height, peers, mempool size, name, network)
- **3D constellation** (R3F) — your node + connected peers
- **World map** (Leaflet + GeoIP + clustering, boom on new tip)
- **Recent blocks** with real `txCount` from the node (not faked)
- **Mempool** sample + SigmaSpace links
- **AVG BLOCK TIME** from `GET /blocks/lastHeaders/100`
- **Share My Node** card (QR, copy link/text, PNG)
- **Public Mode** — optional remote access with a password
- **PWA** manifest/icons (no service worker)
- **Lumen Bridge** — connect a *remote* user node without inbound ports

Not a miner, wallet, explorer, or tx broadcaster.  
Does **not** touch `ergonode` / oracle units. Only **allowlisted GET** Ergo REST.

---

## 2. Stack and layout

### Stack

| Layer | Tech |
|-------|------|
| App | **Next.js 16** (App Router) · **React 19** · TypeScript |
| Data | **TanStack Query** · same-origin API proxies |
| 3D | **@react-three/fiber** · drei · three |
| Map | **Leaflet** · markercluster · **geoip-lite** (server) |
| UI | Tailwind 4 · Framer Motion · lucide · sonner |
| Share | html-to-image · qrcode.react |
| Bridge agent | Node 20 (Docker alpine) · `ws` |
| Bridge hub | Node · `ws` · port **3100** |

### Tree (high level)

```text
/home/aether/
├── app/
│   ├── page.tsx                 # Dashboard (modes, queries, layout)
│   ├── proxy.ts                 # → root proxy.ts (Next 16 network proxy)
│   ├── components/              # UI: settings, map, 3D, metrics, share…
│   ├── lib/                     # node-api, blocks, copy-text, bridge-server client
│   ├── api/
│   │   ├── node/[...path]/     # Proxy → local Ergo :9053
│   │   ├── bridge/tokens|status|node/  # Bridge hub proxy
│   │   ├── peers/map/           # Geo map (Lumen or Bridge token)
│   │   ├── public-status/
│   │   └── public-password/
│   └── bridge/[file]/          # Public downloads: install.sh, context.tar, …
├── bridge/                      # Outbound agent (Docker primary)
│   ├── Dockerfile
│   ├── bridge.js
│   ├── install.sh               # Advanced (no Docker)
│   └── DOCKER.md
├── bridge-server/               # WS hub + tokens + proxy (:3100)
│   ├── server.js
│   └── lumen-bridge-server.service
├── lib/                         # public-password, network-peers
├── scripts/crawl-network.mjs    # Peer catalog crawler
├── data/network-catalog.json    # gitignored, regenerated
├── proxy.ts                     # Auth gate
├── LUMEN.md                     # This handoff
└── .env.local                   # ERGO_NODE_URL, LUMEN_BRIDGE_SERVER_URL
```

### Env (`.env.local`)

| Variable | Typical | Role |
|----------|---------|------|
| `ERGO_NODE_URL` | `http://127.0.0.1:9053` | Upstream for `/api/node` and local map harvest |
| `LUMEN_BRIDGE_SERVER_URL` | `http://127.0.0.1:3100` | Next → bridge-server |

---

## 3. Public Mode

Optional **remote** access to the dashboard. Localhost always open.

| | |
|--|--|
| Password file | `/home/aether/.lumen-public-password` (legacy `.aether-public-password`) |
| Mode | `0600` |
| Set UI | **NODE SETTINGS → Public Access** (min 10 chars) |
| Gate | `proxy.ts` (Next 16 Node proxy; password re-read every request) |

**Remote auth (any one):**

- HTTP Basic (any username + password)
- `?password=SECRET` → sets httpOnly cookie
- Header `X-Lumen-Password` (legacy `X-Aether-Password`)
- Cookie `lumen_public_auth` (legacy `aether_public_auth`) = sha256(password)

**Local bypass:** `Host` is `localhost` / `127.0.0.1` / `::1` → always allow.

**Public without password:** remote gets 401 (Public Mode off).

**Exception (no auth):** GET install/Docker assets under `/bridge/*` so `curl` / `docker build` work from the internet:

- `/bridge/install.sh`, `bridge.js`, `package.json`, `package-lock.json`
- `/bridge/Dockerfile`, `DOCKER.md`, `context.tar`

---

## 4. Lumen Bridge

### What it is

Outbound **WebSocket agent** that runs **next to the user’s Ergo node**.  
User does **not** open inbound ports. Agent connects **out** to Lumen’s hub; the dashboard then reads the node through the hub (allowlisted GETs only).

### Architecture

```text
┌──────────────────┐  outbound WS   ┌─────────────────────────────┐
│ User machine     │ ─────────────► │ Lumen host                  │
│  Ergo :9053      │                │  bridge-server :3100        │
│  lumen-bridge    │◄── request/─── │    tokens (in-memory)       │
│  (Docker/node)   │    response    │    /bridge  (WS)            │
└──────────────────┘                │  Next.js :3000              │
                                    │    /api/bridge/* → :3100    │
                                    │    UI: My Node mode         │
                                    └─────────────────────────────┘
```

| Piece | Path | Port / URL |
|-------|------|------------|
| Agent | `/home/aether/bridge` | (client) |
| Hub | `/home/aether/bridge-server` | **127.0.0.1:3100** only |
| Public WS | Caddy `/ws/*` → hub | **wss://ergolumen.net/ws/bridge** |
| Next proxy | `app/api/bridge/*` | via :3000 / HTTPS |
| Install assets | `app/bridge/[file]` | `https://ergolumen.net/bridge/*` |

**Allowlist (GET only):**  
`/info`, `/peers/connected`, `/transactions/unconfirmed`, `/blocks/*` (incl. `lastHeaders`).

**Storage:** tokens + sessions are **in-memory** on bridge-server. Restart hub → re-issue token / reconnect agent.

### Connect flow (UI)

**NODE SETTINGS → Connect my node**

1. **START — GET DOCKER COMMAND** → creates `lumen_*` token (`POST /api/bridge/tokens`)
2. **Step 1 — Docker (recommended):** one pasteable command (token + server filled)
3. **Step 2 — Wait for ONLINE** (poll `GET /api/bridge/status?token=…` every 5s)
4. Switch data source to **My Node** (or auto on start)

Token + mode stored in **localStorage** (`lumen-bridge-token`, `lumen-node-mode`).

### Docker (primary)

Dashboard builds a ready command. Equivalent manual form:

```bash
docker build -t lumen-bridge https://ergolumen.net/bridge/context.tar && \
docker rm -f lumen-bridge 2>/dev/null; \
docker run -d --name lumen-bridge --restart unless-stopped \
  --network host \
  -e LUMEN_TOKEN=lumen_YOUR_TOKEN \
  -e LUMEN_SERVER=wss://ergolumen.net/ws/bridge \
  -e LUMEN_NODE=http://127.0.0.1:9053 \
  lumen-bridge
```

| Env | Alias | Meaning |
|-----|--------|---------|
| `LUMEN_BRIDGE_TOKEN` | `LUMEN_TOKEN` | Required |
| `LUMEN_BRIDGE_SERVER` | `LUMEN_SERVER` | `wss://ergolumen.net/ws/bridge` |
| `LUMEN_NODE_URL` | `LUMEN_NODE` | Local Ergo REST (default `http://127.0.0.1:9053`) |

- **`--network host`** (Linux): container reaches host `127.0.0.1:9053`
- Docs: `bridge/DOCKER.md`, `bridge/README.md`
- Context: `https://ergolumen.net/bridge/context.tar`
- WSS via Caddy → hub on `127.0.0.1:3100`

### Advanced (no Docker)

```bash
curl -fsSL https://ergolumen.net/bridge/install.sh | \
  LUMEN_BASE=https://ergolumen.net bash
# installs to ~/lumen-bridge

cd ~/lumen-bridge && node bridge.js \
  --token=lumen_… \
  --server=wss://ergolumen.net/ws/bridge
```

### Create token / status (API)

```bash
# Create
curl -s -X POST http://127.0.0.1:3000/api/bridge/tokens \
  -H 'Content-Type: application/json' -d '{"label":"home"}'

# Status
curl -s "http://127.0.0.1:3000/api/bridge/status?token=lumen_…"

# Proxy /info through bridge
curl -s -H "X-Lumen-Bridge-Token: lumen_…" \
  http://127.0.0.1:3000/api/bridge/node/info
# same: ?token=lumen_… also accepted
```

---

## 5. Modes: Lumen Node vs My Node

UI switch in **NODE SETTINGS → Data source** (also badge on dashboard: `SOURCE · LUMEN | BRIDGE`).

| Mode | localStorage | Browser requests | Meaning |
|------|--------------|------------------|---------|
| **Lumen Node** | `lumen-node-mode=lumen` | `/api/node/*` | This server’s Ergo (`ERGO_NODE_URL` → :9053) |
| **My Node** | `lumen-node-mode=my` + token | `/api/bridge/node/*` + `X-Lumen-Bridge-Token` and `?token=` | User node via Bridge |

**What switches with My Node:**

- `/info`, peers, mempool, blocks, avg block time
- **World map (user-owned):**
  - Markers = **only** `GET /peers/connected` via Bridge (no Lumen catalog)
  - GeoIP for those peers on Lumen server (`geoip-lite`)
  - **Top Regions** = countries of those peers only
  - **My Node pin** = real GeoIP of agent public IP  
    (`hello.publicIp` from agent, else TCP `remoteAddress` of WS session)
  - Lines = My Node pin → user connected peers
  - Response `source: "bridge"`, `networkTotal` = live connected count (not catalog)

**Lumen Node map** still uses local Ergo + `network-catalog.json` crawler (full network picture for this server).

**On mode switch:** React Query keys for `nodeInfo` / `peers` / `mempool` / `peer-map` are **removed/invalidated** so Lumen data is not shown as My Node.

Dashboard shows **`NODE · <name>`** from live `/info` so you can verify the active source.

**Labels (map pin + 3D sun + settings title):**

| Mode | Label |
|------|--------|
| Lumen Node | **Lumen Node** / `LUMEN NODE` |
| My Node | **My Node** / `MY NODE` |

3D constellation remounts on mode switch (`key=3d-{mode}-{token}`) so peers always match the active source.

---

## 6. Important endpoints

### Next.js (port 3000)

| Method | Path | Role |
|--------|------|------|
| GET | `/` | Dashboard UI |
| GET | `/api/node/*` | Proxy → local Ergo REST |
| POST | `/api/bridge/tokens` | Create `lumen_*` token |
| GET | `/api/bridge/status?token=` | Bridge online/offline |
| GET | `/api/bridge/node/*` | Proxy Ergo path via live Bridge |
| GET | `/api/peers/map` | Map for Lumen node |
| GET | `/api/peers/map?token=` | Map for My Node (Bridge) |
| GET | `/api/public-status` | Public Mode on/off |
| POST | `/api/public-password` | Set/change public password |
| GET | `/bridge/install.sh` | Agent installer (public) |
| GET | `/bridge/context.tar` | Docker build context (public) |
| GET | `/bridge/Dockerfile` · `bridge.js` · … | Public assets |

### Bridge-server (port 3100)

| Method | Path | Role |
|--------|------|------|
| GET | `/health` | Hub health |
| POST | `/tokens` | Create token |
| GET | `/status?token=` | Connection status |
| GET | `/api/bridge/node/<path>` | Proxy via agent (+ token header/query) |
| WS | `/bridge` | Agent handshake (`hello` / `hello_ack`, request/response) |

### Ergo node (local, 9053) — used by Lumen mode / agent

| Path | Use |
|------|-----|
| `/info` | Status, name, heights |
| `/peers/connected` | Live peers |
| `/transactions/unconfirmed` | Mempool |
| `/blocks/at/{h}`, `/blocks/{id}/…` | Block details / tx count |
| `/blocks/lastHeaders/{n}` | Avg block time |

---

## 7. Run and deploy

### systemd

| Unit | Role |
|------|------|
| `caddy.service` | HTTPS edge · `ergolumen.net` → :3000 / `/ws` → :3100 |
| `aether.service` | Next.js `0.0.0.0:3000` (still binds all ifcs; public via Caddy) |
| `lumen-bridge-server.service` | Bridge hub **`127.0.0.1:3100`** |
| `aether-crawl.timer` | Network catalog every ~12m |
| `ergonode.service` | Ergo node (independent) |
| `nginx` | **disabled** (replaced by Caddy for :80/:443) |

### Deploy loop (this host)

```bash
cd /home/aether
npm run build
systemctl restart aether
systemctl restart lumen-bridge-server   # if hub code changed
systemctl reload caddy                  # if Caddyfile changed
systemctl is-active caddy aether lumen-bridge-server aether-crawl.timer ergonode
```

### View

```bash
# Public HTTPS (Public Mode password if set)
# https://ergolumen.net

# Always open without password: SSH tunnel
ssh -L 3000:127.0.0.1:3000 root@80.209.232.82 -N
# → http://localhost:3000
```

### Git

```bash
cd /home/aether
git status
git add …
git commit -m "…"
git push origin main   # github.com:from-ufa/aether
```

---

## 8. Useful commands

```bash
# Health
curl -s http://127.0.0.1:3000/api/public-status | jq .
curl -s http://127.0.0.1:3100/health | jq .
curl -s http://127.0.0.1:9053/info | jq '{name,fullHeight,peersCount,network}'

# Local node via Next
curl -s http://127.0.0.1:3000/api/node/info | jq '{name,fullHeight}'

# Bridge token + status + proxy
curl -s -X POST http://127.0.0.1:3000/api/bridge/tokens \
  -H 'Content-Type: application/json' -d '{"label":"ops"}' | jq .
curl -s "http://127.0.0.1:3000/api/bridge/status?token=lumen_…" | jq .
curl -s -H "X-Lumen-Bridge-Token: lumen_…" \
  http://127.0.0.1:3000/api/bridge/node/info | jq '{name,fullHeight}'

# Docker agent logs (on user machine)
docker logs -f lumen-bridge
docker rm -f lumen-bridge

# Smoke
npm run bridge-server:smoke
cd bridge && npm run test:local

# Crawler
systemctl status aether-crawl.timer
ls -la /home/aether/data/network-catalog.json
```

---

## 9. Current limitations

| Area | Limitation |
|------|------------|
| Bridge tokens | In-memory only; hub restart invalidates tokens until re-create |
| Bridge allowlist | GET-only subset of Ergo REST (no wallet/mining/POST) |
| Map (My Node) | Only Bridge connected peers + server GeoIP; My Node pin needs public IPv4 (agent ipify or WS remote). Private/CGNAT → pin may be missing |
| Map (My Node) public IP | Agent calls `api.ipify.org` once at start; override with `LUMEN_PUBLIC_IP` |
| Peers without public IP | Unmapped on world map (NAT / empty address) |
| Public Mode | Single shared password file; not multi-user accounts |
| PWA | No service worker / offline cache |
| Repo name | GitHub still `from-ufa/aether`; product name is Lumen |
| Deploy paths | Still `/home/aether` + `aether.service` (intentional, no downtime rename) |
| Copy on HTTP | Clipboard uses fallback (`execCommand`) for plain `http://` (no secure context) |
| Docker agent | Designed for **Linux `--network host`**; other Docker network modes need different `LUMEN_NODE` |

---

## 10. Checklist for a new session

```text
Project: Lumen — Ergo Node Dashboard
URL:     https://ergolumen.net
Path:    /home/aether
Git:     from-ufa/aether (main)
Handoff: /home/aether/LUMEN.md  (+ /root/SERVER.md for host)

Services:
  systemctl is-active caddy aether lumen-bridge-server aether-crawl.timer ergonode

Modes:
  Lumen Node → /api/node/*
  My Node    → /api/bridge/node/* + token (Docker agent recommended)

Bridge:
  Hub 127.0.0.1:3100  ·  public WSS wss://ergolumen.net/ws/bridge
  agent bridge/  ·  UI NODE SETTINGS
  assets https://ergolumen.net/bridge/*

Do not:
  - Break Public Mode local bypass
  - Commit .lumen-public-password / .env.local secrets / data/network-catalog.json
  - Open Ergo wallet or send txs from this app
  - Re-enable nginx on :80 without moving Caddy
```

---

## 11. Session history (condensed)

| When | What |
|------|------|
| 2026-07-18→23 | Prototype → deploy, 3D + map, SigmaSpace, real block TX counts, crawl timer, music/planets |
| 2026-07-24 | Rebrand Aether → Lumen |
| 2026-07-24 | Bridge backend: agent + hub :3100 + `/api/bridge/*` |
| 2026-07-24 | Connect UI, Lumen/My Node modes, Docker-first install, copy fix (HTTP), My Node data path + map via Bridge |
| 2026-07-24 | Domain **ergolumen.net** + **Caddy HTTPS**; Bridge WSS `wss://ergolumen.net/ws/bridge`; hub localhost-only |

Recent commits live on `main` (`git log --oneline -20`).

---

## 12. Dev loop (local on server)

```bash
cd /home/aether
npm run build && systemctl restart aether
# optional hub:
# systemctl restart lumen-bridge-server

systemctl is-active aether lumen-bridge-server ergonode oracle-core oracle-core-usd aether-crawl.timer
```
