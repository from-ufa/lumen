# Session report: iOS на GitHub и roadmap?

**Промпт:** изменения для внедрения iOS app внесены на GitHub и в roadmap?

## GitHub — ДА

- Repo: https://github.com/from-ufa/lumen  
- Phase 1 **влита в `main`** и запушена (`merge: iOS Capacitor Phase 1` + последующие docs)  
- Ветка `feat/ios-capacitor-phase1` тоже на origin  
- В main: `capacitor.config.ts`, `ios/`, `docs/ios*.md`, push-stub API, mobile UX  

## Roadmap — частично / нет отдельного файла

| Файл | iOS? |
|------|------|
| `docs/ROADMAP.md` | **нет такого файла** |
| `docs/ios.md` | Phase 1 done + **Phase 2 checklist** |
| `README.md` | ссылка на docs/ios.md |
| `LUMEN.md` | ops handoff, **не** product roadmap iOS |

Итого: код и docs Phase 1 на GitHub; отдельной roadmap-страницы продукта нет — план Phase 2 только внутри `docs/ios.md`.
