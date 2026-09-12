# Mobile Edit limits: time picker focus

**Status:** ready for owner visual test  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6

## Goal

On phone, opening a time uses a **compact centered card** with a real dim over the Edit limits sheet. Desktop stays an anchored popover. No bump/push.

## Why not a second BottomSheet

Too strong — already inside Edit limits. A small centered dialog (iOS-style) is the right weight.

## Why dim-on-popover failed

The sheet panel is opaque `z-[60]`. Radix Popover portals could not reliably paint a scrim *on top of* that panel. Two overlay attempts were invisible.

## Locked (phase 3)

| Piece | Choice |
|--------|--------|
| Mobile | `createPortal` to `document.body`: `z-[80] bg-black/50` overlay + centered card (`left-1/2 top-1/2 -translate-*`) |
| Desktop | existing Radix Popover, no overlay |
| Dismiss | tap dim or Escape; picking hour/min/AM still does not auto-close |
| Overlay events | do not notify (sheet already did) |

## Files

- `apps/web/src/components/ui/time-picker.tsx`
- `apps/web/src/components/ui/popover.tsx` — revert unused `overlay` prop

## Acceptance

- [ ] Phone: tap time → centered columns, sheet greys, tap dim closes picker not the sheet
- [ ] Desktop: anchored popover, no dim
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

### Phase 1–2 — scrim on Popover (failed visually)

Standalone `z-[69]` portal, then same-portal `z-[70]` overlay. Owner: still no dim.

### Phase 3 — centered mobile dialog (2026-09-12)

Leave Radix Popover on `md+` only. Mobile: Modal-style portal, `z-[80]`, `bg-black/50`.

**Command:** `npm run typecheck -w @warden/web` → exit **0**

### Phase 4 — larger mobile picker (2026-09-12)

Owner: increase picker ~60–80% for tap targets.

- TimeColumn `size="comfortable"` on mobile: list `h-80` (~+67%), rows `min-h-[4.5rem]` (~+64%), type `text-2xl`
- Card `w-[min(22.5rem,calc(100vw-1.5rem))]` so columns fill the phone without overflowing
- Desktop `compact` popover unchanged

**Command:** `npm run typecheck -w @warden/web` → exit **0**

### Phase 5 — wider mobile card (2026-09-12)

Owner: tall+narrow (“banana”). `w-[min(22.5rem,calc(100vw-1.5rem))]` did not apply (comma in arbitrary `min()`). Card now `inset-x-4` so it spans the phone with 1rem gutters; columns `w-full` flex.

## Next step

Owner visual test: picker should be a wide card, not a tall strip.
