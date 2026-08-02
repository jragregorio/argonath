# Web dashboard performance

**Started:** 2026-07-29
**Status:** Phase 3 complete — indexes applied, `relationJoins` enabled. One
open decision: local Postgres for development.

## Symptom

Parent dashboard feels slow during menu navigation and on action buttons
(Nudge, Request approval / Approve-Deny, Screenshot).

## Environment (measured, not assumed)

| Fact | Value |
|------|-------|
| Web host | `localhost:3000` (`next dev`, webpack — no `--turbopack`) |
| Postgres | Supabase pooler `aws-0-ap-southeast-1` port 6543, `pgbouncer=true`, no `connection_limit` |
| TCP RTT to DB | 34–41 ms steady (112 ms first connect) |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | `false` → real JWT path is the hot path |
| Access token TTL | 15 min (`ACCESS_TOKEN_TTL_SECONDS`) |

Latency is dominated by the **count of sequential DB round trips per request**,
not by query cost.

### Measured cost per Prisma call (the dominant factor)

The initial estimate of ~40 ms per query was **wrong by 4-10x**. Measured:

| Prisma call | Statements sent | Wall time |
|-------------|-----------------|-----------|
| `device.count()` | 4 — `BEGIN, DEALLOCATE, SELECT, COMMIT` | ~185 ms |
| `requireFamilyAccess` shape | 4 | ~193 ms |
| `getChildForFamily` shape (3 `include`s) | 7 — `BEGIN, DEALLOCATE, SELECT x4, COMMIT` | ~420 ms |
| `dashboard.overview` children (3 `include`s) | 7 | ~415 ms |
| `agent.getPolicy` child (3 `include`s) | 7 | ~430 ms |

Two multipliers stack:

1. **`pgbouncer=true` wraps every call in `BEGIN` / `DEALLOCATE ALL` / … /
   `COMMIT`** — 3 extra round trips per call. This flag is **required** and must
   not be removed (see "Connection string: do not change" below).
2. **Prisma issues one `SELECT` per `include` relation**, all inside that one
   transaction. Three relations turns 4 round trips into 7.

### Next.js dev server overhead

A route that touches no database at all costs ~325 ms:

| Request | Median |
|---------|--------|
| `GET /api/agent` → 401, no DB | 327 ms |
| `POST /api/agent` bogus action → 400, no DB | 325 ms |

This is `next dev` per-request overhead and does not exist in a production
build. It is roughly 30% of observed local request time.

### Connection string: do not change

`DATABASE_URL` uses the Supavisor **transaction** pooler (6543) with
`pgbouncer=true`. It is tempting to drop that flag since it costs 3 round trips
per query. Measured under 16-way concurrency, 30 rounds:

| Mode | Result |
|------|--------|
| A. 6543 `pgbouncer=true` (current) | 480 queries, **0 errors**, batch median 369 ms |
| B. 6543 without `pgbouncer=true` | **436 of 480 queries failed** (prepared statement errors) |
| C. 5432 session pooler (`DIRECT_URL`) | 30 errors — `EMAXCONNSESSION: max clients ... pool_size: 15` |

Supabase and Prisma both document that Supavisor transaction mode does not
support named prepared statements, so `pgbouncer=true` is mandatory. A low-
concurrency test misleadingly passes on mode B — do not trust it.

**Conclusion:** the connection config is already correct. The only levers are
(a) fewer queries per request, (b) fewer `include` relations per query, and
(c) for local dev, a database that is not 35 ms away.

## Root causes

### A. Serialized per-request round trips (affects every request)

1. `packages/api/src/context.ts:34-46` — `refreshToken.findUnique` runs on
   **every** tRPC request. `ctx.refreshTokenFamilyId` is consumed by exactly
   one procedure: `auth.changePassword` (`routers/index.ts:313`). ~40 ms wasted
   per request.
2. `packages/api/src/routers/index.ts:37-39` — `getFamilyForUser` →
   `requireFamilyAccess` (`auth/session.ts:362-378`) runs a `familyMember`
   lookup at the top of ~30 procedures, serialized before the real query. The
   JWT already carries `fid` + `role`. Because tRPC batches N procedures into
   one HTTP request, a 4-query page load pays 4 identical lookups.
   Only `family.get`, `family.getOrCreate`, `family.rename`, `family.updatePin`
   use fields beyond `family.id`; the other 28 call sites use `family.id` only,
   which already equals `ctx.familyId`.
