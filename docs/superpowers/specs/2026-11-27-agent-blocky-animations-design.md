# Agent popup + lock-screen animations ("smooth Blocky") — design

**Date:** 2026-11-27
**Status:** Draft for owner approval. Direction picked from interactive mockups
(`.superpowers/brainstorm/642-1795794213/content/blocky-v2.html` and
`nudge-options.html`, option B "Typing…").

## Intent

The child (first user: the owner's son, a Minecraft fan; target audience 10+)
notices the popups fine. They pop at the top centre on purpose, so they are
seen without getting in the way. They just feel **boring**. The goal is to
**spice them up**: give each one a bit of game-like life, without making them
louder, bigger, or more in the way.

## Goals

- Give the four child-facing moments a fun, game-inspired entrance and a little
  motion: **nudge**, **bonus time**, **time check**, **lock-down screen**.
- One style for every child: **"smooth Blocky"**. That means chunky shapes,
  square particles and a pixel moon, moving with smooth, eased motion (not
  frame-by-frame steps).
- Match the energy to the news. Bonus time celebrates. The nudge is friendly.
  The time check gets livelier as time runs out. The lock screen stays calm.

## Non-goals

- No change to *when* popups appear, what they say, their buttons, their
  timings (OK delays, auto-dismiss), or the time-warning thresholds.
- No new sounds. The existing `SystemSounds.Asterisk` stays.
- No theme picker or per-child animation settings.
- The blocked-app notice gets no motion (shape only, see builder's calls). The
  update banner and tray main window are untouched.
- No change to the popup position (top centre, 48 px down).

## Anti-goals (a failure even if it works)

- Copying Minecraft (or any game's) art, font, sounds or name. It must read as
  "feels like a game", not a knock-off.
- Motion that makes running out of time feel like a joke, or a lock screen that
  feels like a punishment.
- Animations that delay the child from reading or answering (OK must not unlock
  later than it does today).
- Anything that could freeze, crash, or leave a popup or the lock screen stuck
  half-drawn. Enforcement reliability beats sparkle.

## Constraints

- .NET 8 WPF in the existing projects. `Warden.LockUI` cannot reference
  `Warden.Tray`, and `Warden.Core` is a leaf (ADR-0002). Shared, pure logic goes
  in `Warden.Core`; shared WPF helpers go in `Warden.LockUI`, beside
  `LiftEffect`.
- No new NuGet packages.
- **No `DispatcherTimer` for animation.** `Program.ShowBonusGranted` documents
  that a `DispatcherTimer` froze at "OK (N)" on this WinForms+WPF hybrid loop
  after an unlock. Animations, including typing and count-up, run on WPF's
  animation clock (`Storyboard` / `*AnimationUsingKeyFrames`).
- Respect Windows' animation setting. When
  `SystemParameters.ClientAreaAnimation` is false, every popup and the lock
  screen show their final state at once, as today.
- Lock windows run on their own threads, one per monitor (`LockWindowManager`).
  Animations there must be per-window and must never block show/hide or
  topmost re-assertion.
- The agent version line bumps PATCH on release: `Directory.Build.props`
  0.6.35 → 0.6.36. Web and mobile are not bumped.

## Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **A** | **Native WPF animations** (`Storyboard`, eased `DoubleAnimation`, transforms, small `Rectangle` particles on a `Canvas`) | No dependencies; matches `LiftEffect`; works in the tray and lock screen. More hand-written C# than the mockups. | **Picked by owner** |
| B | Lottie files + player library | Good for complex art, but adds a library and a design tool. Live values (+30, number of blocks) are awkward. | Dropped |
| C | WebView2 popups reusing mockup HTML/CSS | Quickest to match the mockups, but changes the architecture, adds a runtime, may lag on show, and is risky for the lock screen. | Dropped |

## Design (decided with the owner)

All motion uses ease-out or back-ease ("bouncy") curves, never stepped motion.
Durations are roughly as in the mockups. The colours are the existing
`UiTheme` / `AccentPalette` ones.

### Shared Blocky look (all three popups)

- Card corners 6 px (from 20). Border 3 px in the tone colour. A hard drop
  shadow straight down (no blur) for a "block" feel. Buttons 4 px corners, icon
  tile 5 px corners (from a circle).
- **Entrance:** the card drops from above its final spot with a slight
  overshoot bounce (~0.6 s).
- **Delayed OK:** instead of the label "OK (N)", the button background fills
  left to right over the delay. It becomes clickable when the fill completes,
  exactly when it does today.

### 1. Nudge: "Typing…"

1. The card drops in. The message line shows three square "typing" dots that
   hop in a wave (~1.5 s).
2. The dots fade out. The message types itself out one character at a time
   (~38 ms per character), with a blinking block caret while typing.
3. When typing ends, the icon does a small pop (scale up, slight tilt, back).
- Reply, the canned replies and the auto-dismiss work as today. Typing never
  delays the 5 s OK delay; they run in parallel. If the child clicks Reply
  while text is still typing, the full text appears at once.

### 2. Bonus time: celebration

- The card pops in (scale from small with overshoot). The star icon spins in
  (~0.9 s).
- About 20 square particles (4–8 px, theme colour, gold, white, soft mint) burst
  from the icon outward and slightly down. Each one tumbles (random rotation)
  and fades (~1.1 s). They may fly outside the card.
- "+N" counts up from +0 to +N with an ease-out (~0.7 s), drawn in the theme
  colour, then does a single scale "bump".

### 3. Time check: lives bar

- Same drop-in, yellow tone (as today).
- A row of **10 blocks** sits under the message. Lit blocks are yellow; used-up
  blocks are dark slots.
- Every used-up block plays a "life lost" animation **one after another, right
  to left**, ending next to the remaining lit blocks. Each one flashes white,
  pops up and enlarges, then tumbles down, shrinks and fades, leaving its dark
  slot.
- Intensity by threshold: 10 min is calm. 5 min adds a pulse ring from the clock
  icon (3 pulses). 1 min makes the card border glow softly in a loop and the
  clock tick (wobble) in a loop until closed.
- The +15/+30/+60 request buttons and their behaviour are unchanged.

### 4. Lock-down screen: calm night

- The content fades and rises in gently (~1.4 s).
- Stars become small squares that twinkle (opacity and scale, staggered loops).
- The moon becomes a **pixel moon** with a twinkling pixel sparkle, gently
  rocking and bobbing (~4 s loop).
- Two or three faint block "clouds" drift slowly across the sky (linear, long
  loop).
- Same layout, copy, buttons and Parents corner. Applies to every lock reason
  (parent lock-down, daily limit, outside allowed hours), since they share
  `LockWindow`. Secondary-monitor lock windows get the sky animation too.

## Builder's calls (marked as mine, not the owner's; change freely)

- **Lit blocks per threshold** (the warning carries only `ThresholdMinutes`, not
  the daily limit): 60→9, 30→8, 10→7, 5→4, 1→1, anything else→5. This is a pure
  function in `Warden.Core` with unit tests. It is a mood bar, not an exact
  gauge.
- **Particles need room.** The popup window gets a transparent margin (about
  60 px each side) around the card, so particles aren't clipped. The card keeps
  its current on-screen spot: `Top`/`Left` subtract the margin, and the margin
  ignores clicks.
- **Where code goes:**
  - `Warden.LockUI/BlockyMotion.cs`: reusable WPF helpers (drop-in, pop, burst
    particles, typing text, count-up, life-lost, reduced-motion check), so tray
    popups and lock windows share one implementation.
  - `AttentionWindow` uses it, picking the effect from `AttentionStyle`
    (new `AttentionStyle.Motion`: `Nudge`, `Celebrate`, `TimeCheck`, `None`).
    The blocked-app notice is `None`.
  - Pure maths/tables in `Warden.Core` (lit-blocks mapping, typing schedule,
    count-up values), unit-tested in `Warden.Tests`.
- **Typing and count-up** use `StringAnimationUsingKeyFrames` /
  `Int32AnimationUsingKeyFrames`-style key frames on the WPF animation clock, not
  timers.
- **Time-check intensity** needs the threshold passed into `AttentionWindow`
  (new optional constructor parameter). `ShowTimeWarning` already has it.
- **Loops stop on close.** All looping storyboards stop in `Closed`. Lock
  windows stop theirs on hide.
- **Pixel art** for the moon and sparkle is drawn as `Rectangle`s or a
  `Path`, with `SnapsToDevicePixels`. No image files.
- **The blocked-app notice gets the Blocky card shape** (corners, border,
  shadow), because it shares `AttentionWindow`, but **no motion**. Two card
  shapes side by side would look like a bug.
- **Lock screen buttons and Parents corner keep their current shapes.** Only the
  sky, moon, stars, clouds and fade-in change, as in the mockup.
- **Long nudge messages:** typing speed is 38 ms per character, but total typing
  is capped at about 2 s (faster per character for long messages), so a long
  note is never slow to read.
- **All lock reasons get the animated sky**, not only parent lock-down,
  because they share one window and one look. (Owner asked about "locked down";
  easy to restrict if wanted.)

## Left to the builder

- Exact easing curves, durations and particle counts, within the feel above.
- How to verify visually: a hidden dev-only way to fire each popup, or a
  manual test script. The previews must be checked in the running app, not
  only in tests.
- Update `docs/work/active/` with a task file for this work, per `AGENTS.md`.
