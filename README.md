# Lumen — Ergo Node Dashboard

**Lumen** is the Ergo Node Dashboard — immersive visualizer for **your** Ergo node: 3D peer constellation, world map (GeoIP), live metrics, real block TX counts, mempool → SigmaSpace, Share Card, **Lumen Bridge** (My Node).

> **Slogan:** The living pulse of your Ergo node  
> **Live:** **https://ergolumen.net**  
> **Full handoff:** **[LUMEN.md](./LUMEN.md)** (legacy: [AETHER.md](./AETHER.md))  
> **Server (node + oracles):** `/root/SERVER.md` on production host  

## Production

| | |
|--|--|
| Domain | **https://ergolumen.net** |
| Edge | **Caddy** (Let’s Encrypt) → `127.0.0.1:3000` |
| App | `/home/aether` · `aether.service` |
| Bridge hub | `lumen-bridge-server` · `127.0.0.1:3100` |
| Bridge WSS | **wss://ergolumen.net/ws/bridge** |
| Public Mode | `.lumen-public-password` · NODE SETTINGS |

### Local / SSH tunnel

```bash
ssh -L 3000:127.0.0.1:3000 root@80.209.232.82 -N
# http://localhost:3000  (no password)
```

### Public

```text
https://ergolumen.net
# Public Mode: Basic Auth / ?password= / X-Lumen-Password
```

### Connect your node (Docker)

Use **NODE SETTINGS → Connect my node** for a ready command, or:

```bash
docker build -t lumen-bridge https://ergolumen.net/bridge/context.tar && \
docker run -d --name lumen-bridge --restart unless-stopped --network host \
  -e LUMEN_TOKEN=lumen_… \
  -e LUMEN_SERVER=wss://ergolumen.net/ws/bridge \
  lumen-bridge
```

See [bridge/DOCKER.md](./bridge/DOCKER.md).

## Dev loop

```bash
cd /home/aether
npm run build && systemctl restart aether
systemctl is-active caddy aether lumen-bridge-server
```
