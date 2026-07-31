# Mini App — product map

**URL:** https://m.ergolumen.net  
**Full description:** [miniapp.md](./miniapp.md)  
**Product roadmap (incl. agreed improvements):** [ROADMAP.md](./ROADMAP.md)  
**Updated:** 2026-07-31  

---

## Architecture (shipped)

```
HOME  Overview | Blocks | Mempool
NET   MAP first (full-bleed) | LIST + search
ORA   NETWORK | MY  ·  Pools | Operators
ME    Connection · LINK · DISCONNECT · EN/RU
🔔    Alerts hub — 9 toggles + master + thresholds
```

Bot `/start` → **OPEN APP** + **OPEN WEB**  
Guest = LUMEN · DISCONNECT sticks · LINK from site  

---

## Done

MVP · MAP · i18n · rich ora · operators · blocks/mempool  
Alerts catalog mute · Me status · bot start · no Desktop fullscreen  

---

## Next (from agreed ROADMAP — when we continue)

| Pri | Focus |
|-----|--------|
| **P0** | Token hash at rest · rotation · audit log |
| **P1** | Bridge metrics · per-token rate limit · staging |
| **P2** | Quiet hours · extra thresholds · alert history |
| **P3** | Time-series charts · discoverability · map privacy opt-out |
| **P4** | CI + smoke tests |

Install one-liner **already exists** (`bridge/install.sh`) — onboarding polish = video/docs, not inventing curl.

---

## Deploy

```bash
cd /home/lumen && npm run build && systemctl restart lumen
git push origin main
```
