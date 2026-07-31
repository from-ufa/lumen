# Mini App — карта продукта (честно)

**URL:** https://m.ergolumen.net  
**Web (не трогаем):** https://ergolumen.net  
**Updated:** 2026-07-31  

---

## Архитектура (как думать)

```
┌─────────────────────────────────────────────┐
│  TG chrome pad · brand · LIVE/OFF           │
├─────────────────────────────────────────────┤
│  HOME          │  NET        │  ORA  │  ME  │  ← 4 tabs only
│  ───────────── │  ─────────  │  ───  │  ──  │
│  Overview      │  MAP first  │  Net  │ Me   │
│  Blocks   ←────│  LIST       │  My   │      │
│  Mempool  ←────│  search     │  ───  │      │
│                │             │ Pools │      │
│                │             │ Ops   │      │
└─────────────────────────────────────────────┘
Sheets: Bridge · Alerts · Peer detail
Watchdog: TG private alerts (node + oracle) every ~90s
```

**Правило:** не плодить 5-й tab. Всё «chain ops» — подменю Home.  
**Правило:** web (Orbit / dual WebGL) не клонируем.

---

## Сейчас в приложении

| Место | Что |
|-------|-----|
| **Home / Overview** | Height, last block ago, peers, avg block, bridge; **tiles** → Blocks / Mempool / Ora |
| **Home / Blocks** | Last ~10–12 blocks, search, SigmaSpace |
| **Home / Mempool** | Pending txs, Σ ERG, search, SigmaSpace |
| **Net** | MAP full-bleed first · LIST + search · LIVE/ALL · peer sheet |
| **Ora / Pools** | Rich cards: status, rewards $, claim/wallet, publish, gas |
| **Ora / Operators** | LIVE/OFF/ALL, per-pool chips, YOU, idle keys |
| **Me** | Bridge Docker/install, Alerts prefs, EN/RU, clear token |
| **Alerts** | Node: offline, unreachable, peers, sync, stuck · Oracle: DOWN, lag, gas, refresh |

### Deploy
- `m.ergolumen.net` · Caddy + host rewrite · `lumen.service`
- Alerts: `lumen-tg-alerts.timer` ~90s
- Secrets: `.env.local` only · no force-push main

---

## Что **не** делаем в mini

| | |
|--|--|
| Orbit 3D / Boom / typewriters | web only |
| Dual WebGL oracle panels | web only |
| 5th bottom tab | no — submenus instead |
| packages/core monorepo | later optional |
| Share PNG / offline PWA | later |

---

## Next (только если нужно)

1. Home: optional **last N blocks preview strip** on Overview (3 mini rows)  
2. Net MAP: compact peer search overlay (still no desktop HUD)  
3. Alerts: quiet hours  
4. Share card PNG  
5. Devnet full blocks (parallel, Sasha)  

---

## Как пользоваться

| Хочешь | Куда |
|--------|------|
| Height / last block | **Home → Overview** |
| Список блоков | **Home → Blocks** |
| Pending txs | **Home → Mempool** |
| Карта пиров | **Net** (MAP) |
| Список пиров | **Net → LIST** |
| Пулы + rewards | **Ora → Pools** |
| Кто online/offline | **Ora → Operators** |
| Docker / token | **Me → Bridge** |
| Оповещения | **Me → Alerts** or Home chip |

**BotFather Web App URL:** `https://m.ergolumen.net`
