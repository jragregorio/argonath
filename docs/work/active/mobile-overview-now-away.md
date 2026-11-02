# Mobile Overview Now + Away

**Status:** complete (web 0.8.23)  
**Started:** 2026-11-02  
**Orchestrator:** Grok 4.6  
**Executor:** Composer 2.5

## Goal

Mobile Dashboard (Overview) uses the same hierarchy as the Children compact roster: online kids get a time hero; everyone else is a short row. Desktop Overview is frozen.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Direction | **A — Now + Away** (visual hierarchy, not labeled sections) |
| Online | Any device `isOnline` → hero. Multiple online kids all get heroes |
| Offline / no devices | Compact away row |
| Order | Keep API/`createdAt` order. Do **not** sort online first, do **not** add Now/Away headings |
| All offline | Everyone compact |
| Stats strip | **Remove** on mobile (`md:hidden` children/online strip). Keep desktop summary cards. Pending stays on `PendingExtensionBanner` |
| Hero | Name + status badge + `PolicyRemainingMobileHero` + **thicker** bar (`h-3.5`) + caption + device/current-app line. Whole card → child detail. No lock/nudge |
| Current app | Foreground `title \|\| processName` when `runningApps` present; omit if missing |
| Away | Compact row (min-h-14, rounded-2xl): name + one short subtitle. No progress bar, no long “Available again… budget left” paragraph |
| Away subtitle | No devices → `No devices paired`. Else `Offline` plus next window when `nextWindowStart` exists (`Offline · {formatClockInText(nextWindowStart)}`). If online-less but in-window: `Offline` |
| Activity (mobile) | 3 items; prefer local-calendar today, else 3 most recent. **No** “Show N more”. View all stays. Desktop feed unchanged (`initialVisible` 5 + show more) |
| Demo | `apps/web/src/app/demo/page.tsx` matches |
| Desktop | Equal child cards, nudge/swipe, stats cards, activity — **untouched** |
| Nav / Children list / child detail | Untouched |
| Version bump / deploy | Web **0.8.23** (this commit) |

## API (small)

`dashboard.overview` already loads devices via `toDeviceClientViews` (includes sanitized `runningApps`) then strips them. Add `runningApps` to the mapped overview device object. Do not add `lastSeenAt` this pass.

## Acceptance

- [ ] Mobile Overview has no stats strip; online child is a remaining hero; offline child is a short row.
- [ ] Niccolo-online / TESTPC-offline matches the owner’s screenshot case.
- [ ] Two online kids both heroes; all offline → all compact.
- [ ] Mobile activity shows 3 rows, no show-more; desktop activity unchanged.
- [ ] Demo Overview matches; desktop Overview unchanged.
- [x] `npm run typecheck -w @warden/api -w @warden/web` and `npm run check:boundaries` with real exit codes.

## Phase log

### Phase 0 — plan lock (2026-11-02)

Owner chose A after Dribbble discussion.

### Phase 1 — implementation (2026-11-02)

**Files changed**

- `packages/api/src/routers/index.ts` — `dashboard.overview` device map includes `runningApps`
- `apps/web/src/components/overview-mobile-child-list.tsx` — shared mobile Now/Away list (new)
- `apps/web/src/app/dashboard/overview-client.tsx` — mobile list, activity filter, remove stats strip
- `apps/web/src/app/demo/page.tsx` — same mobile split
- `apps/web/src/components/recent-activity-card.tsx` — `enableShowMore` prop (default true)
- `apps/web/src/components/dashboard-skeletons.tsx` — mobile Overview skeleton (hero + away row)

**Commands**

```text
npm run typecheck -w @warden/api -w @warden/web  → exit 0
npm run check:boundaries                         → exit 0
```

**Next step:** Owner local visual test on `:3000` (dev server may already be running).

### Phase 2 — orchestrator review (2026-11-02)

Matches locked A. Desktop cards remain in a `hidden md:grid` clone; mobile uses shared list; `runningApps` on overview; activity capped at 3 with no show-more.

Non-blocking: desktop cards still contain a now-dead inner `md:hidden` remaining block. Away rows may show both `Offline · Fri 6:00 PM` and an “Outside allowed hours” chip — drop the chip after testing if it feels redundant.

### Phase 3 — bump + push (2026-11-02)

Owner approved. Web **0.8.22 → 0.8.23**. Agent/mobile unchanged. Agent virtual-desktop work left unstaged.
