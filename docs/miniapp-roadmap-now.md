# Mini App — product map

**URL:** https://m.ergolumen.net  
**Full product description:** [miniapp.md](./miniapp.md)  
**Web:** https://ergolumen.net  
**Updated:** 2026-07-31  

---

## Architecture

```
HOME  Overview | Blocks | Mempool
NET   MAP first (full-bleed) | LIST + search
ORA   NETWORK | MY  ·  Pools | Operators
ME    Connection · LINK · DISCONNECT · EN/RU
🔔    Alerts hub (header) — 9 toggles + master + thresholds
```

Bot `/start` → **OPEN APP** → m.ergolumen.net  
Guest = LUMEN only · YOU only with personal MY + token  
DISCONNECT sticks (opt-out + vault clear)  
LINK: site code → Me paste  

---

## Done (production)

MVP shell · MAP full-bleed · i18n · rich ora · operators  
Home command center · blocks · mempool  
TG alerts catalog with per-type mute  
Me status + disconnect + link  
LUMEN labels · laconic bot start  

## Later (optional)

monorepo core · share PNG · quiet hours · MAP search · devnet · iOS P2  

## Deploy

```bash
cd /home/lumen && npm run build && systemctl restart lumen
git push origin main
```
