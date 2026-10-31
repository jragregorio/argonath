# Partial clear bonus

**Status:** done  


**Started:** 2026-10-31  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Replace one-shot “Clear bonus” confirm with a Grant-style sheet: **Clear all**, or use a step-5 slider to subtract minutes from today’s bonus.

## Problem

Parents can grant +N or wipe the whole bonus. They cannot take back part of a grant (e.g. 180 → remove 30).

## Locked

| Decision | Choice |
|----------|--------|
| UI | Same pattern as Grant bonus: desktop Modal, mobile BottomSheet. Header chip still labeled “Clear bonus”. |
| Actions | Chip **Clear all** (default) + **slider step 5** (not a number input). No 15/30/60 presets. |
| API | Extend `extension.clearBonus`: `{ childId, minutes?: number }`. Omit `minutes` = clear all. Provided = subtract that many (cap at current total). |
| Semantics | Reduce `ExtensionOverride.extraMinutes` LIFO (newest first). Expire a row when its remaining hits 0. Full clear keeps today’s expire-now path. |
| Cap | Slider max is **remaining unused bonus**, not total granted `bonusMinutes`. Example: +180 granted, 60 min left → slider 5–60. Hide slider if max < 5. Clear all still expires the whole grant. |
| After-hours | Do not rewrite `outsideGrantBaselineUsedMinutes`. Shrinking `extraMinutes` shrinks the pool. |
| Devices | Do not admin-lock on clear (unchanged). Broadcast `policy:updated`. No child AttentionWindow. |
| Audit | Keep `bonus_cleared` with `{ childId, minutes }` = amount actually removed. Activity already shows `−N min`. |
| ConfirmDialog | Remove `clear-bonus` from child-usage-header confirm state. Delete-child confirm stays. |
| Demo | Update `clearBonus(childId, minutes?: number)` and demo child page sheet. |
| Versions | Web/API only. No agent/MSI bump. |

## UI copy

- Title: `Clear bonus screen time`
- Description: `Remove extra minutes from {name} today`
- Hint: remaining unused bonus (and granted total if different) + lock warning
- Primary: `Clear all` or `Clear −N min`
- Type scale: match Grant bonus (mobile `text-lg` / sheet title `text-xl`; desktop compact)

## Files

- `packages/api/src/routers/index.ts` — `clearBonus` input + partial reduce
- `apps/web/src/app/dashboard/children/[id]/child-usage-header.tsx`
- `apps/web/src/app/demo/children/[id]/page.tsx`
- `apps/web/src/lib/policy-remaining-display.ts` — `getRemainingBonusMinutes`
- `apps/web/src/lib/demo/demo-provider.tsx`
- `docs/work/active/clear-bonus-partial.md`

Do **not** change Grant bonus, agent, Prisma schema, or activity label wiring unless the audit payload shape breaks it.

## Acceptance

- [x] Parent can clear all remaining bonus (same outcome as today)
- [x] Parent can choose partial clear via slider (multiples of 5, capped at **remaining unused** bonus)
- [x] Activity shows `−N min` for both
- [x] Demo child page matches
- [x] `npm run typecheck -w @warden/api` exit 0
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

### 2026-10-31 — Plan lock

Owner: Clear all + input amount. Mirror Grant sheet. LIFO reduce overrides.

### 2026-10-31 — Implementation (Composer 2.5)

**Files changed**

- `packages/api/src/routers/index.ts` — `extension.clearBonus` optional `minutes`, LIFO partial reduce vs expire-all
- `apps/web/src/app/dashboard/children/[id]/child-usage-header.tsx` — Grant-style clear sheet; removed `clear-bonus` ConfirmDialog; mobile More actions entry
- `apps/web/src/lib/demo/demo-provider.tsx` — `clearBonus(childId, minutes?)` partial subtract
- `apps/web/src/app/demo/children/[id]/page.tsx` — same clear sheet as dashboard

**Commands**

```
npm run typecheck -w @warden/api   → exit 0
npm run typecheck -w @warden/web   → exit 0
```

**API contract**

- Input: `{ childId: string, minutes?: number }` (`minutes` int 1–240 when provided)
- Omit `minutes` or `minutes >= total bonus` → expire all active overrides (unchanged full clear)
- Partial → LIFO on `ExtensionOverride.extraMinutes`; audit `bonus_cleared` with actual minutes removed; returns `{ ok, clearedMinutes, clearedCount }`

### 2026-10-31 — Orchestrator review + demo browser

Reviewed API + dashboard/demo UI against locked spec. Demo on `:3000`:

- Grant +60 → Clear bonus sheet (Clear all + minutes input)
- Partial 20: remaining 102 → 82; activity `−20 min`; chip still shown
- Clear all remaining 40: remaining 82 → 42; activity `−40 min`; Clear bonus chip gone

Real dashboard (Niccolo) not exercised here (needs parent session). No commit.

### 2026-10-31 — Clear slider UX (Composer 2.5)

Replaced partial-clear number input with native `<input type="range">` (step 5) on dashboard + demo child header. Clear all stays default on open; slider `onChange`/`onInput` only exits Clear all mode (no focus handler). Hidden when `floor(bonus/5)*5 < 5`.

**Files:** `child-usage-header.tsx`, `demo/children/[id]/page.tsx`

```
npm run typecheck -w @warden/web   → exit 0
```

No API changes. No commit.

### 2026-10-31 — Slider max = remaining bonus (Composer 2.5)

Added `getRemainingBonusMinutes()` in `policy-remaining-display.ts` (after-hours → `remainingMinutes`; outside window → 0; in-window → unused grant via `getUsableAfterHoursBonusMinutes`). Dashboard + demo clear sheet use it for slider max, partial validation, and hint copy (“60 min left (of +180 granted)”).

**Files:** `policy-remaining-display.ts`, `child-usage-header.tsx`, `demo/children/[id]/page.tsx`

```
npm run typecheck -w @warden/web   → exit 0
```

No API/agent changes. No commit.

### 2026-10-31 — Mobile clear sheet layout (Composer 2.5)

Mobile BottomSheet only: hide Clear all chip (`hidden md:flex`); footer column order — destructive `Clear −N min`, outline `Clear all`, ghost Cancel (no `flex-col-reverse`); larger range input (webkit + moz). Desktop Modal unchanged (chip + Cancel | mode-aware primary).

**Files:** `child-usage-header.tsx`, `demo/children/[id]/page.tsx`

```
npm run typecheck -w @warden/web   → exit 0
```

No commit.

### 2026-10-31 — Desktop two-button clear footer (Composer 2.5)

Removed Clear all chip and `clearAllMode`. Modal footer: Cancel | Clear all (outline) | Clear −N (destructive). Form is slider + hint only; value label always `−N min`. Mobile column footer unchanged.

**Files:** `child-usage-header.tsx`, `demo/children/[id]/page.tsx`

```
npm run typecheck -w @warden/web   → exit 0
```

No commit.

### 2026-10-31 — Desktop two-button clear footer (Composer 2.5)

Removed Clear all chip and `clearAllMode`. Modal footer: Cancel | Clear all (outline) | Clear −N (destructive). Form is slider + hint only; value label always `−N min`. Mobile column footer unchanged.

**Files:** `child-usage-header.tsx`, `demo/children/[id]/page.tsx`

```
npm run typecheck -w @warden/web   → exit 0
```

No commit.
