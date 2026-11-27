using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using Warden.Core.Diagnostics;
using Warden.Core.Models;
using Warden.Core.Services;
using Warden.Core.Theming;

namespace Warden.LockUI;

public readonly record struct MonitorBounds(
    int Left,
    int Top,
    int Width,
    int Height,
    bool IsPrimary);

/// <summary>How the lock screen should look: the colour chosen in the tray app and the child's name.</summary>
public sealed record LockAppearance(string? AccentHex, string? ChildName)
{
    public static LockAppearance Default { get; } = new(AccentPalette.DefaultHex, null);
}

/// <summary>Full-screen "night sky" lock overlay, tinted with the child's chosen colour.</summary>
public class LockWindow : Window
{
    private static readonly SolidColorBrush TextBrush = Freeze(Rgb(AccentPalette.Text));
    private static readonly SolidColorBrush MutedBrush = Freeze(Rgb(AccentPalette.MutedText));
    private static readonly SolidColorBrush OnAccentBrush = Freeze(Rgb(AccentPalette.OnAccent));
    private static readonly SolidColorBrush DangerBrush = Freeze(Color.FromRgb(0xb5, 0x4a, 0x3f));
    private static readonly SolidColorBrush DangerTextBrush = Freeze(Color.FromRgb(0xff, 0x8a, 0x7a));
    private static readonly SolidColorBrush MoonBrush = Freeze(Color.FromRgb(0xf2, 0xd2, 0x7a));
    private static readonly SolidColorBrush FaintBrush = Freeze(Color.FromRgb(0x8f, 0x9b, 0x97));

    // Windows 11 UI font; falls back to Segoe UI on Windows 10.
    private static readonly FontFamily BodyFont = new("Segoe UI");
    private static readonly FontFamily DisplayFont = new("Segoe UI");


    private readonly SolidColorBrush _accentBrush;
    private readonly SolidColorBrush _softBrush;
    private readonly SolidColorBrush _cardBrush;
    private readonly SolidColorBrush _borderBrush;
    private readonly SolidColorBrush _nightBrush;
    private readonly string? _childName;

    private readonly TextBlock? _titleText;
    private readonly TextBlock? _statusText;
    private readonly TextBlock? _timeText;
    private readonly TextBlock? _pinStatusText;
    private readonly bool _isPrimary;

    /// <summary>Elements whose looping animation starts once the window is loaded.</summary>
    private readonly List<(FrameworkElement Element, LoopKind Kind, TimeSpan Offset, TimeSpan? Duration)> _loops = new();
    private (FrameworkElement Trail, Vector Travel)? _shootingStar;
    private readonly List<Action> _sceneStarters = new();
    private readonly AccentPalette _palette;
    private FrameworkElement? _nightSky;
    private FrameworkElement? _moon;
    private FrameworkElement? _pausedBackdrop;
    private FrameworkElement? _deskScene;
    private TextBlock? _secondaryTitle;

    private FrameworkElement? _content;
    private readonly bool _preview;

    /// <summary>
    /// Test-only preview: no focus stealing, not topmost, closable without the lock manager.
    /// Never set by the app (internal, visible to Warden.Tests only).
    /// </summary>
    internal bool Preview
    {
        get => _preview;
        init
        {
            _preview = value;
            if (value)
            {
                Topmost = false;
                ShowActivated = false;
            }
        }
    }

    public LockWindow(
        MonitorBounds bounds,
        Func<int, Task<bool>> onExtensionRequest,
        Func<Task<(bool ok, string? error)>> onShutdownPc,
        Func<string, Task<(bool ok, string? error)>> onParentShutdown,
        LockAppearance? appearance = null)
    {
        _isPrimary = bounds.IsPrimary;
        appearance ??= LockAppearance.Default;
        _childName = appearance.ChildName;

        var palette = AccentPalette.FromHex(appearance.AccentHex);
        _palette = palette;
        _accentBrush = Freeze(Rgb(palette.Accent));
        _softBrush = Freeze(Rgb(palette.Soft));
        _cardBrush = Freeze(Rgb(palette.Card));
        _borderBrush = Freeze(Rgb(palette.Border));
        _nightBrush = Freeze(Rgb(palette.Night));

        Title = "Warden";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        WindowState = WindowState.Normal;
        Topmost = true;
        ShowInTaskbar = false;
        Background = SkyBrush(palette);
        FontFamily = BodyFont;
        Left = bounds.Left;
        Top = bounds.Top;
        Width = bounds.Width;
        Height = bounds.Height;

        // Best-effort: stop Alt+F4 / system keys that reach WPF before the LL hook.
        PreviewKeyDown += OnPreviewKeyDown;
        Closing += (_, e) =>
        {
            // Only allow programmatic close via LockWindowManager.Hide.
            if (!LockWindowManager.AllowClose && !_preview)
            {
                e.Cancel = true;
            }
        };
        Deactivated += (_, _) =>
        {
            if (_preview) return;
            try
            {
                Topmost = true;
                Activate();
            }
            catch (Exception ex)
            {
                // Ignore if the window is tearing down.
                WardenLog.Debug("LockUI", "Re-activate after Deactivated failed", ex);
            }
        };

        var layers = new Grid();
        System.Windows.Documents.TextElement.SetFontFamily(layers, BodyFont);
        _nightSky = (FrameworkElement)BuildStars(bounds.Width, bounds.Height, palette);
        _nightSky.Tag = "night-sky";
        layers.Children.Add(_nightSky);
        _pausedBackdrop = BuildPausedBackdrop(bounds.Width, bounds.Height);
        layers.Children.Add(_pausedBackdrop);
        Loaded += (_, _) => BlockyMotion.Guard(StartSkyMotion, "LockUI");
        Closed += (_, _) => BlockyMotion.Guard(() => BlockyMotion.StopAll(this), "LockUI");

        if (!bounds.IsPrimary)
        {
            _content = (FrameworkElement)BuildSecondaryContent();
            layers.Children.Add(_content);
            Content = layers;
            return;
        }

        var copy = LockCopy.For(null, _childName);
        var mainPanel = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            MaxWidth = 560
        };

