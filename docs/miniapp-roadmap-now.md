# Mini App — что есть / чего нет (честный roadmap)

**URL:** https://m.ergolumen.net  
**Web (не трогаем):** https://ergolumen.net  

---

## Сейчас в приложении

| Вкладка | Есть | Примечание |
|---------|------|------------|
| **Home** | LIVE, height, peers count, mempool, bridge, source, refresh, pull-to-refresh, Alerts chip | ✅ |
| **Network (Net)** | LIST \| MAP, LIVE \| ALL, peer sheet, map | ✅ (list fixed: API `markers`) |
| **Oracles (Ora)** | NETWORK \| MY, USD/XAU prices | ✅ (fixed: API `price`) |
| **Me** | Bridge sheet, Alerts sheet, clear token, open full site | ✅ |

### UX shell
- Bottom tabs, soft tab fade  
- TG top padding (under close / ···)  
- No floating «My Node» pill on mini  
- Sheets + TG BackButton  

---

## Чего ещё **нет** (осознанно не делали / next)

| # | Фича | Статус |
|---|------|--------|
| 1 | AVG block time (как на web Metrics) | ❌ next |
| 2 | Mempool detail / tx list | ❌ only count |
| 3 | Orbit / 3D constellation in mini | ❌ never MVP (web only) |
| 4 | Boom / typewriters / invites | ❌ web only |
| 5 | Dual oracle WebGL panels | ❌ web only |
| 6 | Full ConnectionSettings (Docker install copy) | ❌ thin Bridge sheet only |
| 7 | Share card PNG | ❌ |
| 8 | Offline cache / PWA install | ❌ |
| 9 | i18n RU | ❌ EN labels now |
| 10 | Peer search on Network | ❌ |
| 11 | Push outside TG bot alerts | ❌ TG alerts sheet only |

---

## Roadmap по шагам

### ✅ Done
1. MVP tabs shell + m.ergolumen.net  
2. Home live + Bridge  
3. Oracles prices (API map fix)  
4. Network list from markers (API map fix)  
5. Alerts sheet, My oracle segment, peer sheet, filters  

### 🔜 Next (если продолжаем)
1. Home: avg block time  
2. Network: search  
3. Bridge sheet: install command copy  
4. RU strings / polish empty states  
5. monorepo `packages/core` (later)  

### ⏸ Parallel (не mini)
- Devnet full blocks (ждём Сашу)  
- Web polish only on request  

---

## Как пользоваться сейчас

| Хочешь | Куда |
|--------|------|
| Высота / bridge | **Home** |
| Список пиров / карта | **Net** → LIST or MAP; LIVE = активные |
| Цены | **Ora** → NETWORK |
| Свой oracle agent | **Ora** → MY (нужен token) |
| Token / alerts | **Me** |

**BotFather Web App URL:** `https://m.ergolumen.net`
