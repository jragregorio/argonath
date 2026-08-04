# Tappable child cards → manage profile

**Status:** complete (local)  
**Started:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Children tab | Whole card navigates to `/dashboard/children/[id]`; Delete / edit use `stopPropagation` |
| Overview | Card chrome (header / screen-time / non-control areas) navigates to manage; **Nudge / SwipeToLock / device controls** stop propagation and stay interactive |
| Manage → link | Keep as visible affordance (still works) |
| Avoid | Wrapping entire Overview card in a single `<Link>` with nested buttons |
| Deploy | **Local only** — no bump/push |

## Acceptance criteria

1. Children list: tap card body → child detail; Delete/edit do not navigate.
2. Overview: tap name/header/screen-time area → child detail; Nudge and swipe-to-lock still work.
3. Keyboard/a11y: card activation has a sensible role/button or clickable region with focus if using `div onClick` — prefer `router.push` on card with `role="link"` / keyboard Enter, or make header a link block.
4. Desktop behavior acceptable (same interaction is fine).
5. `npm run typecheck -w @warden/web` exit 0.

## Phase log

### Phase 0 — plan lock

- Owner approved recommended approach; local test only.

### Phase 1 — implementation

**Files changed:**
- `apps/web/src/app/dashboard/children/page.tsx`
- `apps/web/src/app/dashboard/overview-client.tsx`

**Children tab:**
- Card `onClick` + `router.push` to `/dashboard/children/[id]` when not editing.
- `role="link"`, `tabIndex={0}`, Enter/Space keyboard activation.
- `cursor-pointer`, hover border, focus ring affordance.
- Pencil rename and Delete buttons: `stopPropagation` + `preventDefault`.
- Edit form: `stopPropagation` on click/keydown so card does not navigate while renaming.
- "Manage profile →" link kept with `stopPropagation`.

**Overview:**
- `CardHeader` (name, status badge, screen-time block) is the navigable chrome via `onClick` + `router.push`.
- Card hover border on chrome; header has `role="link"`, keyboard Enter/Space.
- `CardContent` and device subcards use `stopPropagation` so Nudge / SwipeToLock / Release stay interactive.
- "Manage {name}" link kept at bottom.

**Validation:**
```bash
npm run typecheck -w @warden/web
# exit 0
```
