# AGENTS.md — `@warden/api`

tRPC app router, custom JWT auth (argon2 + refresh-token families), and Supabase Realtime/Storage helpers.

## Public surface

`src/index.ts` exports `appRouter`, `createContext`, auth session/token helpers, and Supabase helpers.

Consumed by `apps/web` (HTTP adapters). Must not import from `apps/*`.

## Depends on

`@warden/db` (Prisma singleton), `@warden/shared` (types / policy).

## Layout

- `src/routers/` — tRPC procedures
- `src/auth/` — sign-up/in, refresh, family switch, JWT
- `src/lib/supabase.ts` — admin/client, broadcast, snapshot cleanup
- `src/context.ts` — request context

## Build

```bash
npm run build -w @warden/api
npm run typecheck -w @warden/api
```

Source is also consumed directly by Next via workspace linking; keep exports stable.
