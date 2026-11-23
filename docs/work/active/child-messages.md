# Child → parent messages (Windows tray)

**Status:** implemented (web 0.8.25, agent 0.6.28). `db:push` is done and the 0.6.28 MSI and portable build exist. The commit and deploy are still pending.
**Started:** 2026-11-24  
**Follows:** [nudge-replies.md](nudge-replies.md), [nudge-reply-push.md](nudge-reply-push.md)

## Goal

Let the child start a conversation, not only answer nudges. The child sends a short message from the tray, and parents are notified (in-app toast plus phone push). A parent can reply from Activity. The reply is delivered as a nudge, so it reuses the existing overlay and nudge-reply loop.

## Decisions (owner approved, 2026-11-24)

| Question | Choice |
|---|---|
| Where the child sends from | Tray window **Message** button next to **Request**. Not from the lock overlay in this version (bypass-sensitive surface; Request already exists there). |
| Recipients | **All parents** in the family, with each parent's `notifyChildMessages` setting (default on) |
| Content | Quick buttons (Come here? / I'm done / Need help) **and** a typed line of up to 200 characters |
| Thread UI | **None.** Activity rows plus **Reply**. No Messages page. |
| Rate limit | Per device: **1 per 30 s, 20 per rolling hour**, enforced on the server (HTTP 429 + `Retry-After`) |

## Data

- `ChildMessage { id, familyId, childId, deviceId, quick?, text, createdAt, repliedAt?, repliedBy? }`
- `Nudge.replyToMessageId String?`: set when the nudge is a parent's reply.
- `User.notifyChildMessages Boolean @default(true)`
- Audit row `child_message` (userId `agent`, metadata `{ deviceId, childId, messageId, text, quick? }`). Activity merges `replied` from `ChildMessage.repliedAt`.

## Changes

**Shared** (`types.ts`): `CHILD_MESSAGE_QUICK_LABELS`/`_KEYS`, `CHILD_MESSAGE_MAX_LENGTH`, rate-limit constants and pure `checkChildMessageRateLimit()`, `resolveChildMessageText()`, `CHILD_MESSAGE_PUSH_TYPE`, `childMessagePushTag()`, plus the realtime type `message:received`. Tests are in `child-message.test.ts`.

**API**
- `agent.sendMessage` (`quick` or `text`): rate limit, create, audit, broadcast `message:received` (with `childName`), FCM `child_message` to every parent with the setting on (tag `child-message:<id>`, opens Activity).
- `sendNudge` accepts `replyToMessageId` (validated against family and device), stamps `repliedAt`/`repliedBy`, and audit meta carries `replyToMessageId`.
- `auth.me` / `updateNotificationPrefs` include `notifyChildMessages`.
- `/api/agent` route: `sendMessage` action. `TOO_MANY_REQUESTS` maps to **429** with `retryAfterSeconds` (other errors are still 500).

**Agent**
- `WardenApiClient.SendMessageAsync` returns `ChildMessageSendResult` (sent / rate-limited with seconds / failed). `EnforcementEngine.SendMessageAsync` logs and fails open to "failed".
- `MainWindow`: a Request | Message row. The Message panel has 3 quick buttons (send immediately) plus a text field with Send (Enter works). Status "Sent to your parent!" then the panel collapses. Opening one panel closes the other.
- Unknown realtime events (the agent also receives `message:received`) are ignored by the existing switch.

**Web**
- `child-message-reply.tsx` (new): provider in the dashboard shell plus a Reply modal/sheet (quote, input, presets). Sends `sendNudge({ replyToMessageId })`.
- `recent-activity-card.tsx`: `child_message` rows show the quote, no "by Agent", and a **Reply** / **Reply again** button (dashboard only; the demo has no provider, so no button).
- `activity.ts`: label "Sent you a message" (icon MessageSquare). A reply nudge's label is "Replied to a message".
- `nudge-reply-toaster.tsx`: also toasts `message:received` (title "Message from {child}") with the same top timed toast, deduped per message.
- `native-push-bootstrap.tsx`: foreground child-message push → cancel the system notification by tag and show the toast.
- `family-realtime.tsx`: `message:received` → invalidate Activity.
- Settings: "Messages from children" toggle.

**Versions:** agent `0.6.27` → `0.6.28` (+ dashboard `HARDCODED_DESKTOP_APP_VERSION`), web `0.8.24` → `0.8.25`.

## Validation

| Command | Exit | Notes |
|---|---|---|
| `npm run typecheck -w @warden/shared -w @warden/api -w @warden/web` | 0 | |
| `npm run lint -w @warden/web` | 0 | Only the pre-existing `realtime.ts` warnings. Root `npm run lint` failed at `@warden/db:build` with EPERM because the running dev server locks the Prisma engine DLL (environmental). |
| `npm run test` | 0 | 78 tests (10 new) |
| `npm run check:boundaries` | 0 | |
| `npm run db:validate` | 0 | |
| `dotnet build apps/agent/Warden.sln` | 0 | 0 warnings, 0 errors |
| `npm run db:push` | 0 | 2026-11-24, Supabase (ap-southeast-1 pooler). `ChildMessage` table, `Nudge.replyToMessageId` and `User.notifyChildMessages` are live. The dev server was restarted and `auth.me` with the new pref ran clean (no server errors). |
| `build-installer.ps1` | 1 | `dotnet publish` failed with MSB3027 because the running portable Warden.Tray (0.6.27) locks the publish folder. No 0.6.28 MSI yet. Quit the tray and rerun. |
| `build-installer.ps1` (rerun, tray closed) | 0 | ICE61 warning only (expected). MSI `apps/agent/artifacts/Warden-0.6.28-x64.msi`, 88,713,542 bytes, SHA-256 `e546161463624a25daadf9ced7dae2f5d19f4a71bd1004941d54c834257aa2b6`. Portable `Warden.Tray/bin/Release/net8.0-windows/win-x64/publish/`: Tray/Core/LockUI FileVersion 0.6.28.0. |

Not verified: end-to-end on a real child PC, the phone push, and the look of the tray panel and Reply dialog.

## Before deploy (required)

Run `npm run db:push` **before** the web deploy. `auth.me` selects `notifyChildMessages`, and sending a reply touches `ChildMessage`. Without them the dashboard fails to load. The local dev server shares the production DB, so it is affected too until the push.

## Owner test

1. `db:push`, restart the local dev server (it holds the old Prisma engine), deploy web, install agent 0.6.28 MSI / portable.
2. Tray → **Message** → **Need help** → "Sent to your parent!". The dashboard shows a top toast "Message from {child}" and a phone push (app closed). Activity shows the row with **Reply**.
3. Send again within 30 s → the tray says to wait N s.
4. Activity → **Reply** → "On my way" → the child's PC shows the nudge overlay. The child can answer as usual, the row shows "Replied", and the nudge row reads "Replied to a message".
5. Settings → "Messages from children" off → no push (toast still shows in-app).

## Bugfix: no toast or push in production (2026-11-24, web 0.8.26)

**Symptom:** a message from the tray saved and showed in Activity, but neither the dashboard toast nor the phone push arrived.

**Evidence:** the message row saved at 17:52 UTC, the family's only parent had `notifyChildMessages = true` and one Android `PushToken` (17:01). So the recipients were fine. The broadcast and the FCM send were both fire-and-forget (`void …`) and ran right before `return`. On Vercel the function can be frozen once the response is sent. The realtime send first subscribes the device channel (up to 800 ms when cold), so both were likely cut off. This can't be reproduced on the local dev server, which never freezes. No Vercel log access was available to confirm it directly.

**Fix:** `sendMessage` and the `ackNudge` seen path now `await Promise.allSettled([broadcast, push])` before responding. Errors are logged (`[realtime]` / `[fcm]`) and never fail the child's send. The push result is logged (`[fcm] child message notify { sent, failed }`) so Vercel logs show the outcome.

| Command | Exit |
|---|---|
| `npm run typecheck -w @warden/api -w @warden/web` | 0 |
| `npm run lint -w @warden/web` | 0 |
| `npm run test` | 0 (78) |
| `npm run check:boundaries` | 0 |

Version: web 0.8.25 → **0.8.26**. Agent unchanged (server-only fix).
