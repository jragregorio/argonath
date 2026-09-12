# Mobile: enlarge Screen time policy glance

**Status:** ready for owner visual test  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Make the child-detail **Screen time policy** summary (min/day + day/time list + Edit limits label) easier to read on phone, similar to Visible apps titles. Card title/padding unchanged. Desktop editor unchanged. No bump/push until asked.

## Locked

| Decision | Choice |
|----------|--------|
| Title / description | Keep CardTitle `text-lg` and CardDescription `text-sm` |
| `840 min/day` | `max-md:text-base max-md:font-semibold` on the mobile summary line |
| Day + time rows | `AllowedWindowsSummary`: `max-md:text-base` + `max-md:space-y-2` (keep `text-sm` as base for desktop) |
| Edit limits button | Add `text-base` (mobile-only button already `md:hidden`) so it overrides Button `text-sm` |
| Summary box | Optional `max-md:px-4 max-md:py-3` — modest, not a padding blow-up |
| Out of scope | Edit limits sheet, desktop policy editor, Card `p-6`, bump/push |

## Files

- `apps/web/src/app/dashboard/children/[id]/child-policy-section.tsx` — mobile summary block + Edit limits button
- `apps/web/src/components/allowed-windows-summary.tsx` — `max-md:text-base max-md:space-y-2` on the list; empty-state `max-md:text-base`

Desktop `md:` / inline card summary in card mode still `text-sm`.

## Acceptance

- [x] On phone, policy glance days/times and min/day read at `text-base`
- [x] Edit limits label is `text-base`
- [x] Desktop policy card still dense `text-sm`
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

**2026-09-12 — Implement mobile policy glance type**

Files changed:
- `apps/web/src/app/dashboard/children/[id]/child-policy-section.tsx` — mobile summary `px-4 py-3`, min/day `text-base font-semibold`, Edit limits `text-base`
- `apps/web/src/components/allowed-windows-summary.tsx` — empty state + list `max-md:text-base`, list `max-md:space-y-2`

Validation: `npm run typecheck -w @warden/web` → exit 0

### Orchestrator review

`text-sm` + `max-md:text-base` can lose to `text-sm` on phone (same issue as Confirm buttons). Switched summary to mobile-first `text-base md:text-sm` and `space-y-2 md:space-y-1`.

## Next step

Owner local visual test on phone (child detail Screen time policy card).
