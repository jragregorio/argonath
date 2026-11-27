# Agent "smooth Blocky" animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the child's nudge, bonus-time and time-check popups and the lock screen game-inspired "smooth Blocky" animations, with no change to when they appear, what they say, or how their buttons behave.

**Architecture:** Timing tables (typing frames, count-up frames, lit blocks, life-lost order) are pure functions in `Warden.Core`, unit-tested. WPF effects live in one shared helper, `Warden.LockUI/BlockyMotion.cs`, beside `LiftEffect`. Both `Warden.Tray.AttentionWindow` and `Warden.LockUI.LockWindow` call it. All motion runs on WPF storyboards (the animation clock), never `DispatcherTimer`.

**Tech Stack:** .NET 8 WPF (`System.Windows.Media.Animation`), xUnit 2.9 in `Warden.Tests`.

**Spec:** `docs/superpowers/specs/2026-11-27-agent-blocky-animations-design.md`

## Global Constraints

- No new NuGet packages. `Warden.Core` stays a leaf; `Warden.LockUI` must not reference `Warden.Tray` (ADR-0002).
- No `DispatcherTimer` for any new animation, typing or count-up. Use `Storyboard` / `*AnimationUsingKeyFrames`.
- When `SystemParameters.ClientAreaAnimation` is false, show every final state at once and keep today's "OK (N)" countdown.
- Popup position unchanged: card centred horizontally, card top at `WorkingArea.Top + 48`.
- No change to copy, buttons, OK delays (nudge 5 s, time check 3 s, bonus 0 s), auto-dismiss (nudge default 45 s, blocked-app 3 s), thresholds or sounds.
- Colours come from the existing `UiTheme` / `AccentPalette`; yellow tone `#f2c14e`, moon `#f2d27a`.
- No Minecraft (or other game) art, fonts, sounds or names.
- Agent version: `apps/agent/Directory.Build.props` `0.6.35` → `0.6.36`. Do not bump web or mobile versions.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only; never push.

## Review Focus

1. **Windows "Animation effects" off.** Popups and the lock screen appear in their final state at once: the full nudge text, "+N", the blocks already dark, and the OK countdown as today.
2. **A 200-character nudge** (the reply box allows 200, and parents may send long notes) finishes typing within about 2 s, not 7.6 s.
3. **Reply or OK clicked while the text is still typing.** The full message appears at once and the reply text is captured normally.
4. **The popup closes while loops are running.** This covers auto-dismiss, the bonus notice dismissing an open time warning, and the 1-minute glow and tick. Nothing throws and no storyboard keeps running.
5. **A bonus with `ExtraMinutes <= 0`.** The body reads "Your parent added extra screen time", with no count-up and no "+0".

---

### Task 1: Pure Blocky timelines in Core

**Files:**
- Create: `apps/agent/Warden.Core/Theming/BlockyTimeline.cs`
- Test: `apps/agent/Warden.Tests/BlockyTimelineTests.cs`

**Interfaces:**
- Produces (namespace `Warden.Core.Theming`):
  - `public readonly record struct TextFrame(TimeSpan At, string Text);`
  - `public static class BlockyTimeline`
    - `const int TimeBlocks = 10;`
    - `static int LitBlocks(int thresholdMinutes)`: 60→9, 30→8, 10→7, 5→4, 1→1, anything else→5.
    - `static IReadOnlyList<(int Index, TimeSpan Delay)> LifeLostOrder(int lit, int total = TimeBlocks)`: one entry per used-up block (`lit..total-1`), ordered right to left. Delay = 650 ms + n × 140 ms, where n = 0 for the rightmost block.
    - `static IReadOnlyList<TextFrame> TypingFrames(string text, TimeSpan? start = null)`: one frame per character. The interval is `min(38 ms, 2000 ms / length)`. Every frame except the last shows `text[..k] + "▌"`; the last shows `text` with no caret. `start` (default zero) offsets every frame. Empty text returns `[]`.
    - `static IReadOnlyList<TextFrame> CountUpFrames(int to, TimeSpan duration)`: ease-out cubic (`to * (1 - (1-t)^3)`, rounded) sampled at `min(to, 30)` uniform steps. Consecutive duplicates are dropped. The first frame is `(0, "+0")` and the last is `(duration, "+{to}")`. `to <= 0` returns `[]`.

