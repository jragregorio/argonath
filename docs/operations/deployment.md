# Deployment

## Web (`@warden/web`)

- Platform: Vercel (assumed from `apps/web/vercel.json`).
- `installCommand`: `cd ../.. && npm install`
- `buildCommand`: `cd ../.. && npx turbo run build --filter=@warden/web`
- Requires env vars listed in [environment.md](environment.md) and `apps/web/.env.example`.
- Create private Supabase Storage bucket `snapshots` for capture features.

## Windows agent

1. `dotnet publish Warden.Tray -c Release -r win-x64 --self-contained false` from `apps/agent`
2. Set `apiBaseUrl` in publish-folder `warden.json` to the live dashboard URL
3. Copy publish folder to child PC; pair with dashboard code; enable Start with Windows from tray

Optional: publish/install `Warden.Agent` as a Windows Service (see `apps/agent/README.md`).

## Database

- Production: Supabase Postgres (pooled `DATABASE_URL` + `DIRECT_URL`)
- Local: `docker compose up -d` then `npm run db:push`

## CI

No CI provider is configured in-repo. Prefer `npm run verify` plus `dotnet build apps/agent/Warden.sln` when adding pipelines.
