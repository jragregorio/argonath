# Hide Windows download on mobile

**Status:** in progress  
**Started:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Action | Hide **Download for Windows** (and its “Temporarily unavailable” helper text) on mobile (`md:hidden` wrapper or `hidden md:block`) |
| Keep on mobile | **Generate pairing code** |
| Desktop | Unchanged — download still visible `md+` |
| Version bump | None — push only after change |

## Acceptance criteria

1. Child detail Devices section: no Download for Windows CTA under `md`.
2. Pairing code generate still available on mobile.
3. Desktop still shows the download control.
4. `npm run typecheck -w @warden/web` exit 0 (record real code).

## Phase log

### Phase 0 — plan lock

- Owner approved; push without bump after implementation.

### Phase 1 — implementation

- Wrapped Devices download section (`Button` + helper text) in `hidden md:block` on `apps/web/src/app/dashboard/children/[id]/page.tsx`.
- Pairing code UI unchanged; still visible on mobile.
- `npm run typecheck -w @warden/web` → exit **0**.
