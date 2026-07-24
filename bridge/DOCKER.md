# Lumen Bridge — Docker

Самый простой способ подключить **свою** Ergo-ноду к Lumen.

## Требования

- Docker
- Локальная Ergo REST на `127.0.0.1:9053` (или другой URL через `LUMEN_NODE`)
- Linux: флаг `--network host`, чтобы контейнер видел ноду на localhost

## Одна команда (из дашборда)

В **NODE SETTINGS → Connect my node** уже есть готовая команда с **твоим токеном** и адресом сервера. Скопируй и вставь в терминал.

Пример (подставь свой token):

```bash
docker build -t lumen-bridge http://80.209.232.82:3000/bridge/context.tar && \
docker rm -f lumen-bridge 2>/dev/null; \
docker run -d --name lumen-bridge --restart unless-stopped \
  --network host \
  -e LUMEN_TOKEN=lumen_YOUR_TOKEN \
  -e LUMEN_SERVER=ws://80.209.232.82:3100/bridge \
  lumen-bridge
```

- Первый запуск: соберёт образ (~несколько секунд) и стартует агент  
- `--restart unless-stopped` — поднимется после ребута  
- Статус **ONLINE** в дашборде обновится сам  

## Переменные окружения

| Env | Alias | Описание |
|-----|--------|----------|
| `LUMEN_BRIDGE_TOKEN` | `LUMEN_TOKEN` | Токен из дашборда (обязательно) |
| `LUMEN_BRIDGE_SERVER` | `LUMEN_SERVER` | WS hub, напр. `ws://80.209.232.82:3100/bridge` |
| `LUMEN_NODE_URL` | `LUMEN_NODE` | REST ноды (default `http://127.0.0.1:9053`) |

## Полезные команды

```bash
# логи
docker logs -f lumen-bridge

# стоп / удалить
docker rm -f lumen-bridge

# другой порт/URL ноды
docker run -d --name lumen-bridge --restart unless-stopped --network host \
  -e LUMEN_TOKEN=lumen_xxx \
  -e LUMEN_SERVER=ws://80.209.232.82:3100/bridge \
  -e LUMEN_NODE=http://127.0.0.1:9053 \
  lumen-bridge
```

## Локальная сборка из git

```bash
docker build -t lumen-bridge https://github.com/from-ufa/aether.git#main:bridge
# или из клона:
cd bridge && docker build -t lumen-bridge .
```

## Без Docker

См. `install.sh` / advanced-команды в дашборде (Node.js 18+).
