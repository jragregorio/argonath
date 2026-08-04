# Requests tab → Activity (pending + history)

**Status:** complete (web v0.7.0 — pushed)  
**Started:** 2026-08-04  
**Completed:** 2026-08-05  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Nav label | **Requests → Activity** (mobile bottom tab + desktop sidebar) |
| Icon | Prefer `History` or `Activity` from lucide (Clock can stay if History is clearer) |
| Route | Prefer `/dashboard/activity` with redirect from `/dashboard/extensions` → `/dashboard/activity` (update nav href, badges, FCM `path` for extension notifies if hardcoded) |
| Page layout | (1) **Pending** extension requests with Approve/Deny on top (2) **All activity** family timeline below using existing `dashboard.activity` + `RecentActivityCard` patterns |
| Badge | Still pending-request count on the Activity tab href |
| Overview | Keep compact Recent activity; add “View all” link to Activity tab if easy |
| Extension-only history section | Fold into unified activity feed (don’t duplicate long extension history list if activity already covers approve/deny) — pending cards stay explicit |
| Deploy | Implement fully; **orchestrator will not bump/push unless owner asks** (local/deploy later) |

## Acceptance criteria

1. Nav shows **Activity** linking to the new page; old `/dashboard/extensions` still works (redirect).
2. Pending extensions still approve/deny with realtime/badge updates.
3. Below pending: scrollable family activity list (reuse labels from `apps/web/src/lib/activity.ts`).
4. `useNavBadges` / `badgeFor("/dashboard/…")` still works for the new href.
5. FCM extension `path` points at Activity (or still extensions if redirect — either OK if redirect exists).
6. `npm run typecheck -w @warden/web` (+ api if path strings in api) and `check:boundaries` exit 0.
7. No commit/push/bump by executor.

## Phase log

### Phase 0 — plan lock

- Owner approved Activity tab with pending pinned + full timeline.

### Phase 1 — implementation

**Files changed**

- `apps/web/src/components/dashboard-nav.tsx` — Activity tab: label, `History` icon, href `/dashboard/activity`
- `apps/web/src/lib/family-realtime.tsx` — `badgeFor` maps `/dashboard/activity` → `pendingRequests`
- `apps/web/src/app/dashboard/activity/page.tsx` — new page: Pending section + All activity (`limit: 100`, `RecentActivityCard` `initialVisible: 100`)
- `apps/web/src/app/dashboard/extensions/page.tsx` — server redirect to `/dashboard/activity`
- `apps/web/src/app/dashboard/overview-client.tsx` — links → `/dashboard/activity`; mobile stat label Activity; desktop card `History` icon; “View all →” on Recent activity
- `packages/api/src/routers/index.ts` — FCM extension notify `path: "/dashboard/activity"`

**Validation**

```bash
npm run typecheck -w @warden/web -w @warden/api  # exit 0
npm run check:boundaries                           # exit 0
```

**Next:** owner review / deploy; archive when accepted.
