# Lumen iOS — Phase 1 (Capacitor shell)

**Branch:** `feat/ios-capacitor-phase1`  
**App ID:** `net.ergolumen.app`  
**App Name:** Lumen  

## What Phase 1 does

| Item | Status |
|------|--------|
| Mobile safe-area CSS variables | Done |
| Touch-friendly Orbit (1-finger rotate, pinch zoom) | Done |
| Capacitor iOS project scaffold | Done (files only; no `.ipa` on Linux) |
| Live WebView → `https://ergolumen.net` | Done (`server.url`) |
| StatusBar / Splash dark theme config | Done |
| Push: native register + stub API | Done (no APNs) |
| Store signing / TestFlight / `.ipa` | **Phase 2** |

## Capacitor layout

```text
capacitor.config.ts          # appId, server.url, plugins
native-shell/                # minimal webDir for cap sync
ios/                         # Xcode project (source)
  App/Podfile
  App/App.xcodeproj
  App/App/…                  # Info.plist, AppDelegate, assets
app/lib/capacitor-native.ts  # StatusBar / Splash (native-only)
app/lib/push-register.ts     # Push permission + POST token
app/api/push/register/       # Stub hub (hash storage only)
```

### Config notes (`capacitor.config.ts`)

- **Phase 1:** `server.url = "https://ergolumen.net"` — native shell loads the **live** site for full parity (Orbit, Map, Oracles, Bridge UI).
- **webDir:** `native-shell` — placeholder for `npx cap sync`; not the full Next build.
- **Phase 2:** remove or gate `server.url`, ship bundled web assets / proper webDir from Next export or hybrid strategy.

### Commands (this machine)

```bash
cd /home/lumen
npm run cap:sync          # copy config + plugins into ios/
# On a Mac with Xcode + CocoaPods:
npm run cap:open:ios      # open Xcode
# pod install inside ios/App if needed
```

Linux: `cap add ios` creates sources; **cannot** produce a signed `.ipa` here.

## Push (Phase 1 stub)

1. Client (`registerPushIfNative`) runs only if `Capacitor.isNativePlatform()`.
2. Browser: silent no-op (no error spam).
3. `POST /api/push/register` body: `{ token, platform, appId }`
4. Server stores **SHA-256 hash** of token under `data/push-tokens.json` (gitignored).
5. **No APNs** keys, no send path, no raw tokens in logs.

```bash
curl -sS -X POST http://127.0.0.1:3000/api/push/register \
  -H 'Content-Type: application/json' \
  -d '{"token":"TESTTOKEN_0123456789abcdef","platform":"ios","appId":"net.ergolumen.app"}'
```

## How to roll back

```bash
# Stay on branch, reset to pre-Phase-1 checkpoint:
git checkout feat/ios-capacitor-phase1
git reset --hard d481c68   # chore: checkpoint before iOS Phase 1

# Or drop the whole branch (after switching away):
git checkout main
git branch -D feat/ios-capacitor-phase1
```

Revert a single commit:

```bash
git revert <sha>
```

**Do not** force-push `main`. Do not merge this branch until reviewed.

## Production / main

- Phase 1 work lives on **`feat/ios-capacitor-phase1` only**.
- `main` / https://ergolumen.net should remain on the last production deploy until merge is explicitly requested.
- Capacitor packages are dependencies; browser bundle tree-shakes unused native paths when dynamic-imported.

## Phase 2 (later)

- Apple Developer Team + certificates + provisioning
- Real APNs key + send path
- Xcode signing, device test, TestFlight
- Decide Store packaging: keep live URL vs package webDir from Next
- GitHub Actions macOS runner for `.ipa` (optional)
- App Store screenshots, privacy labels, push entitlement

## Related

- Product roadmap (iOS + Telegram Mini App): [ROADMAP.md](./ROADMAP.md)
- Mobile audit: [ios-phase1-audit.md](./ios-phase1-audit.md)