        mainPanel.Tag = "lock-content";
        _content = mainPanel;
        mainPanel.Children.Add(CreateMoon(84, bottomMargin: 18));
        mainPanel.Children.Add(BuildDeskScene(6.5, bottomMargin: 14));

        _titleText = new TextBlock
        {
            FontFamily = DisplayFont,
            Text = copy.Title,
            FontSize = 36,
            FontWeight = FontWeights.Bold,
            Foreground = TextBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 12)
        };
        mainPanel.Children.Add(_titleText);

        _statusText = new TextBlock
        {
            Text = copy.Body,
            FontSize = 18,
            FontWeight = FontWeights.SemiBold,
            Foreground = MoonBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 6)
        };
        mainPanel.Children.Add(_statusText);

        _timeText = new TextBlock
        {
            Text = copy.Detail,
            FontSize = 14,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 4)
        };
        mainPanel.Children.Add(_timeText);

        mainPanel.Children.Add(new TextBlock
        {
            Text = LockCopy.Tagline,
            FontSize = 14,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 26)
        });

        var requestNote = new TextBlock
        {
            Text = "We'll unlock right away if your parent says yes.",
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Foreground = _softBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 14, 0, 0),
            Visibility = Visibility.Collapsed
        };

        var actionRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        actionRow.Children.Add(CreateExtensionButton(15, onExtensionRequest, requestNote));
        actionRow.Children.Add(CreateShutdownPcButton(onShutdownPc));
        mainPanel.Children.Add(actionRow);
        mainPanel.Children.Add(requestNote);

        layers.Children.Add(mainPanel);

        // Parents corner: small link that reveals the PIN box (bottom-right).
        var corner = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 24, 20)
        };

        var pinPanel = new StackPanel { Width = 260 };
        var pinCard = new Border
        {
            Background = _cardBrush,
            BorderBrush = _borderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(16),
            Padding = new Thickness(14),
            Margin = new Thickness(0, 0, 0, 8),
            Visibility = Visibility.Collapsed,
            Child = pinPanel
        };

        pinPanel.Children.Add(new TextBlock
        {
            Text = "Parent PIN",
            FontSize = 13,
            Foreground = MutedBrush,
            Margin = new Thickness(0, 0, 0, 6)
        });

        var pinBox = new PasswordBox
        {
            Height = 40,
            FontSize = 18,
            Padding = new Thickness(10, 6, 10, 6),
            Margin = new Thickness(0, 0, 0, 10),
            Background = _nightBrush,
            Foreground = TextBrush,
            BorderBrush = _borderBrush,
            BorderThickness = new Thickness(1),
            CaretBrush = TextBrush
        };
        pinPanel.Children.Add(pinBox);

        var shutdownButton = CreateShutdownButton(pinBox, onParentShutdown);
        pinPanel.Children.Add(shutdownButton);

        _pinStatusText = new TextBlock
        {
            FontSize = 13,
            Foreground = MutedBrush,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 8, 0, 0)
        };
        pinPanel.Children.Add(_pinStatusText);
        corner.Children.Add(pinCard);

        var parentsLink = new Button
        {
            Content = IconLabel("", "Parents", FaintBrush, 13),
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            Padding = new Thickness(10, 6, 10, 6),
            HorizontalAlignment = HorizontalAlignment.Right,
            Cursor = Cursors.Hand,
            Template = CreateRoundedButtonTemplate(10)
        };
        parentsLink.Click += (_, _) =>
        {
            var show = pinCard.Visibility != Visibility.Visible;
            pinCard.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
            if (show) pinBox.Focus();
        };
        LiftEffect.Attach(parentsLink, shadowColor: null, lift: 1);
        corner.Children.Add(parentsLink);
        layers.Children.Add(corner);

        Content = layers;
    }

    private static Color Rgb(Rgb c) => Color.FromRgb(c.R, c.G, c.B);

    private static SolidColorBrush Freeze(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }

    private static Brush SkyBrush(AccentPalette palette)
    {
        var sky = new RadialGradientBrush
        {
            Center = new Point(0.5, 0.3),
            GradientOrigin = new Point(0.5, 0.3),
            RadiusX = 0.75,
            RadiusY = 0.9,
            GradientStops =
            {
                new GradientStop(Rgb(palette.Glow), 0),
                new GradientStop(Rgb(palette.Night), 0.75)
            }
        };
        sky.Freeze();
        return sky;
    }

    /// <summary>Pixel cloud silhouettes ('#' = block), drawn at different sizes for depth.</summary>
    private static readonly string[] PuffCloud =
    [
        "......####......",
        "...#########....",
        "..###########.##",
        ".###############",
        "################",
        ".##############."
    ];

    private static readonly string[] WispCloud =
    [
        "....######.......",
        ".##############..",
        "#################",
        "..############..."
    ];

    /// <summary>Clouds across the middle of the sky: shape, block size (per 500 px of height), top, opacity, drift time, start offset.</summary>
    private static readonly (string[] Shape, double Cell, double Top, double Opacity, double Seconds, double Offset)[] Clouds =
    [
        (PuffCloud, 5, 0.30, 0.16, 70, -10),
        (WispCloud, 7, 0.60, 0.22, 48, -30),
        (PuffCloud, 9, 0.41, 0.28, 36, -5)
    ];

    private const int StarCount = 34;
    private const int GlintCount = 6;

    /// <summary>
    /// Night sky layer: pixel clouds drifting across the middle at different depths,
    /// 34 twinkling square stars (6 with a "+" glint), and a shooting star.
    /// Positions are fixed (seeded) so every lock looks the same.
    /// </summary>
    private UIElement BuildStars(double width, double height, AccentPalette palette)
    {
        var canvas = new Canvas { IsHitTestVisible = false };
        var starBrush = Freeze(Rgb(palette.Star));
        var k = Math.Max(1, height / 800.0);
        var unit = height / 500.0;

        var cloudTop = Freeze(Rgb(palette.Star));
        var cloudBody = Freeze(Mix(palette.Night, palette.Star, 0.62));
        foreach (var (shape, cellUnits, top, opacity, seconds, offset) in Clouds)
        {
            var cloud = BuildCloud(shape, cellUnits * unit, cloudTop, cloudBody);
            cloud.Opacity = opacity;
            Canvas.SetLeft(cloud, 0);
            Canvas.SetTop(cloud, top * height);
            canvas.Children.Add(cloud);
            _loops.Add((cloud, LoopKind.Drift, TimeSpan.FromSeconds(offset), TimeSpan.FromSeconds(seconds)));
        }

        var glintBrush = Freeze(Colors.White);
        var seed = 11L;
        double Next()
        {
            seed = seed * 16807 % 2147483647;
            return (seed - 1) / 2147483646.0;
        }

        var placed = 0;
        while (placed < StarCount)
        {
            var fx = 0.0125 + Next() * 0.975;
            var fy = 0.02 + Next() * 0.94;
            if (fx > 0.375 && fx < 0.625 && fy > 0.28 && fy < 0.76) continue; // keep clear of the text
            var size = (Next() < 0.25 ? 4 : (Next() < 0.5 ? 3 : 2)) * k;
            var star = new Rectangle { Width = size, Height = size, Fill = starBrush, Opacity = 0.7, Tag = "star", SnapsToDevicePixels = true };
            Canvas.SetLeft(star, fx * width);
            Canvas.SetTop(star, fy * height);
            canvas.Children.Add(star);
            _loops.Add((star, LoopKind.Twinkle, TimeSpan.FromSeconds(-(Next() * 2.4)), null));

            if (placed < GlintCount)
            {
                var glint = BuildGlint(k, glintBrush);
                Canvas.SetLeft(glint, fx * width + size / 2 - glint.Width / 2);
                Canvas.SetTop(glint, fy * height + size / 2 - glint.Height / 2);
                canvas.Children.Add(glint);
                _loops.Add((glint, LoopKind.Glint, TimeSpan.FromSeconds(-(Next() * 5)), TimeSpan.FromSeconds(4.5 + Next() * 3)));
            }

            placed++;
        }

        var trail = new Canvas { Width = 70 * k, Height = 40 * k, Opacity = 0, Tag = "shooting-star", IsHitTestVisible = false };
        for (var j = 0; j < 7; j++)
        {
            var sz = Math.Max(2, 6 - j) * k;
            var dot = new Rectangle { Width = sz, Height = sz, Fill = glintBrush, Opacity = 1 - j / 8.0, SnapsToDevicePixels = true };
            Canvas.SetLeft(dot, (60 - j * 9) * k);
            Canvas.SetTop(dot, (24 - j * 4) * k);
            trail.Children.Add(dot);
        }

        Canvas.SetLeft(trail, 0.04 * width);
        Canvas.SetTop(trail, 0.06 * height);
        canvas.Children.Add(trail);
        _shootingStar = (trail, new Vector(330 * unit, 140 * unit));

        return canvas;
    }

    private static Canvas BuildCloud(string[] shape, double cell, Brush top, Brush body)
    {
        var cols = shape.Max(r => r.Length);
        var cloud = new Canvas { Width = cols * cell, Height = shape.Length * cell, Tag = "cloud", SnapsToDevicePixels = true };
        for (var y = 0; y < shape.Length; y++)
        {
            for (var x = 0; x < shape[y].Length; x++)
            {
                if (shape[y][x] != '#') continue;
                var isTop = y == 0 || x >= shape[y - 1].Length || shape[y - 1][x] != '#';
                var block = new Rectangle { Width = cell, Height = cell, Fill = isTop ? top : body };
                Canvas.SetLeft(block, x * cell);
                Canvas.SetTop(block, y * cell);
                cloud.Children.Add(block);
            }
        }

        return cloud;
    }

    /// <summary>A small white "+" that flashes over a star now and then (hidden until animated).</summary>
    private static Canvas BuildGlint(double k, Brush brush)
    {
        var arm = 18 * k;
        var thick = 2 * k;
        var glint = new Canvas { Width = arm, Height = arm, Opacity = 0, Tag = "glint", IsHitTestVisible = false };
        void Add(double x, double y, double w, double h)
        {
            var r = new Rectangle { Width = w, Height = h, Fill = brush };
            Canvas.SetLeft(r, x);
            Canvas.SetTop(r, y);
            glint.Children.Add(r);
        }

        Add(arm / 2 - thick / 2, 0, thick, arm);
        Add(0, arm / 2 - thick / 2, arm, thick);
        Add(arm / 2 - thick, arm / 2 - thick, thick * 2, thick * 2);
        return glint;
    }

    private static Color Mix(Rgb a, Rgb b, double t) =>
        Color.FromRgb(
            (byte)Math.Round(a.R + (b.R - a.R) * t),
            (byte)Math.Round(a.G + (b.G - a.G) * t),
            (byte)Math.Round(a.B + (b.B - a.B) * t));

    /// <summary>
    /// Parent lock-down scene: the sleeping pixel buddy dozing beside a retro gaming desk
    /// (CRT monitor showing a paused game, tower PC, keyboard, mouse, controller).
    /// Drawn in units of <paramref name="u"/> px on a 78x40 grid, in the child's colours.
    /// Hidden until <see cref="SetScene"/> shows it; its motion starts with the rest of the sky.
    /// </summary>
    private UIElement BuildDeskScene(double u, double bottomMargin)
    {
        var p = _palette;
        var accent = Freeze(Rgb(p.Accent));
        var soft = Freeze(Rgb(p.Soft));
        var deep = Freeze(Mix(p.Night, p.Accent, 0.55));
        var cheek = Freeze(Mix(p.Accent, p.Star, 0.3));
        var caseMid = Freeze(Rgb(p.Track));
        var caseLight = Freeze(Mix(p.Track, p.Star, 0.15));
        var caseDark = Freeze(Rgb(p.Card));
        var screenBack = Freeze(Rgb(p.Night));
        var ink = Freeze(Color.FromRgb(0x10, 0x14, 0x1a));
        var white = Freeze(Colors.White);
        var black = Freeze(Colors.Black);
        var amber = Freeze(Color.FromRgb(0xf2, 0xc1, 0x4e));
        var coral = Freeze(Color.FromRgb(0xff, 0x7f, 0x6e));
        var sky = Freeze(Color.FromRgb(0x71, 0xb8, 0xe3));
        var wood = Freeze(Color.FromRgb(0x53, 0x42, 0x32));
        var woodLight = Freeze(Color.FromRgb(0x6c, 0x57, 0x41));
        var woodDark = Freeze(Color.FromRgb(0x36, 0x2b, 0x21));
        var animate = BlockyMotion.Enabled;

        var scene = new Canvas
        {
            Width = 78 * u,
            Height = 40 * u,
            Tag = "paused-scene",
            Visibility = Visibility.Collapsed,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, bottomMargin),
            SnapsToDevicePixels = true,
            IsHitTestVisible = false
        };

        Rectangle R(Panel parent, double x, double y, double w, double h, Brush fill, double opacity = 1)
        {
            var r = new Rectangle { Width = w * u, Height = h * u, Fill = fill, Opacity = opacity };
            Canvas.SetLeft(r, x * u);
            Canvas.SetTop(r, y * u);
            parent.Children.Add(r);
            return r;
        }

        Canvas Group(Panel parent, string? tag, double x, double y, double w, double h, bool clip = false)
        {
            var c = new Canvas { Width = w * u, Height = h * u, Tag = tag, ClipToBounds = clip };
            Canvas.SetLeft(c, x * u);
            Canvas.SetTop(c, y * u);
            parent.Children.Add(c);
            return c;
        }

        // Desk
        var desk = Group(scene, "desk", 20, 27, 56, 13);
        R(desk, 0, 0, 56, 2, woodLight);
        R(desk, 0, 2, 56, 1, wood);
        R(desk, 1, 3, 2, 10, woodDark);
        R(desk, 53, 3, 2, 10, woodDark);

        // CRT monitor with the paused game on screen
        var crt = Group(scene, "crt", 32, 5, 24, 21.5);
        R(crt, 0, 0, 24, 18, caseMid);
        R(crt, 0, 0, 24, 1, caseLight);
        R(crt, 0, 17, 24, 1, caseDark);
        var screen = Group(crt, null, 2, 2, 20, 13, clip: true);
        R(screen, 0, 0, 20, 13, screenBack);
        var glow = Group(screen, null, 0, 0, 20, 13);
        R(glow, 0, 0, 20, 13, accent, 0.12);
        var bars = Group(glow, null, 0, 0, 20, 13);
        R(bars, 6.5, 3, 2.5, 7, soft);
        R(bars, 11, 3, 2.5, 7, soft);
        for (var k = 0; k < 13; k++) R(screen, 0, k, 20, 0.35, black, 0.28);
        var band = R(screen, 0, 0, 20, 3, soft, 0.12);
        R(screen, 1, 1, 3, 1, white, 0.25);
        R(screen, 1, 2, 1, 2, white, 0.25);
        var monitorLed = R(crt, 20, 15.5, 2, 1, accent);
        R(crt, 9, 18, 6, 2, caseDark);
        R(crt, 6, 20, 12, 1.5, caseMid);

        // Tower PC
        var tower = Group(scene, "tower", 62, 7, 9, 20);
        R(tower, 0, 0, 9, 20, caseMid);
        R(tower, 0, 0, 9, 1, caseLight);
        R(tower, 8, 0, 1, 20, caseDark);
        R(tower, 1.5, 3, 6, 1.5, caseDark);
        R(tower, 1.5, 5.5, 6, 1.5, caseDark);
        R(tower, 2, 6, 2, 0.5, caseLight);
        R(tower, 1.5, 9, 4, 1, caseDark);
        for (var v = 0; v < 3; v++) R(tower, 1.5, 13 + v * 1.5, 6, 0.6, caseDark);
        var driveLight = R(tower, 6, 9, 1, 1, amber);
        R(tower, 6, 17, 1.2, 1.2, accent);

        // Keyboard
        var keyboard = Group(scene, "keyboard", 32, 23.5, 20, 4.2);
        R(keyboard, 0, 0, 20, 4, caseMid);
        R(keyboard, 0, 0, 20, 0.6, caseLight);
        for (var row = 0; row < 2; row++)
            for (var col = 0; col < 8; col++)
                R(keyboard, 1 + col * 2.3, 1 + row * 1.4, 1.6, 0.9, caseLight);
        R(keyboard, 5, 3.6, 9, 0.6, caseLight);

        // Corded mouse
        var mouse = Group(scene, "mouse", 55, 20, 3, 7);
        R(mouse, 0, 3, 3, 4, caseLight);
        R(mouse, 1.4, 3, 0.3, 1.6, caseDark);
        R(mouse, 0, 6.4, 3, 0.6, caseMid);
        for (var i = 0; i < 3; i++) R(mouse, 1.2, 2 - i, 0.4, 1, caseDark);

        // Controller (an original design)
        var pad = Group(scene, "controller", 22, 22, 12, 5.5);
        R(pad, 1, 0, 10, 4, caseLight);
        R(pad, 0, 1, 12, 3, caseLight);
        R(pad, 0, 4, 3, 1.5, caseLight);
        R(pad, 9, 4, 3, 1.5, caseLight);
        R(pad, 2, 1.6, 2.6, 0.8, caseDark);
        R(pad, 2.9, 0.7, 0.8, 2.6, caseDark);
        R(pad, 8.4, 1, 1, 1, accent);
        R(pad, 9.6, 2.2, 1, 1, amber);
        R(pad, 7.2, 2.2, 1, 1, coral);
        R(pad, 8.4, 3.2, 1, 1, sky);
        R(pad, 5.2, 2, 0.8, 0.5, caseDark);
        R(pad, 6.2, 2, 0.8, 0.5, caseDark);

        // Sleeping buddy beside the desk
        var buddy = Group(scene, "buddy", 0, 18, 18, 22);
        foreach (var (x, y, w, h) in new[] { (4.0, 8.0, 10.0, 1.0), (3, 9, 12, 1), (2, 10, 14, 9), (3, 19, 12, 1), (4, 20, 10, 1) })
            R(buddy, x, y, w, h, accent);
        R(buddy, 4, 9, 4, 1, soft);
        R(buddy, 3, 10, 2, 2, soft);
        foreach (var (x, y, w) in new[] { (5.0, 14.0, 1.0), (6, 15, 2), (8, 14, 1), (10, 14, 1), (11, 15, 2), (13, 14, 1) })
            R(buddy, x, y, w, 1, ink);
        R(buddy, 4, 16, 2, 1, cheek);
        R(buddy, 13, 16, 2, 1, cheek);
        R(buddy, 9, 17, 2, 1, deep);

        var zs = new List<TextBlock>();
        for (var i = 0; i < 3; i++)
        {
            var size = (4 + i) * u;
            var z = new TextBlock
            {
                Text = "Z",
                FontFamily = new FontFamily("Consolas"),
                FontWeight = FontWeights.Bold,
                FontSize = size,
                Foreground = soft,
                Tag = "zzz",
                Opacity = animate ? 0 : 1 - i * 0.25
            };
            // Animated: all start at the same spot and float up in turn. Still: a little stack.
            Canvas.SetLeft(z, (14 + (animate ? 0 : i * 2.5)) * u);
            Canvas.SetTop(z, (25 - (4 + i) - (animate ? 0 : i * 4)) * u);
            scene.Children.Add(z);
            zs.Add(z);
        }

        _sceneStarters.Add(() =>
        {
            BlockyMotion.Loop(glow, LoopKind.Flicker);
            BlockyMotion.Loop(bars, LoopKind.Pulse);
            BlockyMotion.Loop(monitorLed, LoopKind.Blink);
            BlockyMotion.Loop(driveLight, LoopKind.DriveLight);
            BlockyMotion.Loop(buddy, LoopKind.Breathe);
            BlockyMotion.Roll(band, -4 * u, 14 * u, TimeSpan.FromSeconds(3));
            for (var i = 0; i < zs.Count; i++)
            {
                BlockyMotion.FloatUp(zs[i], new Vector(5 * u, -11 * u), TimeSpan.FromSeconds(3.6), TimeSpan.FromSeconds(1.2 * i));
            }
        });

        _deskScene = scene;
        return scene;
    }

    /// <summary>Faint scattered dots in the child's colour behind the parent lock-down scene.</summary>
    private Canvas BuildPausedBackdrop(double width, double height)
    {
        var canvas = new Canvas { IsHitTestVisible = false, Tag = "paused-backdrop", Visibility = Visibility.Collapsed };
        var dot = Freeze(Rgb(_palette.Accent));
        var k = Math.Max(1, height / 800.0);
        for (var i = 0; i < 40; i++)
        {
            var fx = (i * 137 % 790 + 5) / 800.0;
            var fy = (i * 71 % 490 + 5) / 500.0;
            if (fx > 0.3 && fx < 0.7 && fy > 0.15 && fy < 0.85) continue;
            var r = new Rectangle { Width = 2 * k, Height = 2 * k, Fill = dot, Opacity = 0.25 };
            Canvas.SetLeft(r, fx * width);
            Canvas.SetTop(r, fy * height);
            canvas.Children.Add(r);
        }

        return canvas;
    }

    /// <summary>Shows the parent lock-down desk scene, or the starry night for every other lock.</summary>
    private void SetScene(bool parentLock)
    {
        var night = parentLock ? Visibility.Collapsed : Visibility.Visible;
        var paused = parentLock ? Visibility.Visible : Visibility.Collapsed;
        if (_nightSky != null) _nightSky.Visibility = night;
        if (_moon != null) _moon.Visibility = night;
        if (_pausedBackdrop != null) _pausedBackdrop.Visibility = paused;
        if (_deskScene != null) _deskScene.Visibility = paused;
    }

    /// <summary>Starts the twinkles, glints, drifts, shooting star and moon bob, and fades the content in (all skipped when animations are off).</summary>
    private void StartSkyMotion()
    {
        foreach (var (element, kind, offset, duration) in _loops)
        {
            BlockyMotion.Loop(element, kind, offset, duration);
        }

        foreach (var start in _sceneStarters)
        {
            start();
        }

        if (_shootingStar is { } shooting)
        {
            BlockyMotion.ShootingStar(shooting.Trail, shooting.Travel, TimeSpan.FromSeconds(7), TimeSpan.FromSeconds(2));
        }

        if (_content != null) BlockyMotion.FadeUp(_content, TimeSpan.FromMilliseconds(1400));
    }

    /// <summary>
    /// Pixel moon cells on a 12x12 grid (x, y, width, height). Every cell joins its
    /// neighbours along an edge (the bottom row reaches under the lower horn), so
    /// nothing looks detached.
    /// </summary>
    private static readonly (int X, int Y, int W, int H)[] MoonCells =
    [
        (4, 1, 3, 1), (2, 2, 3, 1), (1, 3, 3, 2), (1, 5, 3, 2),
        (1, 7, 4, 1), (2, 8, 7, 1), (3, 9, 5, 1), (8, 7, 2, 1)
    ];

    private UIElement CreateMoon(double size, double bottomMargin)
    {
        var cell = size / 12;
        var canvas = new Canvas
        {
            Width = size,
            Height = size,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, bottomMargin),
            SnapsToDevicePixels = true,
            Tag = "moon"
        };
        _moon = canvas;
        foreach (var (x, y, w, h) in MoonCells)
        {
            var rect = new Rectangle { Width = w * cell, Height = h * cell, Fill = MoonBrush, Tag = "moon-cell" };
            Canvas.SetLeft(rect, x * cell);
            Canvas.SetTop(rect, y * cell);
            canvas.Children.Add(rect);
        }

        _loops.Add((canvas, LoopKind.Bob, TimeSpan.Zero, null));
        return canvas;
    }

    private static StackPanel IconLabel(string glyph, string text, Brush brush, double size)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal };
        panel.Children.Add(new TextBlock
        {
            Text = glyph,
            FontFamily = new FontFamily("Segoe MDL2 Assets"),
            FontSize = size,
            Foreground = brush,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 8, 0)
        });
        panel.Children.Add(new TextBlock
        {
            Text = text,
            FontSize = size,
            FontWeight = FontWeights.SemiBold,
            Foreground = brush,
            VerticalAlignment = VerticalAlignment.Center
        });
        return panel;
    }

    private static void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.SystemKey == Key.F4 || e.Key == Key.F4)
        {
            e.Handled = true;
            return;
        }

        if (
            (e.Key == Key.Tab || e.SystemKey == Key.Tab)
            && (Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt
        )
        {
            e.Handled = true;
            return;
        }

        if (
            (e.Key == Key.Escape || e.SystemKey == Key.Escape)
            && (Keyboard.Modifiers & (ModifierKeys.Alt | ModifierKeys.Control)) != 0
        )
        {
            e.Handled = true;
        }
    }

    private UIElement BuildSecondaryContent()
    {
        var panel = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            Tag = "lock-content"
        };

        panel.Children.Add(CreateMoon(64, bottomMargin: 16));
        panel.Children.Add(BuildDeskScene(4.5, bottomMargin: 12));

        panel.Children.Add(_secondaryTitle = new TextBlock
        {
            Text = LockCopy.For(null, _childName).Title,
            FontSize = 28,
            FontWeight = FontWeights.Bold,
            Foreground = TextBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center
        });

        panel.Children.Add(new TextBlock
        {
            Text = "Use the main screen to ask for more time or shut down the PC.",
            FontSize = 15,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(24, 12, 24, 0),
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 440
        });

        return panel;
    }

    private Button CreateExtensionButton(
        int minutes,
        Func<int, Task<bool>> onExtensionRequest,
        TextBlock requestNote)
    {
        var label = $"Ask for {minutes} more minutes";
        var btn = CreateFilledButton(label, _accentBrush, OnAccentBrush, "");
        btn.MinWidth = 300;
        btn.Click += async (_, _) =>
        {
            btn.IsEnabled = false;
            SetButtonText(btn, "Asking…");
            try
            {
                var success = await onExtensionRequest(minutes);
                if (success)
                {
                    btn.Background = _softBrush;
                    SetButtonText(btn, "Asked! Waiting for your parent…");
                    requestNote.Visibility = Visibility.Visible;
                }
                else
                {
                    SetButtonText(btn, "Couldn't send. Try again");
                    await Task.Delay(2000);
                    SetButtonText(btn, label);
                    btn.IsEnabled = true;
                }
            }
            catch (Exception)
            {
                SetButtonText(btn, "Couldn't send. Try again");
                await Task.Delay(2000);
                SetButtonText(btn, label);
                btn.IsEnabled = true;
            }
        };
        return btn;
    }

    private Button CreateShutdownPcButton(Func<Task<(bool ok, string? error)>> onShutdownPc)
    {
        const string label = "Shut down";
        var btn = CreateFilledButton(label, _cardBrush, TextBrush, "");
        btn.BorderBrush = _borderBrush;
        btn.BorderThickness = new Thickness(1);
        btn.Click += async (_, _) =>
        {
            btn.IsEnabled = false;
            SetButtonText(btn, "Shutting down…");
            if (_statusText != null)
            {
                _statusText.Text = "Shutting down…";
            }

            try
            {
                var (ok, error) = await onShutdownPc();
                if (!ok)
                {
                    SetButtonText(btn, label);
                    btn.IsEnabled = true;
                    if (_statusText != null)
                    {
                        _statusText.Text =
                            error ?? "Could not shut down. Try the Start menu.";
                    }
                }
            }
            catch (Exception ex)
            {
                SetButtonText(btn, label);
                btn.IsEnabled = true;
                if (_statusText != null)
                {
                    _statusText.Text = "Could not shut down. Try the Start menu.";
                }

                WardenLog.Error("LockUI", "Shutdown PC handler failed", ex);
            }
        };
        return btn;
    }

    private Button CreateShutdownButton(
        PasswordBox pinBox,
        Func<string, Task<(bool ok, string? error)>> onParentShutdown)
    {
        var btn = CreateFilledButton("Turn off Warden", DangerBrush, Brushes.White, null);
        btn.Margin = new Thickness(0);
        btn.HorizontalAlignment = HorizontalAlignment.Stretch;
        btn.Click += async (_, _) =>
        {
            if (_pinStatusText != null)
            {
                _pinStatusText.Foreground = MutedBrush;
                _pinStatusText.Text = "Checking PIN…";
            }

            btn.IsEnabled = false;
            try
            {
                var (ok, error) = await onParentShutdown(pinBox.Password);
                if (ok)
                {
                    if (_pinStatusText != null)
                    {
                        _pinStatusText.Foreground = _softBrush;
                        _pinStatusText.Text = "Turning off…";
                    }
                }
                else
                {
                    if (_pinStatusText != null)
                    {
                        _pinStatusText.Foreground = DangerTextBrush;
                        _pinStatusText.Text = error ?? "That didn't work. Try again.";
                    }

                    btn.IsEnabled = true;
                }
            }
            catch (Exception ex)
            {
                if (_pinStatusText != null)
                {
                    _pinStatusText.Foreground = DangerTextBrush;
                    _pinStatusText.Text = "Unexpected error. Try again.";
                }

                btn.IsEnabled = true;
                System.Diagnostics.Debug.WriteLine(ex);
            }
        };
        return btn;
    }

    private static Button CreateFilledButton(string text, Brush background, Brush foreground, string? glyph)
    {
        var btn = new Button
        {
            Height = 52,
            Padding = new Thickness(22, 0, 22, 0),
            Margin = new Thickness(6, 0, 6, 0),
            FontSize = 16,
            FontWeight = FontWeights.SemiBold,
            Background = background,
            Foreground = foreground,
            BorderThickness = new Thickness(0),
            Cursor = Cursors.Hand,
            Template = CreateRoundedButtonTemplate(16)
        };
        // Lift on hover: the accent button casts a shadow in its own colour, others a dark one.
        var shadow = background is SolidColorBrush fill && fill.Color != DangerBrush.Color && fill.Color.R + fill.Color.G + fill.Color.B > 300
            ? fill.Color
            : Colors.Black;
        LiftEffect.Attach(btn, shadow, lift: 2, shadowStrength: shadow == Colors.Black ? 0.6 : 0.5);
        var panel = new StackPanel { Orientation = Orientation.Horizontal };
        if (glyph != null)
        {
            panel.Children.Add(new TextBlock
            {
                Text = glyph,
                FontFamily = new FontFamily("Segoe MDL2 Assets"),
                FontSize = 17,
                Foreground = foreground,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 10, 0)
            });
        }

        panel.Children.Add(new TextBlock
        {
            Text = text,
            Foreground = foreground,
            VerticalAlignment = VerticalAlignment.Center
        });
        btn.Content = panel;
        return btn;
    }

    private static void SetButtonText(Button btn, string text)
    {
        if (btn.Content is StackPanel panel && panel.Children[^1] is TextBlock label)
        {
            label.Text = text;
        }
    }

    private static ControlTemplate CreateRoundedButtonTemplate(double radius)
    {
        var factory = new FrameworkElementFactory(typeof(Border));
        factory.SetValue(Border.CornerRadiusProperty, new CornerRadius(radius));
        factory.SetValue(Border.SnapsToDevicePixelsProperty, true);
        factory.SetBinding(
            Border.BackgroundProperty,
            new Binding(nameof(Button.Background))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            });
        factory.SetBinding(
            Border.BorderBrushProperty,
            new Binding(nameof(Button.BorderBrush))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            });
        factory.SetBinding(
            Border.BorderThicknessProperty,
            new Binding(nameof(Button.BorderThickness))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            });

        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        presenter.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
        presenter.SetBinding(
            FrameworkElement.MarginProperty,
            new Binding(nameof(Button.Padding))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            });
        factory.AppendChild(LiftEffect.WrapWithHighlight(presenter, radius));

        return new ControlTemplate(typeof(Button)) { VisualTree = factory };
    }

    public void UpdateEvaluation(PolicyEvaluation evaluation)
    {
        Dispatcher.Invoke(() =>
        {
            var copy = LockCopy.For(evaluation, _childName);
            SetScene(LockCopy.IsParentLock(evaluation));
            if (_secondaryTitle != null) _secondaryTitle.Text = copy.Title;
            if (!_isPrimary || _titleText == null || _statusText == null || _timeText == null) return;

            _titleText.Text = copy.Title;
            _statusText.Text = copy.Body;
            _timeText.Text = copy.Detail;
            _timeText.Visibility = string.IsNullOrEmpty(copy.Detail) ? Visibility.Collapsed : Visibility.Visible;
        });
    }

    public void AssertTopmost()
    {
        Topmost = false;
        Topmost = true;
    }
}

