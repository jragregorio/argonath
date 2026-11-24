# Agent installer + auto-update

**Started:** 2026-07-30
**Status:** Phase 3 shipped; in-app update 0.6.30 → 0.6.31 verified on the child PC (2026-11-24). Failure-path test still pending.

## Goal

Ship an in-house MSI installer for the Windows agent (`Warden.Tray`) plus an
automatic update delivery path, so child PCs can be installed and upgraded
without manual zip/copy deploys.

## Phased plan

| Phase | Scope |
|-------|--------|
| **1** | MSI packaging with WiX — **DONE** |
| **1.1** | Hardening (CHILDUSER persist, icon, URL source, watchdog) — **DONE** |
| **2** | Release backend (version manifest + artifact hosting + SHA-256) — **DONE** |
| **3** | SYSTEM updater (on-demand task + tray Update button) — **IMPLEMENTED, needs TESTPC run** |
| **4** | Hardening + docs (graceful upgrade shutdown, ops runbook polish) |

## Decisions locked

- **WiX Toolset 6.0.2** via SDK-style MSBuild (`WixToolset.Sdk/6.0.2`).
- **Unsigned MSI for now**; SHA-256 printed by `build-installer.ps1`; optional
  `SignMsi` hook in `.wixproj` for later Authenticode.
