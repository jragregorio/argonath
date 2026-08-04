# Mobile nav elevated chrome contrast

**Status:** done (CSS-only; owner local test pending)  
**Started:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Direction | **1 — Elevated chrome** + **green primary trim** (not gold) |
| Not now | Gold attention trim, primary fill wash |
| Scope | CSS for `.menu` / related vars in `globals.css` only (mobile bottom InteractiveMenu) |
| Deploy | Owner will test locally first — **no bump/push** unless asked later |

## Acceptance criteria

1. Floating bottom `.menu` reads as distinct from child cards / page background.
2. Active tab green + bounce behavior unchanged.
3. Desktop sidebar unchanged.
4. `npm run typecheck -w @warden/web` still passes if TS touched (CSS-only preferred).

## Phase log

### Phase 0 — plan lock

- Owner chose option 1; local test before deploy.

### Phase 1 — elevated chrome CSS

**File:** `apps/web/src/app/globals.css` (CSS-only; no TS changes)

**Token deltas (`:root` under modern mobile menu):**

| Token | Before | After |
|-------|--------|-------|
| `--component-bg` | `var(--color-card)` | `color-mix(in srgb, var(--color-background) 58%, var(--color-card))` — darker than cards |
| `--component-shadow` | `var(--color-border)` | `color-mix(in srgb, var(--color-border) 72%, var(--color-foreground) 14%)` — higher-contrast edge |

**`.menu` deltas:**

| Property | Before | After |
|----------|--------|-------|
| `border` | `1px solid var(--component-shadow)` | `1px solid color-mix(..., 88%)` — slightly softened but higher base contrast |
| `background` opacity | 92% | 97% — less bleed-through from cards behind |
| `box-shadow` | single 4px/24px + 1px ring at 40% | dual lift (8px/32px + 4px/12px) + ring at 58% |

Active tab green, bounce, backdrop blur unchanged. No `modern-mobile-menu.tsx` / `dashboard-nav` edits.

**Validation:** CSS-only — `npm run typecheck -w @warden/web` not run (no TS touched).

### Phase 2 — trim color

- Tried gold (`--color-ring`); owner preferred **lighter green**.
- Border/ring now use `--color-primary` mixes (`45%` border, `22%` outer ring).
- Still local-test only; no bump/push.
