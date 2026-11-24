# Agent playful UI + colour themes — design

**Date:** 2026-11-24
**Status:** Approved by the owner from interactive mockups (Design canvas
"Warden desktop app — friendlier look mockups": Option B tray window + the
night-sky lock screen, both colour-matched).

## Intent

Make the Windows agent feel made *for* the child (8+), not like monitoring
software, while keeping the same features. The owner was happy with the old UI
and wants it "spiced up", not redesigned from scratch.

## Decisions (owner)

- **Tray window = Option B "Playful".**
  - Greeting `Hey {name}!` with a line that changes as time runs low.
  - Time-left **ring** (no ticking `HH:MM:SS`). Colour shifts as time runs
    low: theme colour → amber (≤30 min) → coral (≤10 min) → grey (0).
  - "Today" side panel: time used of the limit, plus a status pill (All good,
    Heads up, Almost done, Time's up).
  - One big **Ask for more time** button. It opens +15 / +30 / +60 choices.
  - **Quick message** 2×2 tiles: Come here?, I'm done, Need help, **Write my
    own**. The last one opens a text box (200 characters) with a send arrow.
  - Footer: **My colour** swatches (Mint, Ocean, Grape, Sunset) and a **+** that
    opens a full colour picker. A small **Parents** button opens the PIN exit.
- **The colour changes the whole app**, not only the accent: background,
  cards, borders and the ring track are all derived from the picked colour.
- **Lock screen = calm night sky**: moon, stars, "That's a wrap for today,
  {name}!", when time comes back, a soft suggestion line, **Ask for 15 more
  minutes**, **Shut down**, and a small **Parents** corner link for the PIN.
  It follows the same chosen colour. The moon and time highlight stay gold;
  **Turn off Warden** stays red.

## Builder's calls

- **Colour maths lives in `Warden.Core`** as a pure `AccentPalette`, because
  `Warden.LockUI` cannot reference `Warden.Tray`. Keep the picked hue; clamp
  accent saturation to 45–90% and lightness to 58–72%; surfaces get the same
  hue at 8–28% saturation (11% bg, 16% card, 26% border, 24% track). This
  keeps text readable whatever the child picks; black becomes dark grey.
- **Saved per child account** in `%LOCALAPPDATA%\Warden\ui.json`
  (`{"accent":"#rrggbb"}`), separate from pairing `config.json`. A broken or
  missing file falls back to Mint. Nothing security-relevant depends on it.
- **Font:** Segoe UI (bold weights) rather than Nunito, to avoid bundling a
  font file. Revisit if the owner wants the rounder look.
- **Lock copy** per reason: parent lock ("Time for a break…"), outside allowed
  hours (comes back at the next window), daily limit (comes back tomorrow).
- The lock screen's extra +30 / +60 request buttons are dropped (only
  "Ask for 15 more minutes", as in the mockup); the tray offers +15/30/60.
- The tray's free-typed minutes box is dropped in favour of the presets
  (matches the approved mockup).
- Other dialogs (PIN, pairing, attention) pick up the colour through
  `UiTheme` automatically; their layout is unchanged.

## Non-goals

- No behaviour changes to enforcement, requests or messaging APIs.
- No server/dashboard changes.
