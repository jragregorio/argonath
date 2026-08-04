# Audit log: device online / offline in Activity

**Status:** in progress  
**Started:** 2026-08-05  
**Executor:** Composer 2.5 (subagent)

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Online | Write audit log when heartbeat detects reconnect (`!wasRecentlySeen`) — same moment as FCM |
| Offline | Write audit log when offline cron notifies (same moment as FCM success / notify path) |
| Actions | `device_online` and `device_offline` |
| Actor | System/agent style (null actor → UI shows “Agent” already) or omit actorUserId |
| Labels | Activity UI: “Device came online” / “Device went offline” (or “came online” / “went offline”) |
| Metadata | Optional ISO timestamp; child/device names via normal activity join |
| Also include | Mobile activity row stack fix in `recent-activity-card.tsx` if still uncommitted |
| Deploy | No bump/push by executor — orchestrator waits for owner |

## Acceptance criteria

1. Reconnect creates an Activity row.
2. Offline cron notify creates an Activity row (once per episode, same as FCM dedup).
3. Labels render cleanly in `apps/web/src/lib/activity.ts`.
4. `npm run typecheck -w @warden/api -w @warden/web` exit 0.
5. No commit/push/bump by executor.

## Phase log

### Phase 0 — plan lock

- Owner: add online/offline to Activity feed.

### Phase 1 — implementation

**Changes:**
- `packages/api/src/lib/audit.ts` — exported shared `logAudit` helper
- `packages/api/src/routers/index.ts` — `device_online` audit on heartbeat reconnect (`!wasRecentlySeen`)
- `packages/api/src/lib/device-offline-notify.ts` — `device_offline` audit before notify; always mark `offlineNotifiedAt` per episode (even zero FCM tokens)
- `apps/web/src/lib/activity.ts` — labels for `device_online` / `device_offline`

**Validation:**
```bash
npm run typecheck -w @warden/api -w @warden/web  # exit 0
npm run check:boundaries                          # exit 0
```

**Next:** owner manual smoke (reconnect + stale device cron) then deploy; no commit/push/bump by executor.