3. `logAudit` (`routers/index.ts:113-122`) is awaited serially at the end of
   every mutation. +40 ms per action.

### B. Awaited Supabase Realtime broadcast inside mutations

`broadcastToDevice` (`lib/supabase.ts:101-132`) awaits channel `SUBSCRIBED` on
first use per device per process, with an 800 ms timeout
(`lib/supabase.ts:67-99`). Awaited (not fire-and-forget) in:

| Call site | Lines |
|-----------|-------|
| `extension.resolve` | `938-949` |
| `policy.update` (sequential per-device loop) | `448-454` |
| `agent.heartbeat` (device coming online) | `1612-1618` |
| `agent.parentUnlock` | `1715-1720` |
| `agent.setLocked` | `1943-1947` |
| `agent.clearAdminLock` | `1973-1978` |

`sendNudge`, `setAdminLock`, `requestCapture`, `confirmSnapshot` already void it.

### Measured round-trip budget per action

| Action | Sequential RTTs | Est. latency |
|--------|-----------------|--------------|
| Nudge | context refresh, family, device, active-nudge, create, audit = 6 | ~270 ms |
| Approve/Deny | 7 DB + awaited broadcast | ~500 ms–1.1 s |
| Screenshot | 6 DB + `createSignedUploadUrl` HTTP | ~420 ms |

### C. Navigation

1. **No `loading.tsx` anywhere** in `apps/web/src`. `dashboard/layout.tsx`
   awaits `prefetchDashboardShell()`, and `trpc-server.ts:22` calls `cookies()`,
   making `/dashboard/*` dynamic. Next 15 only prefetches the loading boundary
   for dynamic routes — with no boundary, `<Link>` prefetch is a no-op and every
   navigation blocks on a fresh RSC round trip before any UI changes.
2. Every dashboard page is `"use client"` and gates the whole page on
   `isLoading`, so nothing paints until the slowest query resolves.
   `extensions/page.tsx:46` gates Pending on History finishing.
3. `next dev` runs webpack, compiling each route on first visit.

### D. Refetch storms

1. `lib/family-realtime.tsx:27-63` — one `nudge:seen` invalidates 6 query
   families, including **unscoped** `children.get` and `policy.getEvaluation`
   (all children, not the affected one).
2. 4+ concurrent `refetchInterval` queries on every page (2 shell + 2 page) at
   30 s / 60 s, on top of Realtime.
3. `dashboard-nav.tsx:122` — unscoped `utils.invalidate()` on family switch.
4. Global `isPending` disables *all* Approve/Deny (`extensions/page.tsx:99-121`)
   and *all* Nudge buttons (`overview-client.tsx:489-500`).
5. Nudge poll effect depends on `nudgeByDevice`, restarting its 2 s interval on
   every label change (`overview-client.tsx:116-166`).

### E. Lower priority

- `snapshot.list` signs up to 50 URLs per call (cache in `signed-url-cache.ts`
  covers warm processes).
- Agent polls `pendingCaptures` at 1 Hz; sequential Storage calls per pending row.
- Missing composite indexes for observed filter+sort shapes.
- `getJwtSecret()` re-encodes the secret per sign/verify.
- Middleware redirects through `/api/auth/refresh` on access-token expiry,
  doubling one navigation every 15 min.

## Fixes landed (Phase 2)

Server (`packages/api`, `packages/db`):

- `context.ts` — refresh-token lookup is now lazy/memoized
  (`resolveRefreshTokenFamilyId`); only `auth.changePassword` pays for it.
  Removes one ~185 ms query from **every** request.
- `context.ts` — added memoized `loadFamily()`. A batched tRPC request with 4
  procedures now does 1 membership lookup instead of 4 (~580 ms saved per page
  load). Memoization lives inside `createContext`, so both HTTP adapters in
  `apps/web` benefit without changes.
- Membership assertion moved into `Promise.all` alongside the real query in the
  hot read paths and in `sendNudge`, `extension.resolve`, `requestCapture`.
  Authorization is unchanged — every check still runs and still throws.
- Awaited `broadcastToDevice` replaced with the existing fire-and-forget pattern
  in `extension.resolve`, `policy.update` (was a sequential per-device loop),
  `agent.heartbeat`, `parentUnlock`, `setLocked`, `clearAdminLock`.
- Parallelized independent writes in `extension.resolve`, `parentUnlock`,
  `clearAdminLock`; `auth.me`; rewrote `agent.getPolicy` to use `ctx.device`
  instead of re-fetching the device row.
