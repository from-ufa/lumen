# Отчёт: Emil craft residual (раунд 3)

**Ветка:** `feat/emil-craft-residual`  
**Checkpoint (main до merge):** `15d1c69`  
**Дата:** 2026-07-30  

---

## Было → стало

### 1. Hover lift только на fine-pointer

| Было | Стало | Почему |
|------|--------|--------|
| `lumen-glow-panel` / oracle block/tile / ops-addr **translateY на :hover** всегда | **transform + heavy shadow** только в `@media (hover: hover) and (pointer: fine)` | На touch «залипает» hover после тапа |
| `group-hover:translate` на ArrowUpRight | класс **`.lumen-hover-nudge`** + fine-pointer | То же правило Emil |
| TG pill `hover:bg` в Tailwind | hover в CSS media query | Цвет-hover не липнет на coarse pointer |

Color-only hover (border) оставлен везде — без сдвига.

### 2. `prefers-reduced-motion`

| Компонент | Было | Стало |
|-----------|------|--------|
| MempoolFlow rows | layout + y + scale | reduce → opacity only, no layout |
| ShareCard / ConnectionSettings modal | scale + y | reduce → opacity only |
| TypewriterInvite | scale + y + glow loop | reduce → opacity; **glow off** |
| page / oracles mobile menu | scale + y | reduce → opacity |
| Block detail modal | scale + y | reduce → opacity |
| PeerMap HUD / selected | y + scale | reduce → opacity |
| Metrics sync bar | scaleX animate | reduce → instant |
| globals reduced-motion | UI transitions 0.01ms | + glow/oracle panels, no hover transform |

### 3. TG low-end (`html.tg-low-end`)

| Было | Стало |
|------|--------|
| Только `touch-action` на viz | **без blur** (panel/glass/pill/boom) |
| | **orbs hidden**, pulse/status/particle **animation: none** |
| | transitions **80ms**, hover lift **off**, lighter box-shadow |

Класс уже ставится в `initTelegramApp()` через `isTelegramLowEnd()`.

---

## Откат

```bash
cd /home/lumen
git checkout main
git reset --hard 15d1c69
npm run build && systemctl restart lumen
```

---

## Как проверить

1. **Desktop мышь** — панели oracle/glow слегка поднимаются на hover  
2. **Телефон / TG** — после тапа панель **не остаётся** «приподнятой»  
3. OS **Reduce motion** — меню/модалки только fade  
4. TG Android low-end — меньше blur/glow, Map first (как раньше)
