# Mobile Edit limits: time trigger type + border

**Status:** in progress  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

On phone Edit limits, time values read larger and the triggers look like fields (not faint outlines on the day card). Desktop schedule editor unchanged. Nested hour/minute popover columns unchanged. No bump/push until asked.

## Why

Current trigger uses `max-md:text-base` on a `size="sm"` Button (`text-sm`) — that fight often loses. Even when `text-base` wins, it is smaller than Nudge/Grant `text-lg` fields. `border-border` + `bg-transparent` blends into the day card.

## Locked

| Piece | Mobile | Desktop |
|--------|--------|---------|
| Time value | `text-lg md:text-sm` on the display span (not `max-md:`) | `md:text-sm` |
| Trigger height | keep `min-h-14` from editor | `md:h-10 md:min-h-10` |
| Trigger border/bg | `border-foreground/25 bg-background` on TimePicker Button | `md:border-border md:bg-transparent` |
| “to” | `text-base md:text-sm` + keep `max-md:text-center` | text-sm |
| Popover columns | unchanged | unchanged |
| Theme | tokens only — no Maiev greens | — |

Do **not** use `border-primary/*` (competes with checkboxes / Add another window). Do **not** use `border-2`.

## Files

- `apps/web/src/components/ui/time-picker.tsx` — display span type; Button border/bg + md reset
- `apps/web/src/components/allowed-windows-editor.tsx` — drop `max-md:text-base` on TimePicker className (type lives on the span); bump “to”; keep `max-md:w-full max-md:min-h-14`

## Out of scope

Sheet title/description, Done button, presets, day names, timeline bar, 5-min step, navbar.

## Phase log

### Phase 1 — Implement (Composer 2.5, 2026-09-12)

**Changes:**

- `time-picker.tsx` — Button: added `border-foreground/25 bg-background md:border-border md:bg-transparent`; display span: `max-md:text-base` → `text-lg md:text-sm`
- `allowed-windows-editor.tsx` — TimePicker className: dropped `max-md:text-base` (both start/end); “to” span: `text-sm` → `text-base md:text-sm`

**Validation:**

- `npm run typecheck -w @warden/web` — exit 0

## Acceptance

- [ ] Phone: time values clearly larger; pickers read as fields
- [ ] Desktop Edit schedule pickers still compact / faint outline
- [x] `npm run typecheck -w @warden/web` exit 0

## Next step

Owner visual test on phone + desktop Edit limits.
