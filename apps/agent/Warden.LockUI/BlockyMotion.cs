using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using Warden.Core.Diagnostics;
using Warden.Core.Theming;

namespace Warden.LockUI;

/// <summary>Looping effects for <see cref="BlockyMotion.Loop"/>.</summary>
public enum LoopKind
{
    /// <summary>Opacity 0.3↔1 and scale 1↔1.6 (stars, sparkles).</summary>
    Twinkle,
    /// <summary>Gentle float up and tilt (the moon).</summary>
    Bob,
    /// <summary>Quick wobble once a second (the clock at one minute left).</summary>
    Tick,
    /// <summary>Border pulses to the heads-up yellow (a <see cref="Border"/> only).</summary>
    Glow,
    /// <summary>Small hop (typing dots).</summary>
    Hop,
    /// <summary>Slow drift across the parent, left to right (clouds).</summary>
    Drift,
    /// <summary>Mostly hidden; now and then flashes in and fades (a star's "+" glint).</summary>
    Glint,
    /// <summary>Slow sleepy breathing: grows a little taller from its bottom edge.</summary>
    Breathe,
    /// <summary>On/off power light.</summary>
    Blink,
    /// <summary>Old-screen brightness flicker (two quick dips per cycle).</summary>
    Flicker,
    /// <summary>Soft brightness pulse (paused bars).</summary>
    Pulse,
    /// <summary>Busy drive light: two quick blinks then rest.</summary>
    DriveLight
}

/// <summary>
/// "Smooth Blocky" animations shared by the tray popups and the lock screen.
/// Everything runs on WPF's animation clock (never a DispatcherTimer). When
/// Windows' animation effects are off, each call shows its final state at once
/// and returns null.
/// </summary>
public static class BlockyMotion
{
    private static readonly Color HeadsUp = Color.FromRgb(0xf2, 0xc1, 0x4e);
    private static readonly object Gate = new();
    private static readonly ConditionalWeakTable<DependencyObject, List<(Storyboard Sb, FrameworkElement On)>> Running = new();
    private static readonly ConditionalWeakTable<Storyboard, FrameworkElement> BeganOn = new();

    [ThreadStatic]
    private static bool _forceDisabled;

    /// <summary>Test hook (per UI thread): behave as if Windows animations were off.</summary>
    internal static bool ForceDisabled
    {
        get => _forceDisabled;
        set => _forceDisabled = value;
    }

    /// <summary>False when Windows' "Animation effects" setting is off.</summary>
    public static bool Enabled => !ForceDisabled && SystemParameters.ClientAreaAnimation;

    /// <summary>
    /// Runs animation work so a failure degrades to a still frame and never escapes into
    /// lock/unlock or the popup queue. Failures go to <paramref name="onError"/>.
    /// </summary>
    public static void Guard(Action action, Action<Exception> onError)
    {
        try
        {
            action();
        }
        catch (Exception ex)
        {
            try { onError(ex); } catch { /* never let reporting throw */ }
        }
    }

    /// <summary><see cref="Guard(Action, Action{Exception})"/> that logs a warning under <paramref name="area"/>.</summary>
    public static void Guard(Action action, string area) =>
        Guard(action, ex => WardenLog.Warn(area, "Animation failed (showing still frame)", ex));

    /// <summary>Card falls in from above with a small overshoot.</summary>
    public static Storyboard? DropIn(FrameworkElement card)
    {
        if (!Enabled) return null;
        var (_, _, t) = Transforms(card);
        var height = card.ActualHeight > 0 ? card.ActualHeight : 150;
        var sb = new Storyboard();
        sb.Children.Add(Tween(card, Part(card, t, TranslateTransform.YProperty), -(height + 40), 0, TimeSpan.Zero, Ms(600), new BackEase { Amplitude = 0.3, EasingMode = EasingMode.EaseOut }));
        return Begin(card, sb);
    }