public static class LockWindowManager
{
    private const int MaxDesktopSets = 16;

    private static readonly List<LockWindow> Windows = new();
    private static readonly KeyboardLockService KeyboardLock = new();
    private static Dispatcher? _dispatcher;
    private static DispatcherTimer? _topmostTimer;
    private static Func<int, Task<bool>>? _onExtensionRequest;
    private static Func<Task<(bool ok, string? error)>>? _onShutdownPc;
    private static Func<string, Task<(bool ok, string? error)>>? _onParentShutdown;
    private static IReadOnlyList<MonitorBounds>? _monitors;
    private static PolicyEvaluation? _lastEvaluation;
    private static bool _ensuringDesktopCover;

    /// <summary>Set true only while LockWindowManager is closing windows intentionally.</summary>
    internal static bool AllowClose { get; private set; }

    /// <summary>Colour and child name for lock windows created from now on (set before <see cref="Show"/>).</summary>
    public static LockAppearance Appearance { get; set; } = LockAppearance.Default;

    public static void Show(
        Func<int, Task<bool>> onExtensionRequest,
        Func<Task<(bool ok, string? error)>> onShutdownPc,
        Func<string, Task<(bool ok, string? error)>> onParentShutdown,
        PolicyEvaluation? evaluation = null,
        IReadOnlyList<MonitorBounds>? monitors = null)
    {
        if (Windows.Count > 0) return;

        var screens =
            monitors
            ?? new[]
            {
                new MonitorBounds(
                    (int)SystemParameters.VirtualScreenLeft,
                    (int)SystemParameters.VirtualScreenTop,
                    (int)SystemParameters.PrimaryScreenWidth,
                    (int)SystemParameters.PrimaryScreenHeight,
                    true
                ),
            };

        _onExtensionRequest = onExtensionRequest;
        _onShutdownPc = onShutdownPc;
        _onParentShutdown = onParentShutdown;
        _monitors = screens;
        _lastEvaluation = evaluation;

        var thread = new Thread(() =>
        {
            try
            {
                foreach (var screen in screens)
                {
                    var window = new LockWindow(screen, onExtensionRequest, onShutdownPc, onParentShutdown, Appearance);
                    if (evaluation != null)
                    {
                        window.UpdateEvaluation(evaluation);
                    }

                    Windows.Add(window);
                    window.Show();
                    _ = new WindowInteropHelper(window).EnsureHandle();
                }

                try
                {
                    KeyboardLock.Enable();
                }
                catch (Exception ex)
                {
                    // Lock UI still works without the hook; shortcuts may bypass.
                    WardenLog.Warn("LockUI", "KeyboardLock.Enable failed", ex);
                }

                _dispatcher = Dispatcher.CurrentDispatcher;
                _topmostTimer = new DispatcherTimer(DispatcherPriority.Background)
                {
                    Interval = TimeSpan.FromMilliseconds(250)
                };
                _topmostTimer.Tick += (_, _) =>
                {
                    try
                    {
                        foreach (var window in Windows)
                        {
                            window.AssertTopmost();
                        }
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Debug("LockUI", "AssertTopmost on lock timer failed", ex);
                    }

                    try
                    {
                        EnsureLockedOnCurrentDesktop();
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("LockUI", "EnsureLockedOnCurrentDesktop failed", ex);
                    }
                };
                _topmostTimer.Start();

                Dispatcher.Run();
            }
            finally
            {
                KeyboardLock.Disable();
                _topmostTimer?.Stop();
                _topmostTimer = null;
            }
        });

        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
    }

