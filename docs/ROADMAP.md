# Lumen — Product Roadmap

**Live:** [https://ergolumen.net](https://ergolumen.net) · Mini: [https://m.ergolumen.net](https://m.ergolumen.net)  
**Repo:** [github.com/from-ufa/lumen](https://github.com/from-ufa/lumen)  
**Updated:** 2026-07-31  

Status legend: ✅ done · 🔄 in progress · 📋 planned · ⏸ later · ❌ out

---

## Now (production)

| Area | Status | Notes |
|------|--------|--------|
| Node dashboard (Orbit / Map / Metrics / Blocks / Mempool) | ✅ | Desktop + mobile web |
| Oracles dual pools + constellation | ✅ | Idle key holders (red), LUMEN badge |
| Bridge hub (My Node / My Oracle) | ✅ | WSS outbound agent · GET allowlist · public stats |
| Mobile web UX | ✅ | Safe-area, touch Orbit, perf |
| **iOS Phase 1** (Capacitor shell) | ✅ | Live WebView → ergolumen.net; push stub |
| **Telegram Mini App** | ✅ | Full operator MVP — [miniapp.md](./miniapp.md) |
| Alerts hub (TG) | ✅ | 9 types · per-type mute · thresholds · ~90s timer |

Details: [ios.md](./ios.md) · [miniapp.md](./miniapp.md) · [miniapp-roadmap-now.md](./miniapp-roadmap-now.md)

---

## Priority improvements (agreed)

From external review fact-check (Kimi): keep what was **correct**, ignore what was already shipped.  
**Order ≈ security → reliability → alerts depth → data/growth → CI.**

### P0 — Security & trust

| # | Item | Status | Notes |
|---|------|--------|--------|
| **S1** | Hash bridge tokens at rest | 📋 | Today: plain `lumen_*` in bridge `tokens.json`. Prefer bcrypt/argon2 or HMAC; never log full token |
| **S2** | Token rotation in UI | 📋 | New token, revoke old, agent reconnect path |
| **S3** | Audit log (connect / proxy errors) | 📋 | Per-token: last connect, last path, fail count (no secrets) |

### P1 — Bridge scale & reliability

| # | Item | Status | Notes |
|---|------|--------|--------|
| **B1** | Bridge hub metrics | 📋 | Live agents, proxy latency, error rate (Prometheus or `/metrics`) |
| **B2** | Per-token rate limit | 📋 | Cap proxy RPS / concurrent waits |
| **B3** | Horizontal bridge path | ⏸ | Redis / sticky sessions when agent count demands it |
| **B4** | Staging environment | 📋 | e.g. staging before prod deploys |

### P2 — Alerts depth

| # | Item | Status | Notes |
|---|------|--------|--------|
| **A1** | Quiet hours | 📋 | e.g. 23:00–08:00; critical may bypass |
| **A2** | Extra thresholds | 📋 | e.g. mempool size, custom lag (beyond peers / postLag) |
| **A3** | Alert history in Mini | 📋 | Last N fired edges |
| **A4** | Webhook / Discord | ⏸ | After TG path is solid |

### P3 — Product data & growth

| # | Item | Status | Notes |
|---|------|--------|--------|
| **D1** | Time-series history | 📋 | Height / peers / mempool / oracle posts — 24h→7d charts (SQLite first) |
| **D2** | Onboarding polish | 📋 | Short video/guide; **one-liner already exists** (`install.sh` + Docker COPY) |
| **D3** | Discoverability | 📋 | awesome-ergo · OG/meta · short write-up |
| **D4** | GeoIP privacy opt-out | 📋 | Hide my pin on public map |
| **D5** | Sustainability | ⏸ | Donations / EF grant / freemium — decide later |

### P4 — Engineering hygiene

| # | Item | Status | Notes |
|---|------|--------|--------|
| **E1** | CI (GitHub Actions) | 📋 | `tsc` + lint + bridge docker build + smoke APIs |
| **E2** | Smoke / unit tests | 📋 | Allowlist + critical routes |
| **E3** | Self-host docs pack | ⏸ | One compose UI+bridge for paranoid ops |

---

## Mobile & clients

### 1. iOS (Capacitor)

| Phase | Status | Scope |
|-------|--------|--------|
| **Phase 1** | ✅ | Scaffold, dark chrome, live URL, push stub |
| **Phase 2** | 📋 | Team, APNs, TestFlight, signing, metadata |

**Strategy:** Mini App first for mobile ops; native only if push-outside-TG is needed.  
[ios.md](./ios.md)

### 2. Telegram Mini App

| | Status |
|--|--------|
| MVP + Alerts hub + Me LINK/DISCONNECT + i18n | ✅ |
| Quiet hours / history / share PNG | 📋 / ⏸ (P2–P3) |
| Orbit 3D / Boom in mini | ❌ web only |

---

## Explicitly out of scope (for now)

- Rewrite Bridge / Oracles API without need  
- Force-push `main`  
- Signed `.ipa` on Linux prod host  
- Clone Orbit/Boom/dual WebGL into Mini  

---

## Links

| Doc | Purpose |
|-----|---------|
| [miniapp.md](./miniapp.md) | What Mini App has now |
| [miniapp-roadmap-now.md](./miniapp-roadmap-now.md) | Short mini map |
| [ios.md](./ios.md) | iOS Phase 1 + 2 |
| [LUMEN.md](../LUMEN.md) | Ops handoff |
| [README.md](../README.md) | Overview |

---

## Changelog (roadmap only)

| Date | Change |
|------|--------|
| 2026-07-31 | **Agreed improvement backlog** (S1–S3, B1–B4, A1–A4, D1–D5, E1–E3) after Kimi review fact-check |
| 2026-07-31 | Mini App production ✅ · Alerts hub · Me LINK/DISCONNECT · bot OPEN APP/WEB |
| 2026-07-29 | Created: iOS P1 ✅ / P2 📋 · TG Mini App 📋 |
