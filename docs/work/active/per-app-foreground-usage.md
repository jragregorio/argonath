# Per-app foreground usage (parked)

**Status:** parked  
**Parked:** 2026-08-16  
**Orchestrator:** Cursor Grok 4.6

## Goal (when unparked)

Show how long each app was **used** (foreground minutes today), not how long the process has been running.

## Why not process uptime

`Process.StartTime` is cheap but misleading for browsers, Slack, Explorer, and Cursor. Parents would read “running 4h” as “used 4h.”

## When we pick it up

- Agent accumulates foreground seconds on the 1s tick, keyed by `processName` (same idle rules as session usage).
- Persist per device/day/process so totals survive window close and Tray restart.
- Dashboard: minutes on the Visible apps row while open; later a “today’s apps” summary for closed apps.
- Old agents omit the field (same pattern as `runningApps`).
- Per-app **limits** are a later slice on top of this data.

Out of scope until then: no `StartTime` on the snapshot, no UI placeholder.
