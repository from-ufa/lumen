# Отчёт: Emil craft — раунд 2

**Ветка:** `feat/emil-craft-round2`  
**Checkpoint:** `66edda3` (main до раунда 2 = предыдущий craft merge)  
**Дата:** 2026-07-30  

---

## Было → стало

### 1. View Transitions (Node ↔ Oracles)

| Было | Стало |
|------|--------|
| Group morph **0.48 s** | **0.28 s** |
| Body fade **0.36–0.40 s** + **blur 4–10 px** | **0.22–0.26 s**, **без blur** |
| scale + translate тяжёлые | Лёгкий scale 0.995 / 1.006 + opacity |

### 2. LumenPageBody (вход страницы)

| Было | Стало |
|------|--------|
| Desktop: blur **10 px**, duration **0.4 s** | Только opacity + y **8 px**, **0.24 s** |
| Mobile: y 6 / 0.22 s | y **4 px** / **0.18 s** |

### 3. Oracles activity feed

| Было | Стало |
|------|--------|
| enter: blur + y, **0.32 s** | enter: y only, **0.2 s** |
| exit: height → 0 (layout) | exit: opacity + y (без height) |

### 4. Typewriter invite

| Было | Стало |
|------|--------|
| Печатает всегда, даже off-screen | **IntersectionObserver** — пауза вне экрана |
| enter scaleX 0.06 / **0.7 s** | scale **0.96**, **0.28 s** ease-out |
| glow loop всегда | glow только когда **inView** |

---

## Откат

```bash
git checkout main
git reset --hard 66edda3
npm run build && systemctl restart lumen
```

---

## Как проверить

1. Node ↔ Oracles — переход **короче**, без «мыла»  
2. Скролл вниз — typewriter **не крутится** в фоне  
3. Activity feed на /oracles — строки появляются **без blur**  
