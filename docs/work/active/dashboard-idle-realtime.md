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

### Phase 2 — mobile WebView crash fix (2026-08-08)

**Symptom:** Capacitor remote-URL app shows Next.js "Application error: a client-side exception has occurred" after commit `44584f0`.

**Diagnosis (evidence):**
1. No `@capacitor/*` npm imports in web client bundle (confirmed via build grep; `apps/web/package.json` has no Capacitor deps).
2. `NativeAppResumeRefresh` was remounted in `44584f0` after being removed in `94fe7a6` for prior Capacitor client crashes; it called `app.addListener(...).then(...)` without try/catch — a non-Promise bridge return throws synchronously in `useEffect`.
3. **Primary likely crash:** new `DashboardVisibilityRefresh` + hardened `realtime.ts` both listen for `visibilitychange`. Capacitor Android WebView fires `visible` on initial paint; the handler immediately scheduled `router.refresh()` / full channel resubscribe ~400ms after mount, during hydration — matching the generic Next client error on load.
4. `NativeAppResumeRefresh` has the same cold-start pattern (`appStateChange` `isActive:true` on launch) and could also call `router.refresh()` during hydration.
5. Realtime resubscribe called `removeChannel` without awaiting before re-adding channels (Supabase reuses topic names); hardened to await removal.

**Fix:**
- `dashboard-visibility-refresh.tsx` — only refresh after a prior `hidden` state (true resume, not cold load).
- `native-app-resume-refresh.tsx` — try/catch + `Promise.resolve(addListener)`; ignore first `isActive:true` until after `isActive:false`.
- `realtime.ts` — add `"use client"`; skip initial visibility resubscribe; guard `document`/`window`; await `removeChannel` before reconnect/resubscribe.

**Validation:**
```bash
npm run typecheck -w @warden/web   # exit 0
npm run check:boundaries           # exit 0
```

**Orchestrator hardening (same day):**
- Unmounted `NativeAppResumeRefresh` again (same component removed in `94fe7a6` after Capacitor crashes).
- Visibility refresh uses `refreshDashboard({ soft: true })` — invalidate queries only, no `router.refresh()`.
- 2s mount grace + `online` only after prior `hidden`.
- Realtime `online` also requires prior `hidden`.

**Next:** push (no version bump); redeploy; retest Capacitor cold start + background/resume.
