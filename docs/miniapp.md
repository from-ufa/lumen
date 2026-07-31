# lumen Mini App — что есть сейчас

**Live:** https://m.ergolumen.net  
**Bot:** @ergolumen_bot · `/start` → кнопка **OPEN APP**  
**Web (отдельно, не клон):** https://ergolumen.net  
**Repo:** github.com/from-ufa/lumen · `main`  
**Updated:** 2026-07-31  

---

## Зачем

Операторский Telegram Mini App: нода, пиры, оракулы, мемпул, блоки, bridge и **личные алерты** — без десктопного Orbit/3D.

---

## Навигация (4 вкладки)

```
┌─────────────────────────────────────────────────────────┐
│  🔔 Alerts (шапка) · LIVE/OFF · lumen brand             │
├─────────────────────────────────────────────────────────┤
│  HOME          NET            ORA            ME         │
│  Overview      MAP (default)  NETWORK|MY     Connection │
│  Blocks        LIST+search    Pools          LINK code  │
│  Mempool                      Operators      DISCONNECT │
│                                              EN|RU      │
└─────────────────────────────────────────────────────────┘
Sheets: Bridge · Alerts hub · Peer detail
```

### HOME
| Подменю | Содержимое |
|---------|------------|
| **Overview** | Command center: tip height, last block ago, tiles → Blocks / Mempool / Ora, peers, avg block, bridge status |
| **Blocks** | Последние ~10–12 блоков (height, txs, age) · поиск · SigmaSpace |
| **Mempool** | Pending txs, Σ ERG, поиск · SigmaSpace |

### NET
| Режим | Содержимое |
|-------|------------|
| **MAP** (по умолчанию) | Full-bleed Leaflet, toolbar → tab bar |
| **LIST** | LIVE\|ALL, search name/city/IP, peer sheet |

### ORA
| | |
|--|--|
| **NETWORK \| MY** | Публичные пулы Lumen / свои через bridge |
| **Pools** | Цена, LIVE/STALE, кворум, epoch, reward token $, claim/wallet/total, last publish, gas, in refresh |
| **Operators** | LIVE/OFF/ALL, chips по пулам, badge LUMEN или YOU, rewards |

### ME
| Блок | Содержимое |
|------|------------|
| **Статус** | Не подключено · Подключено · Токен есть / агент offline |
| **Сейчас в приложении** | Что видят Node/Net и Ora |
| **Источник** | LUMEN \| Моя нода |
| **CONNECT / DISCONNECT** | DISCONNECT чистит token + vault + opt-out (не вернётся сам) |
| **LINK с сайта** | Код с ergolumen.net → Settings → LINK TELEGRAM |
| **Alerts / Language / Full site** | |

---

## Alerts hub (🔔 в шапке)

Одно место для всех Telegram-оповещений:

1. Master ON/OFF  
2. **9 типов** с тумблерами:

| Группа | Оповещения |
|--------|------------|
| Bridge | offline / recovery |
| Node | unreachable · peers low · sync lag · height stuck |
| Oracle | DOWN · publish lag · missed refresh · low gas |

3. Пороги: min peers, oracle lag (blocks)  
4. SAVE · TEST  
5. Edge-only (без спама), recovery при ok  
6. Watchdog: `lumen-tg-alerts.timer` ~90 с  

Нужны: bridge-токен + `/start` боту.

---

## Identity (кто «ты»)

| | Guest (нет token) | Personal (token + MY + agent) |
|--|-------------------|-------------------------------|
| Данные | **LUMEN** (host) | своя нода / oracle agent |
| Лейблы | никогда YOU / MY NODE | YOU / MY NODE |
| API `isMine` на network | **host Lumen**, не user | — |

---

## Bot

```
/start  →  ⚡ lumen + «Tap below» + [ 🚀 OPEN APP ] → m.ergolumen.net
/help   · /status · /oracles · /link CODE · /alerts
```

---

## i18n

EN + RU (`app/m/lib/i18n.ts`): язык из Telegram `language_code` или Me → EN|RU.

---

## Deploy / ops

```bash
cd /home/lumen && npm run build && systemctl restart lumen
# bridge: systemctl restart lumen-bridge-server
# alerts timer: lumen-tg-alerts.timer
```

- Caddy: `m.ergolumen.net` · rewrite → `/m`  
- Env: `TELEGRAM_WEBAPP_URL=https://m.ergolumen.net` (в `.env.local`, не в git)  
- Secrets: `.env.local` · `/root/.secrets`  
- **Не** force-push `main`  

### Код
| Путь | Роль |
|------|------|
| `app/m/**` | Mini shell, panels, sheets |
| `app/lib/tg-alerts-*.ts` | engine · store · catalog |
| `app/lib/tg-bot.ts` | Bot API + OPEN APP |
| `app/api/tg/**` | auth, webhook, settings, alerts |
| `docs/miniapp.md` | этот документ |
| `docs/miniapp-roadmap-now.md` | краткая карта |

---

## Не в mini (намеренно)

Orbit 3D · Boom · typewriters · dual WebGL oracles · 5-й tab  

---

## Agreed next (see ROADMAP.md)

After review fact-check — **priority backlog**:

| Pri | Items |
|-----|--------|
| **P0 Security** | Hash bridge tokens at rest · token rotation · audit log |
| **P1 Bridge** | Hub metrics · per-token rate limit · staging |
| **P2 Alerts** | Quiet hours · extra thresholds · alert history · (later webhook) |
| **P3 Product** | Time-series charts · onboarding video · discoverability · GeoIP opt-out |
| **P4 Eng** | GitHub Actions CI · smoke tests |

Full table: [ROADMAP.md](./ROADMAP.md) · Mini short map: [miniapp-roadmap-now.md](./miniapp-roadmap-now.md)

**Already shipped (do not re-plan as missing):** install one-liner, Alerts 9 types + mute, Mini Me LINK/DISCONNECT, dual mode, TG bot OPEN APP/WEB.

---

## Out of mini

Orbit 3D · Boom · typewriters · dual WebGL · 5th tab  
