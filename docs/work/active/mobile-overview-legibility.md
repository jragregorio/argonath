# Mobile Overview legibility (hierarchy pass)

**Status:** shipped (web 0.8.18)  
**Started:** 2026-08-25  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Phase log

### Phase 2 — Orchestrator review (2026-08-25)

Matches locked decisions. Desktop remaining stack and summary cards intact; nav untouched. Non-blocking: Manage/View all pills also show on `md+` (small desktop chrome change). Ready for owner local test.

### Phase 1 — Implement mobile overview legibility (2026-08-25)

**Changed**

- `apps/web/src/components/policy-remaining-status.tsx` — `getPolicyRemainingMobileCaption`, `PolicyRemainingMobileHero`, `PolicyRemainingMobileCaption` for shared mobile glance (hero + one caption; after-hours folded into caption).
- `apps/web/src/components/page-header.tsx` — optional `hideDescriptionOnMobile` prop (`max-md:hidden` on description).
- `apps/web/src/app/dashboard/overview-client.tsx` — compact stats strip; mobile/desktop split for remaining block; pill Manage/View all; larger device rows/badges; removed tap hint; `hideDescriptionOnMobile` on PageHeader.
- `apps/web/src/app/demo/page.tsx` — mirrored overview mobile changes (demo routes; pending in strip when > 0).
- `apps/web/src/app/dashboard/children/[id]/child-usage-header.tsx` — mobile hero + caption; desktop stack unchanged; card fill remains mobile bar; used-today span desktop-only.

**Commands**

| Command | Exit code |
|---------|-----------|
| `npm run typecheck -w @warden/web` | 0 |
| `npm run check:boundaries` | 0 |

**Next step:** Owner local visual test (web + Android WebView).

## Goal / acceptance

Make the parent Overview (and matching mobile glance surfaces) easier to read and tap on phone **without** enlarging the bottom nav or changing desktop.

Locked decisions:

| Decision | Choice |
|----------|--------|
| Stats (mobile) | **B** — one compact strip (`N children · online/total online`), not two/three stat cards |
| Remaining time (mobile) | **Hero + bar + one caption** — drop the stacked “Today’s screen time” row and footer duplicate |
| Navbar | Frozen — do not edit `modern-mobile-menu` / bottom tabs |
| Desktop (`md+`) | Unchanged |
| Root `html` rem | Out of scope |
| Native shell | No Capacitor/Android changes |
| Version bump / deploy | No — owner will test locally |

**Acceptance**

- [x] Mobile Overview stats are a single compact strip (option B), not hollow cards. Pending count still appears in the strip when > 0 and still links to Activity.
- [x] Mobile child remaining block is hero (`text-2xl`) + progress bar + exactly one caption.
- [x] “Manage” and “View all” are pill/chip tap targets (`min-h-11`), not text links.
- [x] Overview device rows are `min-h-14` with `text-base`; “Tap a device…” hint removed.
- [x] Desktop Overview layout (two summary cards, four-layer remaining copy, full device controls) unchanged.
- [x] Bottom nav unchanged.
- [x] Demo Overview (`apps/web/src/app/demo/page.tsx`) matches the real Overview mobile/desktop split.
- [x] `npm run typecheck -w @warden/web` and `npm run check:boundaries` recorded with real exit codes.

## What to change

### 1. Mobile stats strip (option B)

File: `apps/web/src/app/dashboard/overview-client.tsx` (and demo twin).

Replace the `md:hidden` two/three **cards** with one compact row, e.g.:

- `{n} child/children` → link to `/dashboard/children`
- `{online}/{total} online`
- if pending > 0: `{n} pending` → link to `/dashboard/activity`

Visual: one bordered `rounded-2xl` strip, `px-4 py-3`, `text-base`, `tabular-nums`, middots between segments. Fill the row with type, not empty card padding.

Leave the existing `hidden md:grid` two-card summary **untouched**.

### 2. Remaining: hero + bar + one caption (mobile only)

Shared helper preferred: extend `apps/web/src/components/policy-remaining-status.tsx` with a mobile glance block so Overview, child usage header, and demo stay consistent.

Mobile (`md:hidden`):

1. **Hero** — binding remaining from `PolicyWindowRemainingPrimary` (`text-2xl font-semibold tabular-nums`). If `primaryText` is null (outside hours / blocked / paused), use `statusText` as hero at `text-base font-semibold` (do not blow up a long “Available again…” line to `text-2xl`).
2. **Bar** — keep existing `h-2.5` mobile bar on Overview.
3. **One caption** — used today: `{used} / {effectiveLimit} min today` plus `(+N)` when bonus > 0. If `afterHoursText` would otherwise appear, fold a short suffix into this caption (e.g. `· +30 after hours`). Do **not** also render `PolicyRemainingFooter` on mobile.

Desktop (`md+`): keep current stack (primary + “Today’s screen time” row + bar + footer).

Child detail: `child-usage-header.tsx` — same mobile collapse for the remaining copy (hero + one caption). Keep Grant bonus / Clear bonus. Do not restyle the desktop header.

### 3. Type + tap targets (mobile)

- Child name on Overview cards: `max-md:text-xl` on `CardTitle`.
- Status badges on Overview (child + device): `max-md:text-sm max-md:px-3 max-md:py-1` (prefer className on those instances, not a global Badge default unless `max-md:` only).
- Device status row (`md:hidden`): `min-h-14`, `px-4`, device name `text-base`, icon/chevron `h-5 w-5`. Remove “Tap a device to nudge or lock”.
- “Manage” and “View all →”: `inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium` (or equivalent pill). Primary color for Manage; muted for View all is fine.
- Optional: hide Overview `PageHeader` description below `md` only (`hideDescriptionOnMobile` or `max-md:hidden` on that page’s description — do not globally hide every page subtitle unless gated by a prop).

### 4. Out of scope

- Bottom nav / `modern-mobile-menu.tsx` / `dashboard-nav.tsx` tab chrome
- Global `html` font-size
- Settings, Activity list, Snapshots, auth/marketing
- Agent, API, Prisma, Capacitor
- Version bump, commit, push

## Residual risk

- Two-child Overview should still fit more than one card above the fold after dropping redundant copy; if a card grows, that is a regression — strip + collapse should **save** vertical space.
- Long `statusText` outside-hours hero must not use `text-2xl`.

## Commands to run

```bash
npm run typecheck -w @warden/web
npm run check:boundaries
```

Record real exit codes. Owner tests visually in local web / Android WebView.

## Next step

Owner local visual test (web + Android WebView).
