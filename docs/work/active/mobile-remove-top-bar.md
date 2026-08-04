# Remove mobile dashboard top bar

**Status:** done (awaiting deploy)  
**Started:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Action | Remove mobile fixed top bar (Brand + page title) |
| Safe area | Keep thin top spacer / padding using `env(safe-area-inset-top)` so content is not under the status bar |
| Desktop | Unchanged sidebar |
| Page titles | Rely on in-page H1s / existing headers |
| Scope | `apps/web` only — no APK / Capacitor config change |

## Acceptance criteria

1. No fixed top “Warden | Overview” bar on `md:hidden`.
2. Content does not sit under the Android/iOS status bar (safe-area preserved).
3. Bottom `InteractiveMenu` and More sheet unchanged.
4. Desktop sidebar unchanged.
5. `npm run typecheck -w @warden/web` and `npm run check:boundaries` pass (real exit codes).

## Out of scope

- Redesigning page H1s
- Desktop chrome
- Commit/push unless asked later

## Phase log

### Phase 0 — plan lock

- Owner approved removal with safe-area retention.

### Phase 1 — implementation

- Removed fixed mobile top bar (`Brand` + `pageTitle`) and its height spacer from `dashboard-nav.tsx`.
- Added thin `md:hidden` spacer with `height: env(safe-area-inset-top)` only — no border, brand, or backdrop.
- Removed unused `pageTitle()` and `Brand` `compact` prop (desktop sidebar `Brand` unchanged).
- Left `dashboard-shell.tsx`, `InteractiveMenu`, and `MobileMoreSheet` unchanged.

**Files touched**

- `apps/web/src/components/dashboard-nav.tsx`

**Validation**

| Command | Exit code |
|---------|-----------|
| `npm run typecheck -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |

**Next step**

- Deploy web (`@warden/web`) and smoke-test on Android/iOS WebView: no top chrome bar, content below status bar, bottom nav unchanged.
