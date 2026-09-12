# Mobile Edit limits: stacked time triggers

**Status:** ready for owner visual test  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Stop mis-taps on Edit limits day rows. Stack start/end as **full-width** time triggers on mobile. Desktop schedule editor unchanged. No version bump / push until asked. Owner tests locally (dev already running).

## Locked

| Decision | Choice |
|----------|--------|
| Day row layout (mobile) | Stack: day header full width, then start TimePicker `w-full`, “to”, end TimePicker `w-full`, timeline, add-window |
| Day row layout (md+) | Keep current: checkbox + pickers on one wrapping row |
| Time trigger (mobile) | `min-h-14 w-full text-base`; hide Clock icon (`max-md:hidden`) |
| Time trigger (desktop) | Keep current `md:h-10 md:min-h-10` + icon |
| Day header | Mobile: `min-h-11` label row, checkbox `h-5 w-5`, day name `text-base` |
| Presets | Optional: `max-md:text-base` on title; keep 2-col min-h-11 |
| Policy active (sheet) | Label `text-base` |
| Out of scope | Nested time sheet, native `input type=time`, 5-min step (already), BottomSheet chrome, bump/push |

## Implementation notes

`apps/web/src/components/allowed-windows-editor.tsx`:
- Day card: `flex flex-col gap-3 max-md:...` vs `md:flex-row` for the checkbox + times block.
- Time picker row: `flex flex-col gap-2 max-md:...` and `md:flex-row md:flex-wrap md:items-center`.
- Pass `className="max-md:w-full max-md:min-h-14 max-md:text-base"` into TimePicker if it forwards to the Button.

`apps/web/src/components/ui/time-picker.tsx`:
- Clock: `max-md:hidden` (or `hidden md:inline` / `md:flex`).
- Ensure `className` on TimePicker merges onto the trigger Button (already does).
- `min-h-14` + existing `md:h-10 md:min-h-10`.

`child-policy-section.tsx` sheet Policy active span: `text-base` on sheet mode.

## Acceptance

- [ ] On phone, each day’s start and end are stacked full-width, easy to tap separately
- [ ] Desktop Edit schedule still side-by-side pickers
- [ ] 5-minute picker popover still works
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

**2026-09-12 — Implement stacked mobile day rows**

Files changed:
- `apps/web/src/components/allowed-windows-editor.tsx` — mobile day header row (`min-h-11`, `h-5 w-5`, `text-base`); stacked full-width TimePickers + centered “to”; presets `max-md:text-base`; disabled day `max-md:text-sm`
- `apps/web/src/components/ui/time-picker.tsx` — Clock `hidden md:block`; display `max-md:text-base`; anchor `max-md:w-full` for full-width triggers
- `apps/web/src/app/dashboard/children/[id]/child-policy-section.tsx` — sheet Policy active label `text-base`

Validation: `npm run typecheck -w @warden/web` → exit 0

## Next step

Owner local visual test of Edit limits on phone.
