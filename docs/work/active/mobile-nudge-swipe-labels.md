# Mobile: Nudge label + shorter swipe-to-lock copy

**Status:** complete (pushed, no version bump)  
**Started:** 2026-08-25  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Improve child-detail (and any shared) device control labels on mobile:

1. **Nudge** — larger label (`text-base`) on mobile; desktop unchanged.
2. **SwipeToLock** — mobile label **`Swipe to lock`**; desktop keep **`Swipe to lock down`**. After shortening, bump mobile track text to `text-sm` (desktop stays `md:text-sm` / current).

No version bump / push until owner asks.

## Locked

| Decision | Choice |
|----------|--------|
| Nudge | `nudge-controls.tsx`: main + chevron buttons get `max-md:text-base` (Bell/Chevron can stay h-4 or bump to h-5 on mobile — prefer icon `max-md:h-5 max-md:w-5` for balance) |
| Swipe default label | Keep prop default `"Swipe to lock down"` for desktop callers |
| Mobile swipe copy | Inside `swipe-to-lock.tsx`, when below `md` show shortened string if using default label; OR use CSS/`useIsDesktopMd` to pick display text: mobile `Swipe to lock`, desktop `Swipe to lock down` when `label` is the default. If caller passes a custom `label`, use it as-is on both. |
| Swipe track type | Mobile: `text-sm` (was `text-xs`); desktop: keep `md:text-sm` |
| Verb | **Swipe** not Slide |
| Out of scope | Changing control heights, overflow menu, bump/push |

## Acceptance

- [x] Nudge label reads larger on phone
- [x] Mobile track shows "Swipe to lock" (with chevron); desktop still "Swipe to lock down"
- [x] Custom `label` prop still respected
- [x] `npm run typecheck -w @warden/web` exit 0

## Validation

```text
npm run typecheck -w @warden/web
exit 0
```

## Next step

Pushed without version bump (owner request).
