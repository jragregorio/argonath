# Mobile bottom nav lift

**Status:** complete (web 0.8.22)  
**Started:** 2026-11-02  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Raise the floating mobile bottom nav slightly so it is not glued to the screen edge. Safe-area inset stays. Desktop unchanged.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Amount | Inner wrapper `pb-2` → `pb-4` (+8px / 0.5rem) |
| Safe area | Keep `paddingBottom: env(safe-area-inset-bottom)` on the fixed wrapper |
| Match | `dashboard-nav.tsx` and `demo-nav.tsx` |
| Content clearance | Bump `5.75rem` → `6.25rem` on dashboard-shell + demo-shell main `pb` |
| Toasts / tips | Bump `5.5rem` → `6rem` (`toast.tsx`, `demo-feedback.tsx`, `demo-exit-tip.tsx`) |
| Nav chrome / tabs | Do not restyle InteractiveMenu |
| Version bump / deploy | Web **0.8.22** (this commit) |

## Acceptance

- [ ] Mobile nav sits ~8px higher; still above home indicator / system inset.
- [ ] Last list rows and toasts still clear the bar.
- [ ] Demo nav matches.
- [ ] Desktop sidebar unchanged.
- [ ] `npm run typecheck -w @warden/web` and `npm run check:boundaries` with real exit codes.

## Phase log

### Phase 0 — plan lock (2026-11-02)

Owner: nav feels too low. Orchestrator: modest lift, not a large float.

### Phase 1 — implement (2026-11-02)

**Files changed:**

- `apps/web/src/components/dashboard-nav.tsx` — mobile inner wrapper `pb-2` → `pb-4`
- `apps/web/src/components/demo/demo-nav.tsx` — same
- `apps/web/src/components/dashboard-shell.tsx` — main `pb` `5.75rem` → `6.25rem`
- `apps/web/src/components/demo/demo-shell.tsx` — same
- `apps/web/src/components/ui/toast.tsx` — overlay `bottom` `5.5rem` → `6rem`
- `apps/web/src/components/demo/demo-feedback.tsx` — same
- `apps/web/src/components/demo/demo-exit-tip.tsx` — same

**Commands:**

| Command | Exit |
|---------|------|
| `npm run typecheck -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |

**Skipped:** InteractiveMenu, globals.css menu chrome, More sheet, desktop sidebar (per lock).

**Next step:** Owner refresh local `:3000` and check phone / narrow viewport.

### Phase 2 — bump + push (2026-11-02)

Owner approved. Web **0.8.21 → 0.8.22**. Agent/mobile unchanged.
