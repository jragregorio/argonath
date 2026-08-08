# Dashboard idle Realtime / badge freshness

**Status:** complete (pending manual smoke)  
**Started:** 2026-08-08  
**Completed:** 2026-08-08  
**Orchestrator:** Cursor Grok 4.5  
**Executor:** Composer 2.5 ([idle realtime badge fix](46e5d493-2bbd-41d7-b294-a0b8f7bee287))

## Problem

After the desktop dashboard sits idle, nav badges (Activity / Snapshots) and live updates stall until a full page refresh. Same root cause affects mobile WebView in-app badges (OS FCM still works).

## Cause

1. Badges rely on Supabase Realtime invalidation + slow `POLL_SAFETY_MS` (240s).
2. Global `refetchOnWindowFocus: false` — return from idle does not refetch.
3. `subscribeDeviceChannels` has no channel-error / visibility resubscribe.
4. `NativeAppResumeRefresh` exists but is not mounted in `DashboardShell`.

## Scope (locked): 1 + 2 + 3

1. Browser visibility/focus/`online` resume → `refreshDashboard()` (debounce ~400ms).
2. Mount `NativeAppResumeRefresh` in `DashboardShell`.
3. Harden Realtime: channel status resubscribe; resubscribe on visibility resume; invalidate after reconnect (broadcasts are lossy).

Out of scope: global `refetchOnWindowFocus: true`, shorter safety poll, FCM changes, version bump unless asked.

## Acceptance

- Idle desktop tab regain visibility → badges/queries refresh without hard reload.
- Native Capacitor resume → same (via mounted `NativeAppResumeRefresh`).
- Realtime CHANNEL_ERROR / TIMED_OUT / CLOSED → resubscribe; visibility resume resubscribes.
- `npm run typecheck -w @warden/web` and `npm run check:boundaries` exit 0.
- Do not commit unless asked.

## Phase log

### Phase 0 — plan lock

Owner approved fixes 1, 2, 3.

### Phase 1 — implement 1 + 2 + 3

**Changes:**
- `apps/web/src/components/dashboard-visibility-refresh.tsx` — new client component: `visibilitychange` (visible) + `online`, 400ms debounce, calls `refreshDashboard()`.
- `apps/web/src/components/dashboard-shell.tsx` — mount `NativeAppResumeRefresh` + `DashboardVisibilityRefresh` beside `PushTokenSync`; comment updated.
- `apps/web/src/lib/realtime.ts` — `subscribeDeviceChannels` now uses `.subscribe((status) => ...)`; per-channel resubscribe on `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` (backoff 1s × attempts, max 3); full tear-down + resubscribe on visibility visible + `online` (400ms debounce). Deprecated hooks unchanged API.

**Ownership:** visibility component invalidates queries; realtime layer only resubscribes channels (no duplicate invalidate in `FamilyRealtimeProvider`).

**Validation:**
```bash
npm run typecheck -w @warden/web   # exit 0
npm run check:boundaries           # exit 0
```

**Orchestrator follow-up:** preserved `resubscribeAttempts` across per-channel recreate so max-3 backoff actually stops; visibility/`online` full resubscribe still resets.

**Next:** manual idle-tab + native resume smoke test; archive when accepted. Do not commit unless asked.
