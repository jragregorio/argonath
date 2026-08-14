# Pre-window bonus must hand off into the next allowed window

**Status:** in progress  
**Started:** 2026-08-14  
**Orchestrator:** Cursor Grok 4.6  
**Executor:** Composer 2.5

## Problem

Thursday allowed window: **15:00–18:00**. Child requested **60 min** around **14:00** (before the window); parent approved. After the extension was consumed, Warden **locked** instead of continuing into the 15:00–18:00 window.

Parent expectation: 14:00 + 60 min wall-clock reaches 15:00, so usage should continue in the scheduled window. No lock at the bonus/window boundary.

## Root cause (orchestrator)

After-hours bonus is a **usage pool**. When remaining hits 0 the agent forces `outside_window` and locks (`EnforcementEngine.EvaluateAndEnforce` when `IsOutsideAllowedWindow() && grantSeconds <= 0`).

That is correct when the next window is **not** reachable by the grant (e.g. 60 min at 13:00 with a 15:00 window). It is wrong when the grant’s **wall-clock** end reaches today’s next window start (14:00 + 60 min ≥ 15:00). Usage can also run slightly ahead of wall-clock (seconds vs minutes, other-device minutes), so the pool hits 0 at 14:59 while the window is 15:00 — then the child is locked even though the window is about to open.

In-window `evaluatePolicy` already allows at 15:00 if `used < dailyLimit + bonus`. The missing piece is **do not lock in the gap** when the grant was long enough to reach that window.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Product rule | If an active override’s wall-clock end (`createdAt + extraMinutes`) is **≥ today’s next window start**, do **not** lock for `outside_window` before that window. At window start, in-window rules take over (daily limit + window end), even if the after-hours usage pool is spent. |
| Same-day only | Bridge only to a **later window today** (family TZ). Evening grant must not unlock until tomorrow morning. |
| Usage pool unchanged | After-hours countdown while remaining > 0 stays usage-based. Bridge applies when usage remaining is 0 (or about to lock) but wall-clock grant still reaches the next today window. |
| Remaining during bridge | `minutesUntilNextWindow` (countdown to schedule start). Status `allowed`, `inWindow: false`. |
| No bridge | Grant wall-clock end **before** next today window (13:00 + 60 min vs 15:00) → lock when usage pool is spent (existing). |
| Agent | Source of truth for lock timing. Must mirror shared rule (second precision). Do not force `outside_window` when the bridge applies. |
| Dashboard | Same rule in `evaluatePolicy` so parent UI does not show “Outside allowed hours” during a valid bridge. |
| Versions | Agent `0.6.21` → `0.6.22`; web/shared `0.8.13` → `0.8.14`. Independent lines. No MSI unless asked. No commit/push. |

## Acceptance

1. Vitest: Thu 15:00–18:00, grant `createdAt` 14:00 + 60 min, used 60 (pool spent) at 14:59 → `allowed`, `shouldLock` false, remaining ~1. At 15:00 → `allowed`, `inWindow` true, `shouldLock` false.
2. Vitest: same window, grant 13:00 + 60 min, pool spent at 14:00 → `outside_window`, `shouldLock` true (not enough to reach 15:00).
3. Vitest: post-window evening (existing after-hours lock when pool spent, next window tomorrow) unchanged.
4. Agent: `EvaluateAndEnforce` must not force lock when the bridge applies; must unlock when the window opens even if grant seconds are 0.
5. `npm run test -w @warden/shared`, `npm run typecheck -w @warden/shared -w @warden/api -w @warden/web`, `dotnet build apps/agent/Warden.sln` — record real exit codes.
6. `HARDCODED_DESKTOP_APP_VERSION` synced to `0.6.22`.

## Implementation notes

- `ExtensionOverrideInput.createdAt?: Date` (optional; no createdAt → no wall-clock bridge, usage-only).
- Pass `createdAt` through `ensureOutsideGrantBaselines` mapped overrides (today it is dropped).
- Helper: today’s next window start minutes + `grantWallClockReachesNextTodayWindow`.
- `agent.getPolicy`: expose enough for the agent (e.g. newest/max grant wall-clock end, or override `createdAt`s). Agent `PolicyData` + `PolicyEngine.Evaluate` / `EvaluateAndEnforce`.
- On `extension:approved`, local stamp is a fallback if the API field is missing (old deploy); prefer server value after `getPolicy`.

