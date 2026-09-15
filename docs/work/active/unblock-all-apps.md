# Unblock all apps (Visible apps)

**Status:** shipped (web 0.8.20)  
**Started:** 2026-09-15  
**Orchestrator:** Cursor Grok 4.6  
**Executor:** Composer 2.5

## Goal

Parents can clear the whole blocked-apps list from the Visible apps card in one action, instead of tapping each chip.

## Locked

| Topic | Choice |
|-------|--------|
| API | New `policy.unblockAllApps` (`childId` only). Set `blockedProcessNames` to `[]`. Do **not** loop `unblockApp` on the client. |
| Empty list | No-op: no audit, no broadcast. |
| Broadcast | Same `policy:updated` per device as `unblockApp` when the list actually changed. |
| Audit | One `apps_unblocked` with `{ childId, processNames, count }`. Label: "Unblocked all apps". Icon: `Ban`. Detail: `${count} apps`. |
| UI | "Unblock all" in the Blocked apps header (next to the heading). Per-chip X stays. Button only when list is non-empty. Style: `outline` + `text-destructive` (same red as chip X; not filled primary). |
| Confirm | `ConfirmDialog` before bulk unblock. Title: `Unblock all apps?` Description: `Warden will stop blocking these apps on this child's PCs.` Confirm: `Unblock all`. Variant: `default`. Individual unblock stays immediate. |
| Card API | `onUnblockAll: () => void`. Reuse `unblockBusy` for single + bulk. Confirm `busy={unblockBusy}`. |
| Demo | Wire `unblockAllApps` in demo provider + demo child page. |
| Out of scope | Agent, schema, version bump, commit/push, MSI, mobile shell. |

## Acceptance

- [x] Non-empty Blocked apps section shows **Unblock all**.
- [x] Confirm → list clears, chips disappear (demo QA). Live dashboard + agent `policy:updated` still owner-side.
- [x] Empty list: mutation is a no-op (no audit).
- [x] Demo child detail can clear the list the same way.
- [x] `npm run typecheck` — see Phase 1 (root turbo blocked by Prisma EPERM; `@warden/api` + `@warden/web` exit 0).
- [x] `npm run check:boundaries` exit 0.

## Phase log

### Phase 0 — plan lock

- Date: 2026-09-15
- Next: Composer 2.5 implements.

### Phase 1 — implementation (Composer 2.5)

- Date: 2026-09-15
- Files changed:
  - `packages/api/src/routers/index.ts` — `policy.unblockAllApps` mutation
  - `apps/web/src/lib/activity.ts` — `apps_unblocked` label, icon, detail
  - `apps/web/src/components/visible-apps-card.tsx` — header button + confirm dialog
  - `apps/web/src/app/dashboard/children/[id]/child-visible-apps-section.tsx` — tRPC wire-up
  - `apps/web/src/lib/demo/demo-provider.tsx` — demo `unblockAllApps`
  - `apps/web/src/app/demo/children/[id]/page.tsx` — demo wire-up
- Commands:
  - `npm run typecheck` → exit **1** (Prisma `EPERM` on `query_engine-windows.dll.node` rename during `@warden/db#build`; unrelated to this change)
  - `npm run typecheck -w @warden/api` → exit **0**
  - `npm run typecheck -w @warden/web` → exit **0**
  - `npm run check:boundaries` → exit **0**
- Remaining risks:
  - Live dashboard + agent `policy:updated` still owner-side (browser session not available here).
  - Root `npm run typecheck` may need retry if another process holds the Prisma query engine DLL.

### Phase 2 — orchestrator review + demo QA

- Date: 2026-09-15
- Code review: matches locked plan (API, activity, card confirm, live + demo wiring). No follow-up code changes.
- Browser: demo child Alex — **Unblock all** shown; confirm **Unblock all apps?**; after confirm, Roblox chip gone; activity **Unblocked all apps · 1 app**.
- Live child page redirected to sign-in (no session in automation browser).

### Phase 3 — Unblock all more noticeable

- Date: 2026-09-15
- `visible-apps-card.tsx`: ghost → `outline` + `text-destructive` / `hover:bg-destructive/10` (matches chip X, same chrome as Clear bonus).
- Demo screenshot: bordered red-text button, not a filled primary.

### Phase 4 — bump + push

- Date: 2026-09-15
- Web **0.8.19 → 0.8.20** (`apps/web/package.json`, `@warden/shared` + `APP_VERSION`). Agent/mobile unchanged.
