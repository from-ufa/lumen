# Lumen Mini App — MVP Tabs Design

**Goal:** Super-convenient Telegram Mini App that does **not** look like ergolumen.net.  
**Constraint:** Web (`apps/web` / current site) stays untouched and fully functional.  
**Stack (MVP):** Next.js App Router · React 19 · TanStack Query · Framer Motion · TG WebApp SDK · shared `packages/core`.

---

## 1. Product principle

| Web | Mini App |
|-----|----------|
| Immersive visualizer (Orbit, map cinema) | **Operator tool** (status → action in ≤2 taps) |
| Wide layout, hero, typewriters | **Bottom tabs + sheets** |
| Explore the network | **My node / my bridge / my oracles** |

One sentence: *Phone in Telegram — check health, switch source, open settings, glance oracles. Beauty is secondary; clarity is primary.*

---

## 2. Information architecture

### 2.1 Bottom tabs (always visible)

| Tab | id | Icon feel | Job |
|-----|-----|-----------|-----|
| **Home** | `home` | pulse / activity | Live status + primary actions |
| **Network** | `network` | globe | Peers / height / optional map |
| **Oracles** | `oracles` | chart | ERG/USD · ERG/XAU · my operator |
| **Me** | `me` | user / gear | Bridge token, TG link, alerts, about |

**4 tabs only** — MVP. No fifth “Orbit” tab (too heavy; optional later inside Network as “3D”).

### 2.2 Navigation model

```
[Tab root]  ──push──►  [Stack screen]  ──sheet──►  [Modal]
     │                      │
     │                      └── back (edge swipe / header chevron)
     └── switching tabs does NOT destroy stack (keep last screen per tab)
```

- **Tabs:** independent navigation stacks (like iOS UITabBar).
- **Sheets:** Settings, Connect bridge, Alert prefs, Share — drag to dismiss.
- **No** full-page soft-nav like web Node↔Oracles morph.

### 2.3 Deep links (`start_param`)

| start_param | Opens |
|-------------|--------|
| *(empty)* | Home tab |
| `settings` / `connect` | Me → Bridge sheet open |
| `oracles` | Oracles tab |
| `map` / `network` | Network tab |
| `alerts` | Me → Alerts sheet |

BotFather Menu Button → `https://m.ergolumen.net` (or `/m`).

---

## 3. Screen specs (MVP)

### 3.1 Home — “at a glance”

**Top (safe-area):**
- Wordmark mini + LIVE / OFF pill  
- Source chip: `lumen` | `my node` (tap → sheet Source)

**Hero card (one):**
```
┌─────────────────────────────┐
│  HEIGHT          1,840,525  │
│  Peers · 114     Sync 100%  │
│  Bridge · online · 2m ago   │  ← only if token
└─────────────────────────────┘
```

**Quick actions (2×2 or horizontal chips):**
1. **Refresh** — haptic light, spin icon  
2. **Settings** — opens Me stack / Bridge sheet  
3. **Oracles** — jumps Oracles tab  
4. **Alerts** — Me → Alerts (if TG session)

**Optional second card (if bridge token):**
- Mesh status one-liner (agents online from `/api/bridge/stats`) — **status text only**, no “connect” CTA.

**Not in MVP Home:** typewriter invites, full Constellation3D, Boom fireworks.

### 3.2 Network

**Default: List mode** (fast, low-end friendly)
- Summary: peers online / connected / seen  
- Search only if desktop-TG or user expands (mobile TG: optional later)  
- Row → peer detail sheet (IP redacted if needed, city, version)

**Toggle:** `List | Map`  
- Map = lazy-load Leaflet (same data as web `/api/peers/map`)  
- Low-end (`isTelegramLowEnd`): hide Map toggle, list only  

**Not in MVP:** Boom, full desktop HUD chrome.

### 3.3 Oracles

**Segmented control:** `Network | My`  
- Network: two compact tiles USD / XAU (price, Δ, age)  
- My: requires token; else empty state → “Connect bridge” sheet  

