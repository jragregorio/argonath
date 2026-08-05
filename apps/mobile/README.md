# @warden/mobile — Android shell

Capacitor 8 Android app that loads the live Warden parent dashboard from Vercel (**remote URL mode**). The APK does not bundle the Next.js build; content updates when the web app deploys.

| Setting | Value |
|---------|-------|
| Package / `applicationId` | `com.warden.gard` |
| Display name | Warden |
| Remote URL | `https://warden-alpha.vercel.app/dashboard` |

## Prerequisites

- **Node.js** 20+ (repo root `npm install`)
- **JDK 21+** — Capacitor 8 / Android Gradle Plugin require Java 21 (`JAVA_HOME` must point at JDK 21)
- **Android SDK** — Android Studio or command-line tools; set `ANDROID_HOME` (e.g. `%LOCALAPPDATA%\Android\Sdk` on Windows)
- Accept SDK licenses (`sdkmanager --licenses`) if Gradle prompts
- **Firebase (for push)** — copy `android/app/google-services.json.example` → `android/app/google-services.json` with a real Firebase Android app for package `com.warden.gard` (gitignored)

## Install & sync

From the repo root:

```bash
npm install
cd apps/mobile
npm run build          # compiles src/main.ts → www/js/main.js
npx cap sync android   # copies www + config into android/
```

Or use the workspace script:

```bash
npm run cap:sync -w @warden/mobile
```

## Debug APK

```bash
cd apps/mobile
npm run cap:sync
cd android
# Windows
.\gradlew.bat assembleDebug
# macOS / Linux
./gradlew assembleDebug
```

**Output:** `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Install on a device or emulator:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Release AAB (Play Store)

1. **Create a upload keystore locally** (once per signing identity):

   ```bash
   keytool -genkeypair -v -keystore warden-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias warden
   ```

   Store the `.jks` outside git (e.g. `apps/mobile/android/warden-release.jks` — already gitignored).

2. **Configure signing** — copy `android/keystore.properties.example` → `android/keystore.properties` and set paths/passwords. This file is gitignored.

3. **Build the bundle:**

   ```bash
   cd apps/mobile
   npm run cap:sync
   cd android
   .\gradlew.bat bundleRelease    # Windows
   # ./gradlew bundleRelease      # macOS / Linux
   ```

   **Output:** `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`

   Without `keystore.properties`, Gradle still produces an **unsigned** release bundle; Play Console can use Play App Signing with an uploaded key, or sign locally before upload.

## Push notifications (debug + release)

Both **debug APK** and **release AAB** use the same `applicationId` (`com.warden.gard`) and the same `google-services.json`, so FCM is enabled for both once Firebase is configured.

1. Create a Firebase project → add Android app with package name **`com.warden.gard`**.
2. Download `google-services.json` into `apps/mobile/android/app/` (see `.example` for shape).
3. `npm run cap:sync -w @warden/mobile`, then rebuild debug and/or release.
4. On first launch the shell requests `POST_NOTIFICATIONS` (Android 13+) and registers for FCM. The remote web app also bootstraps registration via `NativePushBootstrap` when running inside the Capacitor WebView.
5. Confirm token in logcat (`[warden] FCM token` / `[warden-mobile] FCM token`). Sending from your backend/FCM console is a separate follow-up.

Without `google-services.json`, the app still builds; the Google Services Gradle plugin is skipped and push will not work.

## Open in Android Studio

```bash
npm run cap:open -w @warden/mobile
```

## Native behavior

- **Launch URL:** `/dashboard` on the Vercel host (middleware refreshes session or redirects to sign-in).
- **Splash / status bar:** dark slate (`#0f172a`) to match the dashboard chrome.
- **App icon:** `warden_icon.png` (generated into `res/mipmap-*`; regenerate with `python scripts/generate-icons.py`).
- **Hardware back:** WebView `history.back()` when possible; otherwise `App.exitApp()`.
- **Notifications:** default channel `warden_alerts` with custom sound `warden_notif` (`res/raw/warden_notif.mp3`); permission + FCM register on launch (when Firebase is configured). Bumping the channel id creates a fresh channel on upgrade so the custom sound applies without clearing app data.
- **Safe area:** relies on the web app’s `viewport-fit=cover` and `env(safe-area-inset-*)`.

## Play Console checklist (packaging only)

- [ ] Application ID: `com.warden.gard`
- [ ] Upload signed **AAB** (`app-release.aab`)
- [ ] Privacy policy URL (product site / dashboard legal page)
- [ ] Store listing: title **Warden**, screenshots, short + full description
- [ ] Content rating questionnaire
- [ ] Target API level per current Play requirements (project uses `targetSdkVersion` from Capacitor template)
- [ ] Firebase / FCM configured with `google-services.json` for package `com.warden.gard`

## Monorepo notes

- No `@warden/*` runtime dependencies — this is a thin shell only.
- Independent version line from `@warden/web` and the Windows agent (see ADR-0005).
- Changing the remote URL: edit `capacitor.config.ts` → `npm run cap:sync`.
