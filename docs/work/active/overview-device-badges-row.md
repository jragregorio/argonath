# Overview device badges: row on mobile

**Status:** complete (pushed, no version bump)  
**Started:** 2026-08-25  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

On Overview (and demo twin) mobile device rows, status badges must sit in a **horizontal row** (`Offline` `Locked` …), not a vertical column. No version bump / push until asked.

## Locked

| Decision | Choice |
|----------|--------|
| Cause | `deviceBadges` wrapper uses `flex-col … md:flex-row` |
| Fix | Use row on all breakpoints: `flex shrink-0 flex-row flex-wrap items-center justify-end gap-1.5` (or `gap-2`) |
| Files | `apps/web/src/app/dashboard/overview-client.tsx`, `apps/web/src/app/demo/page.tsx` |
| Out of scope | Child detail badges, sticky chip, bump/push |

## Acceptance

- [ ] Mobile Overview with Offline + Locked shows both badges in one row before the chevron
- [ ] Demo Overview matches
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

### 2026-08-25 — Implement row layout

- Changed `deviceBadges` wrapper in `overview-client.tsx` and `demo/page.tsx` to `flex shrink-0 flex-row flex-wrap items-center justify-end gap-1.5` (was `flex-col … md:flex-row`).
- `npm run typecheck -w @warden/web` → **exit 0**

## Next step

Pushed without version bump (owner request).