- [ ] **Step 1: Write the failing tests**

```csharp
[Theory]
[InlineData(60, 9)][InlineData(30, 8)][InlineData(10, 7)][InlineData(5, 4)][InlineData(1, 1)][InlineData(15, 5)]
public void Lit_blocks_follow_threshold(int threshold, int lit) => Assert.Equal(lit, BlockyTimeline.LitBlocks(threshold));

[Fact]
public void Life_lost_runs_right_to_left_ending_next_to_lit_blocks()
{
    var order = BlockyTimeline.LifeLostOrder(lit: 4);
    Assert.Equal(new[] { 9, 8, 7, 6, 5, 4 }, order.Select(o => o.Index));
    Assert.Equal(TimeSpan.FromMilliseconds(650), order[0].Delay);
    Assert.Equal(TimeSpan.FromMilliseconds(650 + 5 * 140), order[^1].Delay);
}

[Fact]
public void Life_lost_is_empty_when_all_blocks_lit() => Assert.Empty(BlockyTimeline.LifeLostOrder(lit: 10));

[Fact]
public void Typing_shows_caret_until_last_frame()
{
    var f = BlockyTimeline.TypingFrames("Hi!");
    Assert.Equal(new[] { "H▌", "Hi▌", "Hi!" }, f.Select(x => x.Text));
    Assert.Equal(TimeSpan.FromMilliseconds(38), f[1].At - f[0].At);
}

[Fact]
public void Long_message_types_within_two_seconds()
{
    var f = BlockyTimeline.TypingFrames(new string('a', 200), TimeSpan.FromSeconds(2));
    Assert.True(f[^1].At - f[0].At <= TimeSpan.FromSeconds(2));
    Assert.Equal(new string('a', 200), f[^1].Text);
    Assert.True(f[0].At >= TimeSpan.FromSeconds(2));
}

[Fact]
public void Typing_empty_text_has_no_frames() => Assert.Empty(BlockyTimeline.TypingFrames(""));

[Fact]
public void Count_up_starts_at_zero_ends_at_target_never_decreases()
{
    var f = BlockyTimeline.CountUpFrames(30, TimeSpan.FromMilliseconds(700));
    Assert.Equal("+0", f[0].Text);
    Assert.Equal(new TextFrame(TimeSpan.FromMilliseconds(700), "+30"), f[^1]);
    var values = f.Select(x => int.Parse(x.Text.TrimStart('+'))).ToList();
    Assert.True(values.Zip(values.Skip(1)).All(p => p.Second > p.First));
}

[Theory][InlineData(0)][InlineData(-5)]
public void Count_up_for_no_minutes_is_empty(int to) => Assert.Empty(BlockyTimeline.CountUpFrames(to, TimeSpan.FromMilliseconds(700)));
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/agent && dotnet test Warden.Tests --filter BlockyTimelineTests`
Expected: build FAIL, "The name 'BlockyTimeline' does not exist".

- [ ] **Step 3: Implement `BlockyTimeline` and `TextFrame` per the Interfaces block.**

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/agent && dotnet test Warden.Tests --filter BlockyTimelineTests`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/Warden.Core/Theming/BlockyTimeline.cs apps/agent/Warden.Tests/BlockyTimelineTests.cs
git commit -m "feat(agent): Blocky animation timelines in Core"
```

---

### Task 2: Shared WPF motion helpers

**Files:**
- Create: `apps/agent/Warden.LockUI/BlockyMotion.cs`
- Test: `apps/agent/Warden.Tests/BlockyMotionTests.cs`

