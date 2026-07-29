# Project context (verified)

## What this is

Warden is a parental screen-time SaaS: parents use a web dashboard; children run a Windows tray app that enforces daily limits, lock overlays, extension requests, optional captures, and nudges.

## Deployable applications

1. **`apps/web` (`@warden/web`)** — Next.js 15. Hosts parent UI, tRPC, auth routes, agent REST (`/api/agent`), cron cleanup. Target: Vercel (`apps/web/vercel.json`).
2. **`apps/agent/Warden.Tray`** — .NET 8 WinForms/WPF primary child app. Optional **`Warden.Agent`** Windows Service for headless use.

## Reusable packages

| Package | Responsibility |
|---------|----------------|
| `@warden/api` | tRPC routers, JWT auth, Supabase helpers |
| `@warden/db` | Prisma schema + sole `PrismaClient` |
| `@warden/shared` | Types + policy engine (+ vitest) |
| `@warden/ui` | `cn()` helper only |

## Naming

- Repo directory: often `Guardian`
- Root npm package: `warden`
- Scoped packages: `@warden/*`
- Docker Postgres DB name: `guardian`
- .NET namespaces: `Warden.*`

Inconsistency is intentional legacy; do not mass-rename.

## Runtime integrations

- PostgreSQL (local Docker or Supabase)
- Supabase Realtime + Storage (snapshots; optional for core lock/extension testing)
- Custom JWT cookies for parents; device pairing token for agent

## Out of scope for agents unless asked

Renaming public APIs, packages, namespaces, DB objects; rewriting Git history; changing product behavior during hygiene/restructure work.
