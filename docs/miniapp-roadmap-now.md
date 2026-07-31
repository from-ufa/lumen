# Mini App — product map (flush 2026-07-31)

**URL:** https://m.ergolumen.net  
**Web:** https://ergolumen.net (unchanged Orbit/WebGL)  
**Git:** main @ production mini (see flush session note)

---

## Architecture

```
HOME  Overview | Blocks | Mempool
NET   MAP first (full-bleed) | LIST + search
ORA   NETWORK | MY  ·  Pools | Operators
ME    Connection status · LUMEN|MY · DISCONNECT · Alerts · EN/RU
```

Sheets: Bridge · Alerts · Peer  
Bot `/start`: short text + **OPEN APP** → m.ergolumen.net  
Watchdog: `lumen-tg-alerts.timer` ~90s (node + oracle)

### Identity
| Guest (no token) | Personal (token + MY + agent) |
|------------------|-------------------------------|
| All data **LUMEN** | Node/Net can be **YOUR** machine |
| Labels never YOU | YOU only Ora→MY + scope mine |
| Network API isMine = **host** | not the user |

---

## Done
- MVP 4 tabs · MAP full-bleed · i18n · rich ora · operators LIVE/OFF  
- Home blocks + mempool + command center  
- Node/oracle TG alerts · Me clear status + DISCONNECT  
- LUMEN labels without bridge · laconic bot start  

## Later (optional)
monorepo core · share PNG · quiet hours · MAP search · devnet full · iOS P2

## Deploy
```bash
cd /home/lumen && npm run build && systemctl restart lumen
git push origin main
```

Agent memory flush: `~/.grok/memory/from-ufa-lumen-515466fa/sessions/2026-07-31-full-flush-miniapp.md`
