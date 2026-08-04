# Mobile: pull-to-refresh, notification prefs, FCM deep links

**Status:** complete (web v0.7.1 — pushed; Supabase schema in sync)  
**Started:** 2026-08-05  
**Completed:** 2026-08-05  
**Executor:** Composer 2.5

## Decisions (locked)

| # | Feature | Choice |
|---|---------|--------|
| 1 | Pull-to-refresh | On dashboard **main scroll** (shell), call existing `useDashboardRefresh` / `invalidateDashboardQueries`. Mobile only. Avoid fighting swipe-to-lock: only arm PTR when scrollTop ≈ 0 and vertical pull dominates. |
| 2 | Notification prefs | Per-**user** booleans (default **on**): extensions, device online, device offline. UI on **Settings** page. Server filters FCM in `notifyFamilyParents`. |
| 3 | FCM deep link | On notification tap (`pushNotificationActionPerformed`), navigate to safe `data.path` (must start with `/dashboard`). Also handle cold-start if Capacitor delivers the action on launch. |

## Implementation notes

### 1 — Pull-to-refresh
- Prefer a small client component wrapping dashboard main content or attached in `dashboard-shell.tsx` / a `PullToRefresh` around `{children}` on `md:hidden` path.
- Visual: simple top spinner / “Refreshing…” — keep minimal, match dark theme.
- Reuse `useDashboardRefresh`.
- Do not break bottom nav or horizontal gestures.

### 2 — Notification preferences
- Prisma `User` fields e.g. `notifyExtensionRequests Boolean @default(true)`, `notifyDeviceOnline Boolean @default(true)`, `notifyDeviceOffline Boolean @default(true)`.
- `db:push` and record exit code.
- tRPC: read on `auth.me` (or dedicated query); `auth.updateNotificationPrefs` / `family` — keep on auth/user.
- Settings UI: toggles (checkbox or switch-like buttons) under a “Notifications” card; only need to work well on mobile (OK on desktop too).
- Update `notifyFamilyParents` to accept `category: "extension" | "device_online" | "device_offline"` and only send to tokens whose **user** has that pref true. Include `userId` in pushToken query + join user prefs.
- Wire category at call sites: extension request, device online heartbeat, device offline cron.

### 3 — FCM deep link
- Extend `NativePushBootstrap` (or dashboard-mounted listener so `useRouter` works when signed in): listen `pushNotificationActionPerformed`.
- Parse `notification.data.path` (FCM data values are strings).
- Safe navigate: path must start with `/dashboard` (and not `//`); `router.push(path)`.
- Mount router-capable listener inside `DashboardShell` if bootstrap is outside auth — e.g. `NativePushDeepLink` next to `PushTokenSync`.
- Ensure FCM payloads already send `path` (extension → activity, online/offline → child detail) — verify/fix if missing.

### Out of scope
- Quiet hours, per-device prefs, iOS
- Commit / push / bump (orchestrator later if owner asks)

## Acceptance criteria

1. Pull down on Overview/Activity/Children (at top) refreshes data with visible feedback.
2. Toggling prefs in Settings stops/starts that category of FCM (server-side).
3. Tapping a notification opens the intended dashboard route in the WebView.
4. `npm run typecheck` (touched pkgs) + `check:boundaries` exit 0; `db:push` recorded.

## Phase log

### Phase 0 — plan lock

- Owner: proceed with 1, 2, and 3.

### Phase 1 — implementation

**Pull-to-refresh**
- Added `apps/web/src/components/pull-to-refresh.tsx` — Capacitor + mobile viewport only; touch at scroll top; vertical-dominant pull; ignores `[data-swipe-lock]`.
- Wired in `dashboard-shell.tsx` wrapping shell layout.
- Added `data-swipe-lock` on `SwipeToLock` track.

**Notification preferences**
- Prisma `User`: `notifyExtensionRequests`, `notifyDeviceOnline`, `notifyDeviceOffline` (default `true`).
- `auth.me` returns prefs; `auth.updateNotificationPrefs` mutation.
- Settings page Notifications card with three toggles.
- `notifyFamilyParents(familyId, category, payload)` filters tokens by user pref; call sites pass category.

**FCM deep link**
- `apps/web/src/lib/push-deeplink.ts` — path extract + safe `/dashboard` check + sessionStorage queue.
- `NativePushBootstrap` listens `pushNotificationActionPerformed` (cold-start queue).
- `NativePushDeepLink` in dashboard shell consumes queue + navigates on tap.
- Verified existing FCM payloads include `data.path` (extension → `/dashboard/activity`, online/offline → `/dashboard/children/{childId}`).

### Validation

| Command | Exit |
|---------|------|
| `npm run db:push` | 0 |
| `npm run typecheck -w @warden/db -w @warden/api -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |
