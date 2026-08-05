using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using Warden.Core.Diagnostics;
using Warden.Core.Models;
using Warden.Core.Services;

namespace Warden.LockUI;

public readonly record struct MonitorBounds(
    int Left,
    int Top,
    int Width,
    int Height,
    bool IsPrimary);

public class LockWindow : Window
{
    private static readonly SolidColorBrush BgBrush = Freeze(Color.FromRgb(0x1a, 0x24, 0x20));
    private static readonly SolidColorBrush TextBrush = Freeze(Color.FromRgb(0xe0, 0xe0, 0xe0));
    private static readonly SolidColorBrush MutedBrush = Freeze(Color.FromRgb(0xa8, 0xb0, 0xb0));
    private static readonly SolidColorBrush AccentBrush = Freeze(Color.FromRgb(0x50, 0xc8, 0x78));
    private static readonly SolidColorBrush AccentOnBrush = Freeze(Color.FromRgb(0x0f, 0x1a, 0x12));
    private static readonly SolidColorBrush PanelBorderBrush = Freeze(Color.FromRgb(0x36, 0x45, 0x4f));
    private static readonly SolidColorBrush CardBrush = Freeze(Color.FromRgb(0x24, 0x30, 0x2c));
    private static readonly SolidColorBrush DangerBrush = Freeze(Color.FromRgb(0xb5, 0x4a, 0x3f));
    private static readonly SolidColorBrush SuccessBrush = Freeze(Color.FromRgb(0x50, 0xc8, 0x78));
    private static readonly SolidColorBrush ShieldRingBrush = Freeze(Color.FromArgb(102, 0xc5, 0xa0, 0x59));
    private static readonly SolidColorBrush ShieldFillBrush = Freeze(Color.FromArgb(38, 0x50, 0xc8, 0x78));
    private static readonly SolidColorBrush ShieldStrokeBrush = Freeze(Color.FromRgb(0xc5, 0xa0, 0x59));
    private static readonly SolidColorBrush FooterBrush = Freeze(Color.FromRgb(0x6e, 0x78, 0x72));
    private static readonly SolidColorBrush OutlineFgBrush = Freeze(Color.FromRgb(0xe0, 0xe0, 0xe0));
    private static readonly SolidColorBrush OutlineBorderBrush = Freeze(Color.FromArgb(64, 0x36, 0x45, 0x4f));

    private readonly TextBlock? _statusText;
    private readonly TextBlock? _timeText;
    private readonly TextBlock? _pinStatusText;
    private readonly bool _isPrimary;

    public LockWindow(
        MonitorBounds bounds,
        Func<int, Task<bool>> onExtensionRequest,
        Func<Task<(bool ok, string? error)>> onShutdownPc,
        Func<string, Task<(bool ok, string? error)>> onParentShutdown)
    {
        _isPrimary = bounds.IsPrimary;

        Title = "Warden";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        WindowState = WindowState.Normal;
        Topmost = true;
        ShowInTaskbar = false;
        Background = BgBrush;
        FontFamily = new FontFamily("Segoe UI");
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

        if (!bounds.IsPrimary)
        {
            Content = BuildSecondaryContent();
            return;
        }

        var mainPanel = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            MaxWidth = 480
        };

        mainPanel.Children.Add(CreateShieldIcon(56, 28, bottomMargin: 16));

