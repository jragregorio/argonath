# AGENTS.md — `@warden/db`

Sole owner of Prisma schema and `PrismaClient` construction.

## Layout

- `prisma/schema.prisma` — PostgreSQL models
- `src/index.ts` — singleton `prisma` + re-export `@prisma/client`

## Commands

```bash
npm run db:generate -w @warden/db   # prisma generate
npm run db:push -w @warden/db
npm run db:migrate -w @warden/db
npm run db:validate -w @warden/db   # requires packages/db/.env
npm run typecheck -w @warden/db
```

Root aliases: `npm run db:push`, `npm run db:validate`, etc.

## Env

`packages/db/.env` (gitignored): `DATABASE_URL`, `DIRECT_URL`. Copy from `.env.example`. Local Docker DB name is `guardian` (see `docker-compose.yml`).

## Rules

- Do not instantiate `PrismaClient` outside this package.
- Prefer `db push` today; there is no committed `migrations/` folder yet.
- Consumers import `{ prisma }` from `@warden/db`, not `@prisma/client` directly (except root `scripts/` which currently use hoisted `@prisma/client` — known fragility).
