# Sticky stack: blur covered cards

**Status:** in progress  
**Started:** 2026-08-05

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Effect | Soft blur (~6–10px) + slight dim (~0.75–0.85 opacity) on covered back card |
| Timing | Scroll-progress as next card overlaps (ease with coverage) |
| Scope | `md+` sticky stack only |
| Reduced motion | Dim only, no blur |
| Deploy | Local test first — no push/bump until asked |

## Acceptance

1. When the next sticky card covers the previous, the back card blurs/dims.
2. Effect eases with overlap; reverses when scrolling back.
3. Mobile unchanged; reduced-motion skips blur.
4. `npm run typecheck -w @warden/web` exit 0.

## Phase log

### Phase 0 — lock

- Owner approved covered-card fade; implement for local test.

### Phase 1 — implement

- `StickyHomeCard`: scroll/resize rAF updates cover progress from next `.home-sticky-card` overlap.
- Blur up to 8px + opacity floor 0.78; reduced-motion = dim only; md+ only.
- Direct DOM style (no React state per frame).
- `npm run typecheck -w @warden/web` → exit 0.
- Awaiting local test; no push/bump.
