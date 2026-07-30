# Emil Kowalski skills install + Lumen design analysis

**Date:** 2026-07-30  
**Source:** https://github.com/emilkowalski/skills (`npx skills add emilkowalski/skills`)  
**Installed:** `/home/lumen/.agents/skills/*`, `/home/lumen/.grok/skills/*`, `/root/.grok/skills/*`  

Skills loaded for this audit: **emil-design-eng**, **review-animations** (+ STANDARDS.md).

## Verdict (motion)

**Block** on a few systemic craft issues (`transition: all`, desktop Orbit↔Map 480ms + blur under load, layout-driven bar width animation). Not a product blocker, but below Emil’s craft bar for a “premium dashboard.”

## What’s already strong

- Custom ease curves close to Emil’s recommended ease-out: `cubic-bezier(0.22, 1, 0.36, 1)` / `(0.23, 1, 0.32, 1)` in dropdowns, modals, invite
- Buttons often use `active:scale-[0.97]` / `0.985` (press feedback present)
- Entrances often `scale: 0.96` + opacity (not pure `scale(0)`)
- Mobile Orbit/Map: VT/blur skip + shorter crossfade (perf-aware)
- `useReducedMotion` in VizModeToggle, VizCrossfade, OracleOperatorsLive
- Visual language cohesion: deep space `#0A0A0F`, orange/cyan accents, mono HUD — motion personality mostly “crisp dashboard”
