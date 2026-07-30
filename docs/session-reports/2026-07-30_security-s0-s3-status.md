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

## Not done yet (evening)

### S4 — TG session scope (careful)
- TG Mini App cookie must **not** unlock admin APIs (`/api/bridge/tokens` already redacted; still need scope for `/api/node`, password, etc.)
- Must not break Mini App UI / My Node with user token

### S5 — backlog
- Allowlist `/api/node`
- Remove `?password=`
- Rate limits broader
- Hash tokens at rest + revoke
- CSP, `TELEGRAM_SESSION_SECRET` required

---

## Product still works
- Site open, oracles, My Node + token, TG bot/long-poll, `/link`, alerts tick, NEW TOKEN mint

## Rollback
```bash
# code
cd /home/lumen && git log --oneline -10
# files
ls /root/lumen-security-backup-20260730-144948
# Caddy from backup if needed
# cp /root/lumen-security-backup-.../Caddyfile /etc/caddy/ && systemctl reload caddy
```

## Evening start command
`ДЕЛАЙ S4` (or continue S5 items one by one)
