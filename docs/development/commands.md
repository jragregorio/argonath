# Development commands

## Root (npm workspaces + turbo)

| Script | Purpose |
|--------|---------|
| `npm run build` | `turbo build` |
| `npm run dev` | `turbo dev` (web on :3000) |
| `npm run lint` | `turbo lint` |
| `npm run typecheck` | `turbo typecheck` |
| `npm run test` | `turbo test` |
| `npm run verify` | typecheck + lint + test + boundaries |
| `npm run check:boundaries` | `scripts/check-boundaries.mjs` |
| `npm run db:generate` / `db:push` / `db:migrate` / `db:validate` | Prisma via `@warden/db` |
| `npm run db:up` | `docker compose up -d` |
| `npm run test:core` | End-to-end agent flow script |
| `npm run test:reset` | Clear usage/extensions for retest |

## .NET

```bash
dotnet build apps/agent/Warden.sln
dotnet run --project apps/agent/Warden.Tray
```

## Prerequisites

Node 20+, .NET 8 SDK (agent), Docker Desktop (local Postgres).
