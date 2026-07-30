# Lumen — Telegram Mini App

**Branch (dev):** `feat/telegram-miniapp`  
**Live web (unchanged until merge):** https://ergolumen.net  
**Roadmap:** [ROADMAP.md](./ROADMAP.md)

## What Phase TG-1 does

| Item | Status |
|------|--------|
| Official WebApp SDK script | Done |
| `ready` / `expand` / header & bg colors (`#0A0A0F`) | Done |
| Theme / CSS hooks (`tg-miniapp`) | Done |
| Vertical swipe off on Orbit / dashboard / oracles | Done |
| Haptics (viz switch, copy, confirm open) | Done |
| MainButton «My Node» → settings | Done |
| Deep link `startapp=oracles\|orbit\|map\|settings` | Done |
| Server `initData` HMAC validation | Done (env-gated) |
| TG session cookie for Public Mode | Done |
| Bot webhook `/start` `/status` `/oracles` + web_app buttons | Done (env-gated) |
| Low-end DPR / pause Orbit when hidden | Done |
| Production merge / deploy | **Not done** (wait for explicit command) |

## Architecture

```text
Telegram client
  └─ Mini App WebView → https://ergolumen.net
       ├─ telegram-web-app.js
       ├─ app/lib/telegram.ts          # client helpers
       ├─ POST /api/tg/auth            # validate initData → cookie
       └─ same Next.js app (Orbit, Map, Oracles, Bridge)

Telegram Bot API
  └─ POST /api/tg/webhook              # commands + web_app keyboard
```

## Env vars (server only — never commit)

```bash
# Required for auth + bot
TELEGRAM_BOT_TOKEN=123456:ABC...          # from BotFather

# Optional
TELEGRAM_WEBAPP_URL=https://ergolumen.net # Mini App URL
TELEGRAM_WEBHOOK_SECRET=long-random       # webhook header check
TELEGRAM_SESSION_SECRET=another-random    # cookie HMAC (defaults to bot token)
LUMEN_INTERNAL_URL=http://127.0.0.1:3000  # bot /status + /oracles fetch
```

Put them in `/home/lumen/.env.local` (already used by `lumen.service` EnvironmentFile).

**Without token:** site works; `/api/tg/auth` and `/api/tg/webhook` return `503 disabled`. No crash.

## BotFather setup

1. `@BotFather` → `/newbot` → name + username  
2. Copy token → `TELEGRAM_BOT_TOKEN`  
3. **Menu button / Mini App:**  
   `/setmenubutton` → choose bot →  
   URL: `https://ergolumen.net`  
   Or: Bot Settings → Configure Mini App → same URL  
4. **Commands:** `/setcommands`  
   ```
   start - Open Lumen
   app - Mini App
   status - Node snapshot
   oracles - Oracle prices
   help - Commands
   ```
5. **Webhook** (after deploy of this branch):

```bash
# Replace TOKEN and optional secret
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://ergolumen.net/api/tg/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

6. **Deep links** (startapp):  
   - `https://t.me/<bot>?startapp=oracles`  
   - `https://t.me/<bot>?startapp=orbit`  
   - `https://t.me/<bot>?startapp=map`  
   - `https://t.me/<bot>?startapp=settings`  

## initData validation flow

1. Mini App loads → `Telegram.WebApp.initData`  
2. Client `POST /api/tg/auth` with `{ initData }`  
3. Server HMAC-SHA256 per [Telegram WebApp docs](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)  
4. Check `auth_date` ≤ 24h  
5. Set httpOnly cookie `lumen_tg_auth`  
6. `proxy.ts` accepts cookie when Public Mode password is on  

**Never trust `initDataUnsafe` on the server.** Never log raw initData or bot token.

## Public Mode / Basic Auth

| Context | Behavior |
|---------|----------|
| Browser, no password | Open (unchanged) |
| Browser, password on | Basic / cookie / header (unchanged) |
| Telegram + valid initData | TG session cookie bypasses Basic |
| Telegram + no bot token | Auth disabled; if Public Mode on, user may hit Basic wall — set token or open password |

## Low-end behavior

- Android TG / low `deviceMemory` → `tg-low-end` class  
- Orbit: DPR max 1, `low-power` GPU hint, antialias off  
- Pause frameloop when Mini App / tab hidden  
- One-shot default `/?viz=map` on first low-end open (sessionStorage)

## How to test

1. Merge + deploy this branch (or `next dev` with tunnel for BotFather HTTPS)  
2. Set env + restart `lumen`  
3. setWebhook  
4. Open bot → **Open Lumen**  
5. Check: expand, no vertical-close on Orbit, MainButton, startapp deep links  
6. Desktop browser: site identical, no TG requirement  

```bash
curl -sS https://ergolumen.net/api/tg/status
curl -sS -X POST https://ergolumen.net/api/tg/auth -H 'Content-Type: application/json' -d '{}'
# → 503 if no token, or 401 without valid initData
```

## Rollback (branch only)

```bash
git checkout feat/telegram-miniapp
git reset --hard e158550   # checkpoint before Telegram Mini App

# Or drop branch (main untouched):
git checkout main
git branch -D feat/telegram-miniapp
```

Single commit: `git revert <sha>`

## Phase TA-1 — Private alerts (implemented)

Personal bot notifications for operators who opt in.

| Piece | Path |
|-------|------|
| Architecture | [tg-alerts-architecture.md](./tg-alerts-architecture.md) |
| Store | `data/tg-alert-subs.json` (encrypted bridge token) |
| Subscribe | `POST /api/tg/alerts/subscribe` (TG session cookie + token) |
| Me / test / mute | `/api/tg/alerts/me` · `test` · `unsubscribe` |
| Watchdog | `POST /api/tg/alerts/tick` + systemd `lumen-tg-alerts.timer` |
| Bot | `/alerts` · `on` · `off` · `test` · `delete` |
| UI | Settings → **TELEGRAM ALERTS** toggle |

**Alerts (TA-1):** `bridge.offline` / recovery, `oracle.agent_down`, `oracle.post_lag`.

```bash
# Enable watchdog (after deploy)
systemctl enable --now lumen-tg-alerts.timer
systemctl list-timers | grep lumen-tg
# Manual tick
curl -sS -X POST -H "X-Lumen-Internal: $TELEGRAM_WEBHOOK_SECRET" \
  http://127.0.0.1:3000/api/tg/alerts/tick
```

**User flow:** `/start` bot → Mini App → Settings → bridge token → enable Telegram alerts → optional TEST ALERT.

## Phase TG-2 (later)

- TA-2: node peers/sync, daily claim reminder, quiet hours  
- Attach menu / home screen shortcut polish  
- Payments / stars (if ever)  
- Stronger low-end (optional Map-only mode permanent)  
- Desktop TG client quirks matrix  


## Related

- [telegram-audit.md](./telegram-audit.md)  
- [ROADMAP.md](./ROADMAP.md)  
- [ios.md](./ios.md) — Capacitor shell (parallel, not conflicting)  
