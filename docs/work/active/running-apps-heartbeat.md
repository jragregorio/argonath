# Running apps on heartbeat (v1 slice 1–2)

**Status:** in progress  
**Started:** 2026-08-16  
**Orchestrator:** Cursor Grok 4.6  
**Executor:** Composer 2.5

## Goal

Parents can see which visible apps are open on a child’s Windows PC.

Slice 1–2 only (no blocking / kill / overlay):

1. Agent reports foreground + visible-window processes on heartbeat.
2. Dashboard shows that list on the child device card.

## Out of scope

- Per-app lock, disable, kill, suspend, overlay, or AppLocker.
- Choosing apps to block.
- Per-app time limits.
- Version bumps (web or agent) — not a release.
- Demo dashboard fixtures (follow-up).
- Overview / children-list UI (too dense). Data may ride along on `deviceClientSelect`; do not render there.
- Storing process history, exe paths, or PIDs.

## Acceptance

- [x] `Warden.Tray` heartbeat includes `runningApps` (visible top-level windows, foreground flagged).
- [x] API persists snapshot on `Device` when the field is present; old agents that omit it leave the column unchanged.
- [x] Child detail device card lists apps when the device is online; foreground is visually distinct.
- [x] Enumeration or a bad entry never fails the rest of heartbeat / usage / lastSeen.
- [x] No kill/block UI or policy.
- [x] `dotnet build apps/agent/Warden.sln` and `npm run typecheck` recorded with real exit codes.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Identity | `processName` + window `title` + `isForeground`. No path, no PID. |
| Cap | Max 40 apps; title ≤ 256 chars; processName ≤ 128. |
| Dedup | One row per PID; if several windows, prefer the foreground window else longest title. |
| Filter | Visible top-level windows (Alt+Tab style): `IsWindowVisible`, not toolwindow, not cloaked UWP, skip empty-title shell noise. Include minimized (`IsIconic` still visible). |
| Skip processes | `dwm`, `csrss`, `winlogon`, `SearchHost`, `StartMenuExperienceHost`, `ShellExperienceHost`, `RuntimeBroker`, `TextInputHost`, `LockApp`, `ApplicationFrameHost` (unless title non-empty), `Warden.LockUI`. Include `Warden.Tray`. |
| Persist | `Device.runningApps` Json (default `[]`) + `Device.runningAppsAt` DateTime?. |
| Old agents | Field omitted → do not update `runningApps` / `runningAppsAt`. |
| Empty snapshot | New agent sends `[]` → store `[]` and timestamp (session 0 service, or no windows). |
| Heartbeat failure isolation | Wrap enumerate in try/catch; send `[]` on failure. Server: if `runningApps` present, sanitize; skip invalid items; never 400 the whole heartbeat because of one bad row. |
| Dashboard | `ChildDevicesSection` only. Hide when offline. Null/never-reported: hide section (old agent). Online + `[]`: “No visible apps”. |
| Refresh | Existing `children.get` 30s poll is enough. No new Realtime event. |
| Privilege | User-level Win32 in `Warden.Core`. Soft-fail in `Warden.Agent` session 0. |
| Shared type | `RunningApp` in `@warden/shared`. |

## Shape

```ts
export type RunningApp = {
  processName: string; // "chrome"
  title: string;       // window title
  isForeground: boolean;
};
```

## Files (expected)

| Area | Files |
|------|--------|
| Shared | `packages/shared/src/types.ts` (+ export already via index) |
| DB | `packages/db/prisma/schema.prisma`, `docs/architecture/data-model.md` |
| API | `packages/api/src/routers/index.ts` (`heartbeat`, `deviceClientSelect`, `DeviceClientSource`) |
| Agent | `Warden.Core/Models/AgentModels.cs`, new enumerator in `Warden.Core/Services/`, `WardenApiClient.SendHeartbeatAsync`, `EnforcementEngine.SendHeartbeatAsync` |
| Web | `apps/web/src/app/dashboard/children/[id]/child-devices-section.tsx` |

## Validation

```bash
npm run db:generate -w @warden/db
npm run db:push -w @warden/db   # if local DB available; record skip if not
npm run typecheck
dotnet build apps/agent/Warden.sln
npm run check:boundaries
```

Optional: vitest for a `sanitizeRunningApps` helper if extracted to shared.

## Log

### Phase 0 — plan lock

- Date: 2026-08-16
- Decisions: slice 1–2 only; persist last snapshot on Device; child-detail list; no version bump.
- Next: Composer 2.5 implements.

### Phase 1 — implementation

- Date: 2026-08-16
- Files changed:
  - `packages/shared/src/types.ts` — `RunningApp`, `AgentHeartbeat.runningApps`
  - `packages/shared/src/running-apps.ts` — `sanitizeRunningApps`
  - `packages/shared/src/running-apps.test.ts` — vitest
  - `packages/shared/src/index.ts` — export running-apps
  - `packages/db/prisma/schema.prisma` — `runningApps`, `runningAppsAt` on Device
  - `docs/architecture/data-model.md` — Device notes
  - `packages/api/src/routers/index.ts` — heartbeat persist, deviceClientSelect, sanitize on read
  - `apps/agent/Warden.Core/Services/RunningAppEnumerator.cs` — Win32 enumerator
  - `apps/agent/Warden.Core/Models/AgentModels.cs` — `RunningAppInfo`, heartbeat field
  - `apps/agent/Warden.Core/Services/WardenApiClient.cs` — send runningApps with camelCase JsonOptions
  - `apps/agent/Warden.Core/EnforcementEngine.cs` — enumerate before heartbeat
  - `apps/web/src/app/dashboard/children/[id]/child-devices-section.tsx` — visible apps list UI
