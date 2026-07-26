# Lumen

**The living pulse of your Ergo node.**

Lumen is an immersive **Ergo Node Dashboard** — 3D peer constellation, world map, live metrics, real block data, mempool, **live Ergo Oracle Pools**, and a private path to **your own node** via **Lumen Bridge**.

| | |
|--|--|
| **Live** | [https://ergolumen.net](https://ergolumen.net) |
| **Oracles** | [https://ergolumen.net/oracles](https://ergolumen.net/oracles) |
| **Repo** | [github.com/from-ufa/lumen](https://github.com/from-ufa/lumen) |
| **Bridge WSS** | `wss://ergolumen.net/ws/bridge` |
| **Handoff / ops** | [LUMEN.md](./LUMEN.md) |

---

## What is Lumen?

Lumen turns an Ergo node into a **visual, real-time control surface**:

- See peers in a **3D constellation** and on a **world map** (GeoIP)
- Live height, difficulty, peers, mempool size, **real TX counts** per block
- Watch **ERG/USD** and **ERG/XAU** oracle pools as a dual Canvas constellation
- Open blocks on **SigmaSpace**
- Share a sleek status card
- Optionally drive the whole UI from **your home / VPS node** — without exposing Ergo ports to the internet

It is built for **node runners** who want beauty and situational awareness, and for **developers** who want a clean Next.js + Bridge stack around Ergo REST.

---

## Features

| Area | What you get |
|------|----------------|
| **Lumen Node** | Dashboard on the public host reads the server’s local Ergo (`/api/node` → `:9053`) |
| **My Node** | Same UI, data via **Lumen Bridge** from *your* machine |
| **3D / Map** | Peer graph + world map with status filters; multi-seed network catalog |
| **Blocks & mempool** | Timeline with real `txCount`, honest miner (Explorer + pool map) |
| **Oracles** | Side-by-side ERG/USD · ERG/XAU constellation, on-chain price, live publish activity |
| **Bridge** | Outbound WebSocket agent; allowlisted GET only |
| **No inbound ports** | Your node never needs a public REST port for Lumen |

---

## Architecture

```text
┌─────────────────────┐         HTTPS / WSS          ┌──────────────────────────┐
│  Your machine       │                              │  ergolumen.net           │
│                     │   wss://…/ws/bridge          │                          │
│  Ergo :9053         │◄────────────────────────────►│  Caddy (TLS)             │
│  lumen-bridge       │   outbound only              │    UI  → :3000 (Next.js) │
│  (Docker or node)   │                              │    WS  → :3100 (hub)     │
└─────────────────────┘                              │  Ergo (Lumen Node) :9053 │
                                                     │  crawler → catalog.json  │
                                                     └──────────────────────────┘
```

### Data sources

| Mode | Source | When to use |
|------|--------|-------------|
| **Lumen Node** | Server’s Ergo via `/api/node` + global peer catalog for the map | Browse the public dashboard / host node |
| **My Node** | Your Ergo via Bridge → `/api/bridge/node` | Personal node as the center of the UI |

**Bridge flow**

1. Dashboard creates a personal `lumen_*` token
2. You run the agent next to your Ergo node (Docker recommended)
3. Agent opens **outbound** WSS to `wss://ergolumen.net/ws/bridge`
4. Hub proxies allowlisted GETs (`/info`, peers, mempool, blocks…) back to the UI

Agent code and Docker context live in this repo under [`bridge/`](./bridge/).  
The hub is [`bridge-server/`](./bridge-server/) (runs on the Lumen host).

---

## Network map

The world map behaves differently in each mode:

| Mode | What you see |
|------|----------------|
| **Lumen Node** | Broad Ergo network from a multi-seed catalog (~800+ known IPs), with filters |
| **My Node** | Only peers currently connected to **your** node (Bridge). No network catalog, no filter chips |

### Multi-seed discovery

A background crawler (`scripts/crawl-network.mjs`, timer ~12 min) builds `data/network-catalog.json`:

1. **Local Ergo** — `/peers/all` + `/peers/connected`
2. **Public REST seeds** — curated list in [`scripts/network-seeds.json`](./scripts/network-seeds.json)
3. **Official knownPeers** — from Ergo `mainnet.conf`
4. **Fan-out** — dual-pass crawl of unique `restApiUrl` hosts (deduped, max 200, careful timeouts)
5. **Open-REST scan** — try `http://IP:9053` where no API was known
6. **TCP probe** on `:9030` + GeoIP for pins
7. **Prune** — drop long-dead entries (see below)

```bash
npm run crawl:network
```

### Node statuses

| Status | Meaning |
|--------|---------|
| **Connected** | In the active node’s live peer list right now |
| **Live** | Answering now (open P2P port and/or recent REST `/info`) |
| **Seen** | Seen in discovery recently, not answering |
| **Ghost** | Not live for ≥ **21 days** — kept as **network history**, **hidden** on the map |

Visual hierarchy: Connected (bright cyan) → Live (blue) → Seen (dim). Ghost never appears in Live / Linked / All.

### Map filters (Lumen Node)

| Chip | Shows |
|------|--------|
| **Live** (default) | Connected + Live — clean “who’s up” view |
| **Linked** | Connected only |
| **All** | Connected + Live + Seen (still no Ghost) |

My Node does not show these chips (only connected peers exist). Instead:

> **N peers connected to your node**

### Stats on the map

| Metric | Meaning |
|--------|---------|
| **Discovered** | Active catalog (Connected + Live + Seen) |
| **Live** | Answering now (incl. connected) |
| **Connected** | Linked to the active node |
| **Ghost** | Historical nodes still stored |
| **Total ever** | Active + Ghost |

### Ghost history (soft-prune)

Old nodes are **not deleted** by default. After **21 days** without a live signal they become **Ghost** history (`ghost: true` in the catalog). Connected / Live are never ghosted. If a Ghost answers again, it is revived automatically.

Hard delete (optional): `LUMEN_PRUNE_HARD=1`. Disable: `LUMEN_PRUNE_DAYS=0`.

```bash
cat data/catalog-prune-last.json   # ghosted / deleted / revived
```

Full ops detail: [LUMEN.md](./LUMEN.md) → *Network map — architecture*.

---

## Connect your node (Docker — recommended)

1. Open **[ergolumen.net](https://ergolumen.net)** → **NODE SETTINGS**
2. **Connect my node** → **START — GET DOCKER COMMAND**
3. Paste the command on the machine that runs Ergo (Linux + Docker, host network)

Equivalent shape (replace the token):

```bash
docker build -t lumen-bridge https://github.com/from-ufa/lumen.git#main:bridge && \
docker rm -f lumen-bridge 2>/dev/null; \
docker run -d --name lumen-bridge --restart unless-stopped \
  --network host \
  -e LUMEN_TOKEN=lumen_YOUR_TOKEN \
  -e LUMEN_SERVER=wss://ergolumen.net/ws/bridge \
  -e LUMEN_NODE=http://127.0.0.1:9053 \
  lumen-bridge
```

| Env | Meaning |
|-----|---------|
| `LUMEN_TOKEN` | Token from the dashboard |
| `LUMEN_SERVER` | Hub WebSocket (`wss://ergolumen.net/ws/bridge`) |
| `LUMEN_NODE` | Local Ergo REST (default `http://127.0.0.1:9053`) |

```bash
docker logs -f lumen-bridge   # status
docker rm -f lumen-bridge     # stop
```

When the dashboard shows **BRIDGE ONLINE**, switch data source to **My Node**.

More detail: [bridge/DOCKER.md](./bridge/DOCKER.md).

### Without Docker (advanced)

```bash
curl -fsSL https://raw.githubusercontent.com/from-ufa/lumen/main/bridge/install.sh | bash

cd ~/lumen-bridge && node bridge.js \
  --token=lumen_YOUR_TOKEN \
  --server=wss://ergolumen.net/ws/bridge
```

Requires **Node.js 18+** next to Ergo.

---

## Interface (what you’ll see)

| Screen | Description |
|--------|-------------|
| **Top bar** | Live status, Lumen / My Node badge, Share card, **NODE SETTINGS**, refresh |
| **Hero** | Height (headers / full), source chip (`SOURCE · LUMEN` or `SOURCE · BRIDGE`) |
| **3D constellation** | Peers as a spatial graph; your node as the center |
| **World map** | Multi-seed network (Lumen) or your connected peers (My Node); status filters |
| **Metrics** | Height, peers, mempool, avg block time |
| **Blocks + mempool** | Recent blocks with real TX counts; unconfirmed txs |
| **Oracles** | `/oracles` — dual pool constellation (see below) |
| **NODE SETTINGS** | Data source toggle + Connect my node (Docker / status / token) |

---

## Oracles (`/oracles`)

Live view of the Ergo **network oracle pools** — **ERG/USD** and **ERG/XAU** side by side.

| | |
|--|--|
| **URL** | [https://ergolumen.net/oracles](https://ergolumen.net/oracles) |
| **API** | `GET /api/oracles` → [`lib/oracles.ts`](./lib/oracles.ts) |
| **UI** | [`app/oracles/`](./app/oracles/) — Canvas 2D Constellation + dual-panel shell |

### What you see

| Element | Role |
|---------|------|
| **Dual panels** | ERG/USD (teal) and ERG/XAU (gold), equal width/height on large screens |
| **Pool epoch ring** | Epoch number + freshness (age vs LIVE window) next to the ring |
| **Constellation map** | Operators orbit the pool core; corner chips for consensus, lag, health, settlement |
| **On-chain price** | Single price surface per feed (no duplicate hero prices) |
| **Publish activity** | Live feed when operators post datapoints / rewards / pool refresh |
| **Map legend** | Pool core · Oracle node · Datapoint · Reward |
| **Status glossary** | Footer: plain-language LIVE / STALE / DOWN / OFFLINE |

### Status meanings

These are **two different signals** — do not mix them:

| Status | Kind | Meaning |
|--------|------|---------|
| **LIVE** | Price age | Shared pool price was updated recently (within the LIVE window) |
| **STALE** | Price age | Price still on-chain, but the pool has not refreshed for a while |
| **OFFLINE** | Price age | No usable pool box, or data is extremely old |
| **DOWN** | Local agent | Oracle metrics report protocol / quorum trouble (shown on **Health** chip only) |

Thresholds use floor/cap rules (not raw `epoch×N`) so short epochs do not false-trip OFFLINE. Details: [LUMEN.md](./LUMEN.md) → *Oracles data & status rules*.

### Data sources

| Source | Provides |
|--------|----------|
| **Ergo Explorer** | Pool box (NFT R4/R5): rate, epoch, settlement height |
| **Local Ergo tip** | `/info` height → lag = tip − settlement |
| **Oracle metrics** (optional) | Operator nodes, rewards, pool healthy; ports typically `:9021` (USD), `:9011` (XAU) |

The UI polls about every **5s** so datapoint / reward animations track real network activity.

### Dev pointers

```bash
# API shape
curl -sS http://127.0.0.1:3000/api/oracles | jq '.feeds[] | {id, pair, status, priceLabel, ageBlocks}'

# Main components
#   app/oracles/page.tsx
#   app/oracles/components/OraclesDualView.tsx
#   app/oracles/components/OracleConstellation.tsx
#   lib/oracles.ts
```

---

## Local development

### Prerequisites

- Node.js **18+**
- Optional: local Ergo node on `127.0.0.1:9053`
- Optional: Bridge hub (`bridge-server`) if you work on My Node

### Dashboard

```bash
git clone https://github.com/from-ufa/lumen.git
cd lumen
npm install
npm run dev
# → http://localhost:3000
```

Useful env (`.env.local`):

```bash
ERGO_NODE_URL=http://127.0.0.1:9053
LUMEN_BRIDGE_SERVER_URL=http://127.0.0.1:3100
```

### Bridge hub (My Node on local stack)

```bash
cd bridge-server
npm install
npm start
# → http://127.0.0.1:3100  WS path /bridge
```

### Bridge agent (against local hub)

```bash
cd bridge
npm install
node bridge.js \
  --token=lumen_dev \
  --server=ws://127.0.0.1:3100/bridge \
  --node=http://127.0.0.1:9053
```

For local hub tests you may set `AUTO_REGISTER_TOKENS=1` on the server.

### Production-style build (this host)

```bash
cd /home/lumen   # or your clone
npm run build && systemctl restart lumen
systemctl is-active caddy lumen lumen-bridge-server
```

Full ops map: **[LUMEN.md](./LUMEN.md)**.

---

## Repository layout

```text
app/                 Next.js UI + API routes
  oracles/           Dual Oracle Constellation page + components
bridge/              Outbound agent (Docker, install.sh, bridge.js)
bridge-server/       WebSocket hub + token API + proxy
lib/                 Shared server helpers (oracles, peers catalog, password, …)
  oracles.ts         Pool NFTs, status thresholds, live events, metrics
public/              Static assets
deploy/              systemd unit (lumen.service)
LUMEN.md             Operator handoff
```

---

## Security notes

- Bridge only allows **GET** on a fixed path allowlist (no wallet / no write APIs)
- Connection is **outbound WSS** from your side
- Tokens are random `lumen_*` secrets; treat them like passwords
- Optional site password: file `.lumen-public-password` (see LUMEN.md) — not required for the public demo

---

## Links

- **Live dashboard:** [https://ergolumen.net](https://ergolumen.net)
- **Oracles:** [https://ergolumen.net/oracles](https://ergolumen.net/oracles)
- **GitHub:** [https://github.com/from-ufa/lumen](https://github.com/from-ufa/lumen)
- **Bridge Docker:** [bridge/DOCKER.md](./bridge/DOCKER.md)
- **Bridge agent:** [bridge/README.md](./bridge/README.md)
- **Ops / deploy:** [LUMEN.md](./LUMEN.md)

---

## License

MIT (see package metadata / repo defaults).

---

*Built for the Ergo community — node runners first.*
