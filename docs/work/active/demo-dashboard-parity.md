# Demo dashboard UI parity

**Status:** complete (local)  
**Started:** 2026-08-06  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Source of truth | `overview-client.tsx`, `children/page.tsx`, `children/[id]/page.tsx`, `activity/page.tsx` |
| Scope | `apps/web/src/app/demo/**`, `components/demo/**`, `lib/demo/**` only |
| Marketing mocks | Do not touch (`product-panels`, `dashboard-preview`, etc.) |
| Snapshots | No Snapshots page/nav in demo |
| Demo chrome | Keep banner, signup prompt, feedback toast |
| Overview mobile devices | Compact status-only rows; tap → child detail |
| Overview desktop devices | Full NudgeControls + SwipeToLock / Release |
| Children list | Read-only; whole-card navigation; no add/rename/delete |
| Child detail policy | Read-only "Screen time policy" card with AllowedWindowsSummary |
| Alex allowed windows | Weekdays after-school (Mon–Fri 15:00–20:00) |
| Sam allowed windows | Empty (= any time) |
| Interactive actions | Overview (desktop) + child detail (mobile) |
| Deploy | No commit/push/version bump from this task |
| Signup prompt | Max 2/session: 1st on first action; 2nd after 5 actions or 2.5 min post-dismiss |

## Acceptance criteria

1. Demo Overview matches real dashboard layout (stats, device row split, no Manage footer link).
2. Demo Children list matches real list chrome (card nav, badges, grid).
3. Demo child detail shows read-only policy card with allowed windows.
4. Demo Activity uses `formatRelativeTime` for pending timestamps.
5. `npm run typecheck -w @warden/web` and `npm run check:boundaries` recorded with real exit codes.

## Phase log

### Phase 0 — plan lock

- Owner approved executor plan; marketing mocks and Snapshots out of scope.

### Phase 1 — implementation

**Files changed:**
- `docs/work/active/demo-dashboard-parity.md` (created)
- `apps/web/src/app/demo/page.tsx`
- `apps/web/src/app/demo/children/page.tsx`
- `apps/web/src/app/demo/children/[id]/page.tsx`
- `apps/web/src/app/demo/activity/page.tsx`
- `apps/web/src/components/demo/demo-nav.tsx`
- `apps/web/src/lib/demo/types.ts`
- `apps/web/src/lib/demo/fixtures.ts`

**Overview:**
- PageHeader always visible; mobile stats 2-col (Children, Online); desktop summary 2-col (no Pending card).
- Mobile device rows compact (name + badges) → tap navigates to child detail; desktop keeps NudgeControls + SwipeToLock.
- Removed per-child "Manage {name}" footer link; removed History import.

**Children list:**
- Whole-card navigation (`role="link"`, Enter/Space, hover/focus).
- Layout matches real dashboard: User icon in title, device badges, "Manage profile →" with stopPropagation.
- Grid `md:grid-cols-2 lg:grid-cols-3`; updated read-only notice copy.

**Child detail:**
- Replaced "Today's screen time" with read-only "Screen time policy" card (daily limit, status badge, AllowedWindowsSummary, usage progress, editing note).
- Added `allowedWindows` + `policyActive` to DemoChild; Alex Mon–Fri 15:00–20:00, Sam empty (any time).
- Softened PageHeader description; kept interactive Devices card.

**Activity:**
- Pending timestamps use `formatRelativeTime` / `formatAbsoluteTime` from `@/lib/format-relative-time`.

**Nav:**
- Footer blurb updated to mention Overview (desktop) and child detail (mobile) for nudge/lock.

**Validation:**
```bash
npm run typecheck -w @warden/web
# exit 0

npm run check:boundaries
# exit 0
```

### Phase 2 — second signup prompt (late)

**Decision:** Cap at 2 prompts per tab session. First on first interactive action; second after 5 total actions **or** 2.5 min since first dismiss (whichever first); then stop.

**Files:**
- `apps/web/src/lib/demo/fixtures.ts` — session keys + `SIGNUP_PROMPT_SECOND_MIN_ACTIONS` / `SECOND_DELAY_MS`
- `apps/web/src/lib/demo/demo-provider.tsx` — action count, dismiss count, delayed second open

**Validation:** (record below)

```bash
npm run typecheck -w @warden/web
# exit 0
```
