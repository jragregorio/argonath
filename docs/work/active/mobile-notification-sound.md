# Mobile: custom default notification sound

**Status:** in progress  
**Started:** 2026-08-05  
**Orchestrator:** Cursor Grok 4.5  
**Executor:** Composer 2.5

## Goal

Use repo-root `warden_notif.mp3` as the default Android push notification sound for the Capacitor app (`com.warden.gard`).

## Context

- Push channel today: `warden_alerts` (IMPORTANCE_HIGH), created in:
  - `apps/mobile/android/.../MainActivity.java` (`ensureDefaultNotificationChannel`)
  - `apps/mobile/src/main.ts` (`PushNotifications.createChannel`)
  - `apps/web/src/components/native-push-bootstrap.tsx` (remote WebView bootstrap)
- FCM sends with `android.notification.channelId: "warden_alerts"` (`packages/api/src/lib/fcm.ts`)
- Manifest meta-data + `strings.xml` also reference that channel id
- Asset source: `c:\DEV\Guardian\warden_notif.mp3` (~25 KB)

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | Android mobile shell only (iOS out of scope) |
| Sound file | `warden_notif.mp3` → `apps/mobile/android/app/src/main/res/raw/warden_notif.mp3` |
| Canonical copy | Also keep under `apps/mobile/assets/warden_notif.mp3` (like icon pattern); leave root file for now |
| Channel immutability | **Bump channel id** so existing installs pick up the new sound (Android cannot change sound on an existing channel) |
| New channel id | `warden_alerts` (replace `warden_default` everywhere) |
| Capacitor createChannel | Pass `sound: "warden_notif"` (filename without extension) |
| Native channel | `channel.setSound(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.warden_notif), audioAttributes)` |
| FCM payload | Update `channelId` to `warden_alerts`; do not rely on FCM `sound` field alone |
| Version bump | Mobile shell only if packaging changes warrant it — prefer documenting rebuild requirement; bump `apps/mobile/package.json` patch only if repo convention expects it for native assets |

## Acceptance criteria

1. `res/raw/warden_notif.mp3` present and builds. **Done**
2. Default notification channel uses custom sound in both Java + Capacitor createChannel paths. **Done**
3. All channel id references updated to `warden_alerts` (Java constant, strings.xml, main.ts, fcm.ts, README note). **Done** (+ `native-push-bootstrap.tsx` for WebView path)
4. README documents the custom sound + that users with the old channel may need reinstall / clear app data only if old channel still referenced — with new id, fresh channel is created automatically. **Done**
5. No secrets committed; no unrelated refactors. **Done**
6. Record real validation commands/results in this file. **Done**

## Out of scope

- iOS custom sounds
- Windows agent tray sounds
- Web browser Notification API sounds
- Changing notification copy / categories

## Phase log

### Phase 0 — orchestrator brief

- User added `warden_notif.mp3` at repo root; asked to set as default notification sound.
- Executor: Composer 2.5.

### Phase 1 — executor implementation

**Files touched**

| File | Change |
|------|--------|
| `apps/mobile/android/app/src/main/res/raw/warden_notif.mp3` | Added (copied from repo root, 25389 bytes) |
| `apps/mobile/assets/warden_notif.mp3` | Added (canonical asset copy) |
| `apps/mobile/android/.../MainActivity.java` | Channel id → `warden_alerts`; `setSound` with `R.raw.warden_notif` + `AudioAttributes` |
| `apps/mobile/src/main.ts` | Channel id → `warden_alerts`; `sound: "warden_notif"` on `createChannel` |
| `apps/mobile/android/.../res/values/strings.xml` | `default_notification_channel_id` → `warden_alerts` |
| `packages/api/src/lib/fcm.ts` | `android.notification.channelId` → `warden_alerts` |
| `apps/mobile/README.md` | Notifications bullet updated for sound + channel |
| `apps/web/src/components/native-push-bootstrap.tsx` | Channel id + `sound: "warden_notif"` (WebView bootstrap path) |

**Commands run**

| Command | Exit code | Result |
|---------|-----------|--------|
| Copy `warden_notif.mp3` → `res/raw/` + `assets/` | 0 | Both files present (25389 bytes) |
| `rg warden_default apps/mobile packages/api apps/web` | 0 | No matches (after edits) |
| `cd apps/mobile/android; .\gradlew.bat :app:assembleDebug` | 0 | BUILD SUCCESSFUL in 31s |

**Decisions**

- Also updated `native-push-bootstrap.tsx` — it creates the Android channel from the remote WebView and would have left `warden_default` without sound otherwise.

### Phase 2 — debug APK rebuild (2026-08-05)

| Command | Exit code | Result |
|---------|-----------|--------|
| `npm run android:debug -w @warden/mobile` | 0 | BUILD SUCCESSFUL in 6s; APK ~6.1 MB |

**Output:** `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

### Phase 3 — bump + push (2026-08-05)

- Web / shared: `0.7.7` → `0.7.8` (FCM channel id + WebView bootstrap)
- Mobile: `0.1.2` → `0.1.3` (custom notification sound)
- Agent: unchanged

**Next step**

- After Vercel deploy: uninstall/reinstall APK if needed, send FCM test, confirm `warden_notif` on channel `warden_alerts`.
- Archive task after on-device sound verification.
