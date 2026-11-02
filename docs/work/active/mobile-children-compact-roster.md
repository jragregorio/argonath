# Mobile Children compact roster

**Status:** complete (web 0.8.22)  
**Started:** 2026-11-02  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Mobile Children tab becomes a compact stacked roster. Online kids get a slightly richer row; offline kids stay short. Desktop grid is unchanged. Option B (Now + Away grouping) is parked until the owner asks after testing.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Direction | **A — compact roster** (not B Now/Away grouping) |
| Breakpoint | Mobile `max-md` only; `md+` card grid stays as today (rename, delete, device badges, versions) |
| Online | Any device `isOnline`; **all** online kids get the richer row (never collapse to one) |
| Offline | Compact row: name + Offline / last seen (or “No devices paired”) |
| All offline | Everyone compact |
| Sort | Keep API order (`createdAt` asc). Do **not** sort online first |
| Remaining | Online row shows a **one-line** remaining string from existing policy display helpers |
| Remaining data (live) | Parallel `dashboard.overview` query keyed by `childId`. **Do not** change `children.list` / API |
| Remaining missing | Omit remaining; still show device name + Online chip |
| Last seen | Max `lastSeenAt` among the child’s devices via `formatRelativeTime`. Demo has no `lastSeenAt` → `"Offline"` is enough |
| Actions on mobile list | No pencil, no Delete. Rename/delete stay on child detail (`⋯` / desktop header) |
| Navigation | Whole row tap → child detail (`role="link"`, Enter/Space). Add-child form unchanged |
| Demo | `apps/web/src/app/demo/children/page.tsx` matches the mobile/desktop split |
| Overview / child detail / nav | Untouched |
| Version bump / deploy | Web **0.8.22** (this commit) |

## Acceptance

- [x] Mobile list is a stacked compact roster, not equal-height cards. (code)
- [x] Online rows are slightly richer (name + remaining one-liner + device name(s) + Online chip). Multiple online kids all richer. (code)
- [x] Offline rows are short (name + Offline/last seen). No Delete/rename on the row. (code)
- [x] Desktop Children cards unchanged (grid, badges with version, pencil, Delete). (code)
- [x] Demo Children list matches. (code)
- [x] `npm run typecheck -w @warden/web` and `npm run check:boundaries` recorded with real exit codes.
- [ ] Owner local visual test (phone + desktop)

## Phase log

### Phase 0 — plan lock (2026-11-02)

Owner chose A. B parked until after testing.

### Phase 1 — implementation (2026-11-02)

**Files changed**

- `apps/web/src/components/child-roster-list.tsx` (new) — shared mobile compact roster
- `apps/web/src/app/dashboard/children/page.tsx` — parallel `dashboard.overview` query; mobile roster + hidden desktop grid
- `apps/web/src/app/demo/children/page.tsx` — same mobile/desktop split
- `apps/web/src/components/dashboard-skeletons.tsx` — `ChildrenListSkeleton` mobile row skeletons

**Commands**

```text
npm run typecheck -w @warden/web  → exit 0
npm run check:boundaries          → exit 0
```

**Next step**

Owner: local visual test on phone (`max-md` roster) and desktop (`md+` cards unchanged).

### Phase 2 — orchestrator review (2026-11-02)

Matches locked A. Desktop cards preserved; mobile uses shared `ChildRosterList`; remaining from parallel overview query; last-seen from `children.list`. No API change, no version bump.

Non-blocking: online rows stack remaining and device names as two muted lines (still compact vs old cards). Combine into one subtitle after testing if it feels tall.

### Phase 3 — bump + push (2026-11-02)

Owner approved look. Web **0.8.21 → 0.8.22**. Agent/mobile unchanged. Agent virtual-desktop work left unstaged.
