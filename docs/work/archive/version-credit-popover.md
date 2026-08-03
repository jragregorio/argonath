# Version credit popover (web footer)

**Started:** 2026-08-04
**Status:** Done — web v0.6.2 / agent v0.6.1

## Goal

Tap/click “Made by JRAG · v{web}” in the dashboard nav footer to reveal web +
desktop agent versions.

## Delivered

- Shared `VersionCredit` (desktop sidebar + mobile More sheet).
- Click/tap disclosure; labels regular, versions `font-semibold`.
- Desktop version hardcoded (`0.6.1` = agent line) via
  `HARDCODED_DESKTOP_APP_VERSION`; flip `USE_AGENT_RELEASE_FOR_DESKTOP_VERSION`
  when AgentRelease should drive it again.
- API: `agentRelease.latestMeta` kept for that switch.

## Commands / results

| Command | Result |
|---------|--------|
| `npm run typecheck -w @warden/api -w @warden/web` | PASS (exit 0) earlier in session |
