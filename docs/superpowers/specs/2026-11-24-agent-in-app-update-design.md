# Agent in-app update — design

**Date:** 2026-11-24
**Status:** Draft — awaiting approval
**Continues:** Phase 3 of [agent-installer-autoupdate](../../work/active/agent-installer-autoupdate.md)

## Intent

Today each child PC is upgraded by downloading and re-running the MSI by hand.
The parent (owner) wants the Windows agent to update itself from inside the
tray app: the child sees a small "update available" banner, presses **Update**,
and Warden installs the new version and comes back up on its own, without a
UAC prompt and without anyone re-running the installer.

Hosting moves from Supabase Storage (blocked: the ~88 MB MSI exceeds the
free-tier 50 MB object limit) to **GitHub Releases**, which also lets the
dashboard's **Download for Windows** button be turned back on.

## Goals

1. Tray shows an **"Update available (vX.Y.Z)"** banner directly below the
   custom title bar, with an **Update** button, when the server reports a
   newer stable release.
2. Pressing **Update** installs the new MSI silently with SYSTEM rights — no
   UAC prompt, no admin password.
3. After the install finishes (success *or* failure), the tray is restarted in
   the child's session the usual way (via the existing logon task).
4. MSIs are hosted on GitHub Releases of the public repo
   `jragregorio/argonath`; `npm run publish:agent` uploads there and records
   the `AgentRelease` row.
5. Dashboard **Download for Windows** is re-enabled and downloads the MSI
   directly (no GitHub page in between).

## Non-goals

- Forced/automatic background updates. The `mandatory` flag stays in the data
  model but does not change behavior in this work.
- Download progress UI (the tray only shows "Updating…").
- A tray watchdog / always-on SYSTEM service (Option B, not chosen).
- Code signing (still unsigned; SHA-256 is the integrity check).
- Rollback to older versions / downgrade support.
- Updating PCs still on v0.6.28 or older: they need **one final manual MSI
  install** to get the updater.

## Anti-goals (would be a failure even if it "works")

- The child can use the Update button (or the updater task) to install
  anything other than the server-approved, hash-verified, newer Warden MSI.
- The child can use Update to get enforcement switched off for longer than
  the install itself takes, or to leave Warden not running afterwards.
- Installing the agent into a user-writable location (LocalAppData) to dodge
  elevation.
- A stale "locked" state on the dashboard after an update.

## Constraints

- Per-machine MSI in `C:\Program Files\Warden\`; UpgradeCode never changes
  (ADR-0003). Existing `MajorUpgrade` + `util:CloseApplication` stay.
- Tray runs as the child with `LeastPrivilege`; it cannot elevate.
- Agent version comes from `Directory.Build.props` / `AgentVersionInfo.Current`;
  versions only go up (ADR-0004). This ships as agent **0.6.29** and a web
  patch bump (`apps/web` + `packages/shared` `APP_VERSION`).
- .NET dependency rules: new projects stay in `apps/agent`, `Warden.Core` stays
  a leaf.
- `apps/web` must not import `@warden/db`; DB access via `@warden/api`.

## Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **A** | On-demand SYSTEM scheduled task running a small `Warden.Updater.exe`; child may *run* but not modify it | Nothing runs between updates; reuses the installer's existing `schtasks` task code. No live progress. | **Chosen** |
| B | Extend `Warden.Agent` Windows Service (always-on SYSTEM) + named pipe from tray | Live progress; could later be a watchdog. Always-on process, IPC to secure, service not currently in the MSI. | Not chosen |
| C | Off-the-shelf updater (Velopack/Squirrel) | Installs per-user in LocalAppData — child-tamperable, conflicts with per-machine MSI. | Rejected |

The owner picked **A**.

## Design

### 1. Release hosting (GitHub Releases)

- `scripts/publish-agent-release.mjs` changes from Supabase upload to:
  create/upload to GitHub release tag `agent-v<version>` on
  `jragregorio/argonath` (via `gh release create … <msi>`), then upsert the
  `AgentRelease` row.
- Asset name: `Warden-<version>-x64.msi` (already what `build-installer.ps1`
  produces).
- `AgentRelease` gains `downloadUrl String` (the direct asset URL
  `https://github.com/jragregorio/argonath/releases/download/agent-v<v>/Warden-<v>-x64.msi`).
  `storageKey` becomes nullable (legacy). Prisma change via `db:push`.
- Server code stops creating Supabase signed URLs for releases and returns
  `downloadUrl` from the row.

### 2. Server endpoints

- **Heartbeat** (`agent.heartbeat`, existing): keeps returning
  `update: { version, sha256, sizeBytes, mandatory, downloadUrl }` when a newer
  stable release exists. No longer depends on Supabase being configured.
