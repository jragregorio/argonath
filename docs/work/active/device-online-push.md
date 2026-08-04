# FCM: device came-online notifications

**Status:** complete (web v0.6.8 — pushed)  
**Started:** 2026-08-04  
**Completed:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | **Online-only** — push when agent reconnects (heartbeat transition `!wasRecentlySeen` → seen) |
| Offline | Out of scope (no cron / no `device:offline` push yet) |
| Copy | Body: `{Child}'s {Device} came online at {time}` — family timezone; fix grammar (possessive, device display name / machineName) |
| Title | Short e.g. `Device online` |
| Transport | Existing `notifyFamilyParents` / FCM (same as extension requests) |
| Agent / APK | No changes |
| After impl | Orchestrator **bumps web** + pushes |

## Implementation target

- Hook in agent heartbeat handler in `packages/api/src/routers/index.ts` where `device:online` is already broadcast (~1920–1927).
- Load child `displayName`, family `timezone`, device name (`machineName` or paired display name — match what UI shows).
- Format time with family timezone (reuse existing timezone helpers from `@warden/shared` if available; otherwise `Intl.DateTimeFormat` with `timeZone`).
- `void notifyFamilyParents(...).catch(...)` — do not block heartbeat response.
- Data payload: `type: "device:online"`, `deviceId`, `childId`, `path` to child detail or overview.

## Acceptance criteria

1. Reconnect (stale → heartbeat) sends one FCM to family parents when FCM configured + tokens exist.
2. Steady online heartbeats do not spam.
3. Heartbeat still returns quickly if FCM fails.
4. `npm run typecheck -w @warden/api -w @warden/web` (or relevant) and `npm run check:boundaries` exit 0.
5. No commit/push/bump by executor.

## Phase log

### Phase 0 — plan lock

- Owner: proceed online-only; bump + push after.

### Phase 1 — implementation

- Expanded heartbeat `child` query: `displayName`, `familyId`, family `timezone` (reuse for usage log).
- In `!wasRecentlySeen` branch: `void notifyFamilyParents(...)` alongside existing `device:online` broadcast.
- Device label via `getDeviceDisplayName` (`displayName` ?? `machineName` from heartbeat input).
- Time: `Intl.DateTimeFormat` en-US, family `timeZone`, `hour12` → e.g. `10:22 AM`.
- Copy: title `Device online`; body `{displayName}'s {deviceLabel} came online at {time}`.
- Data: `type`, `deviceId`, `childId`, `path: /dashboard/children/{childId}`.

**Validation**

| Command | Exit |
|---------|------|
| `npm run typecheck -w @warden/api -w @warden/shared` | 0 |
| `npm run check:boundaries` | 0 |

**Next:** orchestrator bump web + push.
