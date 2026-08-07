# Activity log: show who/device for approved screen time

**Status:** complete (awaiting owner smoke)  

**Started:** 2026-08-08  
**Orchestrator:** Cursor Grok 4.5  
**Executor:** Composer 2.5

## Problem

`extension_approved` (and `extension_denied`) activity rows show only `+N min · by Parent`, missing child/device. Neighboring rows (e.g. `bonus_cleared`, captures) show `TESTPC · …`.

Root cause: `extensions.resolve` audits with `{ requestId, minutes }` only. `dashboard.activity` resolves `childName`/`deviceName` from metadata `childId` / `deviceId`.

## Goal

Activity detail for approve/deny must identify **which child (and device) the extra screen time was granted/denied for**, matching other activity rows.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| What to show | Child name + device name + minutes (existing `formatActivityDetail` once IDs present) |
| New audit fields | Always include `childId` + `deviceId` on `extension_approved` / `extension_denied` |
| Historical logs | Also resolve via `requestId` → `ExtensionRequest` when `childId`/`deviceId` missing (same pattern as nudge message backfill) |
| UI formatter | Prefer no change if names already flow; only touch `activity.ts` if needed |
| Demo | Keep demo paths consistent (`childName`/`deviceName` already set; add ids in metadata if useful) |
| Version bump / commit / push | **No** — orchestrator only unless owner asks |

## Acceptance criteria

1. Approving (and denying) an extension produces an activity row with child and device in the detail line (e.g. `TESTPC · JRAG-TUF · +60 min · by …`).
2. New audits from `extensions.resolve` include `childId`, `deviceId`, `requestId`, `minutes`.
3. Older audits that only have `requestId` still resolve names when the request still exists.
4. `npm run typecheck -w @warden/web -w @warden/api` and `npm run check:boundaries` exit 0.
5. No commit/push/version bump by executor.

## Phase log

### Phase 0 — diagnosis (orchestrator)

- Confirmed screenshot gap vs `bonus_cleared`.
- Audit write at `packages/api/src/routers/index.ts` (~1164–1181) omits ids.
- Activity join at ~1522–1549 requires `meta.deviceId` / `meta.childId`.

### Phase 1 — implementation

**Files changed:**
- `packages/api/src/routers/index.ts`

**Write path:** Both `extensions.resolve` `logAudit` calls (`extension_approved` / `extension_denied`) now include `childId` and `deviceId` alongside `requestId` and `minutes`.

**Read path:** `dashboard.activity` collects `requestId`s from historical extension audits missing `childId`/`deviceId`, batch-loads `ExtensionRequest` rows scoped to the family, merges ids into metadata before name resolution (same pattern as nudge message backfill). Child/device ids from backfilled requests are included in the single batch fetch for names — no N+1.

**UI:** No change — `formatActivityDetail` already prints `childName` / `deviceName` / `+N min` once names flow from API.

**Validation (real exit codes):**
- `npm run typecheck -w @warden/web -w @warden/api` → **0**
- `npm run check:boundaries` → **0**

**Follow-ups (optional, not done):**
- Child-filtered activity query still won't match historical extension audits without `childId`/`deviceId` in stored metadata (read backfill does not affect Prisma `where` filters).
- Demo metadata could add `childId`/`deviceId` for consistency (demo already sets `childName`/`deviceName`).

**Next:** Manual smoke — approve/deny an extension and confirm activity detail shows child + device + minutes on the All activity feed.
