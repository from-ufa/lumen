# Session report: auto-report after each prompt

**Дата:** 2026-07-29 12:03 (+03)  
**Сервер:** toa.c.hostens.cloud · `/home/lumen`  
**Ветка:** `main` @ `c2f0200`  
**Промпт:** «мне нужен отчет в файл на сервере после выполнения каждой промта сделай!»

---

## 1. Задача

Пользователь требует: **после выполнения каждого промпта** сохранять отчёт в **md-файл на сервере** (не только по отдельной просьбе).

---

## 2. Что сделано

1. Создан каталог отчётов: `docs/session-reports/`
2. Добавлен `docs/session-reports/README.md` — соглашение об именах и структуре
3. Сохранён этот session-report как пример и фиксация правила
4. Правило для агента на следующие промпты: **всегда** писать отчёт сюда в конце работы

---

## 3. Расположение

| Путь | Назначение |
|------|------------|
| `/home/lumen/docs/session-reports/` | Все session-отчёты по промптам |
| `/home/lumen/docs/ios-phase1-report.md` | Отчёт разработки Phase 1 |
| `/home/lumen/docs/ios-phase1-deploy-report.md` | Отчёт deploy Phase 1 |
| `/home/lumen/docs/ios.md` | Статус iOS / rollback |

---

## 4. Git / production

- Ветка: `main` (чисто, untracked только `.grok/`)
- HEAD: `c2f0200` — `docs(ios): save Phase 1 deploy report`
- Production: Phase 1 уже задеплоена ранее; этот шаг — только docs convention
- Force-push: нет

---

## 5. Правило на будущее (обязательно)

После **каждого** промпта, когда работа завершена:

```bash
# файл:
/home/lumen/docs/session-reports/YYYY-MM-DD_HHMM_<slug>.md
```

Содержание: задача → действия → артефакты/SHA → проверки → откат → next.

Коммит в git — если отчёт полезен в репо (docs); иначе файл всё равно остаётся на диске сервера.

---

## 6. Итог

✅ Каталог session-reports готов  
✅ Правило зафиксировано  
✅ Этот промпт закрыт отчётом на сервере  
