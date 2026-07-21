# Aether — Ergo Node Visualizer

**Handoff / context pack for future Grok (or any AI) sessions.**  
Документ описывает проект целиком: зачем, как устроен, где лежит, как деплоится, что уже сделано.

| | |
|--|--|
| **Слоган** | The living pulse of your Ergo node |
| **Версия** | 0.1.0 |
| **Стек** | Next.js 16 · React 19 · R3F/Three · Leaflet + markercluster · TanStack Query · Framer Motion · geoip-lite · html-to-image · qrcode.react |
| **Продакшен-хост** | `toa.c.hostens.cloud` / `80.209.232.82` (Hostens) |
| **Каталог** | `/home/aether` |
| **URL (local / SSH)** | `http://127.0.0.1:3000` |
| **URL (public)** | `http://80.209.232.82:3000` — auth if Public Mode on |
| **Public Mode** | file `/home/aether/.aether-public-password` (chmod 600); set/change in NODE SETTINGS or shell |
| **systemd** | `aether.service` (enabled), bind **`0.0.0.0:3000`** |
| **Auth gate** | `proxy.ts` (Next 16 Node network proxy; not deprecated middleware) |
| **Связанная дока сервера** | `/root/SERVER.md` |
| **Снимок handoff** | **2026-07-20 ~23:46 EEST** |

---

## 1. Что это и зачем

**Aether** — веб-дашборд для **владельца Ergo mainnet-ноды**. Показывает:

- состояние **своей** ноды (height, peers, mempool);
- **3D constellation** — нода в центре, peers в 3D;
- **World map** — peers по GeoIP, **clustering**, boom на новый блок;
- **Share My Node** — premium card + QR + copy link / text / PNG;
- **Public Mode** — опциональный внешний доступ с паролем;
- **PWA** — Add to Home Screen (manifest + icons, без service worker);
- ленту **recent blocks** (реальный txCount) + **mempool** → SigmaSpace;
- метрики, в т.ч. **AVG BLOCK TIME** с ноды (`lastHeaders/100`).

Не майнер, не кошелёк, не explorer. **Read-only** к Ergo REST.  
Не трогает `ergonode` / oracle systemd units и не шлёт транзакции.

---

## 2. Как смотреть

### SSH-туннель (всегда без пароля — Host localhost)

```bash
ssh -L 3000:127.0.0.1:3000 root@80.209.232.82 -N
# http://localhost:3000
```

### Публично (если Public Mode on)

```text
http://80.209.232.82:3000
Basic Auth: любой user + пароль из .aether-public-password
или: ?password=SECRET  (ставит httpOnly cookie)
или: X-Aether-Password: SECRET
```

Данные ноды: browser → `/api/node/*` → server proxy → `127.0.0.1:9053`.  
Второй туннель на 9053 **не нужен**.

---

## 3. Архитектура

```
┌─────────────┐  SSH -L 3000   ┌──────────────────────────────────────────┐
│  Laptop     │ ─────────────► │  Server 0.0.0.0:3000 (Next.js)           │
│  Browser    │  or public IP  │    proxy.ts → local bypass / Basic auth  │
│             │                │    /              → UI                   │
│             │                │    /api/node/*    → :9053                │
│             │                │    /api/peers/map → peers + geoip        │
│             │                │    /api/public-status                    │
│             │                │    /api/public-password  (POST)          │
└─────────────┘                │  Ergo :9053 REST, :9030 P2P              │
                               │  Oracles (independent)                   │
                               └──────────────────────────────────────────┘
```

### proxy.ts (auth)

- **Local Host** (`localhost` / `127.0.0.1` / `::1`) → always allow (не путать с bind `0.0.0.0` — locality по **Host header**).
- Password file empty/missing → remote **401**.
- Password set → Basic / `?password=` / `X-Aether-Password` / cookie `aether_public_auth` (sha256).
- Password **read from file every request** (смена без rebuild).

### Public password

