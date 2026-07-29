# Session report: Telegram Mini App merge + deploy

**Date:** 2026-07-29  
**main HEAD:** `487ccf2` — `merge: Telegram Mini App Phase TG-1`  
**Bot:** `@ergolumen_bot` (id public via getMe)  

## Done

| Step | Result |
|------|--------|
| Token → `/home/lumen/.env.local` only | ✅ gitignored |
| Merge `feat/telegram-miniapp` → `main` | ✅ pushed |
| `npm run build` | ✅ |
| `systemctl restart lumen` | ✅ active |
| setWebhook → `/api/tg/webhook` | ✅ |
| `/api/tg/status` `botConfigured` | **true** |
| Site home / oracles | **200** |

## Security note

Bot token was pasted in chat. **Recommend rotate** via @BotFather `/revoke` then update `.env.local` + restart + setWebhook.

Token is **not** in git.

## Test (user)

1. Open `@ergolumen_bot` in Telegram  
2. `/start` → Open Lumen  
3. Menu button Mini App  
4. Deep links: `t.me/ergolumen_bot?startapp=oracles` etc.
