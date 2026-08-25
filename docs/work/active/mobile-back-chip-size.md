# Mobile: enlarge sticky Children back chip

**Status:** complete (pushed, no version bump)  
**Started:** 2026-08-25  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Enlarge the sticky `← Children` back pill on child detail (mobile) for a better thumb target, and tint it with primary tokens so it stays noticeable on Maiev and Blackberry. Desktop unchanged. No version bump / push until owner asks.

## Locked

| Decision | Choice |
|----------|--------|
| File | `apps/web/src/components/sticky-back-chip.tsx` |
| Sticky chip size | `min-h-11`, `px-3.5`, `gap-1.5`, `text-base`, icon `h-4 w-4` |
| Sticky chip color | `bg-primary/15 text-primary border-primary/40` (replace card/muted). Keep `shadow-lg backdrop-blur-md`. Hover: `hover:bg-primary/20` or `hover:text-primary` |
| Inline link | Size bump on mobile only; **color stays muted** (no primary tint) |
| Themes | Token-based — works for Maiev + Blackberry without theme-specific classes |
| Out of scope | Nav, solid filled primary pill, bump/push |

## Acceptance

- [x] Sticky Children pill is clearly larger / easier to tap on phone (size pass)
- [x] Inline back link also meets ~44px height on mobile
- [x] Sticky chip uses primary wash (noticeable on Maiev dark + Blackberry light)
- [x] Desktop unchanged
- [x] `npm run typecheck -w @warden/web` exit 0 after tint pass

## Validation

| Command | Exit code |
|---------|-----------|
| `npm run typecheck -w @warden/web` | 0 (size pass) |
| `npm run typecheck -w @warden/web` | 0 (primary tint pass) |

### Orchestrator review (2026-08-25)

Size pass matched lock. Owner then asked for color noticeability — locked primary wash below.

### Phase — primary tint (locked)

Owner approved: soft primary wash, not solid CTA fill. Sticky only.

### Phase — primary tint applied (2026-08-25)

`StickyBackChip`: `border-primary/40 bg-primary/15 text-primary`, `hover:bg-primary/20`; kept `shadow-lg backdrop-blur-md` and size classes. `InlineBackLink` unchanged (muted).

## Next step

Pushed without version bump (owner request). Remote dashboard updates on next Vercel deploy of current web line.
