# Mobile: enlarge Grant bonus sheet

**Status:** in progress  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Match Nudge compose (second pass) type on **Grant bonus screen time**. Desktop Modal unchanged. No bump/push until asked.

## Locked

Same scale as Nudge second pass. Mobile-first `text-lg md:text-sm` — not `max-md:` vs `text-sm`.

| Piece | Mobile | Desktop |
|--------|--------|---------|
| Title | `titleClassName="text-xl"` | Modal unchanged |
| Subtitle | `descriptionClassName="text-base leading-relaxed"` | Modal unchanged |
| Custom minutes label | `text-lg md:text-sm` | md:text-sm |
| Input | keep `max-w-[10rem]`; add `min-h-14 text-lg md:h-10 md:min-h-10 md:text-sm` | h-10 text-sm |
| Hint | `text-base md:text-xs` | text-xs |
| Preset chips | `min-h-12 px-3 py-2 text-base md:min-h-0 md:px-2.5 md:py-1.5 md:text-xs` (drop `max-md:min-h-11`) | small |
| Cancel / Grant | `text-lg` (mobileFooter only); Grant icon `h-5 w-5` | desktopFooter unchanged |

## Files

- `apps/web/src/app/dashboard/children/[id]/child-usage-header.tsx`
- `apps/web/src/app/demo/children/[id]/page.tsx` — same form/footer/sheet props

Do **not** change: inline “Grant bonus” header chip, child ⋯ action sheet, ConfirmDialog, Nudge, Edit limits, navbar.

## Acceptance

- [ ] Phone Grant bonus sheet matches Nudge type (owner visual test)
- [ ] Desktop Grant bonus Modal still compact (owner visual test)
- [ ] `npm run typecheck -w @warden/web` exit 0

## Phase log

### 2026-09-12 — Plan lock

Owner: proceed with Grant bonus at Nudge second-pass scale.

### 2026-09-12 — Implementation

**Files edited:**
- `apps/web/src/app/dashboard/children/[id]/child-usage-header.tsx`
- `apps/web/src/app/demo/children/[id]/page.tsx`

**Changes (both files, mirrored):**
- Preset chips: `min-h-12 text-base … md:min-h-0 md:px-2.5 md:py-1.5 md:text-xs` (dropped `text-sm`, `max-md:min-h-11`)
- Label: `text-lg md:text-sm`
- Input: `max-w-[10rem] min-h-14 text-lg md:h-10 md:min-h-10 md:text-sm`
- Hint: `text-base text-muted-foreground md:text-xs`
- Split `grantBonusFooter` → `desktopFooter` (unchanged compact) + `mobileFooter` (`text-lg`, ClockPlus `h-5 w-5`)
- Modal → `desktopFooter`; BottomSheet → `mobileFooter` + `titleClassName="text-xl"` + `descriptionClassName="text-base leading-relaxed"`

**Command:** `npm run typecheck -w @warden/web`  
**Exit code:** 0

## Next step

Owner local visual test (phone BottomSheet vs desktop Modal).
