# Parent-initiated bonus grant (dashboard)

**Status:** in progress  
**Started:** 2026-08-09  

## Problem

Parents can approve child extension requests and clear active bonus, but cannot proactively grant or top up bonus minutes from the dashboard without a child request.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Semantics | Additive `+N` minutes via existing `ExtensionOverride` (same as approving a request) |
| Expiry | End of family-local calendar day |
| Unlock | Unlock all of the child's devices when granting (mirror approve path; no single device on parent grant) |
| Audit | `bonus_granted` with `{ childId, minutes }` |
| Activity UI | Label + `+N min` like extension_approved |
| Caps | Presets 15 / 30 / 60 + custom; zod max 240 for one grant (no new daily hard cap in v1) |
| Child requests | Keep unchanged |
| Demo | Optional parity if cheap; real dashboard is required |

### Phase 2 — Agent child notice (locked)

| Decision | Choice |
|----------|--------|
| Notice UI | Existing `AttentionWindow` (same family as nudges / time warnings) |
| Trigger | `extension:approved` (covers parent grant, request approve, and similar unlocks) |
| Copy (v1) | Title “Extra time”; body “Your parent added +N minutes” using payload `extraMinutes` when present |
| Time warnings on grant | Dismiss any open time-warning AttentionWindow; drop queued time warnings so they don’t show after the bonus notice |
| Time warnings after grant | Resume as usual while remaining drains (60/30/10/5/1). Engine already re-arms thresholds when remaining increases; do **not** permanently suppress warnings for the whole bonus session |
| MSI | Required only when shipping this agent change; dashboard grant works on current agent without MSI |

### Phase 2 — Agent child notice

**Done (2026-08-09)**

- `EnforcementEngine.HandleRealtimeEvent`: on `extension:approved`, still calls `RefreshPolicyAsync`; parses payload `extraMinutes` and raises `ExtensionApprovedNoticeRequested` (`ExtensionPayload`).
- `Warden.Tray/Program.cs`: `ShowBonusGranted` AttentionWindow (“Extra time” / “Your parent added +N minutes” or fallback); tagged attention queue (`TimeWarning` vs `General`); `DismissActiveTimeWarning` + `PurgeQueuedTimeWarnings` before enqueueing bonus (nudges left alone).
- Agent version `0.6.14` → `0.6.15` (`Directory.Build.props`); `HARDCODED_DESKTOP_APP_VERSION` synced in `dashboard-nav.tsx` (web `package.json` unchanged).

### Phase 2b — suppress time warnings while bonus active (bugfix)

**Done (2026-08-09)**

- While `BonusMinutes > 0`, only emit 10/5/1 warnings (skip 60/30 comfort warnings).
- On `extension:approved`, suppress emits until policy refresh baselines remaining.
- Tray: 5s UI suppress + dismiss/purge so late dispatcher time-warnings cannot reappear after bonus notice.
- Agent `0.6.15` → `0.6.16`; desktop hardcoded version synced; MSI rebuilt.

**Validation**

```text
dotnet build c:\DEV\Guardian\apps\agent\Warden.sln -c Release   → exit 0
powershell -File apps/agent/build-installer.ps1                  → exit 0
  MSI: apps/agent/artifacts/Warden-0.6.15-x64.msi
  Publish exe FileVersion: 0.6.15.0
  SHA-256: 1f53e2085a9688367a716122cfe247acb0f32d646bfb0c33d5e9204e50cf59ef
```

**Files changed (Phase 2)**

- `apps/agent/Warden.Core/EnforcementEngine.cs`
- `apps/agent/Warden.Tray/Program.cs`
- `apps/agent/Directory.Build.props`
- `apps/web/src/components/dashboard-nav.tsx`
- `docs/work/active/parent-grant-bonus.md`

## Acceptance

- [x] `extension.grantBonus` parent mutation exists and creates override via `createExtensionOverrideWithBaseline`
- [x] Child detail UI: Grant bonus next to Clear bonus / usage header
- [x] Activity shows `bonus_granted`
- [x] Local typecheck for api + web passes
- [ ] Parent can grant while locked / after hours and agent picks up via existing policy poll / broadcast (manual test pending)
- [x] Agent shows bonus AttentionWindow on `extension:approved`
- [x] Open/queued time warnings dismissed when bonus notice is shown; warnings resume as remaining crosses thresholds again
- [x] `dotnet build` agent solution passes; agent version bump only when releasing MSI

## Phases

### Phase 1 — API + web UI

**Done (2026-08-09)**

- Added `extension.grantBonus` in `packages/api/src/routers/index.ts`:
  - Creates override via `createExtensionOverrideWithBaseline` (no `sourceRequestId`)
  - Unlocks all child devices (`updateMany`)
  - Audit `bonus_granted` with `{ childId, minutes }`
  - Broadcasts `extension:approved` with `{ extraMinutes }` to each device
- Child usage header: Grant bonus button (always when evaluation loaded), presets 15/30/60 + custom, Modal (desktop) / BottomSheet (mobile), also in mobile More actions
- Activity: `bonus_granted` label, Clock icon, `+N min` in `formatActivityDetail`

**Validation**

```text
npm run typecheck -w @warden/api   → exit 0
npm run typecheck -w @warden/web   → exit 0
npm run lint -w @warden/web        → exit 0 (pre-existing warnings in realtime.ts only)
```

**Files changed**

- `packages/api/src/routers/index.ts`
- `apps/web/src/app/dashboard/children/[id]/child-usage-header.tsx`
- `apps/web/src/lib/activity.ts`
- `docs/work/active/parent-grant-bonus.md`
