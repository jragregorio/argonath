# Environment variables (names only)

Do not put secret values in documentation. Use `.env.example` files for placeholders.

## `apps/web` / Next process (also consumed by `@warden/api` in-process)

| Name | Role |
|------|------|
| `DATABASE_URL` | Postgres (often also needed by server-side Prisma via `@warden/db`) |
| `DIRECT_URL` | Direct Postgres for Prisma migrate/push |
| `AUTH_JWT_SECRET` | HMAC for access JWTs (32+ chars) |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | Skip sign-in when `true` |
| `DEV_BYPASS_USER_ID` | Dev identity user id |
| `DEV_BYPASS_FAMILY_ID` | Dev identity family id |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role |
| `SUPABASE_URL` | Alternate URL read by API helpers |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `CRON_SECRET` | Protects `/api/cron/cleanup` |
| `VERCEL_URL` | Provided by Vercel; used for absolute URLs |
| `PORT` | Local port fallback |
| `NODE_ENV` | Node environment |

Files: `apps/web/.env.local` (gitignored), template `apps/web/.env.example`.

## `packages/db` (Prisma CLI)

| Name | Role |
|------|------|
| `DATABASE_URL` | Datasource URL |
| `DIRECT_URL` | Direct URL |

File: `packages/db/.env` (gitignored), template `packages/db/.env.example`.

## Scripts

| Name | Role |
|------|------|
| `BASE_URL` | `verify-core-flow.mjs` target (default `http://localhost:3000`) |
| `DEV_BYPASS_FAMILY_ID` | Same script family default |

## Agent (.NET)

| Name | Role |
|------|------|
| `WARDEN_API_BASE_URL` | Override API base when not paired / no `warden.json` |

## Docker Compose (container env only)

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (`guardian`).
