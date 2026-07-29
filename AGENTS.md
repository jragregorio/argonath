# AGENTS.md — Warden (Guardian repo)

Instructions for AI coding agents working in this repository.

## Product

Parental screen-time control: a parent web dashboard and a Windows enforcement agent. Repo folder is `Guardian`; npm package name and most namespaces are `warden` / `@warden/*`. Do not rename products, packages, namespaces, executables, APIs, or database objects unless the user explicitly requests it.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Next.js 15 parent dashboard + API host (`@warden/web`). Deployed on Vercel. |
| `apps/agent` | .NET 8 Windows solution (`Warden.sln`). Primary exe: `Warden.Tray`. |
| `packages/api` | tRPC routers, JWT auth, Supabase helpers (`@warden/api`). |
| `packages/db` | Prisma schema + sole `PrismaClient` owner (`@warden/db`). |
| `packages/shared` | Shared types + policy engine (`@warden/shared`). |
| `packages/ui` | Thin `cn()` helper only (`@warden/ui`). UI components live in `apps/web`. |
| `scripts/` | Node utilities (`verify-core-flow`, `reset-usage`, boundary checks). |
| `docs/` | Architecture, ops, AI memory, ADRs, active work. |

`apps/agent` has no `package.json` and is invisible to npm workspaces / Turborepo.

## Dependency rules (enforced)

- Apps may depend on packages. Packages must not import apps.
- No cross-application source imports (`apps/web` ↔ `apps/agent`).
- Acyclic `@warden/*` graph: `web → {api, shared, ui}`, `api → {db, shared}`; `db`, `shared`, `ui` are leaves.
- Only `packages/db` may construct `PrismaClient` / import `@prisma/client` for library use. `apps/web` must not import `@warden/db` in source (access DB via `@warden/api`).
- `packages/ui` must stay free of domain, tRPC, Prisma, and auth logic.
- .NET: `Warden.Core` is a leaf; `Warden.LockUI → Core`; `Warden.Tray` / `Warden.Agent → {Core, LockUI}`. Keep libraries inside `apps/agent` (see ADR-0002).

Validate with `npm run check:boundaries`.

## Commands

```bash
npm install
npm run dev              # turbo: starts @warden/web on :3000
npm run build
npm run typecheck
npm run lint
npm run test             # turbo test (currently @warden/shared vitest)
npm run verify           # typecheck + lint + test + boundaries
npm run db:push          # prisma db push via @warden/db
npm run db:validate      # prisma validate (loads packages/db/.env)
npm run db:up            # docker compose up -d (Postgres)
npm run check:boundaries
npm run test:core        # scripts/verify-core-flow.mjs (needs running web + DB)
npm run test:reset       # scripts/reset-usage.mjs

cd apps/agent
dotnet build
dotnet run --project Warden.Tray
dotnet publish Warden.Tray -c Release -r win-x64 --self-contained true
```

## Environment (names only)

- Web / API process: see `apps/web/.env.example` (includes `AUTH_JWT_SECRET`, Supabase keys, optional `CRON_SECRET`, dev bypass vars).
- Prisma CLI: `packages/db/.env` → `DATABASE_URL`, `DIRECT_URL`.
- Agent: `WARDEN_API_BASE_URL` or `warden.json` `apiBaseUrl`; paired config in `%LOCALAPPDATA%\Warden\config.json`.

Never commit real `.env` / `.env.local` values. Never print secrets.

## Session memory

Before continuing multi-step work, read:

1. `AGENTS.md` (this file)
2. `docs/ai/PROJECT_CONTEXT.md`
3. `docs/ai/CURRENT_STATE.md`
4. Active task under `docs/work/active/` if present

Update the active task file after each phase of substantial work.

## Do not

- Move `apps/web` (Vercel `cd ../..` assumes this depth).
- Convert `Warden.Core` / `Warden.LockUI` into npm packages for symmetry.
- Change business behavior during restructuring / hygiene tasks.
- Rewrite Git history or push unless asked.
- Invent passing validation results.
