# Agent "smooth Blocky" animations

**Status:** built on branch `feat/agent-blocky-animations` (agent **0.6.36**), not merged or released
**Started:** 2026-11-27
**Spec:** [docs/superpowers/specs/2026-11-27-agent-blocky-animations-design.md](../../superpowers/specs/2026-11-27-agent-blocky-animations-design.md)
**Plan:** [docs/superpowers/plans/2026-11-27-agent-blocky-animations.md](../../superpowers/plans/2026-11-27-agent-blocky-animations.md)

## Goal

Make the child's popups and lock screen less boring with game-inspired ("smooth Blocky") motion. No change to when popups appear, their wording, buttons, delays or thresholds.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Style | Smooth Blocky: chunky corners, square particles, pixel moon, eased (not stepped) motion |
| Nudge | Drop-in, hopping typing dots, message types out (≤ 2 s), icon pops; OK fills over 5 s |
| Bonus | Pop-in, spinning star, 20 square particles, "+N" counts up from +0 |
| Time check | Drop-in, 10-block lives bar, used blocks "lose a life" right to left; pulse at 5 min, glow + tick at 1 min |
| Lock screen | Fade/rise in, square twinkling stars, pixel moon bob + sparkle, two drifting block clouds; every lock reason, every monitor |
| Blocked-app notice | New blocky shape, no motion |
| Animations off in Windows | Final state at once; OK keeps the "OK (N)" countdown |
| Implementation | Native WPF storyboards (`Warden.LockUI/BlockyMotion.cs`), timings in `Warden.Core/Theming/BlockyTimeline.cs` |

## Tasks

| # | Task | Status |
|---|------|--------|
| 1 | Core timelines | done |
| 2 | BlockyMotion helpers | done |
| 3 | Popup shell (shape, particle margin, drop-in, OK fill) | done |
| 4 | Nudge typing | done |
| 5 | Bonus celebration | done |
| 6 | Time check lives bar | done |
| 7 | Lock screen night sky | done |
| 8 | Version, docs, gitignore | done |

## Verification done

- `dotnet test apps/agent/Warden.Tests`: unit tests for timelines, disabled-mode helpers, and off-screen window tests for every popup and the lock window.
- Visuals checked with **off-screen** snapshots that capture only Warden's own windows:
  - Popups: `Warden.Tray.exe --preview-popups --snapshot <dir>`
  - Lock screen: set `WARDEN_LOCK_SNAPSHOT_DIR` and run `dotnet test --filter Lock_snapshot`

## Not yet verified live

On a real paired child PC: a dashboard nudge with a reply, a bonus grant, a time run-down through 10/5/1, and a parent lock-down/unlock. These need a test child account. They weren't run on the developer's paired PC so it wouldn't be locked or interrupted.