    /// <summary>Grows from small with an overshoot while fading in.</summary>
    public static Storyboard? PopIn(FrameworkElement el, TimeSpan? delay = null)
    {
        if (!Enabled) return null;
        var d = delay ?? TimeSpan.Zero;
        var (s, _, _) = Transforms(el);
        var ease = new BackEase { Amplitude = 0.7, EasingMode = EasingMode.EaseOut };
        var sb = new Storyboard();
        sb.Children.Add(Tween(el, Part(el, s, ScaleTransform.ScaleXProperty), 0.3, 1, d, Ms(600), ease));
        sb.Children.Add(Tween(el, Part(el, s, ScaleTransform.ScaleYProperty), 0.3, 1, d, Ms(600), ease));
        sb.Children.Add(Tween(el, Own(UIElement.OpacityProperty), 0, 1, d, Ms(300), new CubicEase { EasingMode = EasingMode.EaseOut }));
        return Begin(el, sb);
    }

    /// <summary>Fades in while rising <paramref name="rise"/> px into place.</summary>
    public static Storyboard? FadeUp(FrameworkElement el, TimeSpan duration, double rise = 10)
    {
        if (!Enabled) return null;
        var (_, _, t) = Transforms(el);
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        var sb = new Storyboard();
        sb.Children.Add(Tween(el, Own(UIElement.OpacityProperty), 0, 1, TimeSpan.Zero, duration, ease));
        sb.Children.Add(Tween(el, Part(el, t, TranslateTransform.YProperty), rise, 0, TimeSpan.Zero, duration, ease));
        return Begin(el, sb);
    }

