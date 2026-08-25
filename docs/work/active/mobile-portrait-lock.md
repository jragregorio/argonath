# Mobile: portrait orientation lock (Android)

**Status:** complete  
**Started:** 2026-08-12  
**Executor:** Composer 2.5

## Goal / acceptance

- Lock `@warden/mobile` Android shell to **portrait only** (no landscape on device tilt).
- Source of truth: `android:screenOrientation="portrait"` on `.MainActivity` in `AndroidManifest.xml`.
- iOS out of scope. No version bump. No web/agent changes.

**Acceptance**

- [x] MainActivity has `android:screenOrientation="portrait"`.
- [x] No unrelated diffs.
- [ ] Manual verify on device/emulator (debug APK rebuilt; install/tilt check pending).

## What changed

| File | Change |
|------|--------|
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | Added `android:screenOrientation="portrait"` on `.MainActivity` `<activity>`. |

**Capacitor config:** No change. Capacitor 8 `capacitor.config.ts` has no documented `orientation` key that syncs to Android manifest; portrait lock belongs in `AndroidManifest.xml` (not overwritten by `cap sync` for this activity block).

## Commands run

| Command | Exit code | Notes |
|---------|-----------|-------|
| (none) | — | Manifest-only edit in implement phase. |
| `npm run android:debug` (from `apps/mobile`) | 0 | `cap sync` + `assembleDebug`; BUILD SUCCESSFUL in 22s. APK: `android/app/build/outputs/apk/debug/app-debug.apk` |

## Residual risk

- **Tablets / large screens:** Portrait lock applies on all form factors; user may see letterboxing or unused horizontal space on tablets.
- **Reverse portrait:** `portrait` (not `sensorPortrait`) allows upside-down portrait on devices that support it; landscape remains blocked.
- **`cap sync`:** Does not regenerate the custom `<activity>` block; manifest edit is durable.

## Next step

- Build debug APK and confirm on device/emulator that rotation no longer switches to landscape.
