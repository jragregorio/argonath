# Warden Windows App

.NET 8 Windows app for system-wide screen time enforcement.

## Recommended install: `Warden.Tray`

Use **`Warden.Tray`** on child devices. It is the full desktop app:

- Shows a **time remaining** countdown the child can open any time
- Runs in the system tray after the window is closed
- Enforces screen-time limits and parent lockdown
- Handles realtime commands (lock, capture, policy updates)

The child can see time left in two places:

1. **Warden window** — large `HH:MM:SS` countdown plus used/limit minutes
2. **Tray icon tooltip** — hover the shield icon for a quick `Xm YYs left` summary

Use tray **Open Warden** or double-click the tray icon to reopen the status window.

## Projects

| Project | Purpose |
|---------|---------|
| `Warden.Tray` | **Primary app** — status window + tray + enforcement |
| `Warden.Core` | Shared logic: API client, policy engine, idle detection, capture |
| `Warden.LockUI` | Full-screen WPF lock overlay |
| `Warden.Agent` | Optional Windows Service (no child UI; advanced/headless use only) |

## Prerequisites

- .NET 8 SDK (to build) or a published `Warden.Tray.exe`
- Windows 10/11

## Development

```bash
# Pair and run (opens the child status window)
dotnet run --project Warden.Tray
```

Closing the window keeps Warden running in the tray. Exit requires the parent PIN.

## Publish for a child PC

```bash
dotnet publish Warden.Tray -c Release -r win-x64 --self-contained false
```

Published binary:

`Warden.Tray/bin/Release/net8.0-windows/win-x64/publish/Warden.Tray.exe`

Before copying to a child machine, edit `warden.json` in the publish folder and set your live dashboard URL:

```json
{
  "apiBaseUrl": "https://your-app.vercel.app"
}
```

Copy the whole publish folder to the child PC (for example `C:\Program Files\Warden\`), run `Warden.Tray.exe` once to pair, then enable **Start with Windows** from the tray menu.

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
