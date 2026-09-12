# Mobile: enlarge ConfirmDialog type

**Status:** ready for owner visual test  
**Started:** 2026-09-12  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Make the Block app (and other) mobile confirm sheet easier to read. Desktop modal unchanged. Do **not** enlarge BottomSheet titles globally (Edit limits, etc.). No version bump / push until asked.

## Locked

| Decision | Choice |
|----------|--------|
| Scope | `ConfirmDialog` mobile path only |
| Title | `text-lg font-semibold` — add optional `titleClassName` (or similar) on `BottomSheet`; ConfirmDialog passes `text-lg`. Default BottomSheet title stays as today. |
| Description | ConfirmDialog children: `text-base text-muted-foreground` (was `text-sm`) |
| Footer buttons | Block + Cancel: `text-base` (mobile path only; overrides Button `text-sm md:text-base`) |
| Desktop | Modal + `size="sm"` footer unchanged |
| Out of scope | Other BottomSheets, navbar, bump/push |

## Acceptance

- [ ] Block app sheet: larger title + body + Block/Cancel labels on phone
- [ ] Edit limits / other sheets: title size unchanged
- [ ] Desktop confirm modal unchanged
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

### 2026-09-12 — Button label override fix

**Problem:** Mobile footer used `max-md:text-base` but shared `Button` already has `text-sm md:text-base`; Tailwind kept `text-sm` on mobile.

**Files changed:**
- `apps/web/src/components/confirm-dialog.tsx` — mobile footer Cancel/confirm: `text-base` (not `max-md:text-base`); description: add `leading-relaxed`

**Validation:** `npm run typecheck -w @warden/web` → exit 0

### 2026-09-12 — Implement

**Files changed:**
- `apps/web/src/components/ui/bottom-sheet.tsx` — added optional `titleClassName` prop; applied via `cn("font-semibold", titleClassName)` on title `<p>`
- `apps/web/src/components/confirm-dialog.tsx` — mobile path: `titleClassName="text-lg"`, description `text-base`, footer buttons `max-md:text-base`

**Validation:** `npm run typecheck -w @warden/web` → exit 0

## Next step

Owner re-test Block app sheet on phone.
