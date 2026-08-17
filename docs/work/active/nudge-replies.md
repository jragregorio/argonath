# Nudge replies (canned + one typed line)

**Status:** shipped (web 0.8.17, agent 0.6.26)  
**Started:** 2026-08-17  
**Executor:** Composer 2.5  
**Orchestrator:** session owner

## Goal / acceptance

Child can answer a parent nudge from the Windows overlay: canned buttons plus one optional typed line. Parent sees the answer live on the device chip (and a toast for meaningful replies) and later on the same Activity row. No Messages nav. No FCM this cut. No version bump. No commit/push.

**Locked UX**

| Child action | Parent chip / toast / Activity |
|---|---|
| OK (no typed text) | Chip: `OK`. No toast. Clear chip in 5s (same as today’s Seen). |
| On my way | Chip: `On my way`. Toast. Hold chip ~20s. |
| Need a few minutes | Chip: `Need a few minutes`. Toast. Hold chip ~20s. |
| Typed line (any button) | Chip quotes truncated text. Toast quotes text. Hold chip ~20s. Typed text wins over canned label. |
| Auto-dismiss (45s) | Treat as `ok`, **ignore** unsent typed text. Chip `OK`, 5s clear, no toast. |

Overlay: existing 5s OK delay still applies to all reply buttons. Text field enabled during delay. Time-remaining / blocked-app / extra-time windows unchanged (no reply UI).

**Acceptance**

- [x] Nudge overlay: optional reply field (max 200) + buttons OK / On my way / Need a few minutes.
- [x] `ackNudge` stores canned `response` + optional `responseText`; broadcasts both on `nudge:seen`.
- [x] Overview (desktop) + child device card chip shows formatted reply; timing per table above.
- [x] Toast on meaningful replies (`on_my_way`, `need_a_few`, or non-empty typed text): `{child} replied: …`.
- [x] Activity `nudge_sent` row shows parent quote (existing) plus `Replied: …` when a reply exists.
- [x] Demo dashboard simulates a meaningful reply (not only “Seen”).
- [x] Time-warning / blocked-app overlays unchanged.
- [x] No FCM, no Messages route.
- [x] `npm run typecheck -w @warden/web -w @warden/api -w @warden/shared`, `npm run check:boundaries`, `dotnet build apps/agent/Warden.sln` — record real exit codes.

## Storage / API

`Nudge.response` stays a string. Allowed canned values: `ok` | `on_my_way` | `need_a_few`.

Add `Nudge.responseText String?` (trim, max 200). Empty → null.

`ackNudge` input:

```
status: delivered | seen | expired
response: ok | on_my_way | need_a_few (optional; default ok on seen)
responseText: string optional, trim, max 200
```

Broadcast `nudge:seen` payload: `{ nudgeId, response, responseText }`.

`getNudge` select: include `responseText`.

Activity: for every `nudge_sent` with `nudgeId`, load Nudge (`message`, `response`, `responseText`) and merge into metadata so replies show even when the send-time audit already has `message`. Do **not** add a second audit row.

## Parent UI

- Shared formatter in `@warden/shared` (labels + “typed text wins”).
- `use-device-actions.ts`: read `response` / `responseText` from poll + realtime; format chip; toast via existing `getChildLabel`; `clearNudgeSoon` 5s vs 20s; invalidate `dashboard.activity` on seen so Activity updates.
- Chip surfaces already exist: `overview-client.tsx` (desktop device card) and `child-devices-section.tsx`. Allow wrap for a quoted line.
- `activity.ts` + `recent-activity-card.tsx`: second line `Replied: …` under the parent quote.
- `family-realtime.tsx`: on `nudge:seen`, invalidate `dashboard.activity` only (do not broaden the current “nudge rows only” skip for other queries).

## Agent

- `AttentionWindow`: optional nudge-reply mode (text field via `UiTheme.TextField`, MaxLength 200, placeholder e.g. `Reply (optional)`). Secondary buttons On my way / Need a few min; primary OK. Expose `Response` (`ok` / `on_my_way` / `need_a_few` / `auto`) and `ReplyText`. Widen ~480 like extension layout.
- `ShowNudge`: ack `seen` with button response + trimmed text; auto → `ok` and no text.
- `WardenApiClient.AckNudgeAsync` / `EnforcementEngine.AckNudgeAsync`: pass `responseText`.
- Do not change time-warning / blocked-app constructors.

## Out of scope

FCM, Messages nav, child-initiated compose, iOS.

## Commands / results

| Command | Exit code | Notes |
|---------|-----------|-------|
| `npm run typecheck -w @warden/web -w @warden/api -w @warden/shared` | 0 | After `db:push` regenerated Prisma client (first run was 2 before generate). |
| `npm run check:boundaries` | 0 | |
| `dotnet build apps/agent/Warden.sln` | 0 | |
| `npm run db:push` | 0 | `responseText` column applied; Prisma Client generated. |

## Orchestrator follow-up (2026-08-17)

Reviewed [Implement nudge replies](a444c807-c518-4d00-91d0-21b07546a5d4) output. Spec match is good. Small parent-UI fixes:

- Activity reply line only for meaningful replies (`on_my_way` / `need_a_few` / typed text) so historical `ok` acks do not all show `Replied: OK`.
- Chip toast/invalidate/clear run once per nudge (poll was re-firing every 2s).
- Typed-text toast is quoted.

## Bugfix (local test)

Activity did not show the typed reply because `ShowNudge` read `_replyField.Text` inside `Task.Run` (background thread). WPF throws; the seen ack was swallowed. Snapshot `ReplyText` on the UI thread in `CloseWithResponse`, then ack with that string.

## Overlay compact UI (2026-08-17)

Initial nudge card: **Reply** | **OK** side by side (420px). Reply expands the card to show the optional text field + On my way / Need a few min; OK goes full width. 5s delay still applies to both initial buttons. Auto-dismiss unchanged.

## Shipped

Web **0.8.17**, agent **0.6.26**. Push deploys the dashboard/API; child PCs need a new tray/MSI install (auto-update Phase 3 not live).

## Next step

Install agent 0.6.26 on the child PC after Vercel deploy. Archive this task when that install is confirmed.