**Interfaces:**
- Consumes: `TextFrame`, `BlockyTimeline` (Task 1).
- Produces (namespace `Warden.LockUI`, `public static class BlockyMotion`). Every method returns the started `Storyboard` (or `null` when animations are off) and sets the final state directly when animations are off.
  - `static bool Enabled { get; }` returns `SystemParameters.ClientAreaAnimation && !ForceDisabled`.
  - `internal static bool ForceDisabled { get; set; }` (test hook; add `InternalsVisibleTo Warden.Tests` to `Warden.LockUI.csproj`).
  - `static Storyboard? DropIn(FrameworkElement card)`: `TranslateTransform.Y` from `-(card height + 40)` to 0, 600 ms, `BackEase { Amplitude = 0.5, EasingMode = EaseOut }`.
  - `static Storyboard? PopIn(FrameworkElement el, TimeSpan? delay = null)`: `ScaleTransform` from 0.3 to 1 and opacity from 0 to 1, 600 ms, `BackEase { Amplitude = 0.7 }`, centred.
  - `static Storyboard? Bump(FrameworkElement el, TimeSpan delay, double peak = 1.3, double tiltDeg = 0)`: scales to `peak` (and rotates by `tiltDeg`) and back, 500 ms.
  - `static Storyboard? Spin(FrameworkElement el, TimeSpan delay)`: rotation from -270° to 0° plus scale from 0.3 to 1, 900 ms, `BackEase`.
  - `static Storyboard? PlayText(TextBlock target, IReadOnlyList<TextFrame> frames, string finalText)`: a `StringAnimationUsingKeyFrames` of `DiscreteStringKeyFrame`s on `TextBlock.TextProperty`. When off, or when `frames` is empty, sets `finalText`.
  - `static void Finish(Storyboard? sb, FrameworkElement owner, Action setFinal)`: stops `sb` on `owner` and runs `setFinal`. Used to skip typing.
  - `static Storyboard? Burst(Canvas layer, Point origin, IReadOnlyList<Color> colors, int count, TimeSpan delay, Random? rng = null)`: adds `count` square `Rectangle`s (4–8 px) at `origin`. Each flies 55–100 px outward, biased +18 px down, rotates randomly between -270° and 270°, and fades out over 1100 ms (`CubicEase` out). The rectangles are removed from `layer` on completion. When off, adds nothing and returns `null`.
  - `static Storyboard? LifeLost(Rectangle life, TimeSpan delay)`: 700 ms keyframes. At 0 %: opacity 1, scale 1, colour `#f2c14e`. At 20 %: scale 1.4, white. At 45 %: Y -3, scale 1.15, white. At 100 %: Y +14, scale 0.2, rotate 35°, opacity 0. When off, sets opacity 0.
  - `static Storyboard? Loop(FrameworkElement el, LoopKind kind, TimeSpan? beginOffset = null)` with `public enum LoopKind { Twinkle, Bob, Tick, Glow, Hop, Drift }` (the typing caret is the `▌` in the typing frames; it moves with each letter, so it needs no blink loop). Twinkle: opacity 0.3↔1, scale 1↔1.6, 2.4 s. Bob: Y 0↔-5, rotate 0↔-4°, 4 s. Tick: rotate -12°/12° wobble in the first 30 % of 1 s. Glow: border brush to `#f2c14e` and back plus an outer glow, 1.4 s (border element only). Hop: Y 0↔-5, 600 ms. Drift: X from -120 to parent width + 120, 16 s linear. All `RepeatBehavior.Forever`. Returns `null` and does nothing when off.
  - `static Storyboard? Fill(FrameworkElement bar, double width, TimeSpan duration, Action onCompleted)`: `Width` from 0 to `width`, linear, and `onCompleted` runs on `Completed`. When off, does not animate and returns `null`. The caller keeps today's countdown.
  - `static void StopAll(FrameworkElement owner)`: stops every storyboard this class started against `owner` or its descendants. Track them in a `ConditionalWeakTable<FrameworkElement, List<Storyboard>>` keyed by the owning window.

  Every method takes the owning `FrameworkElement` implicitly as `Window.GetWindow(el) ?? el` for `StopAll` registration. Storyboards are created per call, never shared across threads (lock windows run on their own threads).

- [ ] **Step 1: Write the failing tests** (they need STA; use a small `StaFact`-style helper, a `Thread` with `ApartmentState.STA` that rethrows exceptions, in the test file)

```csharp
[Fact] public void Disabled_play_text_sets_final_text_immediately() => RunSta(() => {
    BlockyMotion.ForceDisabled = true;
    var tb = new TextBlock();
    var sb = BlockyMotion.PlayText(tb, BlockyTimeline.TypingFrames("Hello"), "Hello");
    Assert.Null(sb); Assert.Equal("Hello", tb.Text);
});

[Fact] public void Disabled_burst_adds_no_particles() => RunSta(() => {
    BlockyMotion.ForceDisabled = true;
    var c = new Canvas();
    Assert.Null(BlockyMotion.Burst(c, new Point(10, 10), new[] { Colors.White }, 20, TimeSpan.Zero));
    Assert.Empty(c.Children);
});

[Fact] public void Disabled_life_lost_hides_block() => RunSta(() => {
    BlockyMotion.ForceDisabled = true;
    var r = new Rectangle { Opacity = 1 };
    BlockyMotion.LifeLost(r, TimeSpan.Zero);
    Assert.Equal(0, r.Opacity);
});

[Fact] public void Enabled_burst_adds_requested_particles() => RunSta(() => {
    BlockyMotion.ForceDisabled = false;
    if (!BlockyMotion.Enabled) return; // CI box with animations off
    var c = new Canvas();
    BlockyMotion.Burst(c, new Point(10, 10), new[] { Colors.White }, 20, TimeSpan.Zero);
    Assert.Equal(20, c.Children.Count);
});

[Fact] public void Finish_runs_final_state_even_without_storyboard() => RunSta(() => {
    var tb = new TextBlock { Text = "Hel▌" };
    BlockyMotion.Finish(null, tb, () => tb.Text = "Hello");
    Assert.Equal("Hello", tb.Text);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/agent && dotnet test Warden.Tests --filter BlockyMotionTests`
Expected: build FAIL, "The name 'BlockyMotion' does not exist".

- [ ] **Step 3: Implement `BlockyMotion` per the Interfaces block** and add `<InternalsVisibleTo Include="Warden.Tests" />` to `Warden.LockUI.csproj` (the same pattern as `Warden.Tray.csproj`). If `Warden.Tests` has no direct `Warden.LockUI` reference and internals aren't visible transitively, add `<ProjectReference Include="..\Warden.LockUI\Warden.LockUI.csproj" />` to `Warden.Tests.csproj`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/agent && dotnet test Warden.Tests --filter BlockyMotionTests`
Expected: all PASS.

- [ ] **Step 5: Run the boundary check**

