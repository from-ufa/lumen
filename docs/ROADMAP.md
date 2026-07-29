# Lumen — Product Roadmap

**Live:** [https://ergolumen.net](https://ergolumen.net)  
**Repo:** [github.com/from-ufa/lumen](https://github.com/from-ufa/lumen)  
**Updated:** 2026-07-29  

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

Details: [ios.md](./ios.md) · [ios-phase1-report.md](./ios-phase1-report.md)

---

## Mobile & clients

### 1. iOS app (Capacitor)

| Phase | Status | Scope |
|-------|--------|--------|
| **Phase 1** | ✅ | Scaffold `net.ergolumen.app`, plugins, StatusBar/Splash dark, `server.url` = live site, push **register stub** (no APNs), mobile shell UX |
| **Phase 2** | 📋 | Apple Developer Team · certificates · provisioning · real **APNs** · Xcode signing · device / TestFlight · `.ipa` · Store metadata · optional local `webDir` bundling (drop live-only URL) · GitHub Actions macOS runner |

**App ID:** `net.ergolumen.app` · **Name:** Lumen  

Full notes / rollback: [docs/ios.md](./ios.md)

### 2. Telegram Mini App

| Phase | Status | Scope |
|-------|--------|--------|
| **Phase 0 — design** | 📋 | Product surface: what opens in Telegram (dashboard lite / oracles / status / alerts) · auth model (Telegram user ↔ optional Bridge token) · theme (dark lumen glow in TG WebView) |
| **Phase 1 — shell** | 📋 | Bot + Mini App URL (`https://ergolumen.net/…` or dedicated route) · `@twa-dev/sdk` / Telegram WebApp init · viewport / safe-area for TG · deep links |
| **Phase 2 — product** | 📋 | Compact UI for TG (height limits) · optional inline alerts (pool lag, node height) · share cards · link Bridge “My Node” from chat |
| **Phase 3 — notify** | ⏸ | Bot push / TG notifications (separate from APNs); rate limits; privacy |

**Constraints:** no force of full 3D Orbit if TG WebView is weak — graceful lite mode. Same public APIs; don’t break main site.

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
| 2026-07-29 | Created roadmap: iOS Phase 1 ✅ / Phase 2 📋 · Telegram Mini App 📋 |
