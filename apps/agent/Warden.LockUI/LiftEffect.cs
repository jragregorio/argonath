using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;

namespace Warden.LockUI;

/// <summary>Where a lifted button should be: vertical offset (px), shadow and highlight (0..1).</summary>
public readonly record struct LiftTarget(double OffsetY, double ShadowOpacity, double Highlight);

/// <summary>
/// "Lift" hover effect: a button floats up a touch with a soft shadow on hover
/// and sinks slightly when pressed. Shared by the tray, popups and lock screen.
/// </summary>
public static class LiftEffect
{
    /// <summary>Name of the optional highlight overlay inside a button template.</summary>
    public const string HighlightPartName = "LiftHighlight";

    /// <summary>Faint white wash laid over a hovered button (about 6%).</summary>
    public static readonly Brush HighlightBrush = Frozen(new SolidColorBrush(Color.FromArgb(0x10, 0xff, 0xff, 0xff)));

    private static readonly TimeSpan HoverDuration = TimeSpan.FromMilliseconds(140);
    private static readonly TimeSpan PressDuration = TimeSpan.FromMilliseconds(80);
    private static readonly ConditionalWeakTable<ButtonBase, object> Attached = new();

    public static LiftTarget TargetFor(bool enabled, bool over, bool pressed, double lift)
    {
        if (!enabled || !over) return new LiftTarget(0, 0, 0);
        return pressed ? new LiftTarget(1, 0, 1) : new LiftTarget(-lift, 1, 1);
    }

    /// <summary>
    /// Adds the lift effect to <paramref name="button"/>. Pass <paramref name="shadowColor"/> = null
    /// for a shadowless lift (text links). Calling it again on the same button does nothing.
    /// </summary>
    public static void Attach(ButtonBase button, Color? shadowColor, double lift = 2, double shadowStrength = 0.55)
    {
        if (Attached.TryGetValue(button, out _)) return;
        Attached.Add(button, new object());

        var move = new TranslateTransform();
        button.RenderTransform = move;

        DropShadowEffect? shadow = null;
        if (shadowColor is { } c)
        {
            shadow = new DropShadowEffect
            {
                Color = c,
                BlurRadius = 18,
                ShadowDepth = 6,
                Direction = 270,
                Opacity = 0
            };
            button.Effect = shadow;
        }

        var over = false;
        var pressed = false;

        void Update()
        {
            var t = TargetFor(button.IsEnabled, over, pressed, lift);
            var duration = pressed && over ? PressDuration : HoverDuration;
            Animate(move, TranslateTransform.YProperty, t.OffsetY, duration);
            shadow?.BeginAnimation(DropShadowEffect.OpacityProperty, Anim(t.ShadowOpacity * shadowStrength, duration));
            if (button.Template?.FindName(HighlightPartName, button) is UIElement highlight)
            {
                highlight.BeginAnimation(UIElement.OpacityProperty, Anim(t.Highlight, duration));
            }
        }

        button.MouseEnter += (_, _) => { over = true; Update(); };
        button.MouseLeave += (_, _) => { over = false; Update(); };
        button.PreviewMouseLeftButtonDown += (_, _) => { pressed = true; Update(); };
        button.PreviewMouseLeftButtonUp += (_, _) => { pressed = false; Update(); };
        button.LostMouseCapture += (_, _) => { if (pressed && Mouse.LeftButton != MouseButtonState.Pressed) { pressed = false; Update(); } };
        button.IsEnabledChanged += (_, _) => { if (!button.IsEnabled) { over = false; pressed = false; } Update(); };
    }

    /// <summary>
    /// Template part for a button template: a hit-test-invisible grid holding the highlight
    /// wash with <paramref name="content"/> on top. Use it as the template border's child.
    /// </summary>
    public static FrameworkElementFactory WrapWithHighlight(FrameworkElementFactory content, double radius)
    {
        var grid = new FrameworkElementFactory(typeof(System.Windows.Controls.Grid));
        var highlight = new FrameworkElementFactory(typeof(System.Windows.Controls.Border), HighlightPartName);
        highlight.SetValue(System.Windows.Controls.Border.CornerRadiusProperty, new CornerRadius(Math.Max(0, radius - 1)));
        highlight.SetValue(System.Windows.Controls.Border.BackgroundProperty, HighlightBrush);
        highlight.SetValue(UIElement.OpacityProperty, 0.0);
        highlight.SetValue(UIElement.IsHitTestVisibleProperty, false);
        grid.AppendChild(highlight);
        grid.AppendChild(content);
        return grid;
    }

    private static void Animate(Animatable target, DependencyProperty property, double to, TimeSpan duration) =>
        target.BeginAnimation(property, Anim(to, duration));

    private static DoubleAnimation Anim(double to, TimeSpan duration) =>
        new(to, new Duration(duration)) { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };

    private static Brush Frozen(Brush b)
    {
        b.Freeze();
        return b;
    }
}