Run: `cd ../.. && npm run check:boundaries`
Expected: exit 0 (no new `Warden.LockUI → Warden.Tray` edge).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/Warden.LockUI apps/agent/Warden.Tests
git commit -m "feat(agent): shared BlockyMotion WPF helpers"
```

---

### Task 3: Blocky popup shell (shape, particle margin, drop-in, OK fill)

**Files:**
- Modify: `apps/agent/Warden.Tray/AttentionStyle.cs`
- Modify: `apps/agent/Warden.Tray/AttentionWindow.cs` (constructor layout, the card `Border`, the delay timer block, `Closed`)
- Modify: `apps/agent/Warden.Tray/UiTheme.cs` (add `BlockyCardRadius = 6`, `BlockyButtonRadius = 4`, `BlockyIconRadius = 5`; leave the existing constants for other windows)
- Test: `apps/agent/Warden.Tests/AttentionStyleTests.cs`

**Interfaces:**
- Consumes: `BlockyMotion.DropIn`, `Fill`, `StopAll`, `Enabled` (Task 2).
- Produces:
  - `public enum AttentionMotion { None, Nudge, Celebrate, TimeCheck }`, plus a new `Motion` property on `AttentionStyle` (record parameter, last position). `"nudge"`→Nudge, `"extra time"`→Celebrate, `"time remaining"`→TimeCheck, everything else (including `"app blocked"`)→None.
  - `AttentionWindow` gets a new optional constructor parameter `int? thresholdMinutes = null` (last), stored for Task 6.
  - Protected-in-class fields that later tasks use: `Canvas _particleLayer` (fills the window, `IsHitTestVisible = false`, above the card), `Border _card`, `Border _icon`, `TextBlock _messageText`, `Panel _messageHost` (the container holding `_messageText`), `List<(WpfButton, bool)> _delayedButtons`, `WpfButton _ok`.
  - `const double ParticleMargin = 60;`

- [ ] **Step 1: Write the failing tests**

```csharp
[Theory]
[InlineData("NUDGE", AttentionMotion.Nudge)]
[InlineData("Extra time", AttentionMotion.Celebrate)]
[InlineData("Time remaining", AttentionMotion.TimeCheck)]
[InlineData("App blocked", AttentionMotion.None)]
[InlineData("", AttentionMotion.None)]
public void Motion_follows_popup_kind(string title, AttentionMotion motion) => Assert.Equal(motion, AttentionStyle.For(title).Motion);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/agent && dotnet test Warden.Tests --filter AttentionStyleTests`
Expected: build FAIL, "'AttentionMotion' could not be found".

- [ ] **Step 3: Add `AttentionMotion` and `Motion` to `AttentionStyle`.**

- [ ] **Step 4: Reshape `AttentionWindow`.**
  - Window `Width = cardWidth + 2 * ParticleMargin` (card width stays 420, or 480 with extension buttons). `Left = WorkingArea.Left + (WorkingArea.Width - Width) / 2`, `Top = WorkingArea.Top + 48 - ParticleMargin`.
  - `Content` = a `Grid` with **`Background = null`** (a null brush lets clicks through the transparent margin; `Brushes.Transparent` would swallow them). It holds the card with `Margin = ParticleMargin` and, above it, `_particleLayer`.
  - Card: `CornerRadius 6`, `BorderThickness 3`, and the shadow becomes `DropShadowEffect { BlurRadius = 0, ShadowDepth = 6, Direction = 270, Opacity = 0.45 }`. The icon tile `CornerRadius 5`. The buttons created here get corner radius 4 (via `UiTheme` button factories taking a radius, or by setting it after creation; pick whichever doesn't change other windows' buttons).
  - Delayed OK: when `BlockyMotion.Enabled` and `delay > 0`, put a fill `Border` (accent at 55 % alpha) behind the OK label. Call `BlockyMotion.Fill(fill, okWidth, TimeSpan.FromSeconds(delay), enableButtons)` once OK has its width (`ok.Loaded` / `SizeChanged`). The label stays "OK". Do not start the `DispatcherTimer`. Otherwise keep today's `DispatcherTimer` "OK (N)" path unchanged.
  - `Loaded`: if `style.Motion` is `Nudge` or `TimeCheck`, call `BlockyMotion.DropIn(_card)`. `Celebrate` pops in instead (Task 5). `None` (blocked-app) appears as today, with no motion.
  - `Closed`: call `BlockyMotion.StopAll(this)` before the existing timer stops.

- [ ] **Step 5: Run all agent tests**

Run: `cd apps/agent && dotnet test Warden.Tests`
Expected: all PASS.

- [ ] **Step 6: Manual check in the running app**

Run: `cd apps/agent && dotnet run --project Warden.Tray`. Trigger a blocked-app notice by launching an app the parent has blocked.
Expected:
- The card has the blocky shape, the same position as before, and no motion.
- Clicking just outside the card reaches the window underneath.
- It auto-dismisses after 3 s.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/Warden.Tray apps/agent/Warden.Tests/AttentionStyleTests.cs
git commit -m "feat(agent): blocky popup shell with drop-in and OK fill"
```

