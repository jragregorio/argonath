using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Argonath.Core.Models;
using Argonath.Core.Services;

namespace Argonath.LockUI;

public readonly record struct MonitorBounds(
    int Left,
    int Top,
    int Width,
    int Height,
    bool IsPrimary);

public class LockWindow : Window
{
    private readonly TextBlock? _statusText;
    private readonly TextBlock? _timeText;
    private readonly TextBlock? _pinStatusText;
    private readonly bool _isPrimary;

    public LockWindow(
        MonitorBounds bounds,
        Func<int, Task<bool>> onExtensionRequest,
        Func<string, Task<(bool ok, string? error)>> onParentShutdown)
    {
        _isPrimary = bounds.IsPrimary;

        Title = "argonath";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        WindowState = WindowState.Normal;
        Topmost = true;
        ShowInTaskbar = false;
        Background = new SolidColorBrush(Color.FromRgb(15, 23, 42));
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
            catch
            {
                // Ignore if the window is tearing down.
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
            MaxWidth = 640
        };

        mainPanel.Children.Add(new TextBlock
        {
            Text = "🛡️",
            FontSize = 64,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 24)
        });

        mainPanel.Children.Add(new TextBlock
        {
            Text = "Screen time limit reached",
            FontSize = 32,
            FontWeight = FontWeights.Bold,
            Foreground = Brushes.White,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12)
        });

        _statusText = new TextBlock
        {
            FontSize = 18,
            Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 0, 0, 8)
        };
        mainPanel.Children.Add(_statusText);

        _timeText = new TextBlock
        {
            FontSize = 16,
            Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 0, 0, 32)
        };
        mainPanel.Children.Add(_timeText);

        mainPanel.Children.Add(new TextBlock
        {
            Text = "Request more time from your parent:",
            FontSize = 14,
            Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 16)
        });

        var extensionPanel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 28)
        };

        foreach (var minutes in new[] { 15, 30, 60 })
        {
            extensionPanel.Children.Add(CreateExtensionButton(minutes, onExtensionRequest));
        }

        mainPanel.Children.Add(extensionPanel);

        mainPanel.Children.Add(new Border
        {
            Height = 1,
            Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
            Margin = new Thickness(40, 0, 40, 24)
        });

        var parentPrompt = new TextBlock
        {
            Text = "Parent: Input PIN for Authentication",
            FontSize = 14,
            Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12),
            Visibility = Visibility.Collapsed
        };

        var pinBox = new PasswordBox
        {
            Width = 220,
            Height = 36,
            FontSize = 18,
            Padding = new Thickness(8, 4, 8, 4),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12),
            Visibility = Visibility.Collapsed
        };

        var shutdownButton = CreateShutdownButton(pinBox, onParentShutdown);
        shutdownButton.Visibility = Visibility.Collapsed;

        _pinStatusText = new TextBlock
        {
            FontSize = 13,
            Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 8, 0, 0),
            Visibility = Visibility.Collapsed
        };

        var parentButton = CreateBlueButton("Parent");
        parentButton.HorizontalAlignment = HorizontalAlignment.Center;
        parentButton.Click += (_, _) =>
        {
            parentButton.Visibility = Visibility.Collapsed;
            parentPrompt.Visibility = Visibility.Visible;
            pinBox.Visibility = Visibility.Visible;
            shutdownButton.Visibility = Visibility.Visible;
            _pinStatusText.Visibility = Visibility.Visible;
            pinBox.Focus();
        };

        mainPanel.Children.Add(parentButton);
        mainPanel.Children.Add(parentPrompt);
        mainPanel.Children.Add(pinBox);
        mainPanel.Children.Add(shutdownButton);
        mainPanel.Children.Add(_pinStatusText);

        Content = mainPanel;
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

        panel.Children.Add(new TextBlock
        {
            Text = "🛡️",
            FontSize = 48,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 16)
        });

        panel.Children.Add(new TextBlock
        {
            Text = "Screen time limit reached",
            FontSize = 24,
            FontWeight = FontWeights.Bold,
            Foreground = Brushes.White,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center
        });

        panel.Children.Add(new TextBlock
        {
            Text = "Use the primary display to request more time, or Shut down Argonath with a parent PIN.",
            FontSize = 14,
            Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(24, 12, 24, 0),
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 420
        });

        return panel;
    }

    private Button CreateExtensionButton(int minutes, Func<int, Task<bool>> onExtensionRequest)
    {
        var btn = CreateBlueButton($"+{minutes} min");
        btn.Click += async (_, _) =>
        {
            btn.IsEnabled = false;
            btn.Content = "Requesting...";
            var success = await onExtensionRequest(minutes);
            btn.Content = success ? "Request sent!" : "Failed - try again";
            if (!success)
            {
                await Task.Delay(2000);
                btn.Content = $"+{minutes} min";
                btn.IsEnabled = true;
            }
        };
        return btn;
    }

    private Button CreateShutdownButton(
        PasswordBox pinBox,
        Func<string, Task<(bool ok, string? error)>> onParentShutdown)
    {
        var btn = CreateBlueButton("Shut down Argonath");
        btn.Background = new SolidColorBrush(Color.FromRgb(220, 38, 38));
        btn.HorizontalAlignment = HorizontalAlignment.Center;
        btn.Click += async (_, _) =>
        {
            if (_pinStatusText != null)
            {
                _pinStatusText.Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                _pinStatusText.Text = "Checking PIN...";
            }

            btn.IsEnabled = false;
            var (ok, error) = await onParentShutdown(pinBox.Password);
            if (ok)
            {
                if (_pinStatusText != null)
                {
                    _pinStatusText.Foreground = new SolidColorBrush(Color.FromRgb(34, 197, 94));
                    _pinStatusText.Text = "Shutting down...";
                }
            }
            else
            {
                if (_pinStatusText != null)
                {
                    _pinStatusText.Foreground = new SolidColorBrush(Color.FromRgb(239, 68, 68));
                    _pinStatusText.Text = error ?? "Shutdown failed.";
                }

                btn.IsEnabled = true;
            }
        };
        return btn;
    }

    private static Button CreateBlueButton(string content) =>
        new()
        {
            Content = content,
            Padding = new Thickness(16, 10, 16, 10),
            Margin = new Thickness(6, 0, 6, 0),
            FontSize = 14,
            Background = new SolidColorBrush(Color.FromRgb(59, 130, 246)),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            Cursor = Cursors.Hand
        };

    public void UpdateEvaluation(PolicyEvaluation evaluation)
    {
        if (!_isPrimary || _statusText == null || _timeText == null) return;

        Dispatcher.Invoke(() =>
        {
            _statusText.Text = evaluation.Message ?? "Your screen time is up for today.";
            _timeText.Text =
                evaluation.Status == "outside_window" && evaluation.NextWindowStart != null
                    ? $"Available again: {evaluation.NextWindowStart}"
                    : $"Used {evaluation.UsedMinutes} of {evaluation.DailyLimitMinutes + evaluation.BonusMinutes} minutes today";
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
                    var window = new LockWindow(screen, onExtensionRequest, onParentShutdown);
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
                catch
                {
                    // Lock UI still works without the hook; shortcuts may bypass.
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