**Tap tile:** bottom sheet with more detail (not full dual WebGL canvas).  
Optional later: light chart; **no** dual R3F constellation in MVP.

### 3.4 Me

**Sections:**
1. **Bridge** — token present? online? · Connect / Restore vault · mode My/Lumen  
2. **Telegram** — session ok · Link code (if browser-linked) · Alerts on/off  
3. **About** — version, open full site (`ergolumen.net` external confirm)  
4. **Danger** — clear token (confirm sheet)

All dense forms live in **sheets**, not infinite scroll settings pages.

---

## 4. Motion & transitions (“супер удобно”)

### 4.1 Rules (calm, Emil / Apple-ish)

| Motion | Spec |
|--------|------|
| Tab switch | Crossfade opacity **160–200ms**, ease `[0.25, 0.1, 0.25, 1]` — **no** scale on whole screen |
| Stack push | New screen `x: 12% → 0` + fade; old slightly dim — **220ms** |
| Stack pop | Reverse; interactive if possible later |
| Sheet present | `y: 100% → 0`, spring soft or 280ms ease-out; backdrop fade 0.4 |
| Sheet dismiss | Drag + velocity; snap |
| Numbers | Tabular nums; optional count-up only on Home height (once) |
| Reduced motion | Instant opacity only, no x/y |
| Haptics | tab change `light`; success connect `medium`; error `notification error` |

### 4.2 Tab bar

- Height: **49px + safe-area-bottom**  
- Active: accent `#FF7A3D` (or `--tg-theme-button-color` if readable on dark)  
- Inactive: `#A0A0B0`  
- Active indicator: small bar **or** filled icon (not both loud)  
- **Preserve tab state** when leaving and returning  

### 4.3 Loading

- Skeleton cards (Home/Oracles) — same language as soft web skeletons, **not** “LOADING MAP…”  
- Pull-to-refresh on Home + Oracles + Network list  
- Stale data: show last + subtle “Updating…”

### 4.4 Explicit non-goals for motion

- No View Transitions API between “pages”  
- No shared element morph logo (web experiment stays on web)  
- No full-screen confetti on load  

---

## 5. Layout chrome

```
┌──────────────────────────┐
│ status / tg header inset │  env(safe-area-inset-top)
│  [optional top title]    │
├──────────────────────────┤
│                          │
│     Tab content          │  overflow-y auto
│     (stack inside)       │
│                          │
├──────────────────────────┤
│  Home Network Oracles Me │  tab bar + safe-area-bottom
└──────────────────────────┘
```

- Background: `#0A0A0F` (Lumen)  
- Cards: `white/[0.04]` border `white/10` radius **16–20**  
- Touch targets ≥ **44×44**  
- Font: system / Geist already loaded if shared host  

---

## 6. Technical structure (does not break web)

### 6.1 Deploy shape

| URL | App |
|-----|-----|
| `https://ergolumen.net` | **Web** (current Next, unchanged) |
| `https://m.ergolumen.net` **or** `https://ergolumen.net/m` | **Mini App** new entry |

BotFather Web App URL → mini only.

### 6.2 Repo layout (target)

```
apps/
  web/          # current app/ moved later — or stay as-is phase 1
  miniapp/      # NEW: tab shell only
packages/
  core/         # node-api, bridge, telegram auth client, types, query keys
```

**Phase-0 without full monorepo (faster MVP):**  
`app/m/layout.tsx` + `app/m/[[...tab]]/page.tsx` as isolated tree, **zero imports** of web hero/Orbit into mini routes.  
Web pages never import mini shell.

### 6.3 Shared (`packages/core` or `app/lib` re-exports)

- `loadBridgeToken` / `saveBridgeToken` / `loadNodeMode`  
- `fetchBridgeStatus`, `fetchNodeResource`, oracles fetch  
- `hydrateSettingsFromTelegramVault`  
- Query key factories  
- Types: `BridgeStatus`, `NodeMode`, oracle feeds  

### 6.4 Mini-only modules

- `MiniAppShell` (tab bar + stacks)  
- `HomeScreen`, `NetworkScreen`, `OraclesScreen`, `MeScreen`  
- `BridgeSheet`, `AlertsSheet`  
- `useTabNavigation`, `useSheet`  
- Motion presets  

