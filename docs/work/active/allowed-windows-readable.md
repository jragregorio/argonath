# Allowed windows: stacked schedule rows

**Status:** in progress  
**Started:** 2026-08-05  
**Executor:** Composer 2.5 (subagent)

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Layout | **A — Stacked schedule rows** (days left, times right; stack on narrow if needed) |
| Grouping | Keep same range-grouping as `formatWindowsSummary` today |
| Empty | Still “Allowed any time (within daily limit)” |
| Surfaces | Child detail summary + Edit limits sheet / policy panels that use the summary string |
| Deploy | Push after impl; **no version bump** |

## Implementation hints

- Prefer a small component e.g. `AllowedWindowsSummary` that renders a list from `AllowedWindow[]`, reusing grouping logic from `formatWindowsSummary` in `apps/web/src/lib/time-format.ts` (extract `groupWindowsByRange` helper; keep string formatter if still needed elsewhere or deprecate callers).
- Replace `formatWindowsSummary(...)` text dumps in `children/[id]/page.tsx` (and any other UI that shows this dense paragraph) with the stacked component.
- Desktop: `flex justify-between` / grid per row. Mobile: same or days above times if cramped — prefer one consistent row layout that wraps cleanly.
- Do not commit/push/bump (orchestrator will push).

## Acceptance criteria

1. Allowed windows show as stacked rows, not one `·`-joined paragraph.
2. Empty / any-time copy unchanged in meaning.
3. `npm run typecheck -w @warden/web` exit 0.

## Phase log

### Phase 0 — plan lock

- Owner chose A; push without bump.

### Phase 1 — implementation

- Extracted `groupWindowsByRange`, `formatDayLabels`, `ALLOWED_ANY_TIME_MESSAGE` in `apps/web/src/lib/time-format.ts`; `formatWindowsSummary` now delegates to shared grouping.
- Added `apps/web/src/components/allowed-windows-summary.tsx` — stacked rows (days left, times right; `flex-wrap` on narrow).
- Replaced all three `formatWindowsSummary` call sites in `children/[id]/page.tsx` (policy card, mobile summary, Edit limits sheet).
- `npm run typecheck -w @warden/web` → exit 0.