    /// <summary>Quick scale (and optional tilt) up and back.</summary>
    public static Storyboard? Bump(FrameworkElement el, TimeSpan delay, double peak = 1.3, double tiltDeg = 0)
    {
        if (!Enabled) return null;
        var (s, r, _) = Transforms(el);
        var sb = new Storyboard();
        sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleXProperty), delay, (0, 1), (200, peak), (500, 1)));
        sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleYProperty), delay, (0, 1), (200, peak), (500, 1)));
        if (tiltDeg != 0) sb.Children.Add(Keys(el, Part(el, r, RotateTransform.AngleProperty), delay, (0, 0), (200, tiltDeg), (500, 0)));
        return Begin(el, sb);
    }

    /// <summary>Spins in from -270° while growing (the bonus star).</summary>
    public static Storyboard? Spin(FrameworkElement el, TimeSpan delay)
    {
        if (!Enabled) return null;
        var (s, r, _) = Transforms(el);
        var ease = new BackEase { Amplitude = 0.3, EasingMode = EasingMode.EaseOut };
        var sb = new Storyboard();
        sb.Children.Add(Tween(el, Part(el, r, RotateTransform.AngleProperty), -270, 0, delay, Ms(900), ease));
        sb.Children.Add(Tween(el, Part(el, s, ScaleTransform.ScaleXProperty), 0.3, 1, delay, Ms(900), ease));
        sb.Children.Add(Tween(el, Part(el, s, ScaleTransform.ScaleYProperty), 0.3, 1, delay, Ms(900), ease));
        return Begin(el, sb);
    }

    /// <summary>Plays text frames (typing, count-up). Shows <paramref name="finalText"/> at once when off or empty.</summary>
    public static Storyboard? PlayText(TextBlock target, IReadOnlyList<TextFrame> frames, string finalText)
    {
        if (!Enabled || frames.Count == 0)
        {
            target.Text = finalText;
            return null;
        }

        var anim = new StringAnimationUsingKeyFrames();
        if (frames[0].At > TimeSpan.Zero)
        {
            anim.KeyFrames.Add(new DiscreteStringKeyFrame(string.Empty, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        }

        foreach (var frame in frames)
        {
            anim.KeyFrames.Add(new DiscreteStringKeyFrame(frame.Text, KeyTime.FromTimeSpan(frame.At)));
        }

        Storyboard.SetTarget(anim, target);
        Storyboard.SetTargetProperty(anim, new PropertyPath(TextBlock.TextProperty));
        var sb = new Storyboard();
        sb.Children.Add(anim);
        return Begin(target, sb);
    }

    /// <summary>Stops <paramref name="sb"/> (if any) and applies the final state.</summary>
    public static void Finish(Storyboard? sb, FrameworkElement owner, Action setFinal)
    {
        if (sb != null)
        {
            FrameworkElement on;
            lock (Gate)
            {
                on = BeganOn.TryGetValue(sb, out var began) ? began : owner;
            }

            Halt(sb, on);
        }

        setFinal();
    }

    /// <summary>
    /// Square particles fly out from <paramref name="origin"/>, tumble and fade.
    /// They are removed from <paramref name="layer"/> when done.
    /// </summary>
    public static Storyboard? Burst(Canvas layer, Point origin, IReadOnlyList<Color> colors, int count, TimeSpan delay, Random? rng = null)
    {
        if (!Enabled || count <= 0 || colors.Count == 0) return null;
        rng ??= Random.Shared;
        var sb = new Storyboard();
        var added = new List<Rectangle>(count);
        var fly = Ms(1100);
        for (var i = 0; i < count; i++)
        {
            var size = rng.Next(4, 9);
            var rect = new Rectangle
            {
                Width = size,
                Height = size,
                Fill = new SolidColorBrush(colors[i % colors.Count]),
                IsHitTestVisible = false,
                Opacity = 0,
                SnapsToDevicePixels = true
            };
            Canvas.SetLeft(rect, origin.X - size / 2.0);
            Canvas.SetTop(rect, origin.Y - size / 2.0);
            var (s, r, t) = Transforms(rect);

            var angle = (double)i / count * Math.PI * 2 + rng.NextDouble() * 0.4;
            var dist = 55 + rng.NextDouble() * 45;
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            sb.Children.Add(Tween(rect, Part(rect, t, TranslateTransform.XProperty), 0, Math.Cos(angle) * dist, delay, fly, ease));
            sb.Children.Add(Tween(rect, Part(rect, t, TranslateTransform.YProperty), 0, Math.Sin(angle) * dist + 18, delay, fly, ease));
            sb.Children.Add(Tween(rect, Part(rect, r, RotateTransform.AngleProperty), 0, rng.Next(-270, 271), delay, fly, ease));
            sb.Children.Add(Tween(rect, Part(rect, s, ScaleTransform.ScaleXProperty), 0.5, 1, delay, fly, ease));
            sb.Children.Add(Tween(rect, Part(rect, s, ScaleTransform.ScaleYProperty), 0.5, 1, delay, fly, ease));
            sb.Children.Add(Keys(rect, Own(UIElement.OpacityProperty), delay, (0, 1), (770, 1), (1100, 0)));

            layer.Children.Add(rect);
            added.Add(rect);
        }

        sb.Completed += (_, _) =>
        {
            foreach (var rect in added) layer.Children.Remove(rect);
        };
        return Begin(layer, sb);
    }

    /// <summary>
    /// Square rings ripple out from <paramref name="center"/> <paramref name="times"/> times
    /// (scale 1→2, fading), starting after <paramref name="delay"/>. The ring is removed when done.
    /// </summary>
    public static Storyboard? Pulse(Canvas layer, Point center, double size, Color color, TimeSpan delay, int times)
    {
        if (!Enabled || times <= 0) return null;
        var ring = new Border
        {
            Width = size,
            Height = size,
            BorderThickness = new Thickness(3),
            CornerRadius = new CornerRadius(7),
            BorderBrush = new SolidColorBrush(color),
            Opacity = 0,
            IsHitTestVisible = false
        };
        Canvas.SetLeft(ring, center.X - size / 2);
        Canvas.SetTop(ring, center.Y - size / 2);
        layer.Children.Add(ring);
        var (s, _, _) = Transforms(ring);
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        var sb = new Storyboard { BeginTime = delay, RepeatBehavior = new RepeatBehavior(times) };
        sb.Children.Add(Tween(ring, Part(ring, s, ScaleTransform.ScaleXProperty), 1, 2, TimeSpan.Zero, Ms(1400), ease));
        sb.Children.Add(Tween(ring, Part(ring, s, ScaleTransform.ScaleYProperty), 1, 2, TimeSpan.Zero, Ms(1400), ease));
        sb.Children.Add(Tween(ring, Own(UIElement.OpacityProperty), 0.9, 0, TimeSpan.Zero, Ms(1400), ease));
        sb.Completed += (_, _) => layer.Children.Remove(ring);
        return Begin(layer, sb);
    }

    /// <summary>A time block "loses a life": flashes white, pops up, then tumbles away and fades.</summary>
    public static Storyboard? LifeLost(Rectangle life, TimeSpan delay)
    {
        if (!Enabled)
        {
            life.Opacity = 0;
            return null;
        }

        var brush = new SolidColorBrush(HeadsUp);
        life.Fill = brush;
        var (s, r, t) = Transforms(life);
        var sb = new Storyboard();
        sb.Children.Add(Keys(life, Own(UIElement.OpacityProperty), delay, (0, 1), (450, 1), (700, 0)));
        sb.Children.Add(Keys(life, Part(life, s, ScaleTransform.ScaleXProperty), delay, (0, 1), (140, 1.4), (315, 1.15), (700, 0.2)));
        sb.Children.Add(Keys(life, Part(life, s, ScaleTransform.ScaleYProperty), delay, (0, 1), (140, 1.4), (315, 1.15), (700, 0.2)));
        sb.Children.Add(Keys(life, Part(life, t, TranslateTransform.YProperty), delay, (0, 0), (315, -3), (700, 14)));
        sb.Children.Add(Keys(life, Part(life, r, RotateTransform.AngleProperty), delay, (0, 0), (315, 0), (700, 35)));
        sb.Children.Add(ColorKeys(life, new PropertyPath("(0).(1)", Shape.FillProperty, SolidColorBrush.ColorProperty), delay, (0, HeadsUp), (140, Colors.White), (315, Colors.White), (700, HeadsUp)));
        return Begin(life, sb);
    }

    /// <summary>
    /// Starts a looping effect. A negative offset starts it part-way through.
    /// <paramref name="duration"/> sets the cycle length for <see cref="LoopKind.Drift"/>
    /// (default 16 s) and <see cref="LoopKind.Glint"/> (default 5.5 s).
    /// </summary>
    public static Storyboard? Loop(FrameworkElement el, LoopKind kind, TimeSpan? beginOffset = null, TimeSpan? duration = null)
    {
        if (!Enabled) return null;
        var sb = new Storyboard { RepeatBehavior = RepeatBehavior.Forever };
        // Calm loops look the same at 20 fps and cost far less over a long lock.
        Timeline.SetDesiredFrameRate(sb, 20);
        var z = TimeSpan.Zero;
        switch (kind)
        {
            case LoopKind.Twinkle:
            {
                var (s, _, _) = Transforms(el);
                sb.Children.Add(Keys(el, Own(UIElement.OpacityProperty), z, (0, 0.2), (1200, 1), (2400, 0.2)));
                sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleXProperty), z, (0, 1), (1200, 1.8), (2400, 1)));
                sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleYProperty), z, (0, 1), (1200, 1.8), (2400, 1)));
                break;
            }
            case LoopKind.Bob:
            {
                var (_, r, t) = Transforms(el);
                sb.Children.Add(Keys(el, Part(el, t, TranslateTransform.YProperty), z, (0, 0), (2000, -5), (4000, 0)));
                sb.Children.Add(Keys(el, Part(el, r, RotateTransform.AngleProperty), z, (0, 0), (2000, -4), (4000, 0)));
                break;
            }
            case LoopKind.Tick:
            {
                var (_, r, _) = Transforms(el);
                sb.Children.Add(Keys(el, Part(el, r, RotateTransform.AngleProperty), z, (0, 0), (100, -12), (200, 12), (300, 0), (1000, 0)));
                break;
            }
            case LoopKind.Glow:
            {
                if (el is not Border border) return null;
                var start = (border.BorderBrush as SolidColorBrush)?.Color ?? Color.FromArgb(153, HeadsUp.R, HeadsUp.G, HeadsUp.B);
                var brush = new SolidColorBrush(start);
                border.BorderBrush = brush;
                sb.Children.Add(ColorKeys(border, new PropertyPath("(0).(1)", Border.BorderBrushProperty, SolidColorBrush.ColorProperty), z, (0, start), (700, HeadsUp), (1400, start)));
                break;
            }
            case LoopKind.Hop:
            {
                var (_, _, t) = Transforms(el);
                sb.Children.Add(Keys(el, Part(el, t, TranslateTransform.YProperty), z, (0, 0), (240, -5), (600, 0)));
                break;
            }
            case LoopKind.Drift:
            {
                var (_, _, t) = Transforms(el);
                var width = (VisualTreeHelper.GetParent(el) as FrameworkElement)?.ActualWidth ?? 0;
                if (width <= 0) width = SystemParameters.PrimaryScreenWidth;
                var own = el.ActualWidth > 0 ? el.ActualWidth : (double.IsNaN(el.Width) ? 120 : el.Width);
                var drift = new DoubleAnimation(-own - 20, width + 20, new Duration(duration ?? Ms(16000)));
                Storyboard.SetTarget(drift, el);
                Storyboard.SetTargetProperty(drift, Part(el, t, TranslateTransform.XProperty));
                sb.Children.Add(drift);
                break;
            }
            case LoopKind.Breathe:
            {
                var (s, _, _) = Transforms(el);
                el.RenderTransformOrigin = new Point(0.5, 1);
                sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleYProperty), z, (0, 1), (1600, 1.05), (3200, 1)));
                break;
            }
            case LoopKind.Blink:
                sb.Children.Add(Steps(el, Own(UIElement.OpacityProperty), (0, 1), (800, 0.2), (1600, 0.2)));
                break;
            case LoopKind.Flicker:
                sb.Children.Add(Steps(el, Own(UIElement.OpacityProperty), (0, 1), (1880, 0.82), (1920, 1), (2920, 0.9), (2960, 1), (4000, 1)));
                break;
            case LoopKind.Pulse:
                sb.Children.Add(Keys(el, Own(UIElement.OpacityProperty), z, (0, 0.75), (1200, 1), (2400, 0.75)));
                break;
            case LoopKind.DriveLight:
                sb.Children.Add(Steps(el, Own(UIElement.OpacityProperty), (0, 0.2), (220, 1), (310, 0.2), (480, 1), (570, 0.2), (2200, 0.2)));
                break;
            case LoopKind.Glint:
            {
                var (s, _, _) = Transforms(el);
                var total = (duration ?? Ms(5500)).TotalMilliseconds;
                sb.Children.Add(Keys(el, Own(UIElement.OpacityProperty), z, (0, 0), (total * 0.78, 0), (total * 0.86, 1), (total * 0.94, 0.4), (total, 0)));
                sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleXProperty), z, (0, 0.2), (total * 0.78, 0.2), (total * 0.86, 1), (total * 0.94, 1.15), (total, 0.2)));
                sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleYProperty), z, (0, 0.2), (total * 0.78, 0.2), (total * 0.86, 1), (total * 0.94, 1.15), (total, 0.2)));
                break;
            }
        }

        var offset = beginOffset ?? TimeSpan.Zero;
        if (offset > TimeSpan.Zero) sb.BeginTime = offset;
        Begin(el, sb);
        if (offset < TimeSpan.Zero) sb.Seek(el, offset.Negate(), TimeSeekOrigin.BeginTime);
        return sb;
    }

    /// <summary>
    /// A floating "Z": every <paramref name="cycle"/> it fades in, drifts by
    /// <paramref name="travel"/> while growing, and fades out. Starts after <paramref name="offset"/>.
    /// </summary>
    public static Storyboard? FloatUp(FrameworkElement el, Vector travel, TimeSpan cycle, TimeSpan offset)
    {
        if (!Enabled) return null;
        var (s, _, t) = Transforms(el);
        var total = cycle.TotalMilliseconds;
        var sb = new Storyboard { RepeatBehavior = RepeatBehavior.Forever, BeginTime = offset };
        Timeline.SetDesiredFrameRate(sb, 20);
        var z = TimeSpan.Zero;
        sb.Children.Add(Keys(el, Own(UIElement.OpacityProperty), z, (0, 0), (total * 0.2, 1), (total, 0)));
        sb.Children.Add(Keys(el, Part(el, t, TranslateTransform.XProperty), z, (0, 0), (total, travel.X)));
        sb.Children.Add(Keys(el, Part(el, t, TranslateTransform.YProperty), z, (0, 0), (total, travel.Y)));
        sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleXProperty), z, (0, 0.6), (total, 1.2)));
        sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleYProperty), z, (0, 0.6), (total, 1.2)));
        return Begin(el, sb);
    }

    /// <summary>Moves <paramref name="el"/> down from <paramref name="fromY"/> to <paramref name="toY"/> again and again (a CRT's rolling band).</summary>
    public static Storyboard? Roll(FrameworkElement el, double fromY, double toY, TimeSpan cycle)
    {
        if (!Enabled) return null;
        var (_, _, t) = Transforms(el);
        var sb = new Storyboard { RepeatBehavior = RepeatBehavior.Forever };
        Timeline.SetDesiredFrameRate(sb, 20);
        var roll = new DoubleAnimation(fromY, toY, new Duration(cycle));
        Storyboard.SetTarget(roll, el);
        Storyboard.SetTargetProperty(roll, Part(el, t, TranslateTransform.YProperty));
        sb.Children.Add(roll);
        return Begin(el, sb);
    }

    /// <summary>
    /// A shooting star: every <paramref name="every"/>, <paramref name="trail"/> fades in,
    /// streaks by <paramref name="travel"/> in about 15% of the cycle, and fades out.
    /// Hidden (nothing runs) when animations are off.
    /// </summary>
    public static Storyboard? ShootingStar(FrameworkElement trail, Vector travel, TimeSpan every, TimeSpan offset)
    {
        if (!Enabled) return null;
        var (_, _, t) = Transforms(trail);
        var total = every.TotalMilliseconds;
        var streak = total * 0.15;
        var sb = new Storyboard { RepeatBehavior = RepeatBehavior.Forever, BeginTime = offset };
        // A fast streak needs a few more frames than the calm loops.
        Timeline.SetDesiredFrameRate(sb, 30);
        var ease = new QuadraticEase { EasingMode = EasingMode.EaseIn };
        sb.Children.Add(Keys(trail, Own(UIElement.OpacityProperty), TimeSpan.Zero, (0, 0), (total * 0.03, 1), (streak, 0), (total, 0)));
        var x = new DoubleAnimationUsingKeyFrames();
        x.KeyFrames.Add(new DiscreteDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        x.KeyFrames.Add(new EasingDoubleKeyFrame(travel.X, KeyTime.FromTimeSpan(Ms(streak)), ease));
        x.KeyFrames.Add(new DiscreteDoubleKeyFrame(travel.X, KeyTime.FromTimeSpan(every)));
        Storyboard.SetTarget(x, trail);
        Storyboard.SetTargetProperty(x, Part(trail, t, TranslateTransform.XProperty));
        var y = new DoubleAnimationUsingKeyFrames();
        y.KeyFrames.Add(new DiscreteDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        y.KeyFrames.Add(new EasingDoubleKeyFrame(travel.Y, KeyTime.FromTimeSpan(Ms(streak)), ease));
        y.KeyFrames.Add(new DiscreteDoubleKeyFrame(travel.Y, KeyTime.FromTimeSpan(every)));
        Storyboard.SetTarget(y, trail);
        Storyboard.SetTargetProperty(y, Part(trail, t, TranslateTransform.YProperty));
        sb.Children.Add(x);
        sb.Children.Add(y);
        return Begin(trail, sb);
    }

    /// <summary>
    /// Fills a stretched <paramref name="bar"/> from its left edge to full width linearly
    /// (so it follows the bar if it is resized), then calls <paramref name="onCompleted"/>.
    /// Returns null (does nothing) when off.
    /// </summary>
    public static Storyboard? Fill(FrameworkElement bar, TimeSpan duration, Action onCompleted)
    {
        if (!Enabled) return null;
        var scale = new ScaleTransform(0, 1);
        bar.RenderTransform = scale;
        bar.RenderTransformOrigin = new Point(0, 0.5);
        var anim = new DoubleAnimation(0, 1, new Duration(duration));
        Storyboard.SetTarget(anim, bar);
        Storyboard.SetTargetProperty(anim, new PropertyPath("(0).(1)", UIElement.RenderTransformProperty, ScaleTransform.ScaleXProperty));
        var sb = new Storyboard();
        sb.Children.Add(anim);
        sb.Completed += (_, _) => onCompleted();
        return Begin(bar, sb);
    }

    /// <summary>Stops every animation started under <paramref name="owner"/>'s window.</summary>
    public static void StopAll(FrameworkElement owner)
    {
        List<(Storyboard Sb, FrameworkElement On)>? list = null;
        lock (Gate)
        {
            var key = (DependencyObject?)Window.GetWindow(owner) ?? owner;
            if (Running.TryGetValue(key, out var found))
            {
                list = found.ToList();
                Running.Remove(key);
            }
        }

        if (list == null) return;
        foreach (var (sb, on) in list)
        {
            Halt(sb, on);
        }
    }

    /// <summary>Stops and removes <paramref name="sb"/>, and drops any clock it left on an element's own property.</summary>
    private static void Halt(Storyboard sb, FrameworkElement on)
    {
        sb.Stop(on);
        sb.Remove(on);
        foreach (var child in sb.Children)
        {
            if (Storyboard.GetTarget(child) is UIElement target
                && Storyboard.GetTargetProperty(child) is { PathParameters.Count: 1 } path
                && path.PathParameters[0] is DependencyProperty dp)
            {
                target.BeginAnimation(dp, null);
            }
        }
    }

    private static Storyboard Begin(FrameworkElement on, Storyboard sb)
    {
        var key = (DependencyObject?)Window.GetWindow(on) ?? on;
        lock (Gate)
        {
            Running.GetOrCreateValue(key).Add((sb, on));
            BeganOn.AddOrUpdate(sb, on);
        }

        if (sb.RepeatBehavior != RepeatBehavior.Forever)
        {
            sb.Completed += (_, _) =>
            {
                lock (Gate)
                {
                    if (Running.TryGetValue(key, out var list)) list.RemoveAll(e => ReferenceEquals(e.Sb, sb));
                }
            };
        }

        sb.Begin(on, true);
        return sb;
    }

    /// <summary>Scale, rotate and translate parts appended to the element's render transform.</summary>
    private static (ScaleTransform S, RotateTransform R, TranslateTransform T) Transforms(UIElement el)
    {
        if (el.RenderTransform is TransformGroup { IsFrozen: false } g
            && g.Children.Count >= 3
            && g.Children[^3] is ScaleTransform s0
            && g.Children[^2] is RotateTransform r0
            && g.Children[^1] is TranslateTransform t0)
        {
            return (s0, r0, t0);
        }

        var group = new TransformGroup();
        if (el.RenderTransform is { } existing && !ReferenceEquals(existing, Transform.Identity))
        {
            group.Children.Add(existing);
        }

        var s = new ScaleTransform();
        var r = new RotateTransform();
        var t = new TranslateTransform();
        group.Children.Add(s);
        group.Children.Add(r);
        group.Children.Add(t);
        el.RenderTransform = group;
        el.RenderTransformOrigin = new Point(0.5, 0.5);
        return (s, r, t);
    }

    /// <summary>Holds <paramref name="from"/> until <paramref name="delay"/>, then eases to <paramref name="to"/>.</summary>
    private static DoubleAnimationUsingKeyFrames Tween(DependencyObject target, PropertyPath path, double from, double to, TimeSpan delay, TimeSpan duration, IEasingFunction ease)
    {
        var anim = new DoubleAnimationUsingKeyFrames();
        anim.KeyFrames.Add(new DiscreteDoubleKeyFrame(from, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        if (delay > TimeSpan.Zero) anim.KeyFrames.Add(new DiscreteDoubleKeyFrame(from, KeyTime.FromTimeSpan(delay)));
        anim.KeyFrames.Add(new EasingDoubleKeyFrame(to, KeyTime.FromTimeSpan(delay + duration), ease));
        Storyboard.SetTarget(anim, target);
        Storyboard.SetTargetProperty(anim, path);
        return anim;
    }

    /// <summary>Key frames at (milliseconds after <paramref name="delay"/>, value), smoothly eased; holds the first value until then.</summary>
    private static DoubleAnimationUsingKeyFrames Keys(DependencyObject target, PropertyPath path, TimeSpan delay, params (double Ms, double Value)[] points)
    {
        var anim = new DoubleAnimationUsingKeyFrames();
        anim.KeyFrames.Add(new DiscreteDoubleKeyFrame(points[0].Value, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        foreach (var (ms, value) in points)
        {
            var at = delay + Ms(ms);
            if (at == TimeSpan.Zero) continue;
            anim.KeyFrames.Add(new EasingDoubleKeyFrame(value, KeyTime.FromTimeSpan(at), new SineEase { EasingMode = EasingMode.EaseInOut }));
        }

        Storyboard.SetTarget(anim, target);
        Storyboard.SetTargetProperty(anim, path);
        return anim;
    }

    /// <summary>Hold-then-jump key frames (on/off lights, flicker) at milliseconds from the start.</summary>
    private static DoubleAnimationUsingKeyFrames Steps(DependencyObject target, PropertyPath path, params (double Ms, double Value)[] points)
    {
        var anim = new DoubleAnimationUsingKeyFrames();
        foreach (var (ms, value) in points)
        {
            anim.KeyFrames.Add(new DiscreteDoubleKeyFrame(value, KeyTime.FromTimeSpan(Ms(ms))));
        }

        Storyboard.SetTarget(anim, target);
        Storyboard.SetTargetProperty(anim, path);
        return anim;
    }

    private static ColorAnimationUsingKeyFrames ColorKeys(DependencyObject target, PropertyPath path, TimeSpan delay, params (double Ms, Color Value)[] points)
    {
        var anim = new ColorAnimationUsingKeyFrames();
        anim.KeyFrames.Add(new DiscreteColorKeyFrame(points[0].Value, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        foreach (var (ms, value) in points)
        {
            var at = delay + Ms(ms);
            if (at == TimeSpan.Zero) continue;
            anim.KeyFrames.Add(new LinearColorKeyFrame(value, KeyTime.FromTimeSpan(at)));
        }

        Storyboard.SetTarget(anim, target);
        Storyboard.SetTargetProperty(anim, path);
        return anim;
    }

    private static TimeSpan Ms(double ms) => TimeSpan.FromMilliseconds(ms);

    /// <summary>Path from <paramref name="el"/> to <paramref name="property"/> on one part of its render-transform group.</summary>
    private static PropertyPath Part(UIElement el, Transform part, DependencyProperty property)
    {
        var index = ((TransformGroup)el.RenderTransform).Children.IndexOf(part);
        return new PropertyPath($"(0).(1)[{index}].(2)", UIElement.RenderTransformProperty, TransformGroup.ChildrenProperty, property);
    }

    private static PropertyPath Own(DependencyProperty property) => new(property);
}