    public static void Hide()
    {
        var dispatcher = _dispatcher;
        if (dispatcher == null || Windows.Count == 0) return;

        void CloseAll()
        {
            _topmostTimer?.Stop();
            _topmostTimer = null;
            KeyboardLock.Disable();

            AllowClose = true;
            try
            {
                foreach (var window in Windows.ToList())
                {
                    window.Close();
                }

                Windows.Clear();
                Dispatcher.ExitAllFrames();
                _dispatcher = null;
                _onExtensionRequest = null;
                _onShutdownPc = null;
                _onParentShutdown = null;
                _monitors = null;
                _lastEvaluation = null;
            }
            finally
            {
                AllowClose = false;
            }
        }

        // On the lock UI thread: run inline (Invoke would deadlock).
        // From other threads: block until windows are closed so Exit cannot
        // leave orphaned topmost lock screens behind.
        if (dispatcher.CheckAccess())
        {
            CloseAll();
        }
        else
        {
            dispatcher.Invoke(CloseAll);
        }
    }

    public static void Update(PolicyEvaluation evaluation)
    {
        _lastEvaluation = evaluation;
        foreach (var window in Windows)
        {
            window.UpdateEvaluation(evaluation);
        }
    }

    private static void EnsureLockedOnCurrentDesktop()
    {
        if (Windows.Count == 0)
        {
            return;
        }

        if (_ensuringDesktopCover)
        {
            return;
        }

        var hasValidHwnd = false;
        foreach (var window in Windows)
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero)
            {
                continue;
            }

