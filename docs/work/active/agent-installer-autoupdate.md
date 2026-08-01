# Agent installer + auto-update

**Started:** 2026-07-30
**Status:** Phase 2 complete. Ready for Phase 3 when wanted.

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
| **3** | SYSTEM updater service (check, verify, silent upgrade) |
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

## Related work

Autostart diagnosis, agent file logging, HKCU self-heal, and installer startup-script hardening
are tracked in [agent-startup-diagnostics.md](./agent-startup-diagnostics.md) (targets v0.5.14).
