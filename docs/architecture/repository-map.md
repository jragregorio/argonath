# Repository map

```
Guardian/
  apps/
    web/                 Next.js parent dashboard + API host
      src/app/           Routes, API handlers, middleware
      src/components/    Dashboard UI + local ui/* primitives
      src/lib/           tRPC clients, realtime, auth cookies
      vercel.json        Monorepo install/build (cd ../..)
    agent/
      Warden.sln
      Warden.Tray/       Primary Windows exe
      Warden.Core/       Shared .NET library
      Warden.LockUI/     Lock overlay
      Warden.Agent/      Optional Windows Service
  packages/
    api/                 @warden/api — tRPC + auth
    db/                  @warden/db — Prisma
    shared/              @warden/shared — types + policy
    ui/                  @warden/ui — cn()
  scripts/               verify-core-flow, reset-usage, check-boundaries
  docs/                  This documentation tree
  docker-compose.yml     Postgres 16 (DB name guardian)
```

## HTTP surfaces (web)

| Path | Role |
|------|------|
| `/api/trpc/*` | Parent tRPC |
| `/api/agent` | Windows agent protocol |
| `/api/auth/*` | Sign-in/up, refresh, logout, switch-family |
| `/api/cron/cleanup` | Snapshot cleanup (`CRON_SECRET`) |

## Agent ↔ web

`Warden.Tray` calls `apiBaseUrl` + `/api/agent` (REST). Optional Supabase Realtime for pushes when configured.
