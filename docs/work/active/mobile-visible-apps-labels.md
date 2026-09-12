# Mobile: enlarge Visible apps labels

**Status:** ready for owner visual test  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Make Visible apps row **titles** easier to read on phone. Desktop unchanged. No version bump / push until owner asks.

## Locked

| Decision | Choice |
|----------|--------|
| File | `apps/web/src/components/visible-apps-card.tsx` (`RunningAppsList` only) |
| App title | Title span: `max-md:text-base max-md:font-medium` (keep truncate) |
| Process name (right) | Keep muted; `max-md:text-sm` so it stays secondary when the row is no longer `text-sm` |
| Row | Keep `text-sm md:py-1.5 md:text-xs` + `max-md:min-h-11`; add `max-md:px-3` |
| Badges | Optional `max-md:text-xs` on IN USE / PROTECTED / Blocked (currently `text-[10px]`) — **do this** |
| Out of scope | Navbar, desktop `md:text-xs`, bump/push, child-visible-apps-section wrapper |

## Acceptance

- [ ] On phone, app titles (Discord, Minecraft, …) read at `text-base`
- [ ] Process name on the right stays smaller/muted
- [ ] Desktop rows still `text-xs`
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

### 2026-09-12 — RunningAppsList mobile styles

**Files changed:** `apps/web/src/components/visible-apps-card.tsx` (`RunningAppsList` only)

**Changes:**
- Row: `max-md:px-3` on row className; `max-md:min-h-11` unchanged on tappable rows
- Title span: `max-md:text-base max-md:font-medium`
- Process name span: `max-md:text-sm`
- Badges (In use, Protected, Blocked): `max-md:text-xs` alongside `text-[10px]`

**Validation:** `npm run typecheck -w @warden/web` → exit 0

## Next step

Owner local visual test (`npm run dev`).