- **New public endpoint** `GET /api/agent/release/latest?channel=stable`
  (no auth; release metadata is public anyway) returning
  `{ version, sha256, sizeBytes, downloadUrl }` or 404. This is what the
  SYSTEM updater trusts — it does not need the child's device token.
- `agentRelease.latest` (parent tRPC) returns the GitHub `downloadUrl`.

### 3. Tray: banner + trigger

- `WardenApiClient.SendHeartbeatAsync` deserializes the optional `update`
  field and exposes the latest hint to the UI.
- `MainWindow` shows a slim banner row under the title bar:
  `⬆ Update available (v0.6.29)   [Update]`. Hidden when no newer version.
- On **Update**: banner switches to "Updating… Warden will restart." and the
  button disables; tray starts the `Warden\WardenUpdater` task
  (`schtasks /Run` or Task Scheduler COM). The tray passes **no** version/URL.
- If the updater writes a failure status (see §5), the next tray start shows
  "Update failed — try again" in the banner.

### 4. Updater (`Warden.Updater.exe`, new console project, no window)

Runs as SYSTEM via task `Warden\WardenUpdater`. Steps:

1. Single-instance (named mutex) — repeated clicks do nothing extra.
2. Read `apiBaseUrl` from `C:\Program Files\Warden\warden.json`.
3. `GET /api/agent/release/latest`. Stop (no-op, write status) if not strictly
   newer than the installed version (read from the installed
   `Warden.Tray.exe` file version).
4. Require `downloadUrl` host to be `github.com` /
   `objects.githubusercontent.com` (allowlist). Download to
   `C:\ProgramData\Warden\updates\` (SYSTEM/Admins-only ACL).
5. Verify SHA-256 and size match. Delete and stop on mismatch.
6. Run `msiexec /i <msi> /qn /norestart /l*v <log>` and wait. The MSI's
   existing `CloseApplication` closes the tray; `CHILDUSER` and startup mode
   are already persisted in HKLM, so the upgrade reuses them.
7. **Always** (finally): restart the tray in the signed-in child's session by
   running the matching logon task (`Warden\WardenTray` or
   `Warden\WardenTray-<sam>`, same discovery as `StartupHelper`).
8. Write `C:\ProgramData\Warden\update-status.json`
   (`{ result, fromVersion, toVersion, at, msiExitCode }`), readable by Users,
   and log to `C:\ProgramData\Warden\logs\`.

The tray keeps running (enforcing) through steps 1–5; it is only down from
the start of step 6 until step 7, i.e. roughly the length of the msiexec run.

### 5. Installer changes

- Publish `Warden.Updater` alongside the tray (self-contained or sharing the
  tray's publish folder — builder's call, see below) and install it to
  `INSTALLFOLDER`.
- New deferred custom action (in `Warden.Installer.CA`, same `schtasks` XML
  pattern as `LogonTaskActions`) creates `Warden\WardenUpdater`:
  principal `SYSTEM`, `HighestAvailable`, no triggers (on-demand only),
  `MultipleInstancesPolicy=IgnoreNew`, execution time limit ~15 min.
  Task security descriptor grants **Users: read + execute (run)** only.
- Removed on uninstall alongside the logon tasks.
- Create `C:\ProgramData\Warden\updates` with SYSTEM/Administrators-only write.

### 6. Graceful shutdown during upgrade

The known open item (hard terminate skips `ClearAdminLockAsync`) is addressed
minimally: the Update button is only reachable when the tray window is
usable, i.e. not under a lock overlay, so an update never starts while locked.
On restart, the tray's normal startup sends a fresh heartbeat, which corrects
state. No further shutdown handshake in this work.

### 7. Dashboard

- `INSTALLER_DOWNLOAD_ENABLED = true` in `child-devices-section.tsx`; button
  links to the release `downloadUrl` (browser downloads the MSI directly).

## Builder's calls (decided during design — check these)

- Tag naming `agent-v<version>` to avoid colliding with web tags.
- New public unauthenticated "latest release" endpoint rather than giving
  the SYSTEM updater the child's device token.
- Download host allowlist + SHA-256 + strictly-newer check as the trust model.
- Status file in `ProgramData` for "update failed" feedback.
- No updates while locked (banner hidden under the lock overlay).

## Left to the builder

- Exact project layout for `Warden.Updater` (own csproj in `Warden.sln`,
  references `Warden.Core` only if needed) and whether it ships
  self-contained or framework-shared within the tray's publish output.
- `schtasks /Run` vs Task Scheduler COM from the tray.
- How the updater finds the active child session's task name.
- Banner styling within `UiTheme`.
- Tests: version compare / hash verify / URL allowlist unit-testable pieces;
  end-to-end checked manually on a test PC (0.6.29 → 0.6.30).