- `auth/tokens.ts` — JWT secret encoded once at module scope.
- `schema.prisma` — composite indexes added. **Not applied yet**; needs
  `npm run db:push`.

Client (`apps/web`):

- Added 6 `loading.tsx` boundaries. Without one, Next 15 cannot prefetch a
  dynamic route, so every menu click previously blocked on a server round trip
  before any pixel changed.
- `family-realtime.tsx` — per-event invalidation, scoped by `childId` resolved
  from the cached `device.list`. `nudge:seen` / `nudge:show` no longer invalidate
  anything (they change no queried data; pages listen directly).
- Per-item pending state for Approve/Deny and Nudge; optimistic removal from
  `extension.listPending`.
- Nudge poll effect keyed on stable nudge ids and parallelized; capture
  completion consolidated onto Realtime with a bounded poll fallback.
- Poll intervals raised (`POLL_LIVE_MS` 60 s, `POLL_BACKGROUND_MS` 120 s, new
  `POLL_SAFETY_MS` 240 s). `device.list` keeps a 2 min poll because
  `device:offline` is never broadcast — only `device:online` is.
- `AllowedWindowsEditor` lazy-loaded; `next dev --turbopack` (boots in 2.2 s).

## Validation (real exit codes)

| Command | Result |
|---------|--------|
| `npm run verify` (typecheck + lint + test + boundaries) | **exit 0** |
| `npm run test:core` (pair → heartbeat → getPolicy → extension) | **PASS** — all core flow checks passed |
| `npm run dev -w @warden/web` | Ready in 2.2 s (Turbopack), all routes served |
| `curl` all dashboard routes | `/sign-in` 200; `/dashboard/*` 307 to sign-in (middleware correct) |

Lint warnings are pre-existing only (`no-img-element` in snapshots,
`exhaustive-deps` in `realtime.ts`).

Verification data created by `test:core` was removed afterwards.

## Phase 3 — done

### Indexes applied

`npm run db:push` → "Your database is now in sync with your Prisma schema."
(The bundled `prisma generate` step failed once with `EPERM` because orphaned
`next dev` child processes held `query_engine-windows.dll.node`; killing them and
re-running `db:generate` succeeded. Kill the whole dev-server process tree, not
just the parent `npm` process.)

### `relationJoins` enabled

`previewFeatures = ["relationJoins"]` added to the generator block in
`packages/db/prisma/schema.prisma`. Enabling the flag makes
`relationLoadStrategy: "join"` the **default**, so no query code in
`packages/api` needed changing.

Measured per-call, and results verified deep-equal between the two strategies:

| Query shape | `query` strategy | `join` strategy |
|-------------|------------------|-----------------|
| `getChildForFamily` | 7 statements / 665 ms | **4 / 189 ms** |
| `dashboard.overview` children | 7 / 381 ms | **4 / 180 ms** |
| `agent.getPolicy` child | 7 / 390 ms | **4 / 178 ms** |
| `device.list` (1 relation) | 4 / 194 ms | 4 / 168 ms |
| `snapshot.list` (2 relations) | 4 / 177 ms | 4 / 172 ms |

Shapes with three relations improve 2-3.5x. Shallow ones are unchanged.

### End-to-end result

`GET /api/agent?action=policy`, median of 10, local dev:

| | Median |
|---|--------|
| Before any fixes | 1071 ms |
| After all fixes | **759 ms** |
| of which `next dev` overhead (no DB) | 360 ms |

Server-side work roughly halved (~745 ms → ~400 ms). The `next dev` component
does not exist in a production build.

### Re-validation after Phase 3

| Command | Result |
|---------|--------|
| `npm run verify` | **exit 0** (8/8, 4/4, 4/4, boundaries passed) |
| `npm run test:core` | **PASS** |
| `npm run dev` | Ready in 1491 ms |

## Still open

1. **Local Postgres for development** — the one remaining large lever. See
   "Connection string: do not change"; the cost is inherent to talking to a
   35 ms-away transaction pooler. `docker-compose.yml` and `npm run db:up`
   already exist. Tradeoff: Supabase Storage/Realtime (snapshots, nudges) still
   requires the hosted project, so a local DB means snapshot capture cannot be
   exercised end to end, and local data starts empty.
