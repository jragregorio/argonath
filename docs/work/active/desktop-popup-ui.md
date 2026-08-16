# Desktop popup UI (confirm dialogs)

**Status:** in progress  
**Started:** 2026-08-16  
**Executor:** Composer 2.5 (implementation); orchestrator review

## Goal / acceptance

Fix desktop confirm popups (Clear bonus, Remove device, and other `ConfirmDialog` uses). Keep larger content modals (allowed windows, nudges, grant bonus) on the existing divided layout.

**Acceptance**

- [x] Confirm dialogs are compact (~28rem), no header/footer divider chrome.
- [x] Close X is inset and sized for desktop (not a 44px tap target jammed in the corner).
- [x] Body copy has more contrast and breathing room.
- [x] Footer buttons vertically centered; destructive action has comfortable horizontal padding.
- [ ] Mobile `BottomSheet` path unchanged (code unchanged; needs manual QA).
- [x] No version bump. Web-only.

## Proposed design

See orchestrator brief in session. Source of truth: `apps/web/src/components/ui/modal.tsx` + `apps/web/src/components/confirm-dialog.tsx`.

## Implementation log

### Phase 1 — Modal + ConfirmDialog (2026-08-16)

**Files touched**

- `apps/web/src/components/ui/modal.tsx` — added `size` (`md` | `sm`) and `layout` (`divided` | `plain`) props; optional `children`; compact close button for all modals; plain layout for alert-style confirms.
- `apps/web/src/components/confirm-dialog.tsx` — desktop branch uses `Modal` with `size="sm"` + `layout="plain"`, description in header, `size="sm"` footer buttons with `sm:items-center`; mobile footer left at default button size.

**Commands**

```text
npx tsc --noEmit -p apps/web
exit 0
```

### Phase 2 — Plain layout close alignment (2026-08-16)

**Files touched**

- `apps/web/src/components/ui/modal.tsx` — `layout="plain"`: split header into title+close row (`flex items-center justify-between px-5 pt-4`) and full-width description row below (`px-5 pt-1`); divided layout unchanged.

**Commands**

```text
npx tsc --noEmit -p apps/web
exit 0
```

### Phase 3 — Plain corner close + spacing (2026-08-16)

**Files touched**

- `apps/web/src/components/ui/modal.tsx` — `layout="plain"`: `relative` header wrapper; title `pl-5 pr-10 pt-4`; close `absolute right-2.5 top-2.5` (removed `-mr-1`); description `pt-2.5` (was `pt-1`). Divided layout unchanged.

## Next step

Local desktop QA at ≥768px (confirm dialogs: Clear bonus, Remove device). Spot-check larger modals still use divided layout. Verify mobile BottomSheet unchanged.
