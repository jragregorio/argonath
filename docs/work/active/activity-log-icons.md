# Activity log leading icons

**Status:** complete (awaiting owner review)  
**Started:** 2026-08-08  
**Orchestrator:** Cursor Grok 4.5  
**Executor:** Composer 2.5

## Goal

Add a quiet leading Lucide icon to each activity row (left of title) so parents can scan captures vs screen-time vs presence vs lockdowns. Same treatment on Overview recent activity and Activity tab (both use `RecentActivityCard`).

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Placement | Left of title + detail block; icons at far left of the row |
| Style | ~16–18px Lucide, `text-muted-foreground`, no colored chips/badges |
| Alignment | Icon top-aligned with title; text block to the right |
| Mapping helper | `getActivityIcon(action)` (or similar) next to labels in `apps/web/src/lib/activity.ts` — return Lucide component type |
| Color coding | None for v1 |
| Empty state | Keep existing centered `Activity` icon |

### Icon map

| Family | Actions | Icon |
|--------|---------|------|
| Captures | `capture_requested`, `snapshot_deleted`, `snapshots_bulk_deleted` (if present) | `Camera` |
| Screen time | `extension_approved`, `extension_denied`, `bonus_cleared`, `policy_updated` | `Clock` |
| Lockdown | `admin_lock` | `Lock` |
| Lockdown | `admin_unlock` | `Unlock` |
| Presence | `device_online` | `Wifi` |
| Presence | `device_offline` | `WifiOff` |
| Nudge | `nudge_sent` | `Bell` |
| People | `child_created`, `child_renamed`, `child_deleted` | `Users` |
| Devices | `device_renamed`, `device_deleted`, `pairing_code_generated` | `Monitor` |
| Family settings | `family_renamed`, `pin_updated`, `timezone_updated` | `Settings` |
| Fallback | unknown | `Activity` |

## Acceptance criteria

1. Every activity row in `RecentActivityCard` shows a leading icon at the left.
2. Icons match the map above; unknown actions use `Activity`.
3. Overview + Activity tab both pick up the change (shared component).
4. No per-row color chips; muted icon only.
5. `npm run typecheck -w @warden/web` and `npm run check:boundaries` exit 0.
6. No commit/push/version bump by executor.

## Phase log

### Phase 0 — plan lock

- Owner approved left icons with the map above.

### Phase 1 — implementation

**Files changed:**
- `apps/web/src/lib/activity.ts` — added `ACTION_ICONS` record and exported `getActivityIcon(action)` returning `LucideIcon` with `Activity` fallback
- `apps/web/src/components/recent-activity-card.tsx` — each row renders leading icon (`h-4 w-4`, `text-muted-foreground`, `shrink-0`, `mt-0.5`, `aria-hidden`) in a `flex gap-3` row; text block in `min-w-0 flex-1`; desktop right-aligned timestamp preserved inside text wrapper

**Validation (real exit codes):**
```bash
npm run typecheck -w @warden/web   # exit 0
npm run check:boundaries           # exit 0
```

### Phase 2 — icon vertical centering

- Owner preferred centered icons over top-aligned.
- `recent-activity-card.tsx`: row uses `items-center`; removed icon `mt-0.5`; desktop text/timestamp wrapper uses `md:items-center`.

**Next:** Owner visual review on Overview + Activity tab; archive to `docs/work/archive/` when accepted.
