# Mobile UX density pass (Android WebView)

**Status:** complete (web v0.6.4 — push for Vercel deploy)  
**Started:** 2026-08-04  
**Completed:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | **B — Mobile density pass**: larger touch targets + slightly larger type, spacing, and card padding under `md` |
| Desktop | **Unchanged** — gate with `max-md:` / keep existing `md:` styles |
| Approach | Shared primitives first (`Button`, `SwipeToLock`, bottom nav, shell padding); then Overview + Child detail hot paths |
| Native shell | No Capacitor/Android UI changes — remote URL web only |
| Root font-size scale | **Out of scope** (no global `html` rem bump) |

### Target sizes (mobile / `max-md` only)

| Control | Target |
|---------|--------|
| Primary `Button` (`md` size) | `min-h-12` → prefer `min-h-14` on mobile (~56px) |
| `Button` `lg` | already tall; ensure mobile feels consistent |
| Swipe-to-lock track | ~`h-14` |
| Swipe-to-lock thumb | ~`h-11 w-11` (update `THUMB` constant) |
| Bottom tabs | taller row, icons `w-6 h-6`, labels `text-xs` |
| Icon-only hit areas (edit, overflow) | ≥ 44×44 |
| Progress bars (visual) | slightly thicker on mobile (`h-2.5` / `h-3`) |
| Card / section padding & gaps | modest bump (e.g. `p-4`→`p-5`, `gap-2`→`gap-3` where dense) |
| Body / meta text on dense cards | `text-xs` → `text-sm` on key mobile surfaces where readable |

## Acceptance criteria

1. Desktop (`md+`) visual layout of dashboard controls unchanged (or only incidental via shared default if unavoidable — prefer `max-md:` overrides).
2. Overview child cards: Nudge + swipe-to-lock clearly larger / easier to use on phone.
3. Child detail device card: same control sizing; header actions (Delete / edit) usable touch targets.
4. Bottom nav: larger icons + labels; adjust shell `pb-[…]` if tab bar height grows.
5. No business logic / API / agent changes.
6. `npm run typecheck -w @warden/web` and `npm run check:boundaries` pass (record real exit codes).

## Out of scope

- iOS
- Marketing / auth pages polish (unless trivial shared `Button` side effect)
- Global root font-size scale
- Native Capacitor theme changes
- Redesigning information architecture / removing sections

## Phase log

### Phase 0 — plan lock

- Owner chose **B, desktop unchanged**.
- Orchestrator writing this brief; Composer 2.5 to implement.

### Phase 1 — shared primitives

**Files:**
- `apps/web/src/components/ui/button.tsx` — `md`: `min-h-14 md:min-h-11`; `sm`/`lg` modest mobile bumps
- `apps/web/src/components/swipe-to-lock.tsx` — track `h-14 md:h-11`; thumb `h-11 w-11 md:h-9 md:w-9`; thumb size measured via `ResizeObserver` (replaces hardcoded `THUMB = 36`)
- `apps/web/src/components/nudge-controls.tsx` — chevron split button `max-md:min-w-11`
- `apps/web/src/components/dashboard-nav.tsx` — bottom tabs `min-h-16`, icons `w-6 h-6`, labels `text-xs`, `gap-1`, `py-2`
- `apps/web/src/components/dashboard-shell.tsx` — main `p-5 md:p-8`; bottom padding `pb-[calc(6.25rem+safe-area)]` (was `5.75rem`)

### Phase 2 — dashboard hot paths

**Files:**
- `apps/web/src/app/dashboard/overview-client.tsx` — stats strip `p-3.5`/`text-xs`; child grid `gap-5`; progress `h-2.5 md:h-2`; meta `text-sm md:text-xs`; device sub-cards `px-4 py-3`; control rows `gap-3`
- `apps/web/src/app/dashboard/children/[id]/page.tsx` — rename/edit `min-h-11 min-w-11`; device cards `max-md:p-5`; meta `text-sm md:text-xs`; overflow `min-w-11`; control row gaps

### Phase 3 — validation

| Command | Exit code |
|---------|-----------|
| `npm run typecheck -w @warden/web` | **0** |
| `npm run check:boundaries` | **0** |
| `npm run lint -w @warden/web` | **0** (pre-existing warnings in snapshots/realtime only) |

## Next step

Deploy web (`@warden/web`) so the Capacitor Android shell picks up the denser mobile UX on its remote dashboard URL.
