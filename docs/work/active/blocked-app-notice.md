# Blocked-app child notice

**Status:** shipped (agent 0.6.25)  
**Started:** 2026-08-17  
**Orchestrator:** Cursor Grok 4.6

## Goal

When Tray closes a blocked app, the child sees a Warden attention card. Session stays unlocked.

## Locked decisions

| Topic | Choice |
|--------|--------|
| UI | Existing `AttentionWindow` |
| Title | App blocked |
| Body | `{processName} isn't allowed on this PC.` |
| OK | Immediate (`okDelaySeconds: 0`) |
| Auto-dismiss | **3 seconds** (from visible) |
| Throttle | One card per process per 30s (after show) |
| Duplicate | If a blocked-app card is already showing/queued, skip |
| Locked session | Do not show |
| Nudge conflict | Queue behind current attention (wait), do not stack |
| Ship | Agent **0.6.25**. Web version unchanged (footer desktop version synced). No unblock notice. |

## Out of scope

Web, API, schema, lock overlay, toast/MessageBox, launch intercept, ask-parent unblock, unblock attention card.
