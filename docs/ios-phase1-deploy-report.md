# Deploy Phase 1 — отчёт

**Дата:** 2026-07-29  
**Репозиторий:** https://github.com/from-ufa/lumen  
**Рабочая директория:** `/home/lumen`  
**Задача:** Push feature-ветки → merge в `main` → rebuild + restart production  

---

## 1. Что сделано

| Шаг | Результат |
|-----|-----------|
| 1. Push feature | `origin/feat/ios-capacitor-phase1` ✅ |
| 2. Merge → main | `--no-ff` → `4dda234` ✅ |
| 3. Push main | `b7d298c..4dda234` (без force) ✅ |
| 4. `npm ci` + `npm run build` | OK, route `/api/push/register` в билде ✅ |
| 5. `systemctl restart lumen` | Ready in 146ms ✅ |

**Правила:** force-push не использовался; история `main` не переписывалась.

---

## 2. SHA

| | |
|--|--|
| **main / origin/main** | `4dda234` — `merge: iOS Capacitor Phase 1` |
| Feature (влита) | `feat/ios-capacitor-phase1` @ `98eaaaf` |
| Pre-Phase-1 main (откат) | `b7d298c` — `perf(mobile): skip VT and blur…` |
| Checkpoint (вся Phase 1) | `d481c68` — `chore: checkpoint before iOS Phase 1` |

### Merge-коммит

```
4dda234 merge: iOS Capacitor Phase 1

Mobile safe-area/touch Orbit, Capacitor iOS shell (live URL),
push register stub, docs. No APNs/.ipa in this phase.
```

### Коммиты Phase 1 (влиты)

```
98eaaaf  docs(ios): save Phase 1 work report
c7044ba  docs(ios): phase 1 status and rollback notes
049d3a2  feat(push-stub): native-only register client + POST /api/push/register
b98fb49  chore(capacitor): scaffold iOS shell (Phase 1 live URL)
744ef1f  fix(mobile): safe-area vars, touch Orbit gestures, narrow panels
34e3894  docs(ios): mobile audit before Phase 1 code changes
d481c68  chore: checkpoint before iOS Phase 1
```

---

## 3. Deploy

```bash
cd /home/lumen
git push -u origin feat/ios-capacitor-phase1
git checkout main
git pull --ff-only origin main
git merge --no-ff feat/ios-capacitor-phase1 -m "merge: iOS Capacitor Phase 1"
git push origin main
npm ci
npm run build
systemctl restart lumen
```

- **Build:** Next.js 16.2.10 (Turbopack) — success  
- **Новый route:** `ƒ /api/push/register`  
- **Сервис:** `lumen.service` → `next start -H 127.0.0.1 -p 3000`  
- Bridge / Caddy **не** перезапускались (не требовалось)

---

## 4. Health (после deploy)

| Проверка | Статус |
|----------|--------|
| https://ergolumen.net/ | **200** |
| https://ergolumen.net/oracles | **200** |
| https://ergolumen.net/api/bridge/stats | **200** |
| `POST /api/push/register` (valid token) | `{"ok":true,"status":"registered",…}` |
| `POST /api/push/register` (empty token) | `{"ok":false,"error":"invalid_token"}` |
| local `http://127.0.0.1:3000/` | **200** |
| `lumen` / `lumen-bridge-server` / `caddy` | **active** |

В journalctl push: только hash (`new hash=ccf1363659f6…`), без сырого device token.

---

## 5. Откат

### Безопасный (рекомендуется для remote)

```bash
cd /home/lumen
git checkout main
git revert -m 1 4dda234
npm ci && npm run build && systemctl restart lumen
git push origin main
```

### Локальный hard reset (только если осознанно)

```bash
cd /home/lumen
git checkout main
git reset --hard b7d298c
npm ci && npm run build && systemctl restart lumen
# push origin main — только после явного решения (rewrite remote history)
```

**Нельзя:** `git push --force` в `main` без крайней нужды и явной команды.

---

## 6. Итог

Phase 1 **на production**:

- mobile safe-area / touch Orbit;
- Capacitor iOS shell (`server.url` = live site);
- push client (native-only) + stub `POST /api/push/register`;
- docs: `docs/ios.md`, audit, work report.

Сайт жив. Force-push не использовался.

---

## Related

- [ios.md](./ios.md) — Phase 1 status / Capacitor / rollback notes  
- [ios-phase1-audit.md](./ios-phase1-audit.md) — mobile audit  
- [ios-phase1-report.md](./ios-phase1-report.md) — отчёт о разработке Phase 1  