            hasValidHwnd = true;
            if (VirtualDesktopAffinity.IsOnCurrentDesktop(hwnd))
            {
                return;
            }
        }

        if (!hasValidHwnd)
        {
            return;
        }

        if (!VirtualDesktopAffinity.IsAvailable)
        {
            return;
        }

        var monitors = _monitors;
        var onExtension = _onExtensionRequest;
        var onShutdown = _onShutdownPc;
        var onParentShutdown = _onParentShutdown;
        if (monitors == null || onExtension == null || onShutdown == null || onParentShutdown == null)
        {
            return;
        }

        var monitorCount = monitors.Count;
        if (monitorCount <= 0)
        {
            monitorCount = 1;
        }

        var setCount = Windows.Count / monitorCount;
        if (setCount >= MaxDesktopSets)
        {
            WardenLog.Warn(
                "LockUI",
                $"Virtual desktop cover cap ({MaxDesktopSets} sets) reached; skipping new overlay"
            );
            return;
        }

        _ensuringDesktopCover = true;
        try
        {
            foreach (var screen in monitors)
            {
                var window = new LockWindow(screen, onExtension, onShutdown, onParentShutdown, Appearance);
                if (_lastEvaluation != null)
                {
                    window.UpdateEvaluation(_lastEvaluation);
                }

                Windows.Add(window);
                window.Show();
                _ = new WindowInteropHelper(window).EnsureHandle();
            }

            WardenLog.Info("LockUI", "Lock overlay extended to current virtual desktop");
        }
        finally
        {
            _ensuringDesktopCover = false;
        }
    }
}
