# Sticky mobile back chip on child detail

**Status:** complete  
**Started:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Approach | **A — Compact sticky back chip** when scrolled past the inline header back link |
| Visibility | Show chip only after scroll (inline “Back to children” remains at top); hide chip when scrolled back to top |
| Scope | Mobile only (`md:hidden`); desktop unchanged |
| Target | Child detail page `apps/web/src/app/dashboard/children/[id]/page.tsx` |
| Deploy | Local test only — no bump/push |

## UX

- Top-left under safe-area: small pill/link `← Children` (or “Back to children” shortened)
- Light elevated chrome consistent with theme (blur / border / card-like), not a full top bar revival
- `href="/dashboard/children"`
- z-index above content, below or carefully clear of bottom InteractiveMenu
- Prefer IntersectionObserver on the inline back link (show sticky when inline link leaves viewport) over raw scroll thresholds

## Acceptance criteria

1. At top of page: only inline back link (no duplicate sticky).
2. After scrolling down on mobile: sticky chip appears and navigates to children list.
3. Scroll back to top: sticky chip hides.
4. Desktop: no sticky chip.
5. `npm run typecheck -w @warden/web` exit 0.

## Phase log

### Phase 0 — plan lock

- Owner chose A.

### Phase 1 — implementation

- Added `apps/web/src/components/sticky-back-chip.tsx`:
  - `InlineBackLink` — inline “Back to children” with ref for observer
  - `StickyBackChip` — fixed pill (`← Children`), `md:hidden`, `z-40`, safe-area top inset
  - IntersectionObserver toggles chip when inline link leaves viewport
- Replaced both inline back links on child detail page (not-found + loaded) with `InlineBackLink`.
- Loading skeleton unchanged (no real back link during load).

### Phase 2 — validation

```bash
npm run typecheck -w @warden/web
# exit 0
```
