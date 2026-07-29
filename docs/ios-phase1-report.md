# Lumen iOS — Phase 1: отчёт о проделанной работе

**Дата:** 2026-07-29  
**Репозиторий:** https://github.com/from-ufa/lumen  
**Рабочая директория:** `/home/lumen`  
**Цель:** iOS-оболочка через Capacitor (WebView) + mobile-first правки, без `.ipa` и без реальной APNs  

---

## 1. Checkpoint и ветка

| Параметр | Значение |
|----------|----------|
| Ветка | `feat/ios-capacitor-phase1` |
| Checkpoint (до любых правок Phase 1) | `d481c68` — `chore: checkpoint before iOS Phase 1` |
| Ветка / отчёт | `feat/ios-capacitor-phase1` · файл `docs/ios-phase1-report.md` |
| `main` (не тронут) | `b7d298c` — `perf(mobile): skip VT and blur on mode switch; prefetch oracles/map` |

**Правила соблюдены:**

- работа только в feature-ветке;
- в `main` **не** мержили;
- force-push **не** использовали;
- production-сайт и systemd-сервисы не ломали.

---

## 2. Аудит mobile (без правок кода)

**Коммит:** `34e3894` — `docs(ios): mobile audit before Phase 1 code changes`  
**Файл:** [ios-phase1-audit.md](./ios-phase1-audit.md)

### Уже было хорошо

- `viewport-fit=cover` в layout;
- safe-area в header / Orbit HUD / Map HUD;
- sticky header + общий ритм hero;
- на mobile: без View Transitions и blur при смене Orbit/Map (perf);
- fixed-height viz + keep-alive Orbit/Map;
- glow-панели, тонкие скроллбары;
- PWA apple meta, black-translucent status bar.

### Найденные пробелы

| Область | Проблема |
|---------|----------|
| Safe-area | body в основном L/R; bottom и CSS-переменные не централизованы |
| Orbit touch | default OrbitControls; риск конфликта с page scroll |
| Overflow / 390px | высокие панели на узком экране |
| Viewport / overscroll | viz без явного `touch-action` / overscroll-политики |
| Capacitor | отсутствовал |

---

## 3. Mobile-first улучшения

**Коммит:** `744ef1f` — `fix(mobile): safe-area vars, touch Orbit gestures, narrow panels`  
**Файлы:** `app/globals.css`, `app/components/Constellation3D.tsx`

### Что сделано

1. **Safe-area**
   - CSS-переменные `--safe-*`;
   - bottom safe-area на body;
   - опора на `viewport-fit=cover`.

2. **Touch Orbit (desktop не ломаем)**
   - 1 палец → rotate;
   - pinch / 2 пальца → zoom (dolly);
   - на touch pan отключён, чтобы не «уезжала» камера и не конфликтовал скролл;
   - `touch-action: none` на `.lumen-viz` — жесты canvas не перехватываются page scroll;
   - mouse path на desktop без изменений.

3. **Responsive панелей**
   - твики Metrics / узких layout’ов ~390px;
   - dark / glow / анимации сохранены;
   - 3D Orbit / Constellation **не** удалялись и не выключались.

---

## 4. Capacitor scaffold

**Коммит:** `b98fb49` — `chore(capacitor): scaffold iOS shell (Phase 1 live URL)`

### Организация

```text
capacitor.config.ts          # appId, server.url, plugins
native-shell/                # minimal webDir для cap sync
ios/                         # Xcode project (исходники)
  App/Podfile
  App/App.xcodeproj
  App/App/…                  # Info.plist, AppDelegate, assets
```

### Конфиг

| Ключ | Значение |
|------|----------|
| `appId` | `net.ergolumen.app` |
| `appName` | `Lumen` |
| `webDir` | `native-shell` |
| `server.url` | `https://ergolumen.net` (Phase 1: shell над live-сайтом) |
| Тема | dark splash / status bar `#0A0A0F` |

**Важно:** `server.url` — dev/test shell для parity с production UI. Store-ready bundling = Phase 2.

### Плагины

- `@capacitor/ios`
- `@capacitor/app`
- `@capacitor/haptics`
- `@capacitor/status-bar`
- `@capacitor/splash-screen`
- `@capacitor/network`
- `@capacitor/preferences`
- `@capacitor/push-notifications`

### Git hygiene

В `.gitignore`: Pods, DerivedData, build artifacts, `data/push-tokens.json`, `.capacitor/`.  
На Linux: `npx cap add ios` создал файлы; `.ipa` **не** собирался.

