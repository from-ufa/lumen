# Lumen — Ergo Node Dashboard

**Handoff / context pack for future Grok (or any AI) sessions.**  
Документ описывает проект целиком: зачем, как устроен, где лежит, как деплоится, что уже сделано.

| | |
|--|--|
| **Product** | **Lumen** (formerly Aether) — Ergo Node Dashboard |
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
| **Снимок handoff** | **2026-07-23** (3D planets + galaxy orbit + music) |
| **Network crawler** | `scripts/crawl-network.mjs` + `aether-crawl.timer` (every 12m) |
| **Catalog** | `/home/aether/data/network-catalog.json` (gitignored) |

---

## 1. Что это и зачем

**Lumen** — веб-дашборд (Ergo Node Dashboard) для **владельца Ergo mainnet-ноды**. Показывает:

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
├── LUMEN.md
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
│   │   ├── peers/map/route.ts   ← network catalog + links + live connected
│   │   ├── public-status/route.ts
│   │   └── public-password/route.ts
│   ├── components/
│   │   ├── Constellation3D.tsx
│   │   ├── PeerMap.tsx      ← network markers, signal arcs, boom, clusters
│   │   ├── ShareCard.tsx
│   │   ├── ConnectionSettings.tsx
│   │   ├── BlocksTimeline.tsx
│   │   ├── MempoolFlow.tsx
│   │   ├── MetricsCards.tsx
│   │   └── Providers.tsx
│   ├── lib/ blocks.ts, explorer.ts
│   └── types/ergo.ts
├── lib/
│   ├── public-password.ts
│   └── network-peers.ts     ← catalog load/merge/geo helpers
├── scripts/crawl-network.mjs  ← local + REST fan-out + TCP probe
├── data/network-catalog.json  ← generated (not in git)
└── public/icons/            ← icon-192, icon-512, apple-touch
```

---

## 5. UI — ключевое поведение

### Top bar
- NODE LIVE / DEMO / OFFLINE · **PUBLIC** badge · **SHARE MY NODE** · NODE SETTINGS · DEMO · Refresh  
- Mobile: compact labels, status chip, controls wrap; viz floating Boom/Refresh **hidden while any modal open** (`hideControls` / `isAnyModalOpen`).

### View modes
1. **3D CONSTELLATION** — R3F; mobile: BOOM left + FOCUS right on canvas; toggle under viz on mobile.  
2. **WORLD MAP** — Leaflet CARTO dark + **markercluster** + **network catalog**:
   - Shows **all known network nodes** (catalog), not only connected peers.
   - Marker states: **LINKED** (connected to you, bright cyan) · **LIVE** (TCP reachable) · **STALE** (known, offline).
   - **Signal lines:** thin arcs YOU → each linked peer with flying packet animation.
   - Default camera: `setView(Your Node | Europe, zoom 2.5)` — no aggressive fitBounds.
   - Refresh: refetch peers + reset to default view.
   - **Boom (new block):** 3 pulses on hottest **connected** peer + flying notice (~3.75s).
   - Top Regions under map on mobile / overlay on desktop.
   - HUD: `NETWORK · LIVE · LINKED` counts from `/api/peers/map`.

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

## 10. Network crawler

| | |
|--|--|
| Script | `npm run crawl:network` → `scripts/crawl-network.mjs` |
| Sources | local `/peers/all` + `/peers/connected`, REST fan-out (`restApiUrl`), TCP :9030 probe |
| Output | `data/network-catalog.json` |
| Timer | `aether-crawl.timer` every **12 min** (`Nice=15`) |
| Map API | loads catalog; overlays live connected → `state` + `links[]` |
| Fallback | if catalog missing/stale (>45m) → inline local harvest |

```bash
cd /home/aether && npm run crawl:network
systemctl status aether-crawl.timer
journalctl -u aether-crawl.service -n 30 --no-pager
curl -s http://127.0.0.1:3000/api/peers/map | jq '{networkMapped,connectedMapped,links:(.links|length)}'
```

Not a full Scorex P2P crawler (Phase B later if needed). Does **not** depend on ergonodes.net.

---

## 11. Ограничения / TODO

- Peers without public IP still unmapped (NAT / empty address)  
- Boom peer = hottest connected `lastMessage`, not miner  
- TCP open ≠ full Ergo handshake (reachable ≈ port open)  
- CARTO tiles = исходящий HTTPS из **браузера**  
- systemd leftover next-server on restart (unit всё равно active)  
- PWA без service worker  
- Optional: heatmap, oracle metrics UI, full P2P handshake crawler  
- Server security (mnemonics → EnvironmentFile) — `SERVER.md`

---

## 12. Чеклист для нового чата

```text
Проект: Lumen — Ergo Node Dashboard
Путь: /home/aether
Дока: /home/aether/LUMEN.md + /root/SERVER.md
Прод: aether.service, 0.0.0.0:3000, proxy.ts auth, password file .aether-public-password
Crawler: aether-crawl.timer → data/network-catalog.json
Стек: Next 16 + React 19 + R3F 9 + Leaflet cluster + geoip-lite
Не трогать: ergonode, oracle-core, oracle-core-usd без просьбы
Доступ: ssh -L 3000:127.0.0.1:3000 root@80.209.232.82 -N
Public: http://80.209.232.82:3000 + Basic/password
```

---

## 13. История сессий

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

### 2026-07-22 — Network map + signal lines
1. **Network Indexer** crawler: local `/peers/all` + REST fan-out + TCP probe  
2. Catalog `data/network-catalog.json` + `aether-crawl.timer` (12m)  
3. `/api/peers/map` serves full network markers + `links[]` for connected  
4. Map UI: NETWORK/LIVE/LINKED states + animated YOU→peer signal arcs  
5. ~437 mapped network nodes, ~62 signal lines (live snapshot)

### 2026-07-23 — 3D constellation (planets / sun / orbit / music)
1. **Real planets** — textures in `public/planets/` (Solar System Scope + three.js Earth/Moon)  
   + procedural canvas fallback so no white spheres (`app/lib/planet-textures.ts`)  
2. **Sun** at center: photosphere shader + multi-harmonic **physical** pulse (body scale + noisy corona)  
3. **Galaxy orbit**: whole peer system rotates around sun; UI **AUTO ORBIT** + **GALAXY SPEED** slider (0.25–5×), keys `[` `]`  
4. **Music**: panel MUSIC + key `M`; plays `public/audio/stay.mp3` if present (licensed by operator);  
   else original Web Audio space pad. Interstellar *Stay* is **not** redistributed (copyright).  
5. GitHub: `from-ufa/aether` main — latest `e502a7c` (+ handoff update)

Исходный idea chat:  
https://grok.com/share/bGVnYWN5_01882487-4c5e-4e7e-88cf-7d67479d1387  

---

## 14. Dev loop

```bash
cd /home/aether
npm run crawl:network   # optional refresh catalog
npm run build && systemctl restart aether
systemctl is-active aether ergonode oracle-core oracle-core-usd aether-crawl.timer
```

---

## 15. Снимок (2026-07-23 ~14:00)

| | |
|--|--|
| aether | **active**, HTTP **200**, publicMode **true** |
| ergonode | active — mainnet **6.0.2**, height **~1835293**, peers **~114** |
| oracles | oracle-core + oracle-core-usd **active** |
| aether-crawl.timer | **active**, catalog fresh |
| load | **~0.1** (idle) · RAM **4/16 GiB** used · disk **40%** |
| git | `main` = `origin/main` (clean) |

---

**Конец handoff.**  
Обновляй этот файл при крупных изменениях API/деплоя.  
Синхронизируй `/root/LUMEN.md` ← `/home/aether/LUMEN.md` и pointer в `/root/SERVER.md`.
