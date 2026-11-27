# Agent "smooth Blocky" animations

**Status:** shipped: agent **0.6.36** merged to `main` and published to the stable channel on 2026-11-28 (GitHub release `agent-v0.6.36` on `jragregorio/warden-releases`)
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

## Release

- MSI `Warden-0.6.36-x64.msi`, SHA-256 `544b3710dc44e8cfc8df5d4d3418a89a307bbb67f813ff69d8775d00d287e6f7`, 88,759,269 bytes, channel `stable`, not mandatory.
- `GET /api/agent/release/latest?channel=stable` returned 0.6.36 right after publishing, and the GitHub download returned 200.
- The owner tested the portable build locally before release and was happy with the animations.

## Still to confirm

- The child's PC picks up the in-app update from 0.6.35 to 0.6.36.
- Live checks on the child PC: a dashboard nudge with a reply, a bonus grant, a time run-down through 10/5/1, and a parent lock-down/unlock.

## 0.6.37 (published 2026-11-28, stable)

- MSI `Warden-0.6.37-x64.msi`, SHA-256 `3915981e8aaaf0bf1e1735ef474e4e9e755edc2732b2033d93a567e9a876e99d`, 88,767,461 bytes, not mandatory; GitHub release `agent-v0.6.37`. The latest-release endpoint returned 0.6.37 right after publishing.
- Still to confirm: the child's PC updates from 0.6.36 to 0.6.37, and a live parent lock-down shows the desk scene.


- **Moon:** the stray "sparkle" dot by the top tip is gone, and the bottom row reaches under the lower horn so the crescent is one joined shape (test: every moon pixel joins along an edge).
- **Night sky:** three pixel clouds drift across the middle at different depths; 34 square stars twinkle more clearly, 6 flash a "+" glint; a pixel shooting star crosses about every 7 s (30 fps; other loops stay at 20 fps).
- **Parent lock-down scene:** when a parent locks from the dashboard, the lock screen shows "Game paused" with the sleeping pixel buddy dozing beside a retro gaming desk (CRT monitor with the paused game, tower PC, keyboard, corded mouse, controller), in the child's colours. Time's up and outside allowed hours keep the starry night. The scene switches both ways while locked and applies to every monitor.
- Options explored and set aside: inferno/punishment look (makes everyday locks feel like trouble), gaming chair, buddy slumped at the keyboard.
- Follow-up idea: a parent-chosen "Serious" lock (stern, still screen with a typed reason) would need dashboard + API + agent changes.

