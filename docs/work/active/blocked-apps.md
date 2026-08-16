# Blocked apps (close on relaunch)

**Status:** in progress  
**Started:** 2026-08-16  
**Orchestrator:** Cursor Grok 4.6  
**Executor:** Composer 2.5

## Goal

Parents can block a process from the Visible apps card. Warden Tray closes that app whenever it is running (including relaunch). The rest of the PC stays unlocked.

This is product phase 2 after running-apps heartbeat (see / display).

## Out of scope

- AppLocker / WDAC / SYSTEM helper
- Per-app time limits
- Overlaying a single window
- Session lock changes
- Version bumps (not a release yet)
- Demo dashboard
- Mobile shell bump
- Commits / push / MSI (orchestrator later)

## Acceptance

- [x] `ScreenTimePolicy.blockedProcessNames` JSON string array (default `[]`), child-scoped.
- [x] Parent can block/unblock from Visible apps; blocklist persists and shows even if the app is not running.
- [x] `agent.getPolicy` includes `policy.blockedProcessNames`; `policy:updated` still triggers agent refresh.
- [x] `policy.update` (daily limit / windows) does **not** wipe the blocklist.
- [x] Tray closes matching processes on the 1s tick (relaunch included). Never kills Warden or shell skip-list processes.
- [x] Old agents ignore the new field. New agents with empty list do nothing extra.
- [x] `npm run typecheck`, `dotnet build apps/agent/Warden.sln`, `npm run db:push -w @warden/db` recorded with real exit codes.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Child-level (all that child’s Windows devices). |
| Identity | `processName` only, case-insensitive, no `.exe`, no path, no title. |
| Cap | Max 40 names; each ≤ 128 chars. |
| Store | `ScreenTimePolicy.blockedProcessNames Json @default("[]")`. |
| API | `policy.blockApp` / `policy.unblockApp` (do not overload `policy.update` with the array). |
| Broadcast | Same `policy:updated` as schedule edits. |
| Enforce | Local Tick (~1s): `Process.GetProcessesByName` → `CloseMainWindow`, then `Kill` if still alive. try/catch per process. |
| Never kill | `Warden.Tray`, `Warden.LockUI`, current PID, plus enumerator skip list: `dwm`, `csrss`, `winlogon`, `SearchHost`, `StartMenuExperienceHost`, `ShellExperienceHost`, `RuntimeBroker`, `TextInputHost`, `LockApp`, `explorer`, `ApplicationFrameHost`. |
| UI block | ConfirmDialog before block. Unblock is immediate. |
| UI | Ban/Unblock on each running row; “Blocked apps” chips under the list when the list is non-empty. |
| Audit | `app_blocked` / `app_unblocked` with `processName` + `childId`. Activity labels in `apps/web/src/lib/activity.ts`. |
| Sanitize | Shared `sanitizeBlockedProcessNames` (trim, lower-case fold for compare, preserve original casing of first add, drop empties, cap 40, reject never-kill names). |

## Log

### Phase 0 — plan lock

- Date: 2026-08-16
- Next: Composer 2.5 implements.

### Phase 1 — implementation

- Date: 2026-08-16
- Files:
  - `packages/db/prisma/schema.prisma` — `blockedProcessNames` JSON column
  - `docs/architecture/data-model.md` — ScreenTimePolicy note
  - `packages/shared/src/types.ts` — optional `blockedProcessNames` on `ScreenTimePolicyInput`
  - `packages/shared/src/blocked-apps.ts` — `NEVER_BLOCK_PROCESS_NAMES`, `sanitizeBlockedProcessNames`, `isNeverBlockProcessName`
  - `packages/shared/src/blocked-apps.test.ts` — vitest
  - `packages/shared/src/index.ts` — export
  - `packages/api/src/routers/index.ts` — `policy.blockApp`, `policy.unblockApp`, `agent.getPolicy` field
  - `apps/agent/Warden.Core/Models/AgentModels.cs` — `PolicyInfo.BlockedProcessNames`
  - `apps/agent/Warden.Core/Services/BlockedAppEnforcer.cs` — tick enforcement
  - `apps/agent/Warden.Core/EnforcementEngine.cs` — call enforcer after evaluate
  - `apps/web/src/app/dashboard/children/[id]/child-visible-apps-section.tsx` — block/unblock UI
  - `apps/web/src/app/dashboard/children/[id]/page.tsx` — pass `childId` + blocklist
  - `apps/web/src/lib/activity.ts` — `app_blocked` / `app_unblocked` labels
- Commands (exit codes):
  - `npm run db:generate -w @warden/db` → 0
  - `npm run db:push -w @warden/db` → 0 (Supabase connected)
  - `npm run typecheck` → 0
  - `npm run test` → 0 (64 tests, including 5 blocked-apps)
  - `dotnet build apps/agent/Warden.sln` → 0
  - `npm run check:boundaries` → 0
- Risks:
  - Close vs kill: `CloseMainWindow` then `Kill` if still alive; no `WaitForExit` on the 1s tick (would stall lock).
  - Blocklist chips render once per card (child-scoped), not duplicated per device.
  - Identity is `processName` only (not per-window title); multiple windows share one process.
  - Old agents ignore `blockedProcessNames`; no enforcement until Tray upgrade.
- Shipped: web **0.8.16**, agent **0.6.24**. Next: local smoke (block Notepad, relaunch). Per-app usage parked — see `per-app-foreground-usage.md`.
