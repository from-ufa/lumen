# Lumen Bridge

Outbound agent for [Lumen](https://ergolumen.net) (Ergo Node Dashboard).

Connects to the Lumen hub over **outbound WebSocket** so the dashboard can read your local Ergo REST **without opening inbound ports**.

## Docker (recommended)

```bash
docker build -t lumen-bridge https://ergolumen.net/bridge/context.tar && \
docker rm -f lumen-bridge 2>/dev/null; \
docker run -d --name lumen-bridge --restart unless-stopped \
  --network host \
  -e LUMEN_TOKEN=lumen_YOUR_TOKEN \
  -e LUMEN_SERVER=wss://ergolumen.net/ws/bridge \
  lumen-bridge
```

Full notes: [DOCKER.md](./DOCKER.md). Token from **NODE SETTINGS → Connect my node**.

## Install without Docker

```bash
curl -fsSL https://ergolumen.net/bridge/install.sh | \
  LUMEN_BASE=https://ergolumen.net bash

cd ~/lumen-bridge && node bridge.js \
  --token=lumen_… \
  --server=wss://ergolumen.net/ws/bridge
```

## Allowlist (GET only)

`/info`, `/peers/connected`, `/transactions/unconfirmed`, `/blocks/*`

## Requirements

- Node.js ≥ 18 **or** Docker
- Local Ergo REST (default `http://127.0.0.1:9053`)
