# AGENTS.md — Windows agent (`apps/agent`)

.NET 8 Windows Forms / WPF solution for child-device enforcement.

## Projects (`Warden.sln`)

| Project | Role |
|---------|------|
| `Warden.Tray` | **Primary app** — status window, tray, enforcement |
| `Warden.Core` | Shared library: API client, policy, idle, capture (leaf) |
| `Warden.LockUI` | Full-screen lock overlay (`→ Core`) |
| `Warden.Agent` | Optional Windows Service (no child UI) |

## Commands

```bash
cd apps/agent
dotnet build
dotnet run --project Warden.Tray
dotnet publish Warden.Tray -c Release -r win-x64 --self-contained true
```

Publish output: `Warden.Tray/bin/Release/net8.0-windows/win-x64/publish/`. Copy the whole folder (bundles .NET 8). Edit `warden.json` `apiBaseUrl` before deploying to a child PC.

## Config

- Bootstrap: `warden.json` next to the exe, or `WARDEN_API_BASE_URL`
- After pairing: `%LOCALAPPDATA%\Warden\config.json`

## Boundaries

Keep `Warden.Core` / `Warden.LockUI` inside this folder (ADR-0002). ProjectReferences must stay sibling-relative under `apps/agent`. No npm package for these libraries.

Details: `apps/agent/README.md`.
