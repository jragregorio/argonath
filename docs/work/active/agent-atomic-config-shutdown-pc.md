# Agent: atomic config save + lock-screen Shutdown PC

## Goal

1. Prevent corrupt/empty `config.json` after hard power-off during lock screen by atomic writes in `ConfigStore.Save`.
2. Let child shut down Windows from lock screen without parent PIN (`shutdown.exe /s /t 0`).
3. Bump agent version `0.6.1` → `0.6.2`.

## Changes

### Atomic config save (`Warden.Core/Services/ConfigStore.cs`)

- Write JSON to `config.json.tmp` in the same directory.
- If `config.json` exists: `File.Replace(temp, config, backup)` then delete backup.
- If first create: `File.Move(temp, config)`.
- On failure: best-effort delete temp; rethrow.

### Reduced write frequency (`Warden.Core/EnforcementEngine.cs`)

- `RefreshPolicyAsync` calls `Save` only when `ParentPin` actually changed (string inequality).

### Shutdown PC (`Warden.Core/Diagnostics/SystemShutdown.cs`, `Warden.LockUI/LockWindow.cs`)

- New `SystemShutdown.Initiate()` runs `shutdown.exe /s /t 0`.
- Lock screen primary action: **Shutdown PC** (no PIN); clears session marker via callback before shutdown.
- **For parents** link reveals PIN panel for **Shut down Warden** (unchanged parent PIN exit).
- Updated `LockWindowManager.Show` signature with `onShutdownPc` callback.
- Wired in `Warden.Tray/Program.cs` and `Warden.Agent/Worker.cs`.

### Version

- `apps/agent/Directory.Build.props`: `0.6.2`

## Commands

```powershell
dotnet build "c:\DEV\Guardian\apps\agent\Warden.sln" -c Release
```

**Exit code: 0** — Build succeeded, 0 Warning(s), 0 Error(s).

### Push + MSI (2026-08-05)

- Pushed `a72ca1d` to `origin/main`.
- `powershell -File apps/agent/build-installer.ps1` → exit **0** (ICE61 only, expected).
- MSI: `apps/agent/artifacts/Warden-0.6.2-x64.msi`
- Size: 88004880 bytes
- SHA-256: `b4c579c8bc58657482f57c498b99c8106b6dfb35b2c01e99654663e6210adf0e`

## Next steps

- Install MSI on child PC (elevated), pick Niccolo.
- Manual test: lock screen → Shutdown PC (no PIN) → PC powers off; reboot → config still paired.
- Manual test: hard power-off during lock still safe (config not empty on next boot).
- Optional: `npm run publish:agent` if dashboard Download should serve 0.6.2.
- Dashboard footer hardcoded desktop version synced to `0.6.2` (web bump `0.7.3` → `0.7.4` for deploy).
