# Lumen Bridge — Docker

Самый простой способ подключить **свою** Ergo-ноду к [Lumen](https://ergolumen.net).

## Требования

- Docker
- Локальная Ergo REST на `127.0.0.1:9053` (или другой URL через `LUMEN_NODE`)
- Linux: флаг `--network host`, чтобы контейнер видел ноду на localhost

## Одна команда (из дашборда)

В **NODE SETTINGS → Connect my node** уже есть готовая команда с **твоим токеном** и `wss://ergolumen.net/ws/bridge`.

Пример:

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

- Caddy terminates TLS; path `/ws/*` → `lumen-bridge-server` on `127.0.0.1:3100`
- `--restart unless-stopped` — после ребута  
- Статус **ONLINE** в дашборде  

## Env

| Env | Alias | Meaning |
|-----|--------|---------|
| `LUMEN_BRIDGE_TOKEN` | `LUMEN_TOKEN` | Required |
| `LUMEN_BRIDGE_SERVER` | `LUMEN_SERVER` | `wss://ergolumen.net/ws/bridge` |
| `LUMEN_NODE_URL` | `LUMEN_NODE` | Local Ergo REST |
| `LUMEN_PUBLIC_IP` | — | Optional override for map pin |

## Logs / stop

```bash
docker logs -f lumen-bridge
docker rm -f lumen-bridge
```

## Without Docker

See `install.sh` / Advanced in the dashboard.
