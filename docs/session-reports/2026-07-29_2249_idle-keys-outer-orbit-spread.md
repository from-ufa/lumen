# Session report: idle keys evenly on farthest orbit

**Дата:** 2026-07-29  
**HEAD:** `91a3510`  
**Промпт:** idle более рассредоточены; не пачкой; на самой дальней орбите

---

## Что сделано

1. **Ring 4** — новая дальняя орбита только для idle keys (`baseRings` + 228×s)
2. Active — rings **1–2**; ring **3** — буфер между active и idle
3. Idle: угол = `(i / N) * 2π` + half-step — **равномерно по кругу**
4. Одинаковая angular speed у idle → **не сбиваются обратно в кучу**
5. Poll update **не** сохраняет старый angle для idle (иначе пачка жила вечно)
6. Орбита idle слегка красным dash

## Deploy

- build + `systemctl restart lumen`
- `/oracles` **200**
- push `main` `91a3510`

## Rollback

```bash
git revert 91a3510 && npm run build && systemctl restart lumen
```
