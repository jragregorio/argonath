using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
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
    Drift
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

    /// <summary>Test hook: behave as if Windows animations were off.</summary>
    internal static bool ForceDisabled { get; set; }

    /// <summary>False when Windows' "Animation effects" setting is off.</summary>
    public static bool Enabled => !ForceDisabled && SystemParameters.ClientAreaAnimation;

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

            sb.Stop(on);
            sb.Remove(on);

            // Belt and braces: drop any clock still holding a property the storyboard animated on the element itself.
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

    /// <summary>Starts a looping effect. A negative offset starts it part-way through.</summary>
    public static Storyboard? Loop(FrameworkElement el, LoopKind kind, TimeSpan? beginOffset = null)
    {
        if (!Enabled) return null;
        var sb = new Storyboard { RepeatBehavior = RepeatBehavior.Forever };
        var z = TimeSpan.Zero;
        switch (kind)
        {
            case LoopKind.Twinkle:
            {
                var (s, _, _) = Transforms(el);
                sb.Children.Add(Keys(el, Own(UIElement.OpacityProperty), z, (0, 0.3), (1200, 1), (2400, 0.3)));
                sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleXProperty), z, (0, 1), (1200, 1.6), (2400, 1)));
                sb.Children.Add(Keys(el, Part(el, s, ScaleTransform.ScaleYProperty), z, (0, 1), (1200, 1.6), (2400, 1)));
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
                var drift = new DoubleAnimation(-120, width + 120, new Duration(Ms(16000)));
                Storyboard.SetTarget(drift, el);
                Storyboard.SetTargetProperty(drift, Part(el, t, TranslateTransform.XProperty));
                sb.Children.Add(drift);
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
            sb.Stop(on);
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
