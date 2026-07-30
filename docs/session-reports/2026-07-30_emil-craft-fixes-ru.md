# Отчёт: craft-фиксы по Emil Kowalski (Lumen)

**Ветка:** `feat/emil-craft-fixes`  
**Checkpoint (откат всей пачки):** `b5169dd` — `chore: checkpoint before Emil craft fixes`  
**Дата:** 2026-07-30  

Откат:

```bash
git checkout feat/emil-craft-fixes
git reset --hard b5169dd
# или удалить ветку и остаться на main
```

---

## Что сделали

### 1. Токены easing + utility-класс

| Было | Стало |
|------|--------|
| Разрозненные `transition-all`, слабые `ease` | `:root` → `--ease-out`, `--ease-in-out`, `--dur-ui` (180ms), `--dur-press` (150ms) |
| — | Класс **`.lumen-ui-transition`** вместо `transition-all` (только color / border / shadow / opacity / transform) |

**Зачем:** `transition: all` анимирует лишнее и «ватнит» UI. Emil: указывать свойства явно + strong ease-out.

---

### 2. Карточки и кнопки (CSS)

| Было | Стало |
|------|--------|
| `.card { transition: all 0.2s }` + hover всегда | Явные `border-color` / `transform` / `box-shadow` |
| Hover на touch срабатывает ложно | Hover только `@media (hover: hover) and (pointer: fine)` |
| `.block-card` / `.btn-cinematic` — `transition: all` | Точечные свойства + ease-out |

---

### 3. Orbit ↔ Map (`VizCrossfade`)

| Было | Стало |
|------|--------|
| Desktop: **480–500 ms** + `filter: blur(8px)` на слоях | Desktop: **~240 ms**, **только opacity** |
| Mobile: 220 ms | Mobile: **~180 ms** |
| Wash 0.55 s | Wash **0.28 s** |

**Зачем:** переключатель режима — часто; UI-анимации &lt; 300 ms; blur над WebGL/map дорогой.

---

### 4. Прогресс-бары (GPU)

| Было | Стало |
|------|--------|
| `MetricsCards`: `animate width %` **0.65 s** | `scaleX` **0.22 s**, `transform-origin: left` |
| `OracleOperatorsLive`: `width %` **0.55 s** | `scaleX` **0.22 s** |

**Зачем:** `width` = layout thrash; `scaleX` = transform на GPU.

---

### 5. Reduced motion

| Было | Стало |
|------|--------|
| Частично в JS | Доп. CSS: выключает ambient pulse/particles/focus-wave при `prefers-reduced-motion` |

---

### 6. Tailwind `transition-all` в компонентах

Заменено на **`lumen-ui-transition`** в:

- HeaderChrome, ConnectionSettings, ShareCard, page.tsx  
- NodeMapSearch, PeerMap filters, Constellation3D HUD  
- ExternalOpenConfirm, TelegramBootstrap pill  

Press: `active:scale-[0.97]` **сохранён**.

---

## Что не трогали (намеренно)

- 3D Orbit / R3F Earth (отдельный perf-контур)  
- Bridge / API / Telegram webhook  
- Визуальный бренд (цвета, glow language)  
- Бесконечный typewriter invite (delight; можно позже)

---

## Откат

```bash
# Вся ветка к checkpoint
git checkout feat/emil-craft-fixes
git reset --hard b5169dd

# Один коммит после checkpoint
git revert <sha>
```

---

## Deploy (по команде)

```bash
git checkout main
git merge --no-ff feat/emil-craft-fixes
npm run build && systemctl restart lumen
```
