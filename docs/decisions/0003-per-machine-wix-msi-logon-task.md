# ADR-0003: Per-machine WiX MSI + account-scoped logon task

## Status

Accepted

## Date

2026-07-30

## Context

Child devices need a repeatable install/upgrade path for `Warden.Tray` without
manual publish-folder copies. The child Windows account is a **standard user**
(not a local admin), so tamper-resistance matters: binaries should live under
`Program Files`, and autostart must not silently attach to every interactive
login on the machine (parents often elevate from an admin account on the same PC).

## Decision

1. **Installer tooling:** WiX Toolset **6.0.2**, SDK-style `.wixproj`
   (`WixToolset.Sdk/6.0.2`), built via `apps/agent/build-installer.ps1`.
   The installer project is **not** in `Warden.sln` so inner-loop
   `dotnet build Warden.sln` stays fast.
2. **Install scope:** **per-machine** to `C:\Program Files\Warden\` (x64 only).
3. **Signing:** MSI is **unsigned** for now; SHA-256 of the artifact is the
   integrity signal for future auto-update. The `.wixproj` includes an optional
   `SignMsi` Authenticode hook for later.
4. **Autostart:** a **SYSTEM-registered** Task Scheduler logon task scoped to
   one Windows account (`CHILDUSER` MSI property), running the tray at
   **LeastPrivilege**. Not `HKLM\...\Run` (would start Warden on the elevating
   admin’s logon too). The resolved account is persisted to
   `HKLM\SOFTWARE\Warden\ChildUser` so unattended SYSTEM upgrades (Phase 3)
   re-create the task for the original child — not `LogonUser`/`SYSTEM`.
   Precedence: msiexec cmdline > persisted HKLM > `[LogonUser]`.
5. **Upgrades:** `MajorUpgrade` with `Schedule="afterInstallInitialize"` and
   `AllowSameVersionUpgrades="yes"` (self-contained publish churns hundreds of
   files between versions).
6. **Pairing state:** `%LOCALAPPDATA%\Warden\config.json` is never authored or
   deleted by the MSI, so it survives upgrade and uninstall.
7. **Bootstrap URL:** `apps/agent/Warden.Tray/warden.json` is the single source
   of truth for install-time `apiBaseUrl`; `build-installer.ps1 -ApiBaseUrl` is
   an optional staging override.
8. **Start Menu shortcut:** advertised shortcut whose KeyPath is
   `Warden.Tray.exe` under Program Files (per-machine). Non-advertised + HKLM
   registry KeyPath fails ICE43/ICE57 on WiX 6; advertised File KeyPath is the
   ICE-clean equivalent (component state is machine-wide, not HKCU).

## Consequences

- Installs require elevation; standard child users cannot replace Program Files
  binaries without admin help (desired).
- Operators must pass `CHILDUSER` on **first** install when the elevating
  account is not the child (common under UAC). Documented in
  `apps/agent/README.md`. Subsequent silent upgrades reuse the HKLM value.
- Hard terminate of `Warden.Tray.exe` during upgrade may skip
  `ClearAdminLockAsync` (stale dashboard lock) — follow up in Phase 3/4.
- Task `RestartOnFailure` (PT1M / Count 65535) is a stopgap if the child kills
  the tray — not a substitute for the Phase 3 watchdog.
- ICE61 warns because same-version upgrades are allowed; accepted.
- **Release hosting (Phase 2):** MSI binaries live in private Supabase Storage
  bucket `agent-releases`; metadata + SHA-256 in Prisma `AgentRelease`.
  Publish via `scripts/publish-agent-release.mjs`. Parents get a signed download
  URL from `agentRelease.latest`; heartbeats may include an `update` hint for
  Phase 3 (SYSTEM updater not yet shipped).

## Alternatives considered

- **Per-user install** (`LocalAppData`) — rejected: easier for a child (or
  malware) to tamper; weaker alignment with “standard user + locked-down
  binaries.”
- **`HKLM\Software\Microsoft\Windows\CurrentVersion\Run`** — rejected: starts
  the agent for every user who logs on, including the parent admin session.
- **Third-party installer tooling** (Inno, Advanced Installer, Squirrel-only,
  etc.) — rejected for Phase 1: WiX is MSI-native, scriptable in CI, and
  already validated on this machine at 6.0.2; keeps the update story on
  standard Windows Installer major upgrades.
