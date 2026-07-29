# Session report: operators on oracle constellation (not node map)

**Дата:** 2026-07-29  
**Промпт (уточнение):** имелось в виду **карта/визуал оракулов** (constellation), где операторы крутятся чисто визуально — не World Map нод.

---

## 1. Уточнение

| | World Map (PeerMap) | Oracle Constellation (`/oracles`) |
|--|---------------------|-----------------------------------|
| Что | ноды по IP + geo | операторы pool **по address** |
| Гео | geoip | **нет** — круги/орбиты canvas |
| Сейчас | peers | `feed.nodes` → точки на орбитах |

Пользователь хочет **constellation**: все holders oracle keys, чисто визуально.

---

## 2. Как работает сейчас

`OracleConstellation.tsx` → `buildOraclesFromFeed(feed)`:

- берёт **все** `feed.nodes` (не фильтрует только live);
- раскладывает по углу на кольцах (декор);
- status: live → Active (яркий), stale → Verifying, offline → Offline (тусклый, медленнее).

Данные: `lib/oracles.ts` metrics:

- `ergo_oracle_active_oracle_box_height{posted|collected}`
- `ergo_oracle_all_oracle_claimable_rewards{oracle_address=…}`

Live snapshot:

- USD: **13** nodes (12 live + 1 offline) — offline уже на constellation
- XAU: **12** live

---

## 3. Ответ

**Да — на constellation это как раз то место.**  
Гео/IP не нужны: точки уже «крутятся» визуально.

| Запрос | Реальность |
|--------|------------|
| Все **известные metrics** operators (live + offline)? | **Уже почти так** — offline рисуется dim |
| Все **on-chain key/NFT holders** ever? | **Нет** — metrics = boxes/rewards labels, не полный census NFT |
| Добавить «мертвые» keys которых metrics не видит? | Нужен explorer/token holders API |

---

## 4. Если «не хватает» визуально

Возможные доработки (по команде):

1. Явнее offline (легенда, dim pulse, count «12 live / 1 offline»)
2. Не схлопывать nodes при empty metrics fallback
3. On-chain roster oracle NFT → merge в `nodes` со status `unknown`/`offline`
4. Toggle: Live only | All known

---

## 5. Код

Не менялся (только разбор + отчёт).