## Out of scope

iOS; changing daily-limit math in-window; MSI/installer; git commit/push.

## Commands / results

### Initial implementation (2026-08-14)

| Command | Exit code |
|---------|-----------|
| `npm run test -w @warden/shared` | 0 (54 tests) |
| `npm run typecheck -w @warden/shared` | 0 |
| `npm run typecheck -w @warden/api` | 0 |
| `npm run typecheck -w @warden/web` | 0 |
| `dotnet build apps/agent/Warden.sln --nologo -v q` | 0 |

### Review fix — Manila UTC vs family-local bridge (2026-08-14)

**Bug:** `IsPreWindowBridgeActive` compared UTC `outsideGrantValidUntil` (from `toISOString()`) to `now.Date.AddMinutes(...)` (family Unspecified). After first `getPolicy`, bridge failed for Asia/Manila (e.g. `07:00 UTC >= 15:00 Unspecified` → false).

**Fix:** Convert UTC grant end via `ResolveNow(timeZoneIana, utcInstant)`; leave Unspecified/local approve fallback as-is. Compare same family calendar day + grant-end seconds-since-midnight ≥ next today window start seconds. Pass `timeZoneIana` into `IsPreWindowBridgeActive` from `Evaluate` and `EnforcementEngine`.

| Command | Exit code |
|---------|-----------|
| `npm run test -w @warden/shared` | 0 (55 tests; +1 Manila handoff) |
| `npm run typecheck -w @warden/shared` | 0 |
| `dotnet build apps/agent/Warden.sln --nologo -v q` | 0 |

## Files changed

- `packages/shared/src/types.ts` — `ExtensionOverrideInput.createdAt?`; `APP_VERSION` 0.8.14
- `packages/shared/package.json` — 0.8.14
- `packages/shared/src/policy-engine.ts` — `getNextTodayWindowStartMinutes`, `grantWallClockReachesNextTodayWindow`, `getOutsideGrantValidUntil`; bridge branch in `evaluatePolicy`
- `packages/shared/src/policy-engine.test.ts` — handoff / not-enough / evening tests; **Asia/Manila UTC-instant handoff**
- `packages/api/src/lib/outside-grant-baseline.ts` — pass `createdAt` through mapped overrides
- `packages/api/src/routers/index.ts` — `agent.getPolicy` exposes `outsideGrantValidUntil` (ISO)
- `apps/agent/Warden.Core/Models/AgentModels.cs` — `PolicyData.OutsideGrantValidUntil`
- `apps/agent/Warden.Core/Services/PolicyEngine.cs` — bridge helpers + `Evaluate` branch; **`ToFamilyWallClock` + family-local seconds comparison in `IsPreWindowBridgeActive`**
- `apps/agent/Warden.Core/EnforcementEngine.cs` — no lock on bridge; local `outsideGrantValidUntil` fallback on approve; second-precise countdown to window
- `apps/agent/Directory.Build.props` — 0.6.22
- `apps/web/package.json` — 0.8.14
- `apps/web/src/components/dashboard-nav.tsx` — `HARDCODED_DESKTOP_APP_VERSION` 0.6.22

### MSI rebuild (2026-08-14)

| Command | Exit code | Notes |
|---------|-----------|--------|
| `powershell -File apps/agent/build-installer.ps1` | 0 | ICE61 warning only (0.6.22 vs 0.6.22). |

```
MSI:      apps/agent/artifacts/Warden-0.6.22-x64.msi
Size:     88701254 bytes
SHA-256:  8fa4d623dcbaaa5011e7b360781f1bff9c59b99eb2bf96e675f355023199c46c
Publish exe FileVersion: 0.6.22.0
ApiBaseUrl: https://warden-alpha.vercel.app
```

## Next step

Deploy web 0.8.14, then install `Warden-0.6.22-x64.msi` on the child PC. Manual QA: Thu 15:00–18:00 window, 60 min grant at 14:00, confirm no lock at 14:59 when pool spent and continue at 15:00.