- **Install scope: per-machine** → `C:\Program Files\Warden\` (x64 only).
- **Autostart:** SYSTEM-registered logon scheduled task for `CHILDUSER`
  (LeastPrivilege). **Not** `HKLM\...\Run`.
- **CHILDUSER persistence:** `HKLM\SOFTWARE\Warden\ChildUser` (64-bit view).
  Precedence: msiexec cmdline > persisted HKLM > `[LogonUser]`.
- **Bootstrap URL:** `Warden.Tray/warden.json` is the single source of truth;
  `-ApiBaseUrl` is an optional staging override.
- **UpgradeCode (NEVER change):** `A26D27AF-3996-49CE-A7EF-138FB23851BA`
- **Release hosting:** private Supabase Storage bucket `agent-releases` + Prisma
  `AgentRelease` (SHA-256, size, channel, mandatory). Publish via
  `scripts/publish-agent-release.mjs`.
- ADR: `docs/decisions/0003-per-machine-wix-msi-logon-task.md`

## Open / deferred items

- Hard terminate via `util:CloseApplication` skips tray
  `ClearAdminLockAsync`; locked-mid-upgrade may leave a stale lock → Phase 3/4.
- `AgentVersionInfo.Fallback` still hardcoded — bump with
  `Directory.Build.props`.
- Task `RestartOnFailure` (PT1M / 65535) is a **stopgap** if the child kills
  the tray — not the Phase 3 watchdog.
- ICE61 warning expected with `AllowSameVersionUpgrades="yes"`.
- No MSI was uploaded in Phase 2 validation (script dry-run hash only); user
  must run `publish:agent` once before Download button / heartbeat `update` work.

## Prep phase (2026-07-30) — done

WiX 6.0.2 probe OK; `Directory.Build.props` single-sources `0.5.11`.

## Phase 1 (2026-07-30) — done

See prior notes: installer project, build script, docs, ADR-0003.

## Phase 1.1 hardening (2026-07-30) — done

See prior notes in this file / git history.

## Phase 2 — release backend (2026-07-30) — done

### Delivered

1. **Prisma `AgentRelease`** — schema + `db:push` to Supabase Postgres.
2. **`compareAgentVersions`** in `@warden/shared` (+ vitest).
3. **API** — `agentRelease.latest` (parent, signed URL 1h, null if missing);
   `agent.heartbeat` optionally returns `update: { version, sha256, sizeBytes,
   mandatory, downloadUrl }` for newer stable (signed URL 30m); release errors
   never fail heartbeat.
4. **Publish script** — `scripts/publish-agent-release.mjs` /
   `npm run publish:agent`.
5. **UI** — child detail Devices card: **Download for Windows** near Generate
   pairing code.
6. **Docs** — `deployment.md`, ADR-0003 consequence note, this task file.

### Agent C# note

`WardenApiClient.SendHeartbeatAsync` only checks HTTP success — does not
deserialize the heartbeat body. Unknown `update` is ignored. No agent C#
changes for Phase 2. Pre-existing uncommitted agent edits left untouched.

### Validation (real exit codes)

| Command | Exit |
|---------|------|
| `npm run db:generate` | **0** |
| `npm run db:push` | **0** (synced with Prisma schema) |
| `npm run db:validate` | **0** |
| `npm run test` | **0** (11 tests incl. 4 new compare tests) |
| `npm run typecheck` | **0** |
| `npm run check:boundaries` | **0** |
| `npm run lint` | **0** (pre-existing warnings only; unrelated to Phase 2) |
| MSI hash dry-run (no upload) | **0** |
| `publish-agent-release.mjs --help` | **0** |
| Full `npm run verify` equivalent (typecheck+lint+test+boundaries) | **0** |

### Publish command (user)

```bash
node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.5.11-x64.msi --channel stable
```

Env presence checked (booleans only): DATABASE_URL, Supabase URL, service role
key all present locally.

## Publish attempt (2026-07-30)

Upload failed: Free Supabase Storage max object size is **50 MB**; MSI is ~84 MB.
Download button is temporarily **disabled** in the UI (`INSTALLER_DOWNLOAD_ENABLED =
false` on child detail) until the plan is upgraded. Re-enable that flag, then:

```bash
node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.5.11-x64.msi --channel stable
```

## Next step

1. Upgrade Supabase (or host MSI elsewhere); set `INSTALLER_DOWNLOAD_ENABLED = true`; publish MSI.
2. Redeploy if needed.
3. Phase 3: SYSTEM updater service.

## Phase 1.2 — EULA + startup UI + AllStandard (2026-08-06)

### Shipped

- Custom `assets/License.rtf` wired via `WixUILicenseRtf` (sections 1–11; no governing-law/contact).
- ChildUserDlg copy softened (parental-control framing); advanced checkbox `WARDEN_STARTUP_ALL`.
- `WARDEN_STARTUP_MODE` (`Single` | `AllStandard`) persisted to `HKLM\SOFTWARE\Warden`.
- Deferred CA: Single → `Warden\WardenTray`; AllStandard → `Warden\WardenTray-<Sam>` per non-admin.
- Tray `StartupHelper` detects per-user task names.
- `Repair-WardenStartup.ps1 -AllStandard` for post-install refresh.

### Validation (executor)

| Command | Exit |
|---------|------|
| `dotnet build Warden.Installer.CA` (Release) | **0** |
| `dotnet build Warden.Installer.wixproj -c Release` | **0** (ICE61 expected) |

### Follow-up (orchestrator, same day)

- Cleared persisted `__ALL_STANDARD__` from the account combo on upgrade (was being
  machine-qualified / surfaced as a fake account).
- Single-mode validate + deferred CA reject the AllStandard sentinel.
- Normalized `UI.wxs` whitespace. Rebuild CA + MSI: both **exit 0**.

## Related work

Autostart diagnosis, agent file logging, HKCU self-heal, and installer startup-script hardening
are tracked in [agent-startup-diagnostics.md](./agent-startup-diagnostics.md) (targets v0.5.14).

## Phase 3 — in-app update (2026-11-24)

Design: `docs/superpowers/specs/2026-11-24-agent-in-app-update-design.md`
Plan: `docs/superpowers/plans/2026-11-24-agent-in-app-update.md`

### Delivered

- Hosting moved to **GitHub Releases** (`jragregorio/warden-releases`, tag `agent-v<version>`);
  `AgentRelease.downloadUrl` added (`storageKey` now nullable); publish script uses `gh`.
- Public `GET /api/agent/release/latest?channel=stable` for the SYSTEM updater.
- Dashboard **Download for Windows** re-enabled (direct asset download).
- Tray banner under the title bar: `Update available (vX.Y.Z)` + **Update**; hidden while locked.
- `Warden.Updater.exe` + SYSTEM task `Warden\WardenUpdater` (child may run, not modify).
  Logs/downloads in SYSTEM's own profile
  (`C:\Windows\System32\config\systemprofile\AppData\Local\Warden\updater\`);
  status in `C:\ProgramData\Warden\update-status.json` (the tray reads it as the child).
- First .NET tests: `apps/agent/Warden.Tests` (xUnit, 48 tests).
- Resolves the Phase 1 open item "locked mid-upgrade": an update cannot start while locked.

### Still to do (needs TESTPC + a publish)

1. ~~Publish~~ done: 0.6.30 is live on `jragregorio/warden-releases` (0.6.29 on argonath was withdrawn).
2. ~~Install 0.6.30 manually on TESTPC~~ done (device reports Agent v0.6.30). Check
   `schtasks /Query /TN Warden\WardenUpdater /XML`; as the child,
   `schtasks /Run /TN Warden\WardenUpdater` succeeds and `schtasks /Change /TN Warden\WardenUpdater /DISABLE` is denied.
3. ~~Bump to 0.6.31, build, publish~~ done 2026-11-24 (SHA-256 `89a8e594…0c2987`,
   88,738,789 bytes; endpoint returns 0.6.31). **In-app update 0.6.30 → 0.6.31
   confirmed working on the child PC (2026-11-24).** On TESTPC press **Update** → tray restarts on 0.6.31;
   CHILDUSER / startup mode unchanged.
4. 0.6.32 (playful tray UI + colour themes + night-sky lock screen, see
   `docs/superpowers/specs/2026-11-24-agent-playful-ui-design.md`) is the second in-app
   update test: 0.6.31 → 0.6.32.
5. 0.6.34: Option A fonts (plain Segoe UI) and a restyled popup window (nudge, time
   check, app blocked, extra time) that follows the child's colour.
6. 0.6.35: "Lift" hover/press effect on tray, popup and lock-screen buttons
   (`Warden.LockUI/LiftEffect.cs`).
7. Failure path: wrong `sha256` on the 0.6.31 row → tray never closes, banner shows
   `Update failed — try again`. Restore the hash afterwards.
