# Session report: oracle operators on the map

**Дата:** 2026-07-29 ~13:00 (+03)  
**Сервер:** `/home/lumen` · `main`  
**Промпт:** «мы можем выводить на карту операторов вообще всех держателей oracle keys?»

---

## 1. Задача

Оценить feasibility: показать на World Map **всех** держателей oracle keys / operators (не только live), без реализации.

---

## 2. Как устроено сейчас

| Слой | Данные | Гео |
|------|--------|-----|
| **World Map (PeerMap)** | Ergo **P2P peers** (IP:port) из catalog + live node | **geoip-lite** по IP |
| **Oracle operators** | **P2PK addresses** из oracle-core Prometheus metrics (`posted` / `collected` / claimable rewards) | **нет IP, нет lat/lon** |
| **Operators panel** | unique addresses из `/api/oracles` nodes | grid адресов, не карта |

Live snapshot (network mode):

- erg-usd: **13** nodes (12 live, 1 offline)
- erg-xau: **12** nodes (12 live)
- unique addresses across pools: **~25**

Источник «кто в пуле» = metrics на lumen host (и/или bridge), **не** полный on-chain census всех NFT/key holders за всё время.

---

## 3. Короткий ответ

**Частично да — не «магически всех на карте с реальной геолокацией».**

| Вопрос | Ответ |
|--------|--------|
| Показать всех **сейчас известных** operators (live + offline/stale из metrics)? | **Да** — список/слой UI легко; маркеры на карте только если есть координаты |
| Показать **всех когда-либо** holders oracle NFT/key on-chain? | **Нет из коробки** — нужен explorer/индексация NFT ownership + history |
| Реальные точки на карте для address-only? | **Нет** без IP/opt-in geo: address ≠ location |
| Bridge-агенты с oracle? | **Да, частично**: у connected agent есть `publicIp` → geoip → 1 pin (сейчас 1 connection withOracle) |

---

## 4. Варианты реализации (если делать)

### A. Realistic pins (честная гео)

- Только operators, у кого есть:
  - bridge agent online + `publicIp`, или
  - явный opt-in geo / manual catalog
- Остальных — в side list «no location», не врать на карте

### B. Decorative / synthetic placement

- Hash(address) → jittered lat/lon (красиво, **не** реальная география)
- Помечать «approximate / not real location»

### C. Full key-holder census (Phase «chain»)

- Индексировать oracle **NFT / ballot / key tokens** через Explorer API
- Полный roster holders, статусы active/inactive
- Карта всё равно упирается в geo (A/B)

### D. Hybrid (рекомендация product)

1. Map layer **Oracle operators**
2. Pins: bridge geo + optional catalog
3. Panel: **all known addresses** (metrics, live/stale/offline)
4. Later: chain NFT census → expand roster

---

## 5. Ограничения / риски

- Privacy: не выводить точный IP на публичной карте без согласия
- Metrics ≠ eternal key holders (только то, что metrics видит как active boxes / rewards labels)
- Не путать **oracle P2PK address** с **node IP peer**
- Desktop/mobile map уже тяжёлый (Leaflet clusters) — слой фильтров Live/Linked/All

---

## 6. Что сделано в этом промпте

- Аудит кода/API (без правок product)
- Live проверка `/api/oracles`, bridge stats
- Отчёт + рекомендация

**Код / deploy:** не менялись.

---

## 7. Next (по команде пользователя)

- Спека + UI layer (D)  
- или deep dive Explorer NFT ownership  

---

## Related

- `lib/oracles.ts` — nodes from metrics  
- `app/components/PeerMap.tsx` — IP map  
- `app/components/OracleOperatorsLive.tsx` — address grid  
- `app/api/peers/map/route.ts` — peer geo  
