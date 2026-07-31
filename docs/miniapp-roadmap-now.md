# Mini App — что есть / чего нет (честный roadmap)

**URL:** https://m.ergolumen.net  
**Web (не трогаем):** https://ergolumen.net  
**Updated:** 2026-07-31  

---

## Сейчас в приложении

| Вкладка | Есть | Примечание |
|---------|------|------------|
| **Home** | LIVE, height, peers, mempool, **avg block time**, bridge, source, refresh, pull-to-refresh, Alerts | ✅ |
| **Network (Net)** | **MAP first** (full-bleed) · LIST optional · **search** · LIVE \| ALL · peer sheet | ✅ |
| **Oracles (Ora)** | NETWORK \| MY, USD/XAU prices | ✅ (API field `price`) |
| **Me** | Bridge sheet (**Docker / install copy**), Alerts, clear token, open full site | ✅ |

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
| 1 | AVG block time (как web Metrics) на Home | ✅ |
| 2 | Peer **search** on Network LIST | ✅ |
| 3 | Bridge sheet: **install / Docker copy** | ✅ |
| 4 | RU strings / polish empty states | 🔜 next |
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
7. Home avg block time · Net LIST search · Bridge Docker/install copy  

### 🔜 Next (если продолжаем — порядок)
1. **i18n RU** + empty-state polish  
2. monorepo `packages/core` (shared types/fetch — later)  
3. Share PNG / offline PWA (later)  

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
