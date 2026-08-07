# Policy remaining-time hierarchy (window vs budget)

**Status:** complete (deployed v0.8.8)  
**Started:** 2026-08-07  
**Orchestrator:** Cursor Grok  
**Executor:** Composer 2.5

## Problem

When the schedule window is the binding limit, the UI leads with `used / dailyLimit` and a budget progress bar. The true cutoff (“X min left until allowed hours end”) sits in muted `text-xs` copy and is easy to miss.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | Suggestion **1 + 3** only (lead with binding limit + urgency styling). No dual progress bars / effective-remaining bar fill (suggestion 4 deferred). |
| Surfaces | Real dashboard: `child-usage-header.tsx`, `overview-client.tsx`. Demo parity: `demo/page.tsx`, `demo/children/[id]/page.tsx`. |
| Shared helper | Prefer one small shared helper under `apps/web/src/` (e.g. `lib/policy-remaining-display.ts` + optional tiny presentational component) so copy/urgency stay consistent. Do not invent new packages. |
| Window-binding primary copy | `{N} min left today` (keep minutes; optional `Xh Ym` only if already natural — prefer simple `N min` for consistency with existing UI). |
| Window-binding secondary | `Allowed hours ending · {dailyRemaining} min of daily budget left` |
| Used today | Keep visible but secondary when window is binding (muted / not competing with primary). |
| Urgency thresholds | Window binding + `remainingMinutes <= 60` → warning/attention color (use existing theme tokens, e.g. yellow/warning — match nearby patterns). Window binding + `> 60` → `text-foreground` + `font-medium` (not muted). Non-window cases unchanged hierarchy. |
| Absolute end clock | Do **not** add “ends at 7:00 PM” unless already available on evaluation without new API fields. |
| Out of scope | Progress bar semantics change, policy engine changes, agent, API, commits/push. |

## Acceptance criteria

1. When `limitingFactor === "window"` and status is allowed, primary visual weight is remaining-until-hours-end, not `used/limit`.
2. Urgency styling applies when window-binding and remaining ≤ 60 min.
3. Overview child cards and child detail header match the new hierarchy.
4. Demo overview + demo child detail stay in parity.
5. `npm run typecheck -w @warden/web` recorded with real exit code.

## Phase log

### Phase 0 — plan lock

- User approved 1 + 3; executor summoned.

### Phase 1 — shared helper + UI surfaces

**Added**

- `apps/web/src/lib/policy-remaining-display.ts` — `getPolicyRemainingDisplay()`, window-binding detection, urgency class (`text-amber-700 dark:text-amber-300` when ≤60 min).
- `apps/web/src/components/policy-remaining-status.tsx` — `PolicyWindowRemainingPrimary`, `PolicyRemainingFooter`.

**Updated**

- `apps/web/src/app/dashboard/children/[id]/child-usage-header.tsx` — primary remaining above bar; used-today muted when window-binding.
- `apps/web/src/app/dashboard/overview-client.tsx` — same hierarchy on child cards.
- `apps/web/src/app/demo/page.tsx` — demo overview parity.
- `apps/web/src/app/demo/children/[id]/page.tsx` — demo child header + policy card parity.

**Validation**

```bash
npm run typecheck -w @warden/web
# exit 0
```

### Phase 2 — after-hours bonus footnote

- When window-binding + usable bonus remaining: muted line `+{N} min allowed after hours end`
- Usable amount matches policy-engine outside-window bonus (`bonus − max(0, used − dailyLimit)`)
- Wired via `PolicyRemainingFooter` (dashboard + demo pick up automatically)

**Validation**

```bash
npm run typecheck -w @warden/web
# exit 0
```
