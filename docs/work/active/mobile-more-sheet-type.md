# Mobile: enlarge More sheet type

**Status:** in progress  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6

## Goal

Match Nudge / Grant bonus / Confirm type on the **More** bottom sheet. Desktop sidebar stays compact (`md:`). Bottom tab bar unchanged. No bump/push.

## Locked

| Piece | Mobile sheet | Desktop sidebar |
|--------|----------------|-----------------|
| Title | `text-xl` | n/a |
| Subtitle | `text-base leading-relaxed` | n/a |
| Settings row | `min-h-14 text-lg`, icon `h-6 w-6` | n/a |
| Profile name | `text-lg md:text-sm` | md:text-sm |
| Profile / demo meta | `text-base md:text-xs` | md:text-xs |
| Sign out / Exit demo / Create account | `min-h-14 text-lg md:min-h-11 md:text-sm` | compact |
| Family select | `min-h-14 text-lg md:min-h-11 md:text-sm` | compact |
| Version line | `text-sm md:text-[11px]` | 11px |

Mobile-first `text-lg md:text-sm` — not `max-md:`.

## Files

- `apps/web/src/components/dashboard-nav.tsx`
- `apps/web/src/components/demo/demo-nav.tsx`

## Out of scope

Bottom tabs / `InteractiveMenu`, desktop sidebar layout, Settings page itself.

## Phase log

### 2026-09-12 — Implement

- `dashboard-nav.tsx`: More title `text-xl`, subtitle `text-base`, Settings `min-h-14 text-lg`; NavFooter / VersionCredit mobile-first with `md:` compact for sidebar
- `demo-nav.tsx`: same More chrome; demo footer buttons `min-h-14 text-lg md:min-h-11 md:text-sm`

**Command:** `npm run typecheck -w @warden/web` → exit **0**

## Next step

Owner visual test: More sheet on phone; desktop sidebar still compact. Bottom tabs unchanged.
