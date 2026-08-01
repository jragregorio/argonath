# Agent startup diagnostics + anti-kill (Ceiling A)

**Started:** 2026-07-31  
**Updated:** 2026-08-01  
**Status:** 0.5.18 built — awaiting parent retest (1-min watchdog, mutex squat, unclean banner)  
**Related:** [agent-installer-autoupdate.md](./agent-installer-autoupdate.md), ADR-0004

## Version ownership (ADR-0004)

| Line | Owner file | Notes |
|------|------------|--------|
| Agent / MSI | `apps/agent/Directory.Build.props` → `$(Version)` | Independent; monotonic forever |
| Web / npm | `apps/web/package.json`, `packages/*` | Web can change for dashboard banner; agent version stays in Directory.Build.props only |

Runtime: `AgentVersionInfo.Current` from assembly. No hardcoded agent version literals in models.

## Product ceiling

**Ceiling A** (chosen): kills are annoying + visible. Tray stays a user-session process; 1-minute scheduled-task relaunch; unclean-exit dashboard banner. Fail-open. No LocalSystem supervisor (Ceiling B deferred).

## Confirmed root causes (child PC)

1. Wrong/`Missing` logon task + HKCU self-heal (earlier).
2. Transient network killed the agent (0.5.16).
3. **Install leaves tray dead:** `util:CloseApplication` kills `Warden.Tray.exe`; MSI never relaunched it → unprotected until next child logon (worse under Phase 3 auto-update).
4. **Double-start risk:** once task is Ok, leftover HKCU Run from self-heal would start a second instance (no mutex).
5. **Hard kills (0.5.17 logs):** End Task / external terminate — mid-heartbeat silence, no Fatal/Shutdown.
6. **Mutex squat:** `Local\Warden.Tray` held without a Tray process → every start exited “already running”.

## 0.5.18 changes (Ceiling A)

### P0 — Watchdog + squat + cost
- Logon task `<LogonTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd>` (CA + `Register-WardenStartup.ps1`). `MultipleInstancesPolicy=IgnoreNew` unchanged. End Task → relaunch within ~1 minute.
- `SingleInstanceGuard`: exit silently only when another **live** `Warden.Tray` PID exists; mutex held with no PID → warn squat and continue.
- Heartbeat while unlocked/locked: always ≥5s (removed 1s-while-locked). Capture poll 1s → 15s; nudge poll stays on tick (~5s).

### P1 — Unclean exit visibility
- `SessionMarker` (`%LOCALAPPDATA%\Warden\session.running`): mark on message-loop entry; clear on clean Shutdown / message-loop exit / `SessionEnding` (logoff).
- Heartbeat `previousSessionUnclean` → `Device.lastUncleanExitAt`; child device card banner + Dismiss (`device.dismissUncleanExit`).

## Parent decisions (2026-08-01)

1. Niccolo = standard user  
2. 1 min auto-relaunch  
3. Fail-open  
4. Dashboard banner (not email)  
5. Cap at Ceiling A (no SYSTEM supervisor for now)

## Validation (0.5.18)

| Check | Exit / result |
|-------|----------------|
| `dotnet build` Warden.sln Release | **0** |
| `dotnet build` Warden.Installer.CA Release | **0** |
| `npm run db:generate` | **0** |
| `npm run db:push` (`lastUncleanExitAt`) | **0** |
| `npm run typecheck -w @warden/api` | **0** |
| `npm run typecheck -w @warden/web` | **0** |
| `npm run check:boundaries` | **0** |
| MSI `build-installer.ps1` | **0** (ICE61 only) |

MSI: `apps/agent/artifacts/Warden-0.5.18-x64.msi`  
SHA-256: `da4287576c5e1d9f1594e4e9e46922a66469bddc3f4cac2cdf4f39a05da39183`  
Size: 88000786 bytes

## Parent retest (child PC)

1. Install/upgrade `Warden-0.5.18-x64.msi`, pick Niccolo.  
2. Confirm task XML has Repetition PT1M (`schtasks /Query /TN … /XML`).  
3. End Task `Warden.Tray` → tray returns within ~1 minute; single icon.  
4. After End Task + relaunch: dashboard shows unclean-exit banner; Dismiss clears it.  
5. Normal Start → Shut down via parent PIN: no unclean banner.  
6. Boot log `version=0.5.18`.
