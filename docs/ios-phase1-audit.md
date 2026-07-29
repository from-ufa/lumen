# iOS Phase 1 — Mobile audit (pre-code)

Branch: `feat/ios-capacitor-phase1` · Checkpoint: `d481c68`

## Already OK
- `viewportFit: "cover"` in `app/layout.tsx`
- Header / Orbit HUD / Map HUD use `env(safe-area-inset-*)` in several places
- Sticky header + `LumenPageHero` shared rhythm
- Mobile Orbit/Map: no VT + no blur crossfade (perf)
- Viz slot fixed height; dual keep-alive Orbit/Map
- Panels: glow language, scrollable lists with thin scrollbars
- PWA apple meta + black-translucent status bar intent

## Gaps / risks
| Area | Finding |
|------|---------|
| **Safe-area** | body pads L/R only; bottom safe-area not global; CSS vars for insets not centralized |
| **Orbit touch** | default `OrbitControls` — pan/zoom/rotate may fight page scroll; no explicit `touches` / `touch-action` on canvas shell |
| **overflow** | body `overflow-x-hidden` OK; some dual-oracle panels tall on 390px need scroll |
| **viewport** | maxScale 5 OK; no overscroll-behavior-y:none on viz |
| **Capacitor** | not present yet |

## Touch vs OrbitControls (current)
```
enablePan, enableZoom, enableRotate (default)
// no touches: { ONE: ROTATE, TWO: DOLLY }
// canvas parent has no touch-action: none
```
Risk: one-finger pan scrolls the page under the canvas on iOS Safari/WebView.

## Next (this branch)
1. CSS safe-area vars + bottom pad where needed  
2. Orbit touch profile (mobile only, desktop unchanged)  
3. Responsive tweaks ≤390px without desktop regression  