2. `snapshot.list` signs up to 50 URLs per call; consider lazy per-item signing.
3. Middleware redirects through `/api/auth/refresh` on access-token expiry,
   doubling one navigation every 15 min. Could refresh in place instead.
4. Agent polls `pendingCaptures` at 1 Hz; each poll now costs ~780 ms locally.
   Consider backing off when idle.

## Phase 4 — live LCP diagnosis (2026-08-02)

**Symptom:** Chrome local metrics on live show LCP **10.48 s** (poor), CLS 0.01 /
INP 16 ms (good). Local `npm run dev` feels fast.

**Orchestrator:** Opus 5 (`59eaa848-f822-4e1c-bc60-097fb9de3044`).
**Executor:** Grok 4.5 — measurement only; no code changes.

### Live host / region evidence (measured)

| Probe | Result |
|-------|--------|
| Host | `https://warden-alpha.vercel.app` |
| Homepage | prerendered, `X-Vercel-Cache: HIT`, warm TTFB ~150–170 ms |
| Edge (`X-Vercel-Id` first segment) | `sin1` (Singapore) |
| Node `/api/agent` (401, no DB) | `sin1::iad1::…` — **function region = `iad1` (US East)** |
| `/api/agent` TTFB ×5 | 0.42–0.45 s steady (edge→iad1 hop even without Prisma) |
| DB (from earlier Phase notes) | Supabase pooler `aws-0-ap-southeast-1` |
| `vercel.json` | no `regions` key → Node defaults to `iad1` |

Static marketing pages are not the 10 s problem. Authenticated `/dashboard` is.

### Cause chain (ranked)

1. **Region mismatch (primary multiplier).** Vercel Node runs in `iad1`; Postgres
   is in `ap-southeast-1`. Every Prisma round trip pays trans-Pacific RTT. Local
   dev talks to the same DB at ~35–41 ms RTT; live functions pay ~5–6× that per
   statement, on top of `pgbouncer=true` multi-statement wraps.
2. **LCP gated on client tRPC.** `dashboard/page.tsx` re-exports
   `overview-client.tsx`, which returns text-free `OverviewSkeleton` until
   `dashboard.overview` resolves. Prefetch only covers `navBadges` +
   `device.list` — not overview/activity/`auth.me`.
3. **Blocking layout SSR.** `dashboard/layout.tsx` `await`s
   `prefetchDashboardShell()` with no Suspense above it, so document HTML waits
   on two cold Prisma procedures before any shell streams.
4. **Auth refresh detour (cold visits every 15 min).** Middleware redirects page
   navigations to `/api/auth/refresh` (Node + sequential Prisma in
   `refreshSession`) then back — extra document RTT(s) before (2)/(3).

Rough cold-visit budget that reaches ~10 s: refresh chain (2–4 s from iad1) +
blocking SSR prefetch (1–3 s) + hydrate (0.5–1.5 s) + client overview batch
(1.5–3 s). Warm-token visits still look multi-second because of (1)+(2)+(3).

### Why local feels fine

- Next runs on the laptop (no `iad1` function hop).
- DB RTT ~35 ms vs function→DB ~200 ms+.
- Dev often uses `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` (skips middleware refresh);
  even with bypass off, local never pays US-East→Singapore per query.

### Not yet proven (need signed-in DevTools)

Acceptance items still open without cookies: LCP element identity, TTFB vs LCP
split on `/dashboard`, cold vs warm redirect list, `/api/trpc` batch timing with
auth cookies. Code + region probes are sufficient to explain the live/dev gap.

### Region pin applied (2026-08-02)

`"regions": ["sin1"]` added to `apps/web/vercel.json` so Node co-locates with
Supabase `ap-southeast-1`. Needs a Vercel redeploy. After deploy, `/api/agent`
`X-Vercel-Id` should show `sin1::sin1::…` (not `sin1::iad1::…`).

### Do not change yet

Fonts, marketing animations, TTL lengthening, edge runtime for Prisma, or
bundle-only tweaks. Remaining LCP candidates after region deploy: SSR/prefetch
`dashboard.overview`, stream layout past non-LCP shell prefetch.

## Sources

- API audit: agent `35670c2e-7747-4b2c-a4e1-50cdea6adb9f`
- Client audit: agent `007a9a40-48bf-4788-80a1-625aeee2b9ff`
- Server fixes: agent `3fd18c89-4a98-480a-8388-16f05c828d26`
- Client fixes: agent `654aa13a-7a1d-41fb-82f4-5ef1647d2567`
