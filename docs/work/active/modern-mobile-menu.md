# Integrate modern mobile menu as dashboard bottom nav

**Status:** complete (web v0.6.6 — pushed for Vercel deploy)  
**Started:** 2026-08-04  
**Completed:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Placement | **Replace** `MobileBottomTabs` in [`apps/web/src/components/dashboard-nav.tsx`](apps/web/src/components/dashboard-nav.tsx) |
| Component path | `apps/web/src/components/ui/modern-mobile-menu.tsx` (alias `@/components/ui/...`) |
| Routes | Keep existing primary tabs: Overview, Children, Requests, Snapshots (+ More sheet for Settings/logout) |
| Badges | Preserve `useNavBadges` counts on tab items |
| Desktop | Unchanged (`md:hidden` bottom chrome only) |
| Demo page | **Do not** add a standalone demo route |
| `tw-animate-css` | **Do not** add — unused; extend `globals.css` only |
| lucide-react | Already in `@warden/web` — do not reinstall unless missing |
| Images | N/A — icons only |

## Project facts (already true)

- TypeScript + Tailwind **4** + Lucide
- UI folder: `apps/web/src/components/ui` (not repo-root `/components/ui`)
- Styles: `apps/web/src/app/globals.css`

## Acceptance criteria

1. Mobile bottom nav uses `InteractiveMenu` visual/interaction (bounce line / active state).
2. Tapping tabs navigates to real dashboard routes (not only local `activeIndex`).
3. Active tab follows `usePathname` (including child detail under `/dashboard/children/...`).
4. More tab still opens `MobileMoreSheet` (Settings / logout / family switch).
5. Request badges still visible when count > 0.
6. Safe-area + `DashboardShell` bottom padding still clear content.
7. `npm run typecheck -w @warden/web` and `npm run check:boundaries` pass (real exit codes).

## Out of scope

- Redesigning desktop sidebar
- Changing route set / IA
- Adding shadcn CLI / new Tailwind toolchain
- Committing/pushing unless asked

## Phase log

### Phase 0 — plan lock

- Owner chose **1**: replace live mobile bottom tabs.

### Phase 1 — implementation

**Files touched**

- `apps/web/src/components/ui/modern-mobile-menu.tsx` — new controlled `InteractiveMenu` + types
- `apps/web/src/app/globals.css` — `/* modern mobile menu */` variables, `iconBounce`, full BEM layout
- `apps/web/src/components/dashboard-nav.tsx` — `MobileBottomTabs` renders `InteractiveMenu` with routes, badges, More sheet
- `apps/web/src/components/dashboard-shell.tsx` — mobile bottom padding `6.25rem` → `5.75rem`

**API**

- `InteractiveMenuItem`: `{ label, icon, href?, onClick?, badge? }`
- `InteractiveMenu`: controlled `activeIndex` + `onItemSelect(index)`; optional `accentColor`, `className`
- Badges: optional `badge` count renders pill on icon (`9+` cap)

**Wiring**

- Items: `primaryTabs` (Overview, Children, Requests, Snapshots when Supabase) + More (`onClick` → `MobileMoreSheet`)
- `activeIndex` from `isNavActive(pathname)`; More active when sheet open or on `/dashboard/settings`
- Route taps: `router.push(href)`; More tap: `onMoreToggle`
- Fixed bottom wrapper retains safe-area inset; inner floating `.menu` pill

**CSS**

- Theme tokens: `--component-active-color-default: var(--color-primary)`; inactive/bg/shadow from muted/card/border
- BEM: `.menu`, `.menu__item`, `.menu__icon`, `.menu__text`, `.menu__badge`; active underline via `--lineWidth` + `iconBounce`
- No `tw-animate-css`; `prefers-reduced-motion` disables bounce

**Validation (real exit codes)**

| Command | Exit |
|---------|------|
| `npm run typecheck -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |

**Next step**

- Deploy web to staging/production and verify in Capacitor Android shell (safe-area, badge updates, More sheet, child-detail active state on Children tab).