- Commands + exit codes:
  - `npm run db:generate -w @warden/db` → 0
  - `npm run db:push -w @warden/db` → 0 (Supabase Postgres synced)
  - `npm run typecheck` → 0
  - `dotnet build apps/agent/Warden.sln` → 0
  - `npm run check:boundaries` → 0
  - `npm run test` → 0 (59 tests, incl. 4 for sanitizeRunningApps)
- Decisions:
  - Dashboard uses `runningAppsAt != null` to distinguish old agents (schema default `[]` would otherwise show “No visible apps”).
  - `toDeviceClientViews` returns `runningApps: null` when `runningAppsAt` is null; sanitizes when set.
  - Heartbeat JSON uses explicit `JsonOptions` (camelCase) on PostAsJsonAsync.
- Review: skip windows with empty titles (locked filter); removed unreachable skip-list branch after `ShouldSkipProcess`.
- Risks:
  - `Warden.Agent` session 0 returns empty list (acceptable).
  - UWP apps via `ApplicationFrameHost` may show empty titles until user focuses them.
  - Dashboard poll is 30s vs 5s heartbeat — list may lag.
- Next: manual smoke on paired Tray PC; orchestrator may archive when smoke passes.

## Residual

- Session 0 (`Warden.Agent` service): enumerator returns `[]`.
- UWP `ApplicationFrameHost` titles may be empty until focused.
- Dashboard refresh lag: 30s poll vs 5s agent heartbeat.

### Phase 2 — Visible apps panel card

- Date: 2026-08-16
- Goal: Devices card stays identity + lock/nudge; running apps move to a dedicated card.
- Decisions:
  - New `ChildVisibleAppsSection` Card on child detail.
  - Placement: full width below Devices | Policy, above Recent activity.
  - Always show the card when the child has at least one device (paired or not). Empty states instead of hiding.
  - Empty: no devices → hide card. Offline → “Device offline”. Old agent (`runningAppsAt` null) → “Waiting for agent update”. Online + `[]` → “No visible apps”.
  - Multiple devices: one card, grouped by `getDeviceDisplayName`.
  - No API/agent/schema changes. No version bump. No demo.
- Files changed:
  - `apps/web/src/app/dashboard/children/[id]/child-visible-apps-section.tsx` — new full-width Visible apps card with per-device empty states and list UI (`max-h-64` scroll).
  - `apps/web/src/app/dashboard/children/[id]/page.tsx` — render section between Devices|Policy grid and Recent activity.
  - `apps/web/src/app/dashboard/children/[id]/child-devices-section.tsx` — removed Visible apps block; dropped `RunningApp` / `runningApps*` from `DeviceRecord`.
  - `apps/web/src/components/dashboard-skeletons.tsx` — light full-width skeleton under 2-col grid in `ChildDetailSkeleton`.
- Commands + exit codes:
  - `npm run typecheck -w @warden/web` → 0
- Next: manual refresh on TESTPC child page — confirm card placement, offline / waiting / empty / list states, multi-device labels.

### Phase 3 — release bump

- Date: 2026-08-16
- Web: `0.8.14` → `0.8.15` (`apps/web/package.json`, `@warden/shared` + `APP_VERSION`)
- Agent: `0.6.22` → `0.6.23` (`Directory.Build.props`, `HARDCODED_DESKTOP_APP_VERSION`)
- Mobile: unchanged
- Commit: `9b9ed4c` pushed to `origin/main`
- MSI: `apps/agent/artifacts/Warden-0.6.23-x64.msi` (88,705,350 bytes)
- SHA-256: `7da50803fa7633a058b4f49f40481254ee63eaeb6f0bf3b670ff5e88630e1597`
- Exe: `apps/agent/Warden.Tray/bin/Release/net8.0-windows/win-x64/publish/Warden.Tray.exe`
- ICE61 warning: same-version upgrade (accepted per ADR-0003)
- Next: install MSI on child PC; wait for Vercel web deploy of 0.8.15

### Phase 4 — snapshot timestamp footer

- Date: 2026-08-16
- Goal: Always-visible “Updated …” line at the bottom of the Visible apps card (outside the scroll list).
- Decisions:
  - Source: `runningAppsAt` (not `lastSeenAt`, not Date.now()).
  - Visible: relative via existing `formatRelativeTime` + clock via `toLocaleTimeString` 12h (`Updated just now · 12:46 PM`).
  - `title`/`formatAbsoluteTime` for full datetime on hover.
  - Online: “Updated …”. Offline with a snapshot: “Last updated …”. No `runningAppsAt`: omit the line.
  - Per device group when multiple devices.
  - Web-only. No version bump. No agent/API change.
- Files changed:
  - `apps/web/src/app/dashboard/children/[id]/child-visible-apps-section.tsx` — `RunningAppsSnapshotTimestamp` footer per device group; imports `formatRelativeTime` / `formatAbsoluteTime`.
- Commands + exit codes:
  - `npm run typecheck -w @warden/web` → 0
- Next: manual refresh on TESTPC child page — confirm online/offline timestamp copy and hover title.
