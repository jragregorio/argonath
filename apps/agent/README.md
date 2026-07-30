# Warden Windows App

.NET 8 Windows app for system-wide screen time enforcement.

## Recommended install: MSI (`Warden.Installer`)

On child PCs, prefer the **per-machine MSI** (installs to `C:\Program Files\Warden\`). See [ADR-0003](../../docs/decisions/0003-per-machine-wix-msi-logon-task.md).

### Build the MSI

Requires WiX Toolset SDK restore via NuGet (no separate WiX install). From `apps/agent`:

```powershell
.\build-installer.ps1
# Optional staging override:
.\build-installer.ps1 -ApiBaseUrl https://staging.example
```

Output: `apps/agent/artifacts/Warden-<version>-x64.msi` (script prints SHA-256 and size).

`Warden.Installer` is **not** in `Warden.sln` on purpose — harvesting the ~256 MB self-contained publish would slow every `dotnet build`. Only build it via `build-installer.ps1`.

The dashboard URL baked into install-time `warden.json` comes from **`Warden.Tray/warden.json`** (`apiBaseUrl`) by default. `-ApiBaseUrl` / MSBuild `WardenApiBaseUrl` are staging overrides only. Release MSI builds **fail** if the effective URL is empty, still the placeholder, or not an absolute `http(s)` URI. After pairing, `%LOCALAPPDATA%\Warden\config.json` wins over `warden.json`.

On first install, pass `CHILDUSER` explicitly (persisted to `HKLM\SOFTWARE\Warden\ChildUser` for later unattended upgrades). Under UAC, default `LogonUser` is often the elevating admin — not the child.

Optional future signing: `-p:SignMsi=true -p:CertificateThumbprint=...` (hook is in the `.wixproj`; unsigned by default).

### Install on a child PC (elevated)

```powershell
msiexec /i Warden-0.5.11-x64.msi CHILDUSER="CHILDPC\ChildAccount"
```

`CHILDUSER` is the Windows account that should get the logon scheduled task. Under UAC, the default `LogonUser` is often the **elevating admin**, not the child — always pass `CHILDUSER` explicitly on family PCs.

The installer:

- Installs per-machine to `C:\Program Files\Warden\`
- Creates a Start Menu shortcut (no desktop shortcut)
- Registers a SYSTEM-created logon task for `CHILDUSER` (LeastPrivilege)
- Best-effort removes a legacy HKCU `Run\Warden` value if reachable
- Does **not** touch `%LOCALAPPDATA%\Warden\config.json` (pairing survives upgrade and uninstall)

When the installer-managed task exists, the tray **Start with Windows** item is checked and disabled.

## Projects

| Project | Purpose |
|---------|---------|
| `Warden.Tray` | **Primary app** — status window + tray + enforcement |
| `Warden.Core` | Shared logic: API client, policy engine, idle detection, capture |
| `Warden.LockUI` | Full-screen WPF lock overlay |
| `Warden.Agent` | Optional Windows Service (no child UI; advanced/headless use only) |
| `Warden.Installer` | WiX 6 MSI (build via `build-installer.ps1` only; not in `Warden.sln`) |

## Prerequisites

- .NET 8 SDK (to build) or the MSI / published `Warden.Tray.exe`
- Windows 10/11

## Development

```bash
# Pair and run (opens the child status window)
dotnet run --project Warden.Tray
```

Closing the window keeps Warden running in the tray. Exit requires the parent PIN.

## Manual publish (dev / zip fallback)

```bash
# Self-contained: includes the .NET runtime (no separate install on the child PC)
dotnet publish Warden.Tray -c Release -r win-x64 --self-contained true
```

Published binary:

`Warden.Tray/bin/Release/net8.0-windows/win-x64/publish/Warden.Tray.exe`

Copy the **entire** publish folder (not just the `.exe`). Self-contained output is larger because it bundles .NET 8.

Before copying to a child machine, edit `warden.json` in the publish folder and set your live dashboard URL:

```json
{
  "apiBaseUrl": "https://your-app.vercel.app"
}
```

Prefer the MSI for real child PCs. Zip/copy remains useful for local debugging.

## Pairing

1. In the parent dashboard, add a child and generate a pairing code
2. Run `Warden.Tray` on the child PC
3. Enter the 6-digit code
4. Warden fetches API and realtime settings automatically

## Optional: Windows Service

`Warden.Agent` is only for headless background enforcement with no child-facing UI. Pair with `Warden.Tray` first, then install the service if you need it:

```bash
dotnet publish Warden.Agent -c Release -r win-x64
sc create WardenAgent binPath= "C:\Program Files\Warden\Warden.Agent.exe" start= auto
sc start WardenAgent
```

For most families, **`Warden.Tray` alone is enough**.

## Configuration

Stored in `%LOCALAPPDATA%\Warden\config.json` after pairing.

## Lock limitations

While locked, Warden blocks common bypass shortcuts (Alt+Tab, Win+Tab, Ctrl+Esc, Alt+F4, etc.).

Windows does **not** allow user-mode apps to block **Ctrl+Alt+Del** or reliably block **Win+L**. Kiosk / policy hardening is out of scope for the current app.
