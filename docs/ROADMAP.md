# Lumen — Product Roadmap

**Live:** [https://ergolumen.net](https://ergolumen.net)  
**Repo:** [github.com/from-ufa/lumen](https://github.com/from-ufa/lumen)  
**Updated:** 2026-07-31  

Status legend: ✅ done · 🔄 in progress · 📋 planned · ⏸ later

---

## Now (production)

| Area | Status | Notes |
|------|--------|--------|
| Node dashboard (Orbit / Map / Metrics / Blocks / Mempool) | ✅ | Desktop + mobile web |
| Oracles dual pools + constellation | ✅ | Idle key holders (red), LUMEN badge |
| Bridge hub (My Node / My Oracle) | ✅ | WSS + public stats |
| Mobile web UX | ✅ | Safe-area, touch Orbit, perf |
| **iOS Phase 1** (Capacitor shell) | ✅ | Live WebView → ergolumen.net; push stub |
| **Telegram Mini App MVP** | ✅ | `https://m.ergolumen.net` — 4 tabs, Net MAP-first full-bleed |

Details: [ios.md](./ios.md) · [miniapp-roadmap-now.md](./miniapp-roadmap-now.md)

---

## Mobile & clients

### 1. iOS app (Capacitor)

| Phase | Status | Scope |
|-------|--------|--------|
| **Phase 1** | ✅ | Scaffold `net.ergolumen.app`, plugins, StatusBar/Splash dark, `server.url` = live site, push **register stub** (no APNs), mobile shell UX |
| **Phase 2** | 📋 | Apple Developer Team · certificates · provisioning · real **APNs** · Xcode signing · device / TestFlight · `.ipa` · Store metadata · optional local `webDir` bundling (drop live-only URL) · GitHub Actions macOS runner |

**App ID:** `net.ergolumen.app` · **Name:** Lumen  

Full notes / rollback: [docs/ios.md](./ios.md)

### 2. Telegram Mini App (`m.ergolumen.net`)

| Phase | Status | Scope |
|-------|--------|--------|
| **Phase 0 — design** | ✅ | Tabs design [miniapp-mvp-tabs.md](./miniapp-mvp-tabs.md) |
| **MVP product shell** | ✅ | 4 tabs Home·Net·Ora·Me; Bridge/Alerts sheets; TG chrome pad; no web My Node pill |
| **Network** | ✅ | **MAP default** full-bleed; LIST optional; LIVE/ALL; peer sheet |
| **Oracles / Home live** | ✅ | prices `price`; node stats; pull-to-refresh |
| **Post-MVP polish** | 📋 | Avg block time · peer search · install copy · RU · empty states |
| **Notify / share** | ⏸ | Share PNG · offline PWA · push beyond TG alerts sheet |

**Honest next queue:** [miniapp-roadmap-now.md](./miniapp-roadmap-now.md)  
**Constraints:** no 3D Orbit / Boom / dual WebGL in mini. Web `ergolumen.net` stays separate.

---

## Platform (related, not blocked on clients)

| Item | Status |
|------|--------|
| Real APNs send path (pairs with iOS Phase 2) | 📋 |
| Push token store hardening / retention | 📋 |
| Optional Android Capacitor shell | ⏸ |
| Store-ready offline web bundle | 📋 (iOS Phase 2) |

---

## Explicitly out of scope (for now)

- Rewriting Bridge / Oracles public API without need  
- Force-push / rewrite of `main` history  
- Building signed `.ipa` on Linux production host (needs macOS / CI)

---

## Links

| Doc | Purpose |
|-----|---------|
| [ios.md](./ios.md) | iOS Phase 1 status + Phase 2 checklist + rollback |
| [ios-phase1-deploy-report.md](./ios-phase1-deploy-report.md) | Deploy of Phase 1 to production |
| [LUMEN.md](../LUMEN.md) | Ops / handoff (server, units, env) |
| [README.md](../README.md) | Product overview |

---

## Changelog (roadmap only)

| Date | Change |
|------|--------|
| 2026-07-31 | Mini App MVP ✅ on `m.ergolumen.net`; Net MAP-first full-bleed; next = avg block / search / install copy / RU |
| 2026-07-29 | Created roadmap: iOS Phase 1 ✅ / Phase 2 📋 · Telegram Mini App 📋 |
