# Session: Telegram Alerts TA-1

**Merge:** `3206c04`  
**Date:** 2026-07-30  

## Shipped

- Encrypted subs store `data/tg-alert-subs.json`
- API: me / subscribe / unsubscribe / test / tick
- Engine: bridge offline/online, oracle agent_down, oracle post_lag
- Bot: `/alerts` on|off|test|delete
- Settings UI: TELEGRAM ALERTS toggle + TEST
- systemd `lumen-tg-alerts.timer` every 90s (active)

## User flow

1. `/start` in @ergolumen_bot  
2. Open Mini App → Settings  
3. Bridge token connected  
4. Enable **TELEGRAM ALERTS** → test message  
5. Watchdog notifies on problems  

## Verify

```bash
systemctl list-timers | grep lumen-tg
curl -sS -X POST -H "X-Lumen-Internal: $TELEGRAM_WEBHOOK_SECRET" \
  http://127.0.0.1:3000/api/tg/alerts/tick
```
