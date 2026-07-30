# Policy window / limit reconciliation

**Status:** complete — shipped in v0.5.13  
**Started:** 2026-07-30  
**Goal:** Effective allowance = min(dailyLimit+bonus, window capacity); session remaining drives warnings/UI; engines stay in sync.

## Acceptance criteria

- [x] Part 1: shared types + helpers + evaluatePolicy rework
- [x] Part 2: C# PolicyEngine mirror
- [x] Part 3: agent warnings, skip usage while locked, tray/lock UI
- [x] Part 4: web dashboard consumers + parent advisory
- [x] Part 5: vitest coverage
- [x] Validation commands (real exit codes)
- [x] Follow-up: accurate multi-capacity advisory + paused-policy copy

## Phases

### Phase 0 — context
- Read AGENTS.md, apps/agent/AGENTS.md, PROJECT_CONTEXT, CURRENT_STATE, cursor rules.

### Phase 1 — packages/shared
- Extended PolicyEvaluation; added mergeWindows, getWindowCapacityMinutes, getPolicyReach; reworked evaluatePolicy.

### Phase 2 — C# PolicyEngine
- Mirrored in PolicyEngine.cs + AgentModels.PolicyEvaluation.

### Phase 3 — agent enforcement/UI
- Window-aware warnings; skip active accrual while locked; countdown capped; lock UI shows daily left outside window.

### Phase 4 — web
- Session vs daily display split; parent advisory on draft via getPolicyReach.

### Phase 5 — validation (2026-07-30)

| Command | Exit code |
|---------|-----------|
| `npm run typecheck` | 0 |
| `npm run lint` | 0 (pre-existing no-img-element / exhaustive-deps warnings) |
| `npm run test` | 0 (29 tests) |
| `npm run check:boundaries` | 0 |
| `dotnet build apps/agent/Warden.sln` | 0 |

### Phase 6 — follow-up fixes (2026-07-30)

1. Parent advisory groups constrained days by capacity (`formatReachAdvisory`) so mixed windows (e.g. Mon-Fri 120 / Sat 300) no longer claim every day allows the minimum. Button still sets tightest capacity; added clarifying note.
2. Paused policy (`limitingFactor === "none"` / remaining ≥ 999) shows "Limits paused" on child detail and overview instead of "999 min left now".

Validation (web-only):

| Command | Exit code |
|---------|-----------|
| `npm run typecheck` | 0 |
| `npm run lint` | 0 (pre-existing warnings only) |
| `npm run test` | 0 |
| `npm run check:boundaries` | 0 |

### Phase 6 — review follow-up (2026-07-30)

- Advisory grouped constrained days by capacity (a mixed schedule previously quoted the tightest day's number while naming every constrained day).
- Paused policy shows "Limits paused" instead of leaking the 999 sentinel.
- Orchestrator corrected the advisory helper note, which claimed the button lets "every scheduled day use its full window" — the opposite of what clamping to the tightest day does. Copy is now conditional on whether roomier scheduled days exist.

| Command | Exit code |
|---------|-----------|
| `npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm run test` | 0 (29 tests) |
| `npm run check:boundaries` | 0 |

### Phase 7 — release v0.5.13 (2026-07-30)

Both apps changed, so web and agent versions were bumped together across all six
coordinated locations (`Directory.Build.props`, `APP_VERSION`, `@warden/web`,
`@warden/shared`, `AgentVersionInfo.Fallback`, `AgentModels` defaults).

| Command | Exit code |
|---------|-----------|
| `npm install --package-lock-only` | 0 |
| `npm run verify` | 0 |
| `dotnet build apps/agent/Warden.sln` | 0 (0 warnings) |
| `apps/agent/build-installer.ps1` | 0 (ICE61 warning, pre-existing) |

MSI: `apps/agent/artifacts/Warden-0.5.13-x64.msi` (87,555,685 bytes)
SHA-256: `d74934a0cb349dd9b283e8c7a7a9c5a720aa418fa0cbf250127b47a811c21b93`
Baked API base URL: `https://warden-alpha.vercel.app` (from `Warden.Tray/warden.json`).

Not published to the `agent-releases` bucket — the MSI is ~87 MB against the
Supabase Free 50 MB object cap, the same blocker that keeps
`INSTALLER_DOWNLOAD_ENABLED` false (see `agent-installer-autoupdate.md`).

## Decisions

- On exact daily/window tie, prefer `daily_limit`.
- `getPolicyReach.minWindowedCapacityMinutes` excludes days with zero windows; null when schedule empty.
- Outside window → limitingFactor `"window"`; blocked → `"daily_limit"`; inactive → `"none"`.
- Advisory copy must be per-capacity-group accurate; button remains "set to tightest".
- No Prisma change; no commit.

## Out of scope (deliberate)

- Midnight-crossing windows
- Precedence setting / mutating stored dailyLimitMinutes
- PinWindow.cs / ConfigStore.cs user WIP
- .NET unit tests (none in repo)

## Drift risk (TS ↔ C#)

- Two engines remain hand-mirrored; no shared golden-file tests across languages.
- Windows IANA zone IDs via TimeZoneInfo vs Intl may differ on edge zones.
- Admin-lock path only on C# EnforcementEngine (not in shared evaluatePolicy).

## Next step

None required; leave working tree uncommitted.
