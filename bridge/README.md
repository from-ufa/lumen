# lumen Bridge v1.1

Outbound agent for [lumen](https://ergolumen.net) — Ergo node **and** oracle operators.

Connects to the hub over **outbound WebSocket** so the dashboard can read:

- local **Ergo REST** (My Node)
- local **oracle-core metrics** (My Oracle) — **one pool or both**

**No inbound ports** on your machine. Metrics bases default to **loopback only**.

Source: **[github.com/from-ufa/lumen](https://github.com/from-ufa/lumen)** (`bridge/`).

## Docker (recommended)

### Node only

```bash
docker build -t lumen-bridge https://github.com/from-ufa/lumen.git#main:bridge && \
docker rm -f lumen-bridge 2>/dev/null; \
docker run -d --name lumen-bridge --restart unless-stopped \
  --network host \
  -e LUMEN_TOKEN=lumen_YOUR_TOKEN \
  -e LUMEN_SERVER=wss://ergolumen.net/ws/bridge \
  lumen-bridge
```

### Oracle operator (set only pools you run)

```bash
# USD only
docker run -d --name lumen-bridge --restart unless-stopped --network host \
  -e LUMEN_TOKEN=lumen_YOUR_TOKEN \
  -e LUMEN_SERVER=wss://ergolumen.net/ws/bridge \
  -e LUMEN_ORACLE_USD=http://127.0.0.1:9021 \
  lumen-bridge

# XAU only
  -e LUMEN_ORACLE_XAU=http://127.0.0.1:9011

# Both
  -e LUMEN_ORACLE_USD=http://127.0.0.1:9021 \
  -e LUMEN_ORACLE_XAU=http://127.0.0.1:9011
```

Then open **[ergolumen.net/oracles](https://ergolumen.net/oracles) → MY ORACLE** and paste the same token.

Full notes: [DOCKER.md](./DOCKER.md). Token from **NODE SETTINGS → Connect my node**.

## Env

| Variable | Meaning |
|----------|---------|
| `LUMEN_TOKEN` | Bridge auth token (required) |
| `LUMEN_SERVER` | Hub WSS (`wss://ergolumen.net/ws/bridge`) |
| `LUMEN_NODE` | Local Ergo REST (default `http://127.0.0.1:9053`) |
| `LUMEN_ORACLE_USD` | Optional metrics base for ERG/USD oracle-core |
| `LUMEN_ORACLE_XAU` | Optional metrics base for ERG/XAU oracle-core |
| `LUMEN_ORACLE_ALLOW_REMOTE` | `1` to allow non-loopback metrics URLs (off by default) |

## Allowlist (GET only)

**Node:** `/info`, `/peers/connected`, `/transactions/unconfirmed`, `/blocks/*`  
**Oracle:** `/oracle/status`, `/oracle/usd/metrics`, `/oracle/xau/metrics`  
(virtual paths; agent only serves metrics if the matching env is set)

## Requirements

- Node.js ≥ 18 **or** Docker
- Local Ergo REST (default `http://127.0.0.1:9053`) for My Node
- Optional: oracle-core Prometheus on loopback (`:9021` / `:9011`)
