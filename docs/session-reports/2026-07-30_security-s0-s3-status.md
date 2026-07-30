# Security S0–S3 — status (continue evening)

**Date:** 2026-07-30  
**Git main tip (after S3):** `ed71f02`  
**Backup:** `/root/lumen-security-backup-20260730-144948`

---

## Done

### S0 — prep
- Backup: Caddyfile, tokens.json, .env.local, vault, alerts, git-sha
- Smoke baseline before changes

### S1 — low blast
| Item | Status |
|------|--------|
| Caddy `/devnet/*` removed | ✅ (no devnet node on host anyway) |
| TG webhook fail-closed without secret | ✅ |
| Alerts tick always requires secret | ✅ |

### S2 — bridge tokens
| Item | Status |
|------|--------|
| `GET /api/bridge/tokens` redacted (`tokenFp` + tail only) | ✅ |
| `POST` mint still returns full token once | ✅ |
| Rate limit mint 10/hour/IP | ✅ |
| Localhost full list: `http://127.0.0.1:3100/tokens?full=1` | ✅ |

### S3 — public password
| Item | Status |
|------|--------|
| Remote set password while site **open** → **403** | ✅ (C2) |
| Clear password → **localhost only** | ✅ (H8) |
| Change password when already protected + valid auth | ✅ still works |
| Site left **open** after smoke | ✅ |
| SSH untouched | ✅ |

---

## S4 — TG session scope (done 2026-07-30 evening)

When **Public Mode ON**, `lumen_tg_auth` only unlocks an allowlist:
- UI pages, `/api/tg/*`, oracles/chain/peers, `/api/node`, bridge status/node/stats/tokens (mint + redacted list)
- **Denied:** `/api/public-password` (must use Basic/password cookie or localhost)

When site is **open** (no password), behavior unchanged (everyone has access).

## S5 — backlog (later)
- Allowlist `/api/node` paths
- Remove `?password=`
- Broader rate limits
- Hash tokens at rest + revoke
- CSP, force `TELEGRAM_SESSION_SECRET`

---

## Product still works
- Site open, oracles, My Node + token, TG bot/long-poll, `/link`, alerts tick, NEW TOKEN mint

## Rollback
```bash
cd /home/lumen && git log --oneline -15
ls /root/lumen-security-backup-20260730-144948
```

## Next
`ДЕЛАЙ S5` items one by one when ready
