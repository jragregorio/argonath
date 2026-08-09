# After-hours bonus countdown (dashboard parity)



**Status:** in progress  

**Started:** 2026-08-07  



## Problem



Outside allowed hours, the agent counts down bonus from a **usage baseline** captured when after-hours starts. The shared/web `evaluatePolicy` used `bonus − max(0, used − dailyLimit)`, which stays frozen at the full grant while `used < dailyLimit` (e.g. 250/900 +120 → forever “120 min left”).



## Decisions (locked)



| Decision | Choice |

|----------|--------|

| Semantics | Match agent grant: on first outside-window pierce with bonus, persist baseline used minutes; remaining = `grantSize − (used − baseline)` where `grantSize = bonus − max(0, baseline − dailyLimit)`. |

| Storage | `ExtensionOverride.outsideGrantBaselineUsedMinutes Int?` — set on active overrides missing a baseline (reuse min existing baseline when adding more bonus after hours). |

| Engine | Pure `evaluatePolicy` takes baseline via override input; API ensures/persists baseline before/around eval. |

| UI | After-hours allowed: primary “N min left today”, bar drains vs grant, plume footnote optional/kept. |

| C# Evaluate | Mirror TS formula when baseline provided; agent local EnforcementEngine baseline remains source of truth for lock timing. |



**Validation**



| Command | Exit |

|---------|------|

| `npm run db:push -w @warden/db` | 0 (schema synced; generate EPERM on locked query engine DLL — retry after stopping Next) |

| `npm run test -w @warden/shared` | 0 (40 tests) |

| `npm run typecheck -w @warden/shared` | 0 |

| `npm run typecheck -w @warden/api` | 0 |

| `npm run typecheck -w @warden/web` | 0 |

| `dotnet build apps/agent/Warden.sln` | 0 |



### Phase 2 — fix missing usage header



- Symptom: child detail lost status/bar because `policy.getEvaluation` 500’d.

- Cause: stale Prisma client rejected `outsideGrantBaselineUsedMinutes` on `updateMany` (“Unknown argument”).

- Fix: read/write baseline via `$queryRaw` / `$executeRaw` so evaluation works without regenerating the client mid-dev.



### Phase 3 — sync dashboard baseline with agent (done)



**Problem:** Agent baselined at window end (~7:00) → `41/120` used. Server baselined late when eval first succeeded → dashboard showed ~117 left.



**Implemented:**



1. `getMinutesSinceTodayWindowEnded` + `computeIdealOutsideGrantBaseline` in `packages/shared/src/policy-engine.ts`.

2. `ensureOutsideGrantBaselines` persists `idealBaseline` on first write; repairs stored `> ideal` downward via raw SQL.

3. Vitest: Fri 05:00–19:00, 19:42 → 42 min elapsed; used 268 → ideal 226 → remaining 78.



**Validation (Phase 3)**



| Command | Exit |

|---------|------|

| `npm run test -w @warden/shared` | 0 (40 tests) |

| `npm run typecheck -w @warden/shared` | 0 |

| `npm run typecheck -w @warden/api` | 0 |

| `npm run typecheck -w @warden/web` | 0 |



**Out of scope for this phase:** heartbeat agent-reported outside usage (follow-up if wall-clock drift matters when idle).

### Phase 5 — post-window approval must pierce (done)

**Bug:** Dashboard shows Outside allowed hours +15 bonus while agent correctly counts 15-min extension. Cause: `resolveOutsideGrantBaselineToPersist` treats first observe with `minutesSinceWindowEnded >= 2` as “late” and sets **ideal** = `used − elapsedSinceWindowEnd`. A **new** bonus approved after hours (e.g. at 8:19 with window end 8:00) gets baseline too low → remaining 0 immediately.

**Implemented:**

1. `getLatestTodayWindowEndMinutes` + `isGrantCreatedAfterTodayWindowEnd` in `packages/shared/src/policy-engine.ts`.
2. `resolveOutsideGrantBaselineToPersist` accepts `grantCreatedAfterWindowEnd`: post-window first write always pierces; pre-window late catch-up still uses ideal; post-window skips downward `min(stored, ideal)` and recovers when stored baseline zeros remaining but pierce would restore grant.
3. `ensureOutsideGrantBaselines` passes `createdAt` from overrides, computes post-window flag from newest active override, persists when stored ≠ target (upward recovery + downward repair).
4. API routers pass `createdAt` into `ensureOutsideGrantBaselines` (`getEvaluation`, overview, `getPolicy`).

**Validation (Phase 5)**

| Command | Exit |
|---------|------|
| `npm run test -w @warden/shared` | 0 (47 tests) |
| `npm run typecheck -w @warden/shared` | 0 |
| `npm run typecheck -w @warden/api` | 0 |
| `npm run typecheck -w @warden/web` | 0 |

**Out of scope:** heartbeat agent-reported outside usage (follow-up if wall-clock drift matters when idle).

### Phase 6 — approve-time baseline; stop re-pierce (done)

**Bug (2026-08-07 ~20:26):** Agent shows `6 / 15 min extension` (~8:40 left). Dashboard shows `47/375 (+15)` and **`15 min left`** with a full bar — frozen at the full grant.

**Root cause (script review):**

