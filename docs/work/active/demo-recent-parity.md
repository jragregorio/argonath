# Demo dashboard — recent feature parity

**Status:** complete (local)  
**Started:** 2026-08-17  
**Orchestrator:** Cursor Grok 4.6  
**Executor:** Composer 2.5

## Goal

Bring `/demo` in line with the real parent dashboard so testers can try visible apps, block/unblock, grant bonus, and appearance without an account.

## Locked scope

1. **Visible apps** on demo child detail (Alex has running apps + one blocked; Sam offline → Offline). Demo-only block/unblock (ConfirmDialog on block).
2. **Grant bonus / Clear bonus** on demo child header (presets 15/30/60 + custom 1–240). No rename/delete.
3. **Fixtures:** agent `0.6.26`; Sam device offline; seed `app_blocked`, `device_offline`; live activity for grant/block/unblock/clear.
4. **Appearance:** wrap demo shell in `DashboardThemeProvider` + FOUC script; Maiev/Blackberry swatches on demo Settings.
5. **Out of scope:** Snapshots, marketing mocks, version bump, commit/push, agent/mobile, per-app usage minutes, notification prefs (read-only note OK).

## Acceptance

- [x] `/demo/children/{alex}` shows Visible apps with foreground row, Protected explorer, Blocked chips, tap-to-block.
- [x] Grant bonus updates remaining + Activity `bonus_granted`; Clear reverses.
- [x] Sam child shows Offline visible-apps state; Activity has `device_offline`.
- [x] Demo Settings appearance switches Maiev/Blackberry (persists via existing localStorage key).
- [x] `npm run typecheck -w @warden/web` and `npm run check:boundaries` recorded with real exit codes.

## Phase log

### Phase 1 — implementation

**Files changed:**
- `apps/web/src/components/visible-apps-card.tsx` (new) — shared presentational Visible apps card + ConfirmDialog
- `apps/web/src/components/dashboard-theme-picker.tsx` (new) — shared Maiev/Blackberry swatches
- `apps/web/src/app/dashboard/children/[id]/child-visible-apps-section.tsx` — thin tRPC wrapper over `VisibleAppsCard`
- `apps/web/src/app/dashboard/settings/page.tsx` — use `DashboardThemePicker`
- `apps/web/src/lib/demo/types.ts` — `runningApps`/`runningAppsAt` on device; `blockedProcessNames` on child
- `apps/web/src/lib/demo/fixtures.ts` — agent 0.6.26, Alex running apps + Roblox blocked, Sam offline, activity seeds
- `apps/web/src/lib/demo/demo-provider.tsx` — `blockApp`, `unblockApp`, `grantBonus`, `clearBonus`
- `apps/web/src/app/demo/children/[id]/page.tsx` — Grant/Clear bonus, Visible apps card
- `apps/web/src/app/demo/layout.tsx` — FOUC script + `DashboardThemeProvider`
- `apps/web/src/app/demo/settings/page.tsx` — Appearance picker + notifications note

**Validation:**
```bash
npm run typecheck -w @warden/web
# exit 0

npm run check:boundaries
# exit 0
```

**Residual risk:**
- Demo grant/clear bonus uses synchronous local state (no pending mutation delay like tRPC); UX should match but timing differs slightly from live dashboard.
- Theme picker shares `warden-dashboard-theme` localStorage with real dashboard — intentional per spec.
- `blockApp` toast uses process name as display label (matches real API behavior for simple process names).

## Next

Owner tests locally: `/demo` → Alex child (grant, block Discord, unblock chip), Sam (offline visible apps), Settings theme.