### Команды

```bash
cd /home/lumen
npm run cap:sync
# На Mac + Xcode:
npm run cap:open:ios
```

---

## 5. Push — клиент + stub API

**Коммит:** `049d3a2` — `feat(push-stub): native-only register client + POST /api/push/register`

### Клиент

| Файл | Роль |
|------|------|
| `app/lib/capacitor-native.ts` | StatusBar / Splash init, только native |
| `app/lib/push-register.ts` | permission + register device token |
| `app/components/Providers.tsx` | вызов init + register |

- `register` / permission **только** если `Capacitor.isNativePlatform()`;
- в браузере — silent no-op, без error spam.

### API stub

`POST /api/push/register` → `app/api/push/register/route.ts`

- принимает `{ token, platform, appId }`;
- простая валидация (мусор / пустые токены отсекаются);
- хранит **SHA-256 hash** токена в `data/push-tokens.json` (gitignore);
- **без** APNs, **без** сырых токенов в логах, **без** секретов в репо.

> На production (`main`) эндпоинт пока **не** задеплоен — ветка не смержена. Это ожидаемо.

---

## 6. Документация

**Коммит:** `c7044ba` — `docs(ios): phase 1 status and rollback notes`

| Файл | Содержание |
|------|------------|
| [ios.md](./ios.md) | Phase 1 status, Capacitor layout, push, rollback, Phase 2 |
| [ios-phase1-audit.md](./ios-phase1-audit.md) | pre-code mobile audit |
| [ios-phase1-report.md](./ios-phase1-report.md) | этот отчёт о проделанной работе |
| `README.md` | ссылка: **iOS (Capacitor)** → `docs/ios.md` |

---

## 7. Полный список коммитов Phase 1

```
(docs)   docs(ios): save Phase 1 work report   ← этот файл
c7044ba  docs(ios): phase 1 status and rollback notes
049d3a2  feat(push-stub): native-only register client + POST /api/push/register
b98fb49  chore(capacitor): scaffold iOS shell (Phase 1 live URL)
744ef1f  fix(mobile): safe-area vars, touch Orbit gestures, narrow panels
34e3894  docs(ios): mobile audit before Phase 1 code changes
d481c68  chore: checkpoint before iOS Phase 1
```

Актуальный SHA: `git log --oneline feat/ios-capacitor-phase1 -8`

---

## 8. Как откатить

```bash
# Вся Phase 1 → checkpoint
git checkout feat/ios-capacitor-phase1
git reset --hard d481c68

# Или удалить ветку (main не затронут)
git checkout main
git branch -D feat/ios-capacitor-phase1

# Один коммит
git revert <sha>
```

**Нельзя:** `git push --force` в `main`, rewrite history `main`.

---

## 9. Что осталось на Phase 2

- Apple Developer Team, certificates, provisioning
- Реальный APNs key + send path
- Xcode signing, device test, TestFlight
- Сборка `.ipa` (macOS / GitHub Actions)
- Убрать или загейтить `server.url`; bundling web assets / hybrid webDir
- App Store: screenshots, privacy labels, push entitlement

---

## 10. Подтверждение production

| Проверка | Статус |
|----------|--------|
| Ветка `main` | `b7d298c` — Phase 1 **не** влита |
| Merge в main | **не** выполнялся |
| Force-push | **не** выполнялся |
| https://ergolumen.net | **200** (жив) |
| https://ergolumen.net/oracles | **200** |
| `lumen` / `lumen-bridge-server` / `caddy` | **active** |
| Bridge / Oracles / публичные API | без ломки (push-stub только на feature-ветке) |
| Desktop ≥1280 | mobile-правки ограничены touch/CSS vars/узкими breakpoints |

---

## 11. Итог

Phase 1 **закрыта** на ветке `feat/ios-capacitor-phase1`:

1. checkpoint + изоляция от `main`;
2. mobile audit;
3. safe-area + touch Orbit + узкие панели;
4. Capacitor iOS scaffold с live `server.url`;
5. push client (native-only) + stub register API;
6. docs + README link + этот отчёт.

**Следующий шаг по явной команде:**  
`git push -u origin feat/ios-capacitor-phase1` и/или code review → merge → deploy (когда решите выкатывать mobile/push-stub на production).

---

## Related

- Статус / rollback: [ios.md](./ios.md)
- Pre-code audit: [ios-phase1-audit.md](./ios-phase1-audit.md)
