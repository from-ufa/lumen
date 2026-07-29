# Session report: что сейчас работает на сервере

**Дата:** 2026-07-29 12:42 (+03)  
**Сервер:** toa.c.hostens.cloud · `/home/lumen`  
**Uptime host:** ~12 days  
**Git:** `main` @ `944f6c1` (sync with origin)  
**Промпт:** «что у нас сейчас работает на сервере?»

---

## 1. Задача

Снять live-снимок production: сервисы, порты, HTTP, Ergo, Phase 1 артефакты.

---

## 2. Systemd (все active + enabled где проверено)

| Unit | Статус | Роль | Порт |
|------|--------|------|------|
| **lumen** | active (running) с 11:58 | Next.js 16.2.10 dashboard | `127.0.0.1:3000` |
| **lumen-bridge-server** | active ~1d 17h | WSS hub + tokens/proxy | `127.0.0.1:3100` |
| **caddy** | active ~4d | TLS + reverse proxy | `:80`, `:443` |
| **ergonode** | active | Ergo mainnet node | `:9053` (java) |

Публичный вход: **https://ergolumen.net** → Caddy → lumen `:3000` (+ bridge WS path).

---

## 3. HTTP health (проверено)

| URL | Code |
|-----|------|
| https://ergolumen.net/ | **200** (~0.4s) |
| /oracles | **200** |
| /api/bridge/stats | **200** |
| /api/oracles | **200** |
| /api/public-status | **200** |
| POST /api/push/register | **ok** (stub registered) |
| local :3000 / | **200** |
| local :3100 /stats | **200** |

### Bridge stats (live snapshot)

```json
{
  "tokensIssued": 11,
  "connections": 1,
  "withNode": 1,
  "withOracle": 1,
  "oracles": { "erg-usd": 1, "erg-xau": 1 },
  "service": "lumen-bridge-server",
  "version": "1.0.0"
}
```

### Ergo node

- network: **mainnet**
- name: **lumen_node**
- REST `/info` отвечает

---

## 4. Продукт (что доступно пользователям)

На live-сайте (Phase 1 **задеплоена** в main):

- **Node dashboard** `/` — Orbit 3D, World Map, Metrics, Blocks, Mempool, Operators, Settings, Bridge invites
- **Oracles** `/oracles` — dual pools ERG/USD + ERG/XAU, constellation, publish activity
- **Bridge** — outbound agents, public hub stats, My Node / My Oracle
- **Push stub** — `POST /api/push/register` (hash only, no APNs)
- **Capacitor** — исходники `capacitor.config.ts` + `ios/` на диске; **`.ipa` не собирается** на Linux; shell Phase 1 = WebView → live URL

---

## 5. Ресурсы

| | |
|--|--|
| Disk `/` | 82G / 197G (~43%) |
| RAM | 16 Gi total · ~11 Gi available |
| Load | 0.13 / 0.21 / 0.27 |
| lumen memory | ~248M |

---

## 6. Git / docs

- Branch: **main** clean (untracked `.grok/` only)
- HEAD: `944f6c1` docs: session-reports after every prompt
- Phase 1 merge: `4dda234`
- Docs: `docs/ios.md`, `ios-phase1-*.md`, `session-reports/`

---

## 7. Что НЕ работает / не в scope

- Сборка **`.ipa`** / Xcode на этом Linux-хосте
- **Реальная APNs** (только stub register)
- Store / TestFlight — Phase 2

---

## 8. Итог

Production **жив**: Caddy + Lumen UI + Bridge hub + Ergo mainnet node.  
Phase 1 (mobile UX + Capacitor scaffold + push stub) **в main и на сайте**.

---

## Related

- [ios-phase1-deploy-report.md](../ios-phase1-deploy-report.md)
- [ios.md](../ios.md)
