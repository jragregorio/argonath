# Mobile refresh: app resume + double-tap tab

**Status:** complete (web v0.6.7 pushed)  
**Started:** 2026-08-04  
**Completed:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Combo | **App resume invalidate** + **double-tap active bottom tab to refresh** |
| Pull-to-refresh | Out of scope (owner will test this combo first) |
| Scope | Web dashboard behavior when running in Capacitor / mobile UI; no APK config change required if `@capacitor/app` already in shell |
| Desktop | Double-tap is mobile bottom nav only; resume only when Capacitor native |
| Version | Orchestrator will **bump web** + push after implementation |

## Behavior

### Resume
- On Capacitor `appStateChange` → `isActive: true`, invalidate relevant React Query / tRPC caches (prefer `trpc.useUtils()` invalidate broad dashboard queries, or `queryClient.invalidateQueries()`).
- Guard: only when `Capacitor.isNativePlatform()` (same pattern as push bootstrap).
- Avoid thrashing: ignore rapid resume flaps if easy (e.g. debounce ~300–500ms) but don’t over-engineer.

### Double-tap tab
- In mobile `InteractiveMenu` / `MobileBottomTabs`: if user selects the **already active** route tab again within a short window (e.g. 400–500ms) **or** simply taps the active tab again (single re-tap while already active), refresh.
- Prefer: **tap active tab again → refresh** (common pattern; “double-tap” can mean second tap on already-selected tab, not necessarily two quick taps from inactive).
- Locked UX: **Second tap on the already-active primary tab triggers refresh.** More tab: do not refresh; keep opening/toggling More sheet.
- Visual feedback: brief subtle indicator optional (spinner on icon / short toast) — keep minimal; at least invalidate queries so data updates.
- Refresh action: invalidate current page’s key queries + shared badges/overview as appropriate; `router.refresh()` optional for RSC bits.

## Acceptance criteria

1. Native app resume → dashboard data refetches without full page reload (unless reload is the simplest correct approach — prefer invalidate).
2. Tapping the already-active bottom tab (Overview/Children/Requests/Snapshots) triggers refresh; More unchanged.
3. Desktop sidebar unchanged; browser without Capacitor: no resume listener noise.
4. `npm run typecheck -w @warden/web` (+ mobile if touched) and `npm run check:boundaries` exit 0.
5. Do **not** commit/push (orchestrator will bump + push).

## Phase log

### Phase 0 — plan lock

- Owner: resume + double-tap (active-tab re-tap); will feel-test; bump+push after.

### Phase 1 — implementation

**Files touched**

| File | Change |
|------|--------|
| `apps/web/package.json` | Added `@capacitor/app` + `@capacitor/core` ^8.0.0 |
| `apps/web/src/lib/dashboard-refresh.ts` | `invalidateDashboardQueries` + `useDashboardRefresh()` hook |
| `apps/web/src/components/native-app-resume-refresh.tsx` | Capacitor `appStateChange` → refresh on resume (400ms debounce) |
| `apps/web/src/components/dashboard-shell.tsx` | Mount `NativeAppResumeRefresh` |
| `apps/web/src/components/dashboard-nav.tsx` | Re-tap active primary tab → `refreshDashboard()`; More unchanged |
| `package-lock.json` | Lockfile updated via `npm install` |

**Invalidated query families:** `dashboard.overview`, `dashboard.activity`, `dashboard.navBadges`, `children.list`, `children.get`, `device.list`, `extension.listPending`, `extension.listHistory`, `snapshot.list`, `policy.getEvaluation` + `router.refresh()`.

**Approach:** `@capacitor/app` imported in web (remote URL bridge; no mobile shell change). In-flight guard on refresh prevents rapid repeat.

**Validation**

| Command | Exit code |
|---------|-----------|
| `npm install` | 0 |
| `npm run typecheck -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |

**Next:** Orchestrator bumps web version + commit/push.
