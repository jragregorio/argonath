# FCM: device went-offline notifications (cron)

**Status:** complete (web v0.6.9 — pushed)  
**Started:** 2026-08-04  
**Completed:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Detection | Server cron infers offline from stale `lastSeenAt` (agent does not send “bye”) |
| Where | New route `apps/web/src/app/api/cron/device-offline/route.ts` + logic in `@warden/api` |
| Auth | Same as cleanup: `Authorization: Bearer ${CRON_SECRET}` |
| Schedule | Add Vercel cron in `apps/web/vercel.json` — **every 1 minute** (`* * * * *`) if plan allows; otherwise every 5 min — prefer 1 min for snappier test |
| UI online threshold | Keep `DEVICE_ONLINE_THRESHOLD_SECONDS` (15s) unchanged for dashboard “Online” badges |
| Push offline threshold | **Separate longer window** — e.g. `DEVICE_OFFLINE_PUSH_THRESHOLD_SECONDS = 120` (2 min) so brief blips don’t spam. Export from `@warden/shared` |
| Dedup | Add `Device.offlineNotifiedAt DateTime?`. Notify only if stale beyond push threshold AND (`offlineNotifiedAt` is null OR `offlineNotifiedAt <= lastSeenAt`). After send, set `offlineNotifiedAt = now`. On heartbeat (any successful heartbeat), clear `offlineNotifiedAt` to null so next offline cycle can notify again |
| Copy | Title `Device offline`; body `{Child}'s {Device} went offline at {time}` — family timezone; time ≈ lastSeenAt (when we last heard them) or cron “detected at” — prefer **lastSeenAt** formatted in family TZ (more accurate “went quiet”) |
| Skip | Devices with `lastSeenAt == null` (never paired/seen); unpaired (`deviceToken` null) optional skip — skip null lastSeen for sure |
| Online push | Unchanged |
| After impl | Orchestrator bumps web + push; owner may need `db:push` locally/prod |

## Acceptance criteria

1. Cron route protected by `CRON_SECRET` like cleanup.
2. One FCM per offline episode; no repeat while still offline.
3. Coming back online clears dedup so a later offline notifies again.
4. vercel.json cron entry documented.
5. `npm run typecheck` for touched packages + `check:boundaries` exit 0.
6. `npm run db:push` or validate schema — record real result (owner DB).
7. No commit/push/bump by executor.

## Owner test notes (after deploy)

1. `db:push` so `offlineNotifiedAt` exists (local + production).
2. Deploy web; confirm Vercel Cron is enabled for the new path.
3. Run agent, then quit/kill it; wait ≥ push threshold + one cron tick; expect offline push.
4. Or manually `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/device-offline` after agent stopped long enough.

## Phase log

### Phase 0 — plan lock

- Owner: proceed with offline push for testing.

### Phase 1 — schema + shared

- Added `Device.offlineNotifiedAt DateTime?` in `packages/db/prisma/schema.prisma`.
- `npm run db:push` exit **0** (Supabase in sync).
- `DEVICE_OFFLINE_PUSH_THRESHOLD_SECONDS = 120` + `isDeviceOfflineForPush()` in `packages/shared/src/types.ts`.

### Phase 2 — API + heartbeat

- `packages/api/src/lib/device-offline-notify.ts` — `notifyStaleDeviceOffline()` queries stale paired devices, dedups via `offlineNotifiedAt`, sends FCM `device:offline`, sets dedup on success/no-tokens.
- Exported from `packages/api/src/index.ts`.
- Heartbeat clears `offlineNotifiedAt: null` on every successful heartbeat.

### Phase 3 — cron + Vercel

- `apps/web/src/app/api/cron/device-offline/route.ts` — `CRON_SECRET` auth, returns `{ checked, notified, failed }`.
- `apps/web/vercel.json` — cron `* * * * *` on `/api/cron/device-offline`.

### Phase 4 — docs + validation

- `docs/operations/android-push-fcm.md` — offline cron section.
- `npm run typecheck -w @warden/shared -w @warden/api -w @warden/db -w @warden/web` exit **0**.
- `npm run check:boundaries` exit **0**.
- `npm run db:push` exit **0** (recorded in phase 1).

## Files touched

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | `offlineNotifiedAt` column |
| `packages/shared/src/types.ts` | threshold constant + helper |
| `packages/api/src/lib/device-offline-notify.ts` | new |
| `packages/api/src/index.ts` | export helper |
| `packages/api/src/routers/index.ts` | clear dedup on heartbeat |
| `apps/web/src/app/api/cron/device-offline/route.ts` | new cron route |
| `apps/web/vercel.json` | cron schedule |
| `docs/operations/android-push-fcm.md` | offline docs |
