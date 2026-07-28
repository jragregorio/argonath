# Warden

Parental screen time control SaaS with a parent web dashboard and a Windows agent for system-wide enforcement.

## Architecture

- **Parent dashboard** (`apps/web`) — Next.js 15 web app for tracking, policies, extension approvals, and on-demand captures
- **Windows app** (`apps/agent/Warden.Tray`) — .NET 8 tray app for system-wide time tracking, lockdown, and a child-facing time-remaining display
- **API** (`packages/api`) — tRPC routers + custom JWT auth + Supabase Realtime/Storage integration
- **Database** (`packages/db`) — Prisma + Supabase PostgreSQL

## Prerequisites

- Node.js 20+
- .NET 8 SDK (for Windows agent)
- Supabase project (Postgres + Realtime + Storage)

## Local core testing (no Supabase)

See [DEV-TESTING.md](DEV-TESTING.md) for time limits, lockout, and extension approval without Supabase (optional auth bypass).

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

3. Fill in `AUTH_JWT_SECRET` (32+ characters), Supabase, and database credentials in `apps/web/.env.local` and `packages/db/.env`. For Vercel + Supabase PgBouncer, use the pooled `DATABASE_URL` on port `6543` with `pgbouncer=true&connection_limit=5&pool_timeout=30`.

4. Create a `snapshots` bucket in Supabase Storage (private).

5. Push the database schema:

```bash
npm run db:push
```

6. Start the dev server:

```bash
npm run dev
```

7. Create an account at `/sign-up`, or set `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` for local testing without sign-in.

8. Build and run the Windows app on a child PC (requires .NET 8 SDK to build, or use a published `Warden.Tray.exe`):

```bash
cd apps/agent
dotnet build
dotnet run --project Warden.Tray
```

The tray app shows a **time remaining** countdown. Closing the window keeps Warden in the system tray — the child can reopen it anytime to check time left.

## Environment variables

See `apps/web/.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase Postgres pooled connection (`6543`) with `pgbouncer=true&connection_limit=5&pool_timeout=30` |
| `DIRECT_URL` | Supabase Postgres direct connection |
| `AUTH_JWT_SECRET` | HMAC secret for access JWTs (32+ chars) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `CRON_SECRET` | Secret for snapshot cleanup cron job |

## Auth overview

- Parent dashboard: email/password (argon2), 15-minute JWT access cookies + rotating refresh-token families
- Roles: `Admin`, `Parent`, `Child` (family memberships)
- Windows agent: pairing code → long-lived `deviceToken` (unchanged; separate from parent auth)

## Device pairing

1. Sign in to the parent dashboard
2. Add a child profile
3. Click "Generate pairing code"
4. Enter the 6-digit code in `Warden.Tray` on the child PC

## License

Private — for parental use on devices you own and manage.