        mainPanel.Children.Add(new TextBlock
        {
            Text = "Time's up for today",
            FontSize = 32,
            FontWeight = FontWeights.Bold,
            Foreground = TextBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12)
        });

        _statusText = new TextBlock
        {
            Text = "Ask a parent for more time, or come back tomorrow.",
            FontSize = 16,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 360,
            Margin = new Thickness(0, 0, 0, 8)
        };
        mainPanel.Children.Add(_statusText);

        _timeText = new TextBlock
        {
            FontSize = 13,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 0, 0, 28)
        };
        mainPanel.Children.Add(_timeText);

        var actionRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12)
        };

        actionRow.Children.Add(
            CreateExtensionButton(15, onExtensionRequest, "Request +15 min", primary: true));

        var shutdownPcButton = CreateShutdownPcButton(onShutdownPc);
        actionRow.Children.Add(shutdownPcButton);
        mainPanel.Children.Add(actionRow);

        var parentReveal = new TextBlock
        {
            Text = "For parents",
            FontSize = 13,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextDecorations = TextDecorations.Underline,
            Cursor = Cursors.Hand,
            Margin = new Thickness(0, 0, 0, 12)
        };
        mainPanel.Children.Add(parentReveal);

        var moreTimeRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 28)
        };
        moreTimeRow.Children.Add(
            CreateExtensionButton(30, onExtensionRequest, "+30 min", primary: false));
        moreTimeRow.Children.Add(
            CreateExtensionButton(60, onExtensionRequest, "+60 min", primary: false));
        mainPanel.Children.Add(moreTimeRow);

        var pinPanel = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            Visibility = Visibility.Collapsed,
            Margin = new Thickness(0, 0, 0, 16)
        };

        pinPanel.Children.Add(new TextBlock
        {
            Text = "Enter parent PIN to shut down Warden",
            FontSize = 14,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12)
        });

        var pinBox = new PasswordBox
        {
            Width = 220,
            Height = 40,
            FontSize = 18,
            Padding = new Thickness(10, 6, 10, 6),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12),
            Background = CardBrush,
            Foreground = TextBrush,
            BorderBrush = PanelBorderBrush,
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
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 8, 0, 0)
        };
        pinPanel.Children.Add(_pinStatusText);
        mainPanel.Children.Add(pinPanel);

        parentReveal.MouseLeftButtonUp += (_, _) =>
        {
            parentReveal.Visibility = Visibility.Collapsed;
            pinPanel.Visibility = Visibility.Visible;
            pinBox.Focus();
        };

        mainPanel.Children.Add(new TextBlock
        {
            Text = "WARDEN · WINDOWS AGENT",
            FontSize = 11,
            Foreground = FooterBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 24, 0, 0)
        });

        Content = mainPanel;
    }

    private static SolidColorBrush Freeze(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }

    private static UIElement CreateShieldIcon(double size, double iconSize, double bottomMargin)
    {
        var path = new Path
        {
            Data = Geometry.Parse(
                "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"),
            Stroke = ShieldStrokeBrush,
            StrokeThickness = 2,
            Fill = Brushes.Transparent,
            Stretch = Stretch.Uniform,
            Width = iconSize,
            Height = iconSize,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };

        return new Border
        {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(size / 2),
            Background = ShieldFillBrush,
            BorderBrush = ShieldRingBrush,
            BorderThickness = new Thickness(1),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, bottomMargin),
            Child = path
        };
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

    private static UIElement BuildSecondaryContent()
    {
        var panel = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        };

        panel.Children.Add(CreateShieldIcon(48, 24, bottomMargin: 16));

        panel.Children.Add(new TextBlock
        {
            Text = "Time's up for today",
            FontSize = 24,
            FontWeight = FontWeights.Bold,
            Foreground = TextBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center
        });

        panel.Children.Add(new TextBlock
        {
            Text = "Use the primary display to request more time or shut down the PC.",
            FontSize = 14,
            Foreground = MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(24, 12, 24, 0),
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 420
        });

        panel.Children.Add(new TextBlock
        {
            Text = "WARDEN · WINDOWS AGENT",
            FontSize = 11,
            Foreground = FooterBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 28, 0, 0)
        });

        return panel;
    }

    private Button CreateExtensionButton(
        int minutes,
        Func<int, Task<bool>> onExtensionRequest,
        string label,
        bool primary)
    {
        var btn = primary
            ? CreateFilledButton(label, AccentBrush)
            : CreateOutlinedButton(label);
        btn.Click += async (_, _) =>
        {
            btn.IsEnabled = false;
            var previous = btn.Content;
            btn.Content = "Requesting...";
            try
            {
                var success = await onExtensionRequest(minutes);
                btn.Content = success ? "Request sent!" : "Failed - try again";
                if (!success)
                {
                    await Task.Delay(2000);
                    btn.Content = previous;
                    btn.IsEnabled = true;
                }
            }
            catch (Exception)
            {
                btn.Content = "Failed - try again";
                await Task.Delay(2000);
                btn.Content = previous;
                btn.IsEnabled = true;
            }
        };
        return btn;
    }

    private Button CreateShutdownPcButton(Func<Task<(bool ok, string? error)>> onShutdownPc)
    {
        var btn = CreateFilledButton("Shutdown PC", DangerBrush);
        btn.Click += async (_, _) =>
        {
            btn.IsEnabled = false;
            btn.Content = "Shutting down...";
            if (_statusText != null)
            {
                _statusText.Text = "Shutting down...";
            }

            try
            {
                var (ok, error) = await onShutdownPc();
                if (!ok)
                {
                    btn.Content = "Shutdown PC";
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
                btn.Content = "Shutdown PC";
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
        var btn = CreateFilledButton("Shut down Warden", DangerBrush);
        btn.HorizontalAlignment = HorizontalAlignment.Center;
        btn.Click += async (_, _) =>
        {
            if (_pinStatusText != null)
            {
                _pinStatusText.Foreground = MutedBrush;
                _pinStatusText.Text = "Checking PIN...";
            }

            btn.IsEnabled = false;
            try
            {
                var (ok, error) = await onParentShutdown(pinBox.Password);
                if (ok)
                {
                    if (_pinStatusText != null)
                    {
                        _pinStatusText.Foreground = SuccessBrush;
                        _pinStatusText.Text = "Shutting down...";
                    }
                }
                else
                {
                    if (_pinStatusText != null)
                    {
                        _pinStatusText.Foreground = DangerBrush;
                        _pinStatusText.Text = error ?? "Shutdown failed.";
                    }

                    btn.IsEnabled = true;
                }
            }
            catch (Exception ex)
            {
                if (_pinStatusText != null)
                {
                    _pinStatusText.Foreground = DangerBrush;
                    _pinStatusText.Text = "Unexpected error. Try again.";
                }

                btn.IsEnabled = true;
                System.Diagnostics.Debug.WriteLine(ex);
            }
        };
        return btn;
    }

    private static Button CreateFilledButton(string content, SolidColorBrush background) =>
        new()
        {
            Content = content,
            Padding = new Thickness(20, 12, 20, 12),
            Margin = new Thickness(6, 0, 6, 0),
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Background = background,
            Foreground = ReferenceEquals(background, AccentBrush) ? AccentOnBrush : TextBrush,
            BorderThickness = new Thickness(0),
            Cursor = Cursors.Hand,
            Template = CreateRoundedButtonTemplate()
        };

    private static Button CreateOutlinedButton(string content) =>
        new()
        {
            Content = content,
            Padding = new Thickness(20, 12, 20, 12),
            Margin = new Thickness(6, 0, 6, 0),
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Background = Brushes.Transparent,
            Foreground = OutlineFgBrush,
            BorderBrush = OutlineBorderBrush,
            BorderThickness = new Thickness(1),
            Cursor = Cursors.Hand,
            Template = CreateRoundedButtonTemplate()
        };

    private static ControlTemplate CreateRoundedButtonTemplate()
    {
        var factory = new FrameworkElementFactory(typeof(Border));
        factory.SetValue(Border.CornerRadiusProperty, new CornerRadius(10));
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
        if (!_isPrimary || _statusText == null || _timeText == null) return;

        Dispatcher.Invoke(() =>
        {
            _statusText.Text =
                evaluation.Message ?? "Ask a parent for more time, or come back tomorrow.";
            if (evaluation.Status == "outside_window" && evaluation.NextWindowStart != null)
            {
                var dailyLeft = evaluation.DailyRemainingMinutes;
                _timeText.Text =
                    dailyLeft > 0
                        ? $"Available again: {evaluation.NextWindowStart} — {dailyLeft} min of today's time left"
                        : $"Available again: {evaluation.NextWindowStart}";
            }
            else
            {
                _timeText.Text =
                    $"Used {evaluation.UsedMinutes} of {evaluation.DailyLimitMinutes + evaluation.BonusMinutes} minutes today";
            }
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
    private static readonly List<LockWindow> Windows = new();
    private static readonly KeyboardLockService KeyboardLock = new();
    private static Dispatcher? _dispatcher;
    private static DispatcherTimer? _topmostTimer;

    /// <summary>Set true only while LockWindowManager is closing windows intentionally.</summary>
    internal static bool AllowClose { get; private set; }

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

        var thread = new Thread(() =>
        {
            try
            {
                foreach (var screen in screens)
                {
                    var window = new LockWindow(screen, onExtensionRequest, onShutdownPc, onParentShutdown);
                    if (evaluation != null && screen.IsPrimary)
                    {
                        window.UpdateEvaluation(evaluation);
                    }

                    Windows.Add(window);
                    window.Show();
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
                    Interval = TimeSpan.FromMilliseconds(750)
                };
                _topmostTimer.Tick += (_, _) =>
                {
                    foreach (var window in Windows)
                    {
                        window.AssertTopmost();
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
        foreach (var window in Windows)
        {
            window.UpdateEvaluation(evaluation);
        }
    }
}
