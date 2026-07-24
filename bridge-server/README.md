# Lumen Bridge Server

Backend hub for **Lumen Bridge** agents.

- Accepts outbound WebSocket connections from user Bridges
- Issues `lumen_*` tokens
- Proxies allowlisted GET requests to the user’s local Ergo node via the Bridge

## Run

```bash
cd /home/lumen/bridge-server
npm install
npm start
# → http://0.0.0.0:3100  WS: ws://0.0.0.0:3100/bridge
```

Env:

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3100` | HTTP + WS port |
| `HOST` | `0.0.0.0` | Bind address |
| `AUTO_REGISTER_TOKENS` | off | If `1`, unknown `lumen_*` tokens accepted on connect |
| `REQUEST_TIMEOUT_MS` | `12000` | Proxy timeout |

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health + counts |
| `POST` | `/tokens` | Create token `{ "label"?: "home" }` → `{ token }` |
| `GET` | `/tokens` | List tokens + connected flag |
| `GET` | `/status?token=lumen_…` | Bridge online/offline details |
| `GET` | `/api/bridge/node/<path>?token=…` | Proxy through Bridge |
| `GET` | `/api/node/<path>` + header `X-Lumen-Bridge-Token` | Same |
| `GET` | `/node/<token>/<path>` | Same (token in URL) |

Allowlisted paths (GET only): `/info`, `/peers/connected`, `/transactions/unconfirmed`, `/blocks/*`.

## WebSocket

Path: **`/bridge`**

Bridge client protocol matches `/home/lumen/bridge/bridge.js` (`hello` → `hello_ack`, `request`/`response`/`error`, `ping`/`pong`).

Token may be sent as:

- query `?token=`
- header `Authorization: Bearer …`
- header `X-Lumen-Bridge-Token`
- JSON `hello.token` (required for session)

## Quick test

```bash
# 1) start server
npm start

# 2) create token
curl -s -X POST http://127.0.0.1:3100/tokens -H 'Content-Type: application/json' -d '{"label":"dev"}' | jq .

# 3) run bridge (other terminal)
TOKEN=lumen_...
cd /home/lumen/bridge
node bridge.js --token=$TOKEN --server=ws://127.0.0.1:3100/bridge --node=http://127.0.0.1:9053

# 4) status + proxy
curl -s "http://127.0.0.1:3100/status?token=$TOKEN" | jq .
curl -s -H "X-Lumen-Bridge-Token: $TOKEN" http://127.0.0.1:3100/api/bridge/node/info | jq '{name,fullHeight,peers}'
```

Automated:

```bash
npm start &   # or systemd
npm run test:smoke
```

## Next.js integration

Dashboard same-origin routes (proxy to this service):

- `POST /api/bridge/tokens`
- `GET  /api/bridge/status?token=`
- `GET  /api/bridge/node/[...path]` + `X-Lumen-Bridge-Token` / `?token=`

Set `LUMEN_BRIDGE_SERVER_URL=http://127.0.0.1:3100` in `/home/lumen/.env.local` (default).

## systemd

```bash
cp /home/lumen/bridge-server/lumen-bridge-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now lumen-bridge-server
systemctl status lumen-bridge-server
```
