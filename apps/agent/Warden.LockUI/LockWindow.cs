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
    private static readonly SolidColorBrush MoonFillBrush = Freeze(Color.FromArgb(38, 0xf2, 0xd2, 0x7a));
    private static readonly SolidColorBrush FaintBrush = Freeze(Color.FromRgb(0x8f, 0x9b, 0x97));

    // Windows 11 UI font; falls back to Segoe UI on Windows 10.
    private static readonly FontFamily BodyFont = new("Segoe UI Variable Text, Segoe UI");
    private static readonly FontFamily DisplayFont = new("Segoe UI Variable Display, Segoe UI");

    private const string MoonGeometry = "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z";
    private const string SparkleGeometry = "M17 3.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z";

    /// <summary>Star positions as fractions of the screen (x, y, radius px, opacity).</summary>
    private static readonly (double X, double Y, double R, double O)[] Stars =
    [
        (0.12, 0.15, 2, 0.7), (0.22, 0.30, 1.5, 0.5), (0.85, 0.20, 2, 0.7), (0.79, 0.10, 1.5, 0.5),
        (0.92, 0.42, 1.5, 0.5), (0.08, 0.55, 1.5, 0.5), (0.31, 0.12, 1.2, 0.6), (0.69, 0.33, 1.2, 0.6),
        (0.16, 0.83, 1.5, 0.4), (0.88, 0.80, 1.5, 0.4), (0.45, 0.06, 1.2, 0.5), (0.58, 0.88, 1.2, 0.4),
        (0.04, 0.30, 1.2, 0.5), (0.96, 0.62, 1.2, 0.5)
    ];

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
            if (!LockWindowManager.AllowClose)
            {
                e.Cancel = true;
            }
        };
        Deactivated += (_, _) =>
        {
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
        layers.Children.Add(BuildStars(bounds.Width, bounds.Height, palette));

        if (!bounds.IsPrimary)
        {
            layers.Children.Add(BuildSecondaryContent());
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

        mainPanel.Children.Add(CreateMoon(84, bottomMargin: 18));

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

    private static UIElement BuildStars(double width, double height, AccentPalette palette)
    {
        var canvas = new Canvas { IsHitTestVisible = false };
        var starBrush = Freeze(Rgb(palette.Star));
        foreach (var (x, y, r, o) in Stars)
        {
            var star = new Ellipse { Width = r * 2, Height = r * 2, Fill = starBrush, Opacity = o };
            Canvas.SetLeft(star, x * width - r);
            Canvas.SetTop(star, y * height - r);
            canvas.Children.Add(star);
        }

        return canvas;
    }

    private static UIElement CreateMoon(double size, double bottomMargin)
    {
        var grid = new Grid
        {
            Width = size,
            Height = size,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, bottomMargin)
        };
        grid.Children.Add(new Path
        {
            Data = Geometry.Parse(MoonGeometry),
            Stroke = MoonBrush,
            StrokeThickness = 1.4,
            Fill = MoonFillBrush,
            Stretch = Stretch.None,
            RenderTransform = new ScaleTransform(size / 24, size / 24)
        });
        grid.Children.Add(new Path
        {
            Data = Geometry.Parse(SparkleGeometry),
            Stroke = MoonBrush,
            StrokeThickness = 1.4,
            Stretch = Stretch.None,
            RenderTransform = new ScaleTransform(size / 24, size / 24)
        });
        return grid;
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
            HorizontalAlignment = HorizontalAlignment.Center
        };

        panel.Children.Add(CreateMoon(64, bottomMargin: 16));

        panel.Children.Add(new TextBlock
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
        factory.AppendChild(presenter);

        return new ControlTemplate(typeof(Button)) { VisualTree = factory };
    }

    public void UpdateEvaluation(PolicyEvaluation evaluation)
    {
        if (!_isPrimary || _titleText == null || _statusText == null || _timeText == null) return;

        Dispatcher.Invoke(() =>
        {
            var copy = LockCopy.For(evaluation, _childName);
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
                    if (evaluation != null && screen.IsPrimary)
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
                if (_lastEvaluation != null && screen.IsPrimary)
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