---

### Task 4: Nudge "Typing…"

**Files:**
- Modify: `apps/agent/Warden.Tray/AttentionWindow.cs`

**Interfaces:**
- Consumes: `BlockyTimeline.TypingFrames`, `BlockyMotion.PlayText`, `Finish`, `Loop(LoopKind.Hop)`, `Bump`, `_messageText`, `_messageHost`, `_icon` (Tasks 1–3).

Timeline from `Loaded`:
- 0.55 s: the typing-dots panel fades in. It is three 6×6 accent squares on a `hsl(card, +6 % lightness)` 4 px-corner chip, inside `_messageHost` over the empty `_messageText`. Each dot runs `Loop(Hop)` offset 0 / 0.15 / 0.30 s.
- 2.05 s: the dots fade out and `PlayText(_messageText, TypingFrames(message, start: 2.05 s), message)` starts.
- At the last typing frame time: `Bump(_icon, that time, peak: 1.35, tiltDeg: -8)`.
- `_messageText.Text` starts as `""`, but the card height must not jump. Reserve the height by measuring the final message first: set `MinHeight` from a `TextBlock` measured with the same width, font and size.
- Skip-to-end: in the Reply toggle handler, in `CloseWithResponse`, and when the canned buttons are clicked, call `BlockyMotion.Finish(typing, this, () => { hide dots; _messageText.Text = message; })` first.
- When `BlockyMotion.Enabled` is false, show the message at once with no dots.

- [ ] **Step 1: Implement the nudge timeline** in a private `StartNudgeMotion(string message)`, called from `Loaded` when `style.Motion == AttentionMotion.Nudge`.

- [ ] **Step 2: Build**

