# Mini App — что есть / чего нет (честный roadmap)

**URL:** https://m.ergolumen.net  
**Web (не трогаем):** https://ergolumen.net  
**Updated:** 2026-07-31  

---

## Сейчас в приложении

| Вкладка | Есть | Примечание |
|---------|------|------------|
| **Home** | LIVE, height, peers count, mempool, bridge, source, refresh, pull-to-refresh, Alerts chip | ✅ |
| **Network (Net)** | **MAP first** (full-bleed) · LIST optional · LIVE \| ALL · peer sheet | ✅ (`markers` API; map fills toolbar→tabs) |
| **Oracles (Ora)** | NETWORK \| MY, USD/XAU prices | ✅ (API field `price`) |
| **Me** | Bridge sheet, Alerts sheet, clear token, open full site | ✅ |

### UX shell
- Bottom tabs, soft tab fade  
- TG top padding (under close / ···)  
- No floating «My Node» pill on mini  
- Sheets + TG BackButton  
- Net default: **MAP**; toggle MAP \| LIST  

### Deploy
- Caddy: `m.ergolumen.net`  
- Next rewrite host → `/m` (HTTP → 127.0.0.1:3000)  
- BotFather Web App URL: `https://m.ergolumen.net`  
- Unit: `lumen.service` · build + `systemctl restart lumen`  

---

## Чего ещё **нет** (осознанно / next)

| # | Фича | Приоритет |
|---|------|-----------|
| 1 | AVG block time (как web Metrics) на Home | 🔜 next |
| 2 | Peer **search** on Network | 🔜 next |
| 3 | Bridge sheet: **install / Docker copy** | 🔜 next |
| 4 | RU strings / polish empty states | 🔜 polish |
| 5 | Mempool detail / tx list | only count now |
| 6 | Share card PNG in mini | later |
| 7 | Offline cache / PWA install | later |
| 8 | monorepo `packages/core` | later |
| 9 | Push outside TG bot alerts | TG Alerts sheet only |
| 10 | Orbit / 3D constellation in mini | ❌ never MVP (web only) |
| 11 | Boom / typewriters / dual WebGL oracles | ❌ web only |

---

## Roadmap по шагам

### ✅ Done (MVP shipped)
1. MVP tabs shell + `m.ergolumen.net`  
2. Home live + Bridge hydrate → Home + toast  
3. Oracles prices (`price` field map)  
4. Network list from `markers` + state  
5. Alerts sheet, My oracle segment, peer sheet, LIVE/ALL  
6. **Net opens MAP first**, full-bleed to tab bar (`fillParent` + grid)  

### 🔜 Next (если продолжаем — порядок)
1. **Home:** avg block time (как на web Metrics)  
2. **Network:** peer search (desktop-style, mini-safe)  
3. **Bridge sheet:** install command / Docker copy  
4. **i18n RU** + empty-state polish  
5. monorepo `packages/core` (shared types/fetch — later)  

### ⏸ Parallel (не mini, не блокирует)
- **Devnet** full blocks — peer 213… / ждём Сашу (Chepurnoy); conf Matrix, ports 9130/9153, panel `devnet.ergolumen.net`  
- Web polish — only on request  
- iOS Phase 2 (APNs / TestFlight) — separate track  

---

## Как пользоваться сейчас

| Хочешь | Куда |
|--------|------|
| Высота / bridge | **Home** |
| Карта пиров (по умолч.) | **Net** → MAP; LIST = список; LIVE = активные |
| Цены | **Ora** → NETWORK |
| Свой oracle agent | **Ora** → MY (нужен token) |
| Token / alerts | **Me** |

**BotFather Web App URL:** `https://m.ergolumen.net`

---

## Git / last map fix
- `f7873c7` — Net MAP first + edge-to-edge height  
- Repo: `github.com/from-ufa/lumen` · branch `main`  
