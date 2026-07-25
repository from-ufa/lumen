# Lumen

**The living pulse of your Ergo node.**

Lumen is an immersive **Ergo Node Dashboard** — 3D peer constellation, world map, live metrics, real block data, mempool, and a private path to **your own node** via **Lumen Bridge**.

| | |
|--|--|
| **Live** | [https://ergolumen.net](https://ergolumen.net) |
| **Repo** | [github.com/from-ufa/lumen](https://github.com/from-ufa/lumen) |
| **Bridge WSS** | `wss://ergolumen.net/ws/bridge` |
| **Handoff / ops** | [LUMEN.md](./LUMEN.md) |

---

## What is Lumen?

Lumen turns an Ergo node into a **visual, real-time control surface**:

- See peers in a **3D constellation** and on a **world map** (GeoIP)
- Live height, difficulty, peers, mempool size, **real TX counts** per block
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
| **Ghost** | Stale for a long time — **hidden** on the map |

Visual hierarchy: Connected (bright cyan) → Live (blue) → Seen (dim).

### Map filters (Lumen Node)

| Chip | Shows |
|------|--------|
| **Live** (default) | Connected + Live — clean “who’s up” view |
| **Linked** | Connected only |
| **All** | Connected + Live + Seen |

My Node does not show these chips (only connected peers exist). Instead:

> **N peers connected to your node**

### Prune (catalog cleanup)

**Prune** keeps the catalog healthy: after each crawl, IPs that have been **dead for a long time** are removed so the map and stats are not flooded with garbage.

| Rule | Detail |
|------|--------|
| **Default age** | **21 days** (`LUMEN_PRUNE_DAYS`) |
| **Never pruned while live** | `reachable` nodes and nodes with recent probe / REST `/info` |
| **Age signal** | Last **live** activity — not gossip “seen in someone’s peer list” alone |
| **Soft mode** | `LUMEN_PRUNE_SOFT=1` marks ghost instead of delete |
| **Disable** | `LUMEN_PRUNE_DAYS=0` |

**Last prune report:**

```bash
cat data/catalog-prune-last.json
# or embedded:
# data/network-catalog.json → seeds.report.prune
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
| **NODE SETTINGS** | Data source toggle + Connect my node (Docker / status / token) |

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
npm run build && systemctl restart aether
systemctl is-active caddy aether lumen-bridge-server
```

Full ops map: **[LUMEN.md](./LUMEN.md)**.

---

## Repository layout

```text
app/                 Next.js UI + API routes
bridge/              Outbound agent (Docker, install.sh, bridge.js)
bridge-server/       WebSocket hub + token API + proxy
lib/                 Shared server helpers (password, peers catalog, …)
public/              Static assets
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
- **GitHub:** [https://github.com/from-ufa/lumen](https://github.com/from-ufa/lumen)
- **Bridge Docker:** [bridge/DOCKER.md](./bridge/DOCKER.md)
- **Bridge agent:** [bridge/README.md](./bridge/README.md)
- **Ops / deploy:** [LUMEN.md](./LUMEN.md)

---

## License

MIT (see package metadata / repo defaults).

---

*Built for the Ergo community — node runners first.*
