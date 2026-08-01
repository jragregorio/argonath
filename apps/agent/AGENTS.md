# AGENTS.md — Windows agent (`apps/agent`)

.NET 8 Windows Forms / WPF solution for child-device enforcement.

## Projects (`Warden.sln`)

| Project | Role |
|---------|------|
| `Warden.Tray` | **Primary app** — status window, tray, enforcement |
| `Warden.Core` | Shared library: API client, policy, idle, capture (leaf) |
| `Warden.LockUI` | Full-screen lock overlay (`→ Core`) |
| `Warden.Agent` | Optional Windows Service (no child UI) |
| `Warden.Installer` | WiX 6 MSI — **not** in `Warden.sln`; build with `build-installer.ps1` |

## Commands

```bash
cd apps/agent
dotnet build
dotnet run --project Warden.Tray
dotnet publish Warden.Tray -c Release -r win-x64 --self-contained true

# MSI (reads apiBaseUrl from Warden.Tray/warden.json by default)
powershell -File .\build-installer.ps1
```

Publish output: `Warden.Tray/bin/Release/net8.0-windows/win-x64/publish/`. Prefer the MSI for child PCs (`C:\Program Files\Warden\`). For zip deploys, copy the whole publish folder and edit `warden.json` `apiBaseUrl`.

## Config

- Bootstrap: `warden.json` next to the exe, or `WARDEN_API_BASE_URL`
- After pairing: `%LOCALAPPDATA%\Warden\config.json`
- MSI install: pass `CHILDUSER="COMPUTER\ChildAccount"` so the logon task targets the child (not the elevating admin)

## Versioning

**Agent version is independent of web/packages** (ADR-0004). Sole owner:

| Line | File | Who bumps it |
|------|------|----------------|
| Agent / MSI | `apps/agent/Directory.Build.props` → `$(Version)` | Agent releases only |
| Web / npm | `apps/web/package.json`, `packages/*/package.json` | Web releases only — never here |

Runtime reads `AgentVersionInfo.Current` from the assembly. Do not hardcode agent version strings. Agent versions must **only increase** (field agents + MSI downgrade protection).

## Boundaries

Keep `Warden.Core` / `Warden.LockUI` inside this folder (ADR-0002). ProjectReferences must stay sibling-relative under `apps/agent`. No npm package for these libraries. Installer decisions: ADR-0003. Version ownership: ADR-0004.

Details: `apps/agent/README.md`.
