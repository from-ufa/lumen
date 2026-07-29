# Telegram Mini App — Audit (pre-code)

**Branch:** `feat/telegram-miniapp`  
**Checkpoint:** `e158550`  
**Date:** 2026-07-29  

## Already mobile-ready

| Area | Notes |
|------|--------|
| viewport-fit=cover | `app/layout.tsx` |
| CSS `--safe-*` | `globals.css` + body pads |
| Touch Orbit | ONE=rotate, TWO=dolly; `touch-action: none` on `.lumen-viz` |
| Mobile VT skip | no blur VT on mode switch |
| Capacitor shell | parallel pattern: client-only init, silent browser no-op |
| viz= query | `/?viz=map\|constellation` already restores view |
| Oracles route | `/oracles` separate page |
| Push stub | native-only register (model for TG init) |

## Integration points for TG SDK

| Point | File | Role |
|-------|------|------|
| Script tag | `app/layout.tsx` `<head>` | `telegram-web-app.js` |
| Bootstrap | `Providers.tsx` | after Capacitor init: `initTelegramApp()` |
| Helpers | `app/lib/telegram.ts` (new) | detect, ready/expand, theme, haptics, deep link |
| CSS vars | `globals.css` | merge TG safe-area / themeParams |
| Auth API | `app/api/tg/auth` (new) | HMAC validate initData |
| Proxy / Public Mode | `proxy.ts` | optional TG session cookie bypass |
| Orbit swipe | Constellation3D / viz shell | disableVerticalSwipes while Orbit active |
| Deep link | page.tsx / oracles | start_param → viz / route |
| Bot | `telegram-bot/` or `app/api/tg/webhook` | /start web_app button |

## Risks

### 3D / WebGL in TG WebView
- Android TG WebView often weaker than Chrome
- R3F currently `dpr={[1, 1.5]}` — still heavy with Earth textures + post FX
- **Need:** lowPowerMode (DPR cap 1, pause on `visibilitychange` / `web_app_inactive`)

### WebSocket Bridge
- Same origin `wss://ergolumen.net/ws/bridge` should work if Mini App URL is ergolumen.net
- Mixed content / cookie third-party less relevant (same host)
- Test: My Node attach inside TG WebView

### Basic Auth / Public Mode
- `proxy.ts` gates remote traffic when password file set
- Telegram WebView may not show Basic Auth UI cleanly
- **Need:** valid initData → short-lived session cookie (`lumen_tg_auth`) accepted in proxy
- Without token/env: TG path disabled, no open hole

### Desktop / mobile browser
- All TG APIs must no-op outside Telegram
- Do not require Telegram to use site

### Capacitor / iOS
- Do not touch `ios/`, capacitor.config — parallel shell only

## Bot layer options on this host
- Prefer **webhook** at `POST /api/tg/webhook` behind Caddy (HTTPS already)
- Long polling only if webhook hard — systemd optional later
- Token: `TELEGRAM_BOT_TOKEN` env only

## Out of scope this phase
- Real TG payment, attach menu Store, spam alerts cron (stub docs only if needed)
- Merge to main / production deploy (user command later)