Run: `cd apps/agent && dotnet build`
Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Manual check.** Send a nudge from the dashboard (or `npm run test:core` against a running web + DB) to the paired dev agent, three times: a short message, a 200-character message, and an empty message.
Expected:
- Dots hop, then the text types out. The 200-character one finishes within about 2 s. The empty one types "Your parent wants your attention".
- OK becomes clickable at 5 s. Clicking Reply mid-typing shows the full text at once.
- The reply arrives on the dashboard. Auto-dismiss happens at 45 s.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/Warden.Tray/AttentionWindow.cs
git commit -m "feat(agent): typing animation for parent nudges"
```

---

### Task 5: Bonus time celebration

**Files:**
- Modify: `apps/agent/Warden.Tray/AttentionWindow.cs`
- Modify: `apps/agent/Warden.Tray/Program.cs` (`ShowBonusGranted`: pass the minutes)

**Interfaces:**
- Consumes: `BlockyTimeline.CountUpFrames`, `BlockyMotion.PopIn`, `Spin`, `Burst`, `PlayText`, `Bump`, `_particleLayer`, `_icon`, `_messageText` (Tasks 1–3).
- Produces: a new optional `AttentionWindow` parameter `int? bonusMinutes = null` (last). `ShowBonusGranted` passes `extraMinutes`.

Behaviour (when `style.Motion == AttentionMotion.Celebrate`):
- `PopIn(_card)`, then `Spin(icon glyph, 0.2 s)`.
- `Burst(_particleLayer, icon centre in layer coordinates, [UiTheme.Accent, #f2c14e, #eef2f0, #9fe8bd], 20, 0.25 s)`.
- If `bonusMinutes > 0`: the message becomes `"Your parent added "` + a `Run` holding the count (accent colour, semibold) + `" minutes"`. The count plays `CountUpFrames(bonusMinutes, 700 ms)` starting at 0.35 s, ending on `"+{bonusMinutes}"`, then `Bump(count, 1.05 s, peak 1.35)`. A `Run` can't take a transform, so host the count in an `InlineUIContainer` with a `TextBlock`.
- If `bonusMinutes` is null or `<= 0`: the body stays "Your parent added extra screen time" with no count-up.
- OK stays clickable immediately.

- [ ] **Step 1: Implement `StartCelebrateMotion()`** and the `ShowBonusGranted` parameter.

- [ ] **Step 2: Build**

Run: `cd apps/agent && dotnet build`
Expected: Build succeeded.

- [ ] **Step 3: Manual check.** From the dashboard, add +15, +30 and +60 bonus time, then a custom amount. Also approve a pending extension request while a time warning is open.
Expected:
- Pop, spin and a square burst. Particles fly outside the card without being clipped. The count-up ends on the exact minutes.
- The open time warning closes without errors (watch `%LOCALAPPDATA%\Warden` logs for `Warn`/`Error`).

- [ ] **Step 4: Commit**

```bash
git add apps/agent/Warden.Tray
git commit -m "feat(agent): celebration animation for bonus time"
```

---

### Task 6: Time check lives bar

**Files:**
- Modify: `apps/agent/Warden.Tray/AttentionWindow.cs`
- Modify: `apps/agent/Warden.Tray/Program.cs` (`ShowTimeWarning`: pass `thresholdMinutes: payload.ThresholdMinutes`)

**Interfaces:**
- Consumes: `BlockyTimeline.TimeBlocks`, `LitBlocks`, `LifeLostOrder`, `BlockyMotion.LifeLost`, `Loop(Glow)`, `Loop(Tick)`, `_thresholdMinutes`, `_card`, `_icon`, `_messageHost` (Tasks 1–3).

Behaviour (when `style.Motion == AttentionMotion.TimeCheck` and a threshold is set):
- Under the message, add a row of 10 equal blocks. Each is 9 px tall with a 3 px gap and 1 px corners. Lit blocks are `#f2c14e`. Used-up blocks are a dark slot (`UiTheme.TrackBrush`) with a yellow `Rectangle` "life" laid over the slot.
- For each `(Index, Delay)` in `LifeLostOrder(LitBlocks(threshold))`, call `LifeLost(life[Index], Delay)`.
- Threshold 5: three pulse rings from the icon. A 3 px yellow rounded square scales from 1 to 2 and fades over 1.4 s, starting at 0.6 s, `RepeatBehavior = 3x`. Add this as `LoopKind`-free code here, or as a `BlockyMotion.Pulse(FrameworkElement, TimeSpan, int times)` (if added, add a disabled-mode test like Task 2's).
- Threshold 1: `Loop(_card, Glow)` and `Loop(clock glyph, Tick)`.
- Threshold 10 or others: no extra motion.
- Request buttons, OK delay (3 s) and the `_activeTimeWarningWindow` handling are unchanged.

- [ ] **Step 1: Implement `StartTimeCheckMotion(int threshold)`** and the `Program.ShowTimeWarning` argument.

- [ ] **Step 2: Build and run all tests**

Run: `cd apps/agent && dotnet build && dotnet test Warden.Tests`
Expected: Build succeeded; all PASS.

- [ ] **Step 3: Manual check.** Set a child's daily limit so remaining time crosses 10, 5 and 1 minutes (`npm run test:reset` to reset usage between runs).
Expected:
- At 10, three blocks are lost; at 5, six; at 1, nine. They go right to left.
- 5 adds the pulses. 1 glows and ticks until closed.
- Granting bonus time during the 1-minute popup closes it with no errors in the log.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/Warden.Tray
git commit -m "feat(agent): lives-bar animation for time checks"
```

---

### Task 7: Lock screen night animation

**Files:**
- Modify: `apps/agent/Warden.LockUI/LockWindow.cs` (`BuildStars`, `CreateMoon`, main panel construction near line 140, secondary-window panel near line 426)

**Interfaces:**
- Consumes: `BlockyMotion.Loop(Twinkle | Bob | Drift)`, `BlockyMotion.StopAll`, `Enabled` (Task 2).

Changes:
- `BuildStars`: replace each `Ellipse` with a square `Rectangle` (`r * 2` side, `SnapsToDevicePixels`). Start `Loop(star, Twinkle, beginOffset: (i * 0.37) % 2.4 s)` on each.
- `CreateMoon`: replace the two `Path`s with a pixel moon drawn on a 12×12 grid of `Rectangle`s, scaled to `size`, filled `MoonBrush`. The cells (x, y, w, h): (4,1,3,1) (2,2,3,1) (1,3,3,2) (1,5,3,2) (1,7,4,1) (2,8,6,1) (3,9,5,1) (8,7,2,1). A separate 1×1 sparkle cell sits at (9,2) with `Loop(Twinkle)`. `Loop(grid, Bob)` runs on the whole moon. Remove the now-unused `MoonGeometry` / `SparkleGeometry` / `MoonFillBrush` if nothing else uses them.
- Clouds: add two `Rectangle`s (10 px tall, 70 px and 44 px wide) to the sky layer, filled with `palette.Star` at 12 % alpha, at 58 % and 22 % of the height. Each runs `Loop(cloud, Drift)`, the second with a -7 s offset. Put them behind the content and keep them non-hit-testable.
- Fade-in: on `Loaded`, animate the main content panel's opacity from 0 to 1 and its `TranslateTransform.Y` from 10 to 0 over 1.4 s, ease-out. Skip this when `BlockyMotion.Enabled` is false.
- `Closed`: call `BlockyMotion.StopAll(this)`.
- Layout, copy, buttons and the Parents corner are unchanged. This applies to every lock reason and to the secondary-monitor windows.

- [ ] **Step 1: Implement the lock screen changes.**

- [ ] **Step 2: Build and run all tests**

Run: `cd apps/agent && dotnet build && dotnet test Warden.Tests`
Expected: Build succeeded; all PASS.

- [ ] **Step 3: Manual check.** Lock the device from the dashboard (parent lock-down), wait 10 s, then unlock from the dashboard. Repeat once letting the daily limit run out. If a second monitor is available, check it too.
Expected:
- The content fades in. Square stars twinkle, the pixel moon rocks, the clouds drift.
- The unlock closes all windows promptly. Ask for 15 more minutes, Shut down and the Parents PIN still work. Keyboard lock and topmost re-assertion are unaffected.
- No new `Warn`/`Error` lines in the log.

- [ ] **Step 4: Repeat Step 3 with Windows animations off** (Settings → Accessibility → Visual effects → Animation effects: off).
Expected: the static square stars and pixel moon appear at once, with no motion and no fade.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/Warden.LockUI
git commit -m "feat(agent): animated night sky on the lock screen"
```

---

### Task 8: Release housekeeping

**Files:**
- Modify: `apps/agent/Directory.Build.props` (`<Version>0.6.35</Version>` → `<Version>0.6.36</Version>`)
- Modify: `.gitignore` (add `.superpowers/`)
- Create: `docs/work/active/agent-blocky-animations.md` (task file per `AGENTS.md`: goal, spec and plan links, status per task, manual checks done)
- Modify: `docs/ai/CURRENT_STATE.md` (one line under the agent section: the Blocky animations in 0.6.36)

- [ ] **Step 1: Make the four edits above.**

- [ ] **Step 2: Run full validation**

Run: `cd apps/agent && dotnet build -c Release && dotnet test Warden.Tests` then `cd ../.. && npm run check:boundaries`
Expected: Build succeeded; all tests PASS; boundaries exit 0.

- [ ] **Step 3: Repeat the animations-off check for popups.** With Windows animations off, fire a nudge, a bonus and a time check.
Expected:
- Final states appear at once: the full text, "+N", the blocks already dark.
- OK shows today's "OK (N)" countdown.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/Directory.Build.props .gitignore docs/work/active/agent-blocky-animations.md docs/ai/CURRENT_STATE.md docs/superpowers
git commit -m "chore(agent): v0.6.36 Blocky animations, docs and gitignore"
```
