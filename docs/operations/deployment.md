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
npm run publish:agent -- --msi apps/agent/artifacts/Warden-0.5.15-x64.msi --channel stable
# equivalent:
node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.5.15-x64.msi --channel stable
```

Requires `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), and `DATABASE_URL` (loaded from `apps/web/.env.local` / `packages/db/.env` when unset). Storage key: `releases/<channel>/Warden-<version>-x64.msi`. Optional flags: `--channel test`, `--mandatory`, `--version X.Y.Z`.

Parents download via the child detail **Devices** card (**Download for Windows**). Agents receive an optional heartbeat `update` hint when a newer stable release exists (Phase 3 applies it).

### Install on child PC (elevated)

**Interactive install:** the MSI wizard shows a **child Windows account** picker (non-admin local accounts, editable for domain accounts). Do not choose the parent admin that elevates the installer.

**Silent install / Phase 3 upgrades:** pass `CHILDUSER` explicitly (or rely on the persisted HKLM value):

```powershell
msiexec /i Warden-0.5.15-x64.msi CHILDUSER="CHILDPC\ChildAccount" /qn
```

`CHILDUSER` is persisted under `HKLM\SOFTWARE\Warden\ChildUser` so SYSTEM-driven silent upgrades re-register the logon task for the same child account. Quiet installs (`UILevel <= 3`) may still fall back to `[LogonUser]` if neither cmdline nor HKLM is set; full UI never uses that fallback.

Pairing state in `%LOCALAPPDATA%\Warden\config.json` is preserved across MSI upgrade and uninstall.

### Troubleshooting: agent does not start at boot / logon

1. Run the read-only diagnostic on the child PC (elevated):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\diagnose-warden-startup.ps1 -OutFile "$env:USERPROFILE\Desktop\warden-startup-diag.txt"
```

2. Read the **VERDICT** line (task UserId vs current user) and **LIKELY CAUSE**.
3. Repair the logon task (v0.5.14+, elevated):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Program Files\Warden\Repair-WardenStartup.ps1" -UserId "CHILDPC\ChildAccount"
```

4. Logs: `%LOCALAPPDATA%\Warden\logs\` (app) and `C:\ProgramData\Warden\logs\` (installer/SYSTEM).

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
