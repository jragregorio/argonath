# Extension bypasses allowed window

**Status:** complete — shipped web 0.7.9 / agent 0.6.5  
**Started:** 2026-08-06  
**Goal:** An approved extension (active bonus) may unlock the child outside allowed hours, capped to unused bonus minutes only — never leftover daily budget.

## Product decision

- Parent approving an extension is an explicit schedule override.
- Outside the allowed window, leftover daily minutes still do **not** unlock.
- Only **unused bonus** unlocks:  
  `bonusRemaining = max(0, bonusMinutes - max(0, usedMinutesToday - dailyLimitMinutes))`
- When `!inWindow && bonusRemaining > 0` → `status: "allowed"`, `remainingMinutes: bonusRemaining`, `limitingFactor: "daily_limit"` (bonus is daily-pool extension; no new LimitingFactor enum unless needed).
- When `!inWindow && bonusRemaining === 0` → keep current `outside_window` behavior.
- Inside window: unchanged (bonus still adds to daily limit; window may still bind). After window ends, unused bonus continues to unlock via the outside-window branch above.
- Keep TS (`packages/shared`) and C# (`Warden.Core`) engines in sync.

## Acceptance criteria

- [x] Outside window + no bonus → still `outside_window` / locked
- [x] Outside window + unused bonus → `allowed` with `remainingMinutes === bonusRemaining`
- [x] Outside window + bonus fully consumed (used past daily+bonus into/through bonus) → locked again
- [x] Inside window behavior unchanged (existing vitest cases still pass)
- [x] C# `PolicyEngine.Evaluate` mirrors TS
- [x] Vitest covers the Wed 8 PM / +15 min scenario
- [x] `npm run test` + `dotnet build apps/agent/Warden.sln` pass (record real exit codes)
- [x] Version bump + push (web 0.7.9, agent 0.6.5)

## Out of scope

- Changing `expiresAt` semantics (still end-of-day)
- New LimitingFactor value / UI redesign
- ParentUnlock / clearBonus behavior changes

## Validation

| Command | Exit code |
|---------|-----------|
| `npm run test -w @warden/shared` | 0 (33 tests passed) |
| `dotnet build apps/agent/Warden.sln` | 0 |
| `npm run typecheck` | 0 |

## Phases / log

### Phase 0 — plan (orchestrator)
- Root cause: `evaluatePolicy` / C# `Evaluate` hard-gate on `!inWindow` before bonus can matter; bonus only raises daily limit inside windows.
- Decision: bonus pierces schedule gate; cap to unused bonus only.

### Phase 1 — implement (executor)
- Added `bonusRemaining` check in `!inWindow` branch of TS `evaluatePolicy` and C# `PolicyEngine.Evaluate`.
- When `bonusRemaining > 0`: `status: "allowed"`, `remainingMinutes: bonusRemaining`, `limitingFactor: "daily_limit"`.
- Added 4 vitest cases in `extension outside allowed window` describe block (Wed 8 PM scenario + partial/full/no bonus).
- All validation commands exit 0.

### Phase 2 — release (orchestrator)
- Bumped web `@warden/web` + `@warden/shared` + `APP_VERSION` → **0.7.9**
- Bumped agent `Directory.Build.props` → **0.6.5**
- Commit + push to `origin/main`
