# lumen

**The living pulse of your Ergo node.**

**lumen** is a real-time visual dashboard for **Ergo mainnet** node operators and oracle runners.  
It turns node and oracle data into something you can *see and feel* — not another table of RPC fields.

| | |
|--|--|
| **Live** | [https://ergolumen.net](https://ergolumen.net) |
| **Oracles** | [https://ergolumen.net/oracles](https://ergolumen.net/oracles) |
| **GitHub** | [github.com/from-ufa/lumen](https://github.com/from-ufa/lumen) |
| **Bridge WSS** | `wss://ergolumen.net/ws/bridge` |
| **Ops / handoff** | [LUMEN.md](./LUMEN.md) |

---

## Product in one screen

```text
                    ┌─────────────────────────────────────┐
                    │  ergolumen.net  (public UI + hub)   │
                    │  Network Orbit · World Map · Metrics│
                    │  Blocks · Mempool · Oracles         │
                    └──────────────┬──────────────────────┘
                                   │  optional Bridge (outbound WSS)
                    ┌──────────────▼──────────────────────┐
                    │  Your machine                       │
                    │  Ergo node :9053  ±  oracle metrics │
                    │  lumen-bridge (Docker)              │
                    └─────────────────────────────────────┘
```

**Two data modes (same UI):**

| Mode | What you see | How data arrives |
|------|----------------|------------------|
| **Lumen node** | Host public node + broad network map | Server → local Ergo (`/api/node`) |
| **My Node / My Oracle** | *Your* node or oracle as the center | Your PC → Bridge → UI (no open ports) |

---

## What you can do

### Node dashboard (`/`)

- **Network Orbit** — cinematic 3D Earth + live peers (soft pins, hover, search)
- **World Map** — GeoIP pins with **Live / Linked / All** filters (Lumen mode)
- **Live heights** — headers / full height next to the viz
- **Metrics** — peers, mempool, average block time
- **Blocks & mempool** — real tx counts from the node; miner labels from Explorer + pool catalog
- **Connect invite** — soft typewriter CTA to attach your own node via Settings
- **Soft page motion** — smooth Node ↔ Oracles transitions (View Transitions + enter fade)

### Oracles (`/oracles`)

- Dual live feeds: **ERG/USD** and **ERG/XAU**
- Canvas constellation per pool (operators, datapoints, rewards, lag)
- On-chain pool box price + optional local oracle-core metrics
- **Network** view (public pools) or **My Oracle** (your agent via the same Bridge token)
- Typewriter CTA to connect your oracle (hidden when My Oracle is already live)

### Lumen Bridge (privacy)

- Outbound WebSocket agent next to your Ergo process
- **Allowlisted GET only** — no wallet, no writes
- One token for **My Node** and **My Oracle**
- Your node never needs a public REST port

---

## Who it is for

| Audience | Why lumen |
|----------|-----------|
| **Node runners** | Situational awareness with beauty — peers, height, mempool, map |
| **Oracle operators** | Live dual-pool picture + path to attach your own agent |
| **Builders** | Next.js App Router + thin `/api/chain/*` explorer plane + Bridge stack |

---

## Architecture (short)

| Piece | Role |
|-------|------|
| **Next.js 16** app (`app/`) | UI + API routes (`/api/node`, `/api/oracles`, `/api/chain/*`, `/api/bridge/*`) |
| **Local Ergo** (`:9053`) | Primary chain source on the host (Lumen node mode) |
| **bridge-server** (`:3100`) | Token hub + WSS proxy for My Node / My Oracle |
| **bridge/** | Docker agent agents run on the operator machine |
| **Caddy** | TLS + reverse proxy → UI + `wss://…/ws/bridge` |

Detailed ops, units, and env: **[LUMEN.md](./LUMEN.md)**.

---

## Connect your node (Docker)

1. Open [ergolumen.net](https://ergolumen.net) → **Settings**
2. **Connect my node** → copy the Docker command (token included)
3. Run it on the host that runs Ergo (`--network host`)

Shape of the command:

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
| `LUMEN_TOKEN` | Dashboard token (`lumen_…`) |
| `LUMEN_SERVER` | Hub WebSocket |
| `LUMEN_NODE` | Local Ergo REST |

More: [bridge/DOCKER.md](./bridge/DOCKER.md) · [bridge/README.md](./bridge/README.md)

---

## Network map (Lumen mode)

A background crawler builds a multi-seed catalog (`data/network-catalog.json`):

| Status | Meaning |
|--------|---------|
| **Connected** | In the active node’s live peer list |
| **Live** | Answering now (P2P / recent REST) |
| **Seen** | Recently discovered, quiet |
| **Ghost** | Historical (≥ ~21 days silent) — stored, not shown on Live/Linked/All |

| Filter | Shows |
|--------|--------|
| **Live** | Connected + Live |
| **Linked** | Connected only |
| **All** | Connected + Live + Seen |

**My Node** map shows only peers connected to *you* (no network catalog chips).

```bash
npm run crawl:network
```

---

## Oracles data model

| Source | Provides |
|--------|----------|
| **Explorer** | Pool NFT box R4/R5 — rate, epoch, settlement |
| **Local tip** | Height → lag = tip − settlement |
| **Metrics** (optional) | Operators, rewards, health (`:9021` USD / `:9011` XAU) |

| Status | Kind | Meaning |
|--------|------|---------|
| **LIVE** | Price age | Pool price refreshed recently |
| **STALE** | Price age | On-chain, but aging |
| **OFFLINE** | Price age | Missing / extremely old box |
| **DOWN** | Agent | Protocol/quorum trouble (Health chip) |

API: `GET /api/oracles` · logic: [`lib/oracles.ts`](./lib/oracles.ts)

---

## Thin explorer (data plane)

lumen ships a **local thin explorer** for product UIs:

```text
GET /api/chain/status | feed | blocks | block/:id | mempool | address/:a | token/:id
```

- Primary source: local node with **extraIndex** + **boxByTokenId**
- Normalized JSON for blocks, mempool, particles, token names
- **No full public explorer UI** yet — API kept for the next chain product

See [docs/THIN-EXPLORER-CAPABILITIES.txt](./docs/THIN-EXPLORER-CAPABILITIES.txt).

---

## Local development

```bash
git clone https://github.com/from-ufa/lumen.git
cd lumen
npm install
npm run dev
# → http://localhost:3000
```

Optional `.env.local`:

```bash
ERGO_NODE_URL=http://127.0.0.1:9053
LUMEN_BRIDGE_SERVER_URL=http://127.0.0.1:3100
```

Production-style on host:

```bash
cd /home/lumen
npm run build && systemctl restart lumen
```

---

## Repo map

```text
app/                 Next.js UI + API
  oracles/           Dual oracle constellation page
bridge/              Outbound agent (Docker context)
bridge-server/       WSS hub + tokens + proxy
lib/                 Server helpers (oracles, chain, catalog, …)
scripts/             Network crawl, miner watch, …
docs/                Caps / reset notes
LUMEN.md             Operator handoff
```

---

## Security (read this)

- Bridge: **GET allowlist only** — no signing, no wallet, no writes  
- Agent is **outbound WSS** — no inbound Ergo REST to the public internet  
- Treat `lumen_*` tokens like passwords  
- Optional site Basic Auth for public mode (see LUMEN.md)

---

## Links

- Dashboard: [ergolumen.net](https://ergolumen.net)  
- Oracles: [ergolumen.net/oracles](https://ergolumen.net/oracles)  
- Ops: [LUMEN.md](./LUMEN.md)  
- Bridge Docker: [bridge/DOCKER.md](./bridge/DOCKER.md)  

---

## License

MIT

---

*Built for Ergo node runners — and for people who want the network to feel alive.*
