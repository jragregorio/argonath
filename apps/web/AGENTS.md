# AGENTS.md — `@warden/web`

Next.js 15 App Router parent dashboard and HTTP host for tRPC + agent REST.

## Entry points

- UI: `src/app/` (dashboard, sign-in/up, middleware)
- tRPC: `src/app/api/trpc/[trpc]/route.ts` → `@warden/api`
- Agent REST: `src/app/api/agent/route.ts`
- Auth cookies: `src/app/api/auth/*`
- Cron cleanup: `src/app/api/cron/cleanup/route.ts` (requires `CRON_SECRET`)

## Depends on

`@warden/api`, `@warden/shared`, `@warden/ui`. Declares `@warden/db` for Next `serverExternalPackages` only — **do not import `@warden/db` in `src/`**.

Path alias: `@/*` → `./src/*`. UI primitives: `src/components/ui/*` (import `cn` from `@warden/ui`).

## Commands

```bash
npm run dev -w @warden/web    # or root npm run dev
npm run build -w @warden/web
npm run lint -w @warden/web
npm run typecheck -w @warden/web
```

## Deploy

`vercel.json` runs install/build from monorepo root via `cd ../..`. Keep this app at `apps/web`.

## Env

Copy `.env.example` → `.env.local`. See root `AGENTS.md` and `docs/operations/environment.md`.
