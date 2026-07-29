# Session report: ME → LUMEN on operators panel

**Дата:** 2026-07-29  
**HEAD:** `e343985`  
**Промпт:** рядом с адресами lumen oracles стоит ME — должно быть LUMEN

---

## Причина

Metrics `isMine` = oracle box **этого host/agent**, не «посетитель сайта».  
Dashboard `mode=network` показывал badge **ME** для host — неверно.

## Фикс

`OracleOperatorsLive.tsx`:

| Условие | Badge |
|---------|--------|
| `isMine` + My Oracle (`scope=mine` / `view=my`) | **ME** (orange) |
| `isMine` + network / public dashboard | **LUMEN** (cyan) |
| not isMine | — |

## Deploy

`e343985` · build + restart · home **200**

## Rollback

```bash
git revert e343985 && npm run build && systemctl restart lumen
```
