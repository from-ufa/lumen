# Session report: Telegram Mini App Phase TG-1

**Branch:** `feat/telegram-miniapp`  
**Checkpoint:** `e158550`  
**HEAD:** `f380dc6`  
**main:** not merged · production not redeployed from this branch  

## Commits

```
f380dc6 feat(tg): WebApp SDK init + theme/viewport helpers  (includes full TG-1 code)
0cbcddd docs(tg): mini app audit before code changes
e158550 chore: checkpoint before Telegram Mini App
```

## Done

- Audit `docs/telegram-audit.md`
- SDK + helpers + bootstrap
- Auth HMAC + proxy TG session
- Haptics / deep links / MainButton / swipe guards
- Low-end Orbit
- Bot webhook commands
- `docs/telegram.md` + README/ROADMAP
- `npm run build` OK

## Not done

- Merge to main / production deploy
- Real bot token (env) / setWebhook
- Phase TG-2 alerts

## Deploy later (user command)

```bash
git checkout main && git merge --no-ff feat/telegram-miniapp
git push origin main
# set TELEGRAM_BOT_TOKEN in .env.local
npm ci && npm run build && systemctl restart lumen
# setWebhook …
```