| | |
|--|--|
| Path | `/home/aether/.aether-public-password` |
| Mode | `0600`, owner root |
| Content | one line, secret |
| UI | NODE SETTINGS → SET / CHANGE PUBLIC PASSWORD (min 10) |
| API | `POST /api/public-password` `{ password }` — localhost or valid public auth |
| Status | `GET /api/public-status` → `{ publicMode, storage: "file", ... }` never leaks password |

---

## 4. Структура файлов (важное)

```
/home/aether/
├── AETHER.md
├── README.md
├── proxy.ts                 ← network auth (Next 16)
├── lib/public-password.ts   ← read/write password file
├── .aether-public-password  ← SECRET chmod 600 (not in git)
├── .env.local               ← ERGO_NODE_URL only (no public password)
├── app/
│   ├── manifest.ts          ← PWA
│   ├── page.tsx
│   ├── layout.tsx           ← viewport, appleWebApp, theme-color
│   ├── globals.css
│   ├── api/
│   │   ├── node/[...path]/route.ts
│   │   ├── peers/map/route.ts
│   │   ├── public-status/route.ts
│   │   └── public-password/route.ts
│   ├── components/
│   │   ├── Constellation3D.tsx
│   │   ├── PeerMap.tsx      ← clusters, boom flight, popups (native Leaflet)
│   │   ├── ShareCard.tsx
│   │   ├── ConnectionSettings.tsx
│   │   ├── BlocksTimeline.tsx
│   │   ├── MempoolFlow.tsx
│   │   ├── MetricsCards.tsx
│   │   └── Providers.tsx
│   ├── lib/ blocks.ts, explorer.ts
│   └── types/ergo.ts
└── public/icons/            ← icon-192, icon-512, apple-touch
```

---

## 5. UI — ключевое поведение

### Top bar
- NODE LIVE / DEMO / OFFLINE · **PUBLIC** badge · **SHARE MY NODE** · NODE SETTINGS · DEMO · Refresh  
- Mobile: compact labels, status chip, controls wrap; viz floating Boom/Refresh **hidden while any modal open** (`hideControls` / `isAnyModalOpen`).

### View modes
1. **3D CONSTELLATION** — R3F; mobile: BOOM left + FOCUS right on canvas; toggle under viz on mobile.  
2. **WORLD MAP** — Leaflet CARTO dark + **markercluster** (native `L.markerClusterGroup`):
   - Default camera: `setView(Your Node | Europe, zoom 2.5)` — no aggressive fitBounds (no black side bars).
   - Refresh: refetch peers + reset to default view.
   - Peers: bindTooltip + bindPopup (HTML); Your Node outside cluster.
   - **Boom (new block):** 3 long pulse rings on hottest peer + notice starts at top of map and **flies down** to peer (~3.75s). No bottom plaque, no sonner for boom.
   - Top Regions under map on mobile / overlay on desktop.

### Metrics / lists
- Equal two-column grid: **Recent Blocks** | **Mempool Flow**.
- Block row click → **modal only**; SigmaSpace only via button in modal.
- Mempool dots: 8-color palette by tx id hash; click → SigmaSpace TX.

### Share Card
- Premium PNG export (`html-to-image` @3x), QR (`qrcode.react`), Copy link / Copy as text for X·TG.

---

## 6. systemd (`/etc/systemd/system/aether.service`)

```ini
[Service]
WorkingDirectory=/home/aether
Environment=NODE_ENV=production
Environment=ERGO_NODE_URL=http://127.0.0.1:9053
EnvironmentFile=-/home/aether/.env.local
ExecStart=/usr/bin/npx next start -H 0.0.0.0 -p 3000
Restart=on-failure
Nice=10
```

```bash
cd /home/aether && npm run build && systemctl restart aether
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -s http://127.0.0.1:3000/api/public-status
curl -s -o /dev/null -w "%{http_code}\n" http://80.209.232.82:3000/   # 401 if public mode
```

**Не коммитить:** `node_modules/`, `.next/`, `.aether-public-password`, `.env*`.

---

## 7. Зависимости (ключевые)

