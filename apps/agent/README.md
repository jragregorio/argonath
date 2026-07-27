# Argonath Windows Agent

.NET 8 Windows agent for system-wide screen time enforcement.

## Projects

| Project | Purpose |
|---------|---------|
| `Argonath.Core` | Shared logic: API client, policy engine, idle detection, capture |
| `Argonath.Tray` | Status window + system tray (run this for home/dev) |
| `Argonath.LockUI` | Full-screen WPF lock overlay |
| `Argonath.Agent` | Windows Service for background enforcement |

## Prerequisites

- .NET 8 SDK
- Windows 10/11

## Development

```bash
# Pair and run (opens a status window; closes to the system tray)
dotnet run --project Argonath.Tray
```

Tray opens a modern status window after pairing. Closing the window keeps Argonath running in the tray — use **Open Argonath** or double-click the tray icon to restore it. Exit requires the parent PIN.

```bash
# Install as Windows Service (after pairing via Tray)
dotnet publish Argonath.Agent -c Release
sc create ArgonathAgent binPath="path\to\Argonath.Agent.exe"
sc start ArgonathAgent
```

## Pairing

1. Start the parent dashboard and generate a pairing code for a child
2. Run `Argonath.Tray`
3. Enter API URL, Supabase URL, Supabase anon key, and the 6-digit code
4. Agent connects and begins enforcing policies

## Configuration

Stored in `%LOCALAPPDATA%\Argonath\config.json`:

- `ApiBaseUrl` — Argonath web API URL
- `SupabaseUrl` — For realtime commands
- `SupabaseAnonKey` — Supabase anon key
- `DeviceToken` — Set automatically after pairing

## Lock limitations

While locked, Argonath installs a low-level keyboard hook that blocks common bypass shortcuts (Alt+Tab, Win+Tab / Win key chords, Ctrl+Esc, Alt+Esc, Alt+F4, Ctrl+Shift+Esc).

Windows does **not** allow user-mode apps to block:

- **Ctrl+Alt+Del** (Secure Attention Sequence)
- **Win+L** (often still reaches the OS)

Hardening beyond this needs kiosk / Keyboard Filter / policy approaches, which are out of scope for the current agent.
