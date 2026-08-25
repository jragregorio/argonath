# Mobile Edit limits sheet (policy UX)

**Status:** shipped (web 0.8.18)  
**Started:** 2026-08-25  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal / acceptance

Make the mobile **Edit limits** bottom sheet easier to use (Screen time policy). Desktop policy card + “Edit schedule” modal stay as they are. Bottom nav frozen.

Locked decisions:

| Decision | Choice |
|----------|--------|
| Duplicate summary in sheet | **Remove** the `{limit} min/day` + `AllowedWindowsSummary` block at the top of the sheet |
| Dismiss chrome | Drop BottomSheet **“Tap to close”** label globally; keep grabber + X |
| Footer | **Dirty → Save + Discard.** **Clean → Done only.** Never stack disabled Save on top of Done |
| Presets | Two-column on mobile; `min-h-11` `text-sm`; short title + time on a second line |
| Policy active | Full-width row ≥44px (sheet only) |
| Daily limit | `min-h-12` + `text-base` on mobile |
| Add another window | `min-h-11` control, not `text-xs` link |
| Time picker trigger | `min-h-12` on mobile |
| Minute precision | **5-minute steps on mobile**; desktop keeps 1-minute |
| Native `input type="time"` | Out of scope |
| Nested time sheet | Out of scope unless 5-min + shorter column is not enough (do not do this pass) |

**Acceptance**

- [x] Opening Edit limits no longer shows a duplicate schedule summary above the editor.
- [x] Clean sheet footer is a single Done; dirty is Save + Discard (no disabled Save + Done).
- [x] “Tap to close” text is gone from BottomSheet; grabber and X remain.
- [x] Mobile presets are two columns, larger, title+time stacked.
- [x] Mobile time picker: 5-minute options, `h-44` stepped column on mobile / `h-48` desktop step-1; wider columns (`w-20`), ~44px rows, `text-base` on mobile.
- [x] Desktop `md+` policy card and Allowed windows modal still use 1-minute picker and existing chip/layout.
- [x] No nav / Capacitor / API / agent changes.
- [x] `npm run typecheck -w @warden/web` and `npm run check:boundaries` recorded with real exit codes.

## What to change

### 1. Sheet chrome — `child-policy-section.tsx`

BottomSheet `open={policyEditorOpen}`:

- Delete the `mb-4` summary wrapper (`currentLimit min/day` + `AllowedWindowsSummary`) inside sheet children. Keep `renderPolicyEditor("sheet", "sheet")`.
- Footer:
  - if `policyDirty`: Save policy (enabled unless pending) + Discard
  - else: Done only (close sheet)
  - Do not render Save when clean.

Card on the child page (summary + Edit limits button) stays.

### 2. BottomSheet label — `bottom-sheet.tsx`

Remove the `Tap to close` `<span>`. Keep the grabber bar button (`aria-label="Dismiss"`). Applies to all sheets (nudge, confirm, devices, etc.).

### 3. Editor controls — `allowed-windows-editor.tsx` + sheet fields in `renderPolicyEditor`

**Presets (mobile only via `max-md:` / `md:`):**

- Mobile: `grid grid-cols-2 gap-2`; each chip `min-h-11`, `text-sm`, two lines (e.g. **Weekdays** / `3:00 PM – 8:00 PM`). “Any time” is a single-line title.
- Desktop: keep current `flex flex-wrap` + `rounded-full px-3 py-1.5 text-xs` single-line labels.

**Add another window:** `max-md:min-h-11 max-md:text-sm` (or a small Button); keep desktop as text-xs link if needed.

**Policy active + daily limit** live in `renderPolicyEditor` (`child-policy-section.tsx`). Sheet is the only place `showActiveToggle` is true today.

- Policy active: `label` row `min-h-11` with a larger checkbox (`h-5 w-5`) + label.
- Daily limit Input: `max-md:min-h-12 max-md:text-base` (desktop card uses the same field — gate with `max-md:` or `mode === "sheet"`).

### 4. Time picker — `time-picker.tsx`

