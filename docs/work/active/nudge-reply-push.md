# Nudge reply push + timed top toast

**Status:** implemented (web 0.8.24) — `db:push` done; not committed / deployed  
**Started:** 2026-11-24  
**Follows:** [nudge-replies.md](nudge-replies.md) (web 0.8.17 / agent 0.6.26)

## Goal

When a child sends a real reply to a nudge, notify **only the parent who sent it**:

- App in background / closed → phone push (FCM).
- Using the app → in-app **timed toast at the top** with a slim countdown bar, on every dashboard page.

## Decisions (owner, 2026-11-24)

| Decision | Choice |
|---|---|
| Recipient | `Nudge.requestedBy` only (not every family parent) |
| Which replies | Same rule as before: On my way, Need a few minutes, or any typed text (`isMeaningfulNudgeReply`). Plain OK / auto-dismiss stay quiet. |
| Preference | New `User.notifyNudgeReplies` (default on), Settings → Notifications → "Nudge replies" |
| Android while app open | Cancel the system notification from the web (by FCM tag) and show the toast. No APK rebuild. Other push types unchanged. |
| Toast | Top of screen, 8s, title "Nudge reply", draining bar under the content; hover / press pauses it |

## Changes

- `packages/db/prisma/schema.prisma` — `User.notifyNudgeReplies Boolean @default(true)`.
- `packages/shared/src/types.ts` — `NUDGE_REPLY_PUSH_TYPE`, `nudgeReplyPushTag()`, `formatNudgeReplyMessage()`; test `nudge-reply.test.ts`.
- `packages/api/src/lib/fcm.ts` — `nudge_reply` category, `notifyParentUser()` (one user's tokens), optional `androidTag`; shared send path with `notifyFamilyParents`.
- `packages/api/src/routers/index.ts` — `ackNudge` (seen): broadcast `nudge:seen` now carries `requestedBy` + `childName`; push to sender for meaningful replies (tag `nudge-reply:<id>`, opens `/dashboard/activity`). Idempotent: repeat seen acks return early, so one push per nudge. `auth.me` / `updateNotificationPrefs` include the new pref.
- `apps/web/src/lib/toast.tsx`, `components/ui/toast.tsx`, `app/globals.css` — `showToast(message, tone, { title, placement, durationMs, timed })`. Existing callers unchanged (bottom, 4.5s, no bar).
- `apps/web/src/components/nudge-reply-toaster.tsx` (new, mounted in `dashboard-shell.tsx`) — realtime `nudge:seen` where `requestedBy === me`, plus a window-event fallback from the foreground push; deduped per nudge.
- `apps/web/src/components/native-push-bootstrap.tsx` — `pushNotificationReceived`: for nudge replies, `removeDeliveredNotifications({ id: 0, tag })` and dispatch the toast event.
- `apps/web/src/lib/use-device-actions.ts` — removed the old per-page reply toast (chip + Activity refresh kept).
- Version: web line `0.8.23` → `0.8.24` (`apps/web`, `packages/shared` + `APP_VERSION`). Agent / mobile unchanged.

## Validation

| Command | Exit | Notes |
|---|---|---|
| `npm run db:generate -w @warden/db` | 0 | Client only; DB untouched |
| `npm run typecheck -w @warden/shared -w @warden/api -w @warden/web` | 0 | |
| `npm run lint` | 0 | Only pre-existing `realtime.ts` exhaustive-deps warnings |
| `npm run test` | 0 | 68 tests (4 new) |
| `npm run check:boundaries` | 0 | |
| `npm run db:validate` | 0 | |
| `npm run db:push` | 0 | 2026-11-24, Supabase (ap-southeast-1 pooler); `notifyNudgeReplies` column live |

Not verified: on-device push, the foreground cancel on Android, and the toast's look in the browser.

## Before deploy (required)

`npm run db:push` against production **before** the web deploy. `auth.me` selects `notifyNudgeReplies`; without the column the dashboard fails to load.

## Owner test

1. `db:push`, deploy web.
2. Phone app closed: send a nudge from the phone, reply "On my way" on the PC → push arrives on the sender's phone only; tap opens Activity.
3. Phone app open: same → top toast with draining bar, no system notification left in the shade (a brief sound/flash is possible).
4. Plain OK → no push, no toast. Settings toggle off → no push (toast still shows in-app).