1. Baseline is **not** set when the override is created (approve / parentUnlock). It is first written lazily in `ensureOutsideGrantBaselines` on later `getEvaluation` / `getPolicy`.
2. Agent pierces **locally at approval** (~used 41) → correct countdown.
3. Dashboard / Phase 5 **recovery** raises a bad/zero remaining baseline to **current** `usedMinutes` (47) → remaining resets to full **15**. Same class of bug: any late first-write pierce after approval also freezes remaining at full grant until used moves on the server.
4. MSI agent still calls **`https://warden-alpha.vercel.app`** while the dashboard is often **local `npm run dev`**. If production `getPolicy` omits `outsideGrantBaselineUsedMinutes`, the agent keeps its local pierce and never converges with the local API’s re-pierced baseline.

**Implemented:**

1. `resolveBaselineForNewOverride` + `createExtensionOverrideWithBaseline` in `packages/api/src/lib/outside-grant-baseline.ts` — pierce at approve time (`min` of active baselines when stacking, else today's used minutes); raw SQL baseline write after create.
2. Wired into `extension.resolve` (approve) and `agent.parentUnlock` in `packages/api/src/routers/index.ts`.
3. `resolveOutsideGrantBaselineToPersist`: post-window + stored → return stored always (removed upward re-pierce recovery).
4. Agent `ResolveOutsideGrantBaselineUsedMinutes` → `min(server, local)` when both present.
5. Tests: post-window stored immutable; stacking reuses lower baseline; removed Phase 5 recovery test.

**Validation (Phase 6)**

| Command | Exit |
|---------|------|
| `npm run test -w @warden/shared` | 0 (48 tests) |
| `npm run typecheck -w @warden/shared` | 0 |
| `npm run typecheck -w @warden/api` | 0 |
| `npm run typecheck -w @warden/web` | 0 |
| `dotnet build apps/agent/Warden.sln -c Release --nologo -v q` | 0 |

**Retest note for orchestrator:** After fix, clear bonus → request/approve again (old row may still have a late baseline). For agent↔dashboard parity while developing, either deploy API or point the agent at the same base URL as the dashboard.

### Phase 4 — agent Evaluate parity (done)

**Problem:** Agent `EnforcementEngine` overwrote `PolicyEngine.Evaluate` with a local pierce baseline. Dashboard and agent could disagree on remaining extension time.

**Implemented:**

1. `resolveOutsideGrantBaselineToPersist` + `LATE_OUTSIDE_BASELINE_MINUTES` in `packages/shared/src/policy-engine.ts` — pierce at first observe (elapsed &lt; 2), ideal backfill when late, downward repair when stored &gt; ideal. `computeIdealOutsideGrantBaseline` documented as late-repair/migration only.
2. `ensureOutsideGrantBaselines` uses `resolveOutsideGrantBaselineToPersist` (not always ideal); persists when missing or stored &gt; target.
3. Agent: when server baseline present, remaining/grant/tray usage mirror shared formula via `PolicyEngine.GetOutsideExtensionGrantSize` / `GetOutsideExtensionRemainingMinutes`; local `_outsideExtensionBaselineSeconds` no longer overrides Evaluate. Fallback local pierce when server baseline null.

**Validation (Phase 4)**

| Command | Exit |
|---------|------|
| `npm run test -w @warden/shared` | 0 (44 tests) |
| `npm run typecheck -w @warden/shared` | 0 |
| `npm run typecheck -w @warden/api` | 0 |
| `npm run typecheck -w @warden/web` | 0 |
| `dotnet build apps/agent/Warden.sln` | 0 |

### Phase 7 — agent outside-grant persist race (done)

**Incident (Niccolo device, 2026-08-08):** Child window Sat 10:00–21:00. Parent approved bonus ~5 min before window end. At window end agent locked instead of switching to bonus. Agent log showed `IOException` on fixed `outside-grant.json.tmp` from concurrent `PersistOutsideGrantBaseline` writes (WinForms timer re-entry + heartbeat `RefreshPolicyAsync`).

**Root cause:** `OutsideGrantStateStore.Save` used a single `.tmp` path; `PersistOutsideGrantBaseline` ran every tick when server baseline present; persist exceptions aborted `EvaluateAndEnforce` before lock/unlock.

**Implemented:**

1. `OutsideGrantStateStore`: per-write unique temp file, static lock serializing Save/Load/Clear, 3× IOException retry with backoff, atomic `File.Replace`/`Move`.
2. `EnforcementEngine.PersistOutsideGrantBaseline`: skip disk when date/baseline/bonus unchanged; try/catch Warn (non-fatal) — in-memory baseline kept on failure.
3. `LogOutsideWindowDiagnostics` on outside-window lock/unlock transitions and when outside-window status flips.
4. Agent version `0.6.12` → `0.6.13` (`Directory.Build.props`).

**Validation (Phase 7)**

| Command | Exit |
|---------|------|
| `dotnet build apps/agent/Warden.sln -c Release --nologo -v q` | 0 |

### Phase 8 — agent log timestamps local (done)

**Problem:** File log lines used ISO UTC (`2026-08-08T13:02:15.563Z`), hard for parents to match wall-clock when reading `%LOCALAPPDATA%\Warden\logs\`.

**Implemented:**

1. `WardenLog`: timestamps use local machine time `yyyy-MM-dd HH:mm:ss` (no `T`/`Z`).
2. Daily rotation and purge keyed off local calendar date (`_currentDateLocal`) so filename date aligns with line timestamps.
3. Agent version `0.6.13` → `0.6.14` (`Directory.Build.props`).

**Validation (Phase 8)**

| Command | Exit |
|---------|------|
| `dotnet build apps/agent/Warden.sln -c Release --nologo -v q` | 0 |

