# Mobile: Capacitor Android shell (Play Store + debug APK)

**Status:** complete  
**Started:** 2026-08-04  
**Completed:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Approach | Capacitor **remote URL** (WebView loads live Next.js on Vercel) |
| Server URL | `https://warden-alpha.vercel.app/sign-in` |
| Package path | `apps/mobile` |
| Android applicationId | `com.warden.gard` |
| Display name | Warden |
| Push notifications | **Enabled** for debug + release (FCM; needs `google-services.json`) |
| Distribution | Debug APK + Play Store packaging prep (AAB, signing notes) |
| iOS | Out of scope |

### What “remote URL” means

The APK does **not** bundle the Next.js build. The Capacitor WebView opens the deployed site at **`https://warden-alpha.vercel.app/sign-in`**. Auth cookies, tRPC, middleware, and realtime keep working against that origin. Web deploys update the app content without a new store release.

### What “push” means (enabled)

Firebase Cloud Messaging so the phone can show notifications (e.g. extension requests) while backgrounded. Shell + web bootstrap register for FCM on launch. Requires `apps/mobile/android/app/google-services.json` for package `com.warden.gard`. Backend send path is still a follow-up.

## Acceptance criteria

1. `apps/mobile` Capacitor 8 project with Android platform. — **done**
2. `capacitor.config` uses `server.url = https://warden-alpha.vercel.app` (clear allowNavigation). — **done**
3. Native polish: splash screen, status bar, Android hardware back → WebView history / exit. — **done**
4. Documented commands to produce a **debug APK**. — **done** (`apps/mobile/README.md`)
5. Play Store prep: release **AAB** build path, signing keystore instructions (no secrets committed), short store-listing checklist. — **done**
6. Repo docs updated: ADR (or decision note), `AGENTS.md` / architecture mention of `apps/mobile`, active task log. — **done** (ADR-0005)
7. Boundaries: mobile must not import `apps/web` sources or break `npm run check:boundaries`. Turbo must not fail on the new package. — **done**
8. Do **not** change web/agent product behavior except minimal mobile-friendly fixes required for WebView. — **done** (no web/agent changes)

## Out of scope

- FCM / push receive path (client) — **done**; backend send still follow-up
- iOS
- Static `output: 'export'`
- Expo / React Native rewrite
- Uploading to Play Console (packaging only)

## Phase log

### Phase 0 — plan lock

- Orchestrator recommendation accepted with clarifications above.

### Phase 1 — scaffold `apps/mobile`

Commands:

```bash
# repo root
npm install
# exit 0

cd apps/mobile
npm run build
# exit 0 (after fixing KeyboardResize TS error — removed iOS-only call)

npx cap add android
# exit 0 — android/ generated, applicationId com.wargen.gard

npx cap sync android
# exit 0
```

Created: `package.json`, `capacitor.config.ts`, `tsconfig.json`, `src/main.ts`, `www/index.html`, `.gitignore`, Capacitor plugins (`@capacitor/app`, `status-bar`, `splash-screen`, `keyboard`).

### Phase 2 — native polish

- Splash/status bar: `#0f172a` in `capacitor.config.ts`; Capacitor default splash drawables in `android/app/src/main/res/`.
- Android back: `App.addListener('backButton')` → `history.back()` or `App.exitApp()`.
- `applicationId` / `appName`: verified in `android/app/build.gradle` and `strings.xml`.

### Phase 3 — build & Play Store packaging

**First debug APK attempt (JDK 17):**

```bash
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd apps/mobile/android
.\gradlew.bat assembleDebug
# exit 1 — invalid source release: 21 (Capacitor 8 requires JDK 21)
```

**After installing Microsoft OpenJDK 21:**

```bash
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd apps/mobile/android
.\gradlew.bat assembleDebug
# exit 0
# output: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk (~4.0 MB)

.\gradlew.bat bundleRelease
# exit 0 (unsigned / default debug signing — no keystore.properties)
# output: apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

Signing prep: `android/keystore.properties.example`, conditional `signingConfigs.release` in `app/build.gradle`. Keystores gitignored.

### Phase 4 — repo documentation

- ADR-0005: `docs/decisions/0005-capacitor-android-remote-url-shell.md`
- Updated: `AGENTS.md`, `docs/architecture/repository-map.md`, `docs/architecture/boundaries.md`, `docs/ai/CURRENT_STATE.md`, `docs/decisions/README.md`, root `.gitignore`, `scripts/check-boundaries.mjs`, `turbo.json` (`@warden/mobile#build`)

### Phase 5 — validation

| Command | Exit | Notes |
|---------|------|-------|
| `npm run check:boundaries` | 0 | PASS |
| `npm run build -w @warden/mobile` | 0 | tsc → `www/js/main.js` |
| `npm run typecheck -w @warden/mobile` | 0 | PASS |
| `npm run build` (root turbo) | 0 | PASS (after turbo.json fix) |
| `gradlew assembleDebug` | 0 | JDK 21 required |
| `gradlew bundleRelease` | 0 | Unsigned without `keystore.properties` |

### Phase 6 — follow-up mods (2026-08-04)

- Launch URL → `https://warden-alpha.vercel.app/sign-in`
- Package rename `com.wargen.gard` → `com.warden.gard` (config, gradle, MainActivity package)
- Push: `@capacitor/push-notifications`, Android channel + `POST_NOTIFICATIONS`, web `NativePushBootstrap`, `google-services.json.example`
- `npm run cap:sync -w @warden/mobile` — exit 0
- `gradlew assembleDebug` (JDK 21) — exit 0

### Phase 7 — FCM server send path (2026-08-04)

- Root cause of “no notification on more time”: client permission only; no token store + no FCM send.
- Added `PushToken` model (`db:push` exit 0), `push.registerToken`, `notifyFamilyParents` on `requestExtension`.
- Web: `NativePushBootstrap` stores token; `PushTokenSync` uploads after sign-in.
- Docs: `docs/operations/android-push-fcm.md` (service account env).
- Still required from owner: Firebase service account on Vercel + deploy web so remote WebView picks up sync code.

## Next step

1. Owner adds Firebase service account env on Vercel (and local if testing).
2. Deploy `@warden/web` to Vercel.
3. Re-open Android app → sign in → dashboard once.
4. Retest extension request with app backgrounded.
