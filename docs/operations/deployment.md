# Deployment

## Web (`@warden/web`)

- Platform: Vercel (assumed from `apps/web/vercel.json`).
- `installCommand`: `cd ../.. && npm install`
- `buildCommand`: `cd ../.. && npx turbo run build --filter=@warden/web`
- Requires env vars listed in [environment.md](environment.md) and `apps/web/.env.example`.
- Create private Supabase Storage bucket `snapshots` for capture features.
- Create private Supabase Storage bucket `agent-releases` for Windows MSI artifacts
  (MIME open; file size limit ≥100MB). Parent dashboard **Download for Windows**
  uses signed URLs from `agentRelease.latest`.

## Windows agent

Preferred path: **per-machine MSI** (see [ADR-0003](../decisions/0003-per-machine-wix-msi-logon-task.md)).

### Build MSI

From `apps/agent`:

```powershell
.\build-installer.ps1
# Optional staging override of Warden.Tray/warden.json:
.\build-installer.ps1 -ApiBaseUrl https://staging.example
```

- Artifact: `apps/agent/artifacts/Warden-<version>-x64.msi`
- Script prints **SHA-256** and byte size (needed later for auto-update verification).
- Default `apiBaseUrl` is read from `apps/agent/Warden.Tray/warden.json`; `-ApiBaseUrl` / `WardenApiBaseUrl` are overrides.
- `Warden.Installer` is **not** part of `Warden.sln`; do not expect `dotnet build Warden.sln` to produce an MSI.

### Publish MSI (release backend)

After building the MSI, upload to Supabase Storage and upsert the `AgentRelease` row:

```bash
npm run publish:agent -- --msi apps/agent/artifacts/Warden-0.5.11-x64.msi --channel stable
# equivalent:
node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.5.11-x64.msi --channel stable
```

Requires `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), and `DATABASE_URL` (loaded from `apps/web/.env.local` / `packages/db/.env` when unset). Storage key: `releases/<channel>/Warden-<version>-x64.msi`. Optional flags: `--channel test`, `--mandatory`, `--version X.Y.Z`.

Parents download via the child detail **Devices** card (**Download for Windows**). Agents receive an optional heartbeat `update` hint when a newer stable release exists (Phase 3 applies it).

### Install on child PC (elevated)

```powershell
msiexec /i Warden-0.5.11-x64.msi CHILDUSER="CHILDPC\ChildAccount"
```

Pass `CHILDUSER` explicitly on **first install**. It is persisted under `HKLM\SOFTWARE\Warden\ChildUser` so Phase 3 SYSTEM-driven silent upgrades re-register the logon task for the same child account (without relying on `LogonUser`, which would be `SYSTEM`). Under UAC elevation, the default logon user is often the admin who elevated, not the child.

Pairing state in `%LOCALAPPDATA%\Warden\config.json` is preserved across MSI upgrade and uninstall.

### Zip / publish fallback

1. `dotnet publish Warden.Tray -c Release -r win-x64 --self-contained true` from `apps/agent`
2. Set `apiBaseUrl` in publish-folder `warden.json` to the live dashboard URL
3. Copy publish folder to child PC; pair with dashboard code

Optional: publish/install `Warden.Agent` as a Windows Service (see `apps/agent/README.md`).

## Database

- Production: Supabase Postgres (pooled `DATABASE_URL` + `DIRECT_URL`)
- Local: `docker compose up -d` then `npm run db:push`

## CI

No CI provider is configured in-repo. Prefer `npm run verify` plus `dotnet build apps/agent/Warden.sln` when adding pipelines. MSI builds are a separate step via `apps/agent/build-installer.ps1`. Do **not** publish MSIs from CI unless secrets and the `agent-releases` bucket are explicitly wired.