- Optional `minuteStep` (default `1`). `AllowedWindowsEditor` passes `minuteStep={5}` when viewport is below `md` (`useIsDesktopMd` already exists at `@/lib/use-is-desktop-md`).
- Minute options: `0, 5, 10, …` when step is 5. **If current `value` minutes are not on the grid, still include that minute** so saved odd times remain visible/selectable until the parent changes them.
- Column height: `h-36 md:h-48` (or `h-36` when step is 5).
- Trigger button: `min-h-12 md:min-h-10` (keep existing `h-10` desktop look).
- Do not change hour or AM/PM columns’ option sets.

Desktop Allowed windows **Modal** uses the same editor — `useIsDesktopMd` must keep `minuteStep={1}` there.

### 5. Out of scope

- Bottom nav / `modern-mobile-menu`
- Desktop policy card layout, desktop modal chrome
- Demo child page (no Edit limits sheet)
- Snapping existing stored windows to 5 minutes on save
- Version bump, commit, push

## Residual risk

- First client paint of `useIsDesktopMd` is `false` (then updates). TimePicker is inside a closed popover; acceptable. Do not flash a different desktop editor layout.
- Odd saved minutes (e.g. 16) stay until the user picks a new time.

## Commands to run

```bash
npm run typecheck -w @warden/web
npm run check:boundaries
```

Record real exit codes. Next step = owner local visual test.

## Phase log

### Phase 1 — Implement (2026-08-25)

**Files changed**

- `apps/web/src/app/dashboard/children/[id]/child-policy-section.tsx` — removed duplicate sheet summary; dirty/clean footer; sheet policy-active row + daily limit mobile sizing
- `apps/web/src/components/ui/bottom-sheet.tsx` — removed "Tap to close" label
- `apps/web/src/components/allowed-windows-editor.tsx` — mobile 2-col presets, `minuteStep` wiring, larger add-window control
- `apps/web/src/components/ui/time-picker.tsx` — optional `minuteStep`, off-step minute inclusion, `h-36` min column, taller mobile trigger

**Commands**

| Command | Exit code |
|---------|-----------|
| `npm run typecheck -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |

**Decisions**

- Off-step minutes: `buildMinuteOptions` generates `0, step, 2*step, …` and appends the current minute if missing (sorted), so saved odd times remain selectable until the user picks a new value.
- Desktop unchanged via `useIsDesktopMd()` → `minuteStep={1}` and `md:` preset/chip classes.

### Phase 2 — Orchestrator review (2026-08-25)

Matches locked decisions (summary removed, footer dirty/clean, presets, 5-min step, off-step minutes kept).

**Fix:** Time picker popover height was still `h-48` because hour/AM-PM columns kept that height. Applied `h-36` to all three columns when `minuteStep > 1` so the sheet picker actually shrinks.

### Phase 3 — Larger mobile time picker (locked 2026-08-25)

Owner accepted the sheet; picker columns/type/rows are too small. Enlarge **width + row tap + type**, not a return to the old tall overlapping popover.

| Token | Mobile (`max-md` / `minuteStep > 1`) | Desktop |
|-------|--------------------------------------|---------|
| Column width | `w-20` (80px) | keep `w-14` |
| Row | `min-h-11 text-base py-2` | keep `py-1.5 text-sm` |
| List height | `h-44` (176px) when stepped | keep `h-48` when step is 1 |
| Header label | `text-sm` | keep `text-xs` |

Do not full-width the popover. Do not nested sheet.

**Acceptance add:** time picker on phone is clearly larger (wider columns, ~44px rows, `text-base`) without covering most of the Edit limits sheet.

### Phase 3 — Larger mobile time picker (2026-08-25)

**Files changed**

- `apps/web/src/components/ui/time-picker.tsx` — `max-md:w-20` columns; stepped list `h-44` (was `h-36`); `max-md:text-sm` header; `max-md:min-h-11 max-md:py-2 max-md:text-base` option rows

**Commands**

| Command | Exit code |
|---------|-----------|
| `npm run typecheck -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |

**Decisions**

- Mobile scale via `max-md:` breakpoint (width, header, row tap/type); stepped height via `minuteStep > 1` → `h-44` on all three columns. Desktop `md+` unchanged.

### Phase 4 — AM/PM column header (2026-08-25)

- `time-picker.tsx`: AM/PM column `label=""` → `label="AM/PM"`; header `whitespace-nowrap` so it stays on one line in the narrow column.

## Next step

Shipped web **0.8.18**. Capacitor shell picks up remote URL after Vercel deploy.