```
next 16.2.10 · react 19.2.4
@react-three/fiber 9.6.1 · @react-three/drei 9.121.1 · three
leaflet · react-leaflet 5 · leaflet.markercluster · react-leaflet-cluster (installed; map uses native cluster API)
geoip-lite · @tanstack/react-query · framer-motion · sonner · lucide-react
html-to-image · qrcode.react · date-fns
```

---

## 8. Ergo REST

| Path | Зачем |
|------|--------|
| `/info` | height, peers, name, version |
| `/peers/connected` | peer list |
| `/transactions/unconfirmed` | mempool |
| `/blocks/at/{h}` · `/blocks/{id}/header` · `/blocks/{id}/transactions` | blocks + txCount |
| `/blocks/lastHeaders/{n}` | avg block time |

Прод-нода: **mainnet 6.0.2**, `netim_node`, REST `:9053`, P2P `:9030`.

---

## 9. Design tokens

| Token | Value |
|-------|--------|
| BG | `#0A0A0F` |
| Ergo orange | `#FF7A3D` |
| Cyan | `#00E5FF` |
| Text | `#E8E8F0` |
| Muted | `#A0A0B0` |

---

## 10. Ограничения / TODO

- ~40–50% peers без public IP → не на карте  
- Boom peer = hottest `lastMessage`, не miner  
- CARTO tiles = исходящий HTTPS из **браузера**  
- systemd leftover next-server on restart (unit всё равно active)  
- PWA без service worker  
- Optional: heatmap, oracle metrics UI, lines you→peer  
- Server security (mnemonics → EnvironmentFile) — `SERVER.md`

---

## 11. Чеклист для нового чата

```text
Проект: Aether — Ergo node visualizer
Путь: /home/aether
Дока: /home/aether/AETHER.md + /root/SERVER.md
Прод: aether.service, 0.0.0.0:3000, proxy.ts auth, password file .aether-public-password
Стек: Next 16 + React 19 + R3F 9 + Leaflet cluster + geoip-lite
Не трогать: ergonode, oracle-core, oracle-core-usd без просьбы
Доступ: ssh -L 3000:127.0.0.1:3000 root@80.209.232.82 -N
Public: http://80.209.232.82:3000 + Basic/password
```

---

## 12. История сессий

### 2026-07-18 → 2026-07-19
Прототип → deploy `/home/aether`, proxy, 3D + map + boom, SigmaSpace, real metrics, handoff MD.

### 2026-07-20 (основная сессия UI)
1. **Public Mode** + bind `0.0.0.0` + Share Card phase 1  
2. Password → **file** + UI change API (no env password)  
3. Share Card premium (QR, copy text, PNG)  
4. Mobile + basic PWA  
5. Mobile viz controls under map; hide floating controls when modal open  
6. **Marker clustering** (native Leaflet cluster + bindPopup/Tooltip)  
7. Map default **setView** (no black bars); Refresh resets view  
8. Boom redesign: 3 pulses + flying notice top→peer (no bottom plaque)  
9. Equal Blocks/Mempool panels; colored TX dots; block click → modal only  

Исходный idea chat:  
https://grok.com/share/bGVnYWN5_01882487-4c5e-4e7e-88cf-7d67479d1387  

---

## 13. Dev loop

```bash
cd /home/aether
npm run build && systemctl restart aether
systemctl is-active aether ergonode oracle-core oracle-core-usd
```

---

## 14. Снимок на handoff (2026-07-20 ~23:46 EEST)

| | |
|--|--|
| aether | **active**, HTTP **200**, `0.0.0.0:3000` |
| publicMode | **true** (password file set, chmod 600) |
| ergonode | active — mainnet **6.0.2**, height **~1833426**, peers **~118** |
| oracles XAU/USD | active |
| monitor / balance timers | active |

**Aether work for this evening is closed.** Next touch may be Telegram notifications only (`SERVER.md` / monitor scripts) — not Aether UI unless asked.

---

**Конец handoff.**  
Обновляй этот файл при крупных изменениях API/деплоя.  
Синхронизируй `/root/AETHER.md` ← `/home/aether/AETHER.md` и pointer в `/root/SERVER.md`.