### 6.5 Data / poll (calm on mobile)

| Query | Interval MVP |
|-------|----------------|
| node info | 8s |
| bridge status | 8s (if token) |
| oracles | 8s |
| peers summary | 12s |
| bridge public stats | 15s (Home optional) |

`refetchOnWindowFocus: false` (TG resumes differently — use `visibility` once).

### 6.6 TG integration MVP

- `ready()`, `expand()`, theme header/bg  
- Haptics on tab / success  
- **No** full-width MainButton (keep floating/actions in UI — you already prefer this)  
- BackButton: show when stack depth > 0; hide on tab roots  
- `start_param` → tab/sheet once  

---

## 7. MVP feature cut

### In

- 4 tabs + stacks + sheets  
- Home status + refresh + source switch  
- Bridge connect / vault restore (existing APIs)  
- Network list + optional map  
- Oracles network tiles + My if token  
- Alerts subscribe surface (existing `/api/tg/alerts/*`)  
- Soft transitions + haptics + reduced motion  

### Out (post-MVP)

- Full Orbit / Constellation3D  
- Boom  
- Typewriter invites  
- Share card PNG export (or thin link later)  
- Desktop TG “wide two-column” polish  
- Capacitor (separate product)  

---

## 8. Implementation phases

| Phase | Deliverable | Est. |
|-------|-------------|------|
| **M0** | Route isolation `/m` or `m.` + empty shell tabs (static) | 0.5 d |
| **M1** | Home live data + refresh + source chip | 1–2 d |
| **M2** | Me + Bridge sheet (token, vault, mode) | 1–2 d |
| **M3** | Oracles Network tiles | 1 d |
| **M4** | Network list + map toggle | 1–2 d |
| **M5** | Motion polish, BackButton, start_param, BotFather URL switch | 1 d |
| **M6** | Low-end pass, QA on iOS/Android TG | 1 d |

**MVP ship:** after M5 (~1–1.5 weeks focused). Web never blocked.

---

## 9. Success criteria

| Metric | Pass |
|--------|------|
| First paint useful status | &lt; 2s on mid Android TG |
| Tab switch feels instant | ≤ 200ms fade |
| Connect bridge without full site | yes |
| Web regression | zero intentional UI changes |
| User quote | “это приложение, не сайт” |

---

## 10. Decisions (locked 2026-07-31)

| # | Decision | Choice |
|---|----------|--------|
| 1 | **URL** | **`https://m.ergolumen.net`** (wildcard DNS `*.ergolumen.net` already points here) |
| 2 | **Map in MVP** | **Yes — List \| Map toggle** from day one (low-end: list only / map behind toggle still ok) |
| 3 | **After `/link` / vault hydrate** | **Home tab** + toast “Bridge restored” |

### Deploy notes for `m.ergolumen.net`

- Caddy: new site block → Mini App Next entry (or rewrite to mini routes when scaffolded).
- BotFather Web App URL → `https://m.ergolumen.net`
- Web stays `https://ergolumen.net` unchanged.
- TG `start_param`: empty → Home; `settings` → Me sheet; after link flow → **Home**.

### Network tab (MVP with map)

- Default: **MAP** (full-bleed toolbar → tab bar)
- Toggle: **MAP | LIST** (list optional)
- Map: lazy Leaflet + `/api/peers/map` (same as web); `fillParent` kills desktop 52dvh height
- Low-end Android TG: Map still default; LIST available if map is heavy

---

## 11. Implementation status (shipped MVP)

| Piece | Status |
|-------|--------|
| `/m` shell + 4 tabs + fade | done |
| Home live + bridge chip | done |
| Network List \| Map | done |
| Oracles tiles | done |
| Me + Bridge sheet | done |
| After hydrate → Home + toast | done |
| Caddy `m.ergolumen.net` | done |
| proxy host rewrite | done |
| BotFather URL | set to `https://m.ergolumen.net` manually |

**No web layout changes.**
