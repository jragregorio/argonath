# Warden

Parental screen time control SaaS with a parent web dashboard and a Windows agent for system-wide enforcement.

## Architecture

- **Parent dashboard** (`apps/web`) — Next.js 15 web app for tracking, policies, extension approvals, and on-demand captures
- **Windows agent** (`apps/agent`) — .NET 8 service for system-wide time tracking, machine lock, and capture execution
- **API** (`packages/api`) — tRPC routers + Supabase Realtime/Storage integration
- **Database** (`packages/db`) — Prisma + Supabase PostgreSQL

## Prerequisites

- Node.js 20+
- .NET 8 SDK (for Windows agent)
- Supabase project (Postgres + Realtime + Storage)
- Clerk account (parent auth)

## Local core testing (no Supabase)

See [DEV-TESTING.md](DEV-TESTING.md) for time limits, lockout, and extension approval without Clerk or Supabase.

Quick start:

```bash
docker compose up -d
npm run db:push
npm run dev
```

## Setup

1. Clone and install dependencies:

```bash
npm install
```

2. Copy environment files:

```bash
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
```

3. Fill in your Clerk, Supabase, and database credentials in `apps/web/.env.local` and `packages/db/.env`.

4. Create a `snapshots` bucket in Supabase Storage (private).

5. Push the database schema:

```bash
npm run db:push
```

6. Start the dev server:

```bash
npm run dev
```

7. Build and run the Windows agent (requires .NET 8 SDK):

```bash
cd apps/agent
dotnet build
dotnet run --project Warden.Tray
```

## Environment variables

See `apps/web/.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase Postgres connection (pooled) |
| `DIRECT_URL` | Supabase Postgres direct connection |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `CRON_SECRET` | Secret for snapshot cleanup cron job |

## Device pairing

1. Sign in to the parent dashboard
2. Add a child profile
3. Click "Generate pairing code"
4. Enter the 6-digit code in the Windows agent setup screen

## License

Private — for parental use on devices you own and manage.
