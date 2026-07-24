# Lumen Bridge

Небольшой **outbound** агент для [Lumen](https://github.com/) (Ergo Node Dashboard).

Пользователь запускает Bridge рядом со своей Ergo-нодой. Агент сам устанавливает WebSocket-соединение с сервером Lumen и позволяет дашборду **безопасно читать** данные с локальной ноды — без открытия входящих портов.

## Возможности (v1)

- Подключение по WebSocket к серверу Lumen (`--server`)
- Передача токена при handshake (`--token`)
- Автоматическое переподключение при обрыве (exponential backoff + jitter)
- Проксирование **только GET** на локальную Ergo REST
- Жёсткий allowlist путей
- Таймаут запросов к ноде (12 с)
- Heartbeat (WS ping + app-level `ping`)

## Разрешённые пути

| Path | Описание |
|------|----------|
| `/info` | Статус ноды |
| `/peers/connected` | Подключённые пиры |
| `/transactions/unconfirmed` | Mempool |
| `/blocks/*` | Блоки (включая `lastHeaders`) |
| `/blocks/lastHeaders/*` | Заголовки |

Всё остальное (wallet, mining, utils, POST/PUT/DELETE) — **блокируется**.

## Требования

- **Docker** (рекомендуется) **или** Node.js ≥ 18
- Доступ к локальной Ergo REST (по умолчанию `http://127.0.0.1:9053`)

## Запуск через Docker (рекомендуется)

Подробнее: **[DOCKER.md](./DOCKER.md)**.

Готовая команда с твоим токеном — в Lumen → **NODE SETTINGS → Connect my node**.

```bash
# Пример (подставь token из дашборда)
docker build -t lumen-bridge http://80.209.232.82:3000/bridge/context.tar && \
docker rm -f lumen-bridge 2>/dev/null; \
docker run -d --name lumen-bridge --restart unless-stopped \
  --network host \
  -e LUMEN_TOKEN=lumen_YOUR_TOKEN \
  -e LUMEN_SERVER=ws://80.209.232.82:3100/bridge \
  lumen-bridge
```

Env: `LUMEN_TOKEN` / `LUMEN_SERVER` / `LUMEN_NODE` (или длинные `LUMEN_BRIDGE_*`).

## Установка без Docker

```bash
curl -fsSL http://80.209.232.82:3000/bridge/install.sh | \
  LUMEN_BASE=http://80.209.232.82:3000 bash
# или из репо:
cd bridge && npm install
```

## Запуск

```bash
# Минимум (нужен токен от Lumen)
node bridge.js --token=lumen_xxxxx

# Явный URL ноды
node bridge.js --token=lumen_xxxxx --node=http://127.0.0.1:9053

# Свой сервер Bridge (WS/WSS)
node bridge.js --token=lumen_xxxxx --server=wss://lumen.example.com/bridge
```

### Переменные окружения

| Env | Эквивалент CLI |
|-----|----------------|
| `LUMEN_BRIDGE_TOKEN` | `--token` |
| `LUMEN_NODE_URL` | `--node` |
| `LUMEN_BRIDGE_SERVER` | `--server` |

Пример:

```bash
export LUMEN_BRIDGE_TOKEN=lumen_xxxxx
export LUMEN_NODE_URL=http://127.0.0.1:9053
export LUMEN_BRIDGE_SERVER=wss://lumen.example.com/bridge
node bridge.js
```

### npm scripts

```bash
npm start -- --token=lumen_xxxxx
npm run mock-server          # локальный mock Lumen-сервера
npm run test:local           # smoke-тесты allowlist + roundtrip
```

## Локальный тест без продакшен-сервера

Терминал 1 — mock-сервер:

```bash
cd /home/aether/bridge
npm run mock-server
# → ws://127.0.0.1:9099/bridge
```

Терминал 2 — bridge:

```bash
node bridge.js \
  --token=lumen_test_local \
  --server=ws://127.0.0.1:9099/bridge \
  --node=http://127.0.0.1:9053
```

Mock-сервер после `hello` шлёт sample-запросы (`/info`, peers, mempool, lastHeaders и запрещённый `/wallet/balances`). В логах bridge видно `forbidden` для wallet и ответы ноды для разрешённых путей.

Автоматический smoke-тест:

```bash
npm run test:local
```

## Протокол WebSocket (JSON)

### Client → Server

**hello** (сразу после `open`):

```json
{
  "type": "hello",
  "token": "lumen_xxxxx",
  "version": "1.0.0",
  "node": "http://127.0.0.1:9053",
  "capabilities": {
    "methods": ["GET"],
    "paths": ["/info", "/peers/connected", "/transactions/unconfirmed", "/blocks/*"]
  }
}
```

Токен также передаётся в:

- query: `?token=…`
- header: `Authorization: Bearer …`
- header: `X-Lumen-Bridge-Token`

**response**:

```json
{
  "type": "response",
  "id": "<request-id>",
  "status": 200,
  "contentType": "application/json",
  "body": { }
}
```

**error**:

```json
{
  "type": "error",
  "id": "<request-id>",
  "error": "forbidden|method_not_allowed|timeout|upstream_unreachable",
  "message": "…"
}
```

**ping** (heartbeat):

```json
{ "type": "ping", "ts": 1710000000000 }
```

### Server → Client

**request**:

```json
{
  "type": "request",
  "id": "uuid",
  "method": "GET",
  "path": "/info"
}
```

Опционально: `"query": "limit=10"` или объект query.

**hello_ack** / **auth_ok** — подтверждение (опционально).

## Структура проекта

```
/home/aether/bridge/
├── package.json
├── bridge.js              # точка входа (клиент)
├── README.md
├── .gitignore
└── scripts/
    ├── mock-server.js     # mock Lumen server для отладки
    └── smoke-test.js      # allowlist + roundtrip
```

## Безопасность

1. **Только исходящее** соединение — firewall на ноде пользователя не нужно открывать.
2. **Allowlist** путей — wallet / keys / mining недоступны.
3. **Только GET** — нельзя слать транзакции через bridge.
4. **Таймаут** 12 с на upstream.
5. **Path traversal** (`..`, encoded dots) отклоняется.
6. Серверная авторизация токенов — на стороне Lumen (в v1 bridge просто передаёт токен).

## systemd (опционально)

```ini
# /etc/systemd/system/lumen-bridge.service
[Unit]
Description=Lumen Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/aether/bridge
Environment=LUMEN_BRIDGE_TOKEN=lumen_xxxxx
Environment=LUMEN_NODE_URL=http://127.0.0.1:9053
Environment=LUMEN_BRIDGE_SERVER=wss://lumen.example.com/bridge
ExecStart=/usr/bin/node /home/aether/bridge/bridge.js
Restart=always
RestartSec=5
Nice=10

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now lumen-bridge
journalctl -u lumen-bridge -f
```

## Версия

**1.0.0** — рабочий клиент Bridge (подключение + proxy allowlist). Серверная часть Lumen — отдельно.
