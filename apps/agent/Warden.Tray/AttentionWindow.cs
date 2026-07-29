using System.Media;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using WpfButton = System.Windows.Controls.Button;
using WpfHorizontalAlignment = System.Windows.HorizontalAlignment;

namespace Warden.Tray;

/// <summary>
/// Topmost attention card with delayed OK (no auto-dismiss).
/// Used for parent nudges and local time-remaining warnings.
/// </summary>
public sealed class AttentionWindow : Window
{
    private readonly DispatcherTimer? _okDelayTimer;
    private bool _closed;
    private bool _busy;

    public string? Response { get; private set; }

    public AttentionWindow(
        string title,
        string message,
        int okDelaySeconds,
        IReadOnlyList<int>? extensionMinutes = null,
        Func<int, Task<bool>>? onExtensionRequest = null
    )
    {
        Title = "Warden";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Topmost = true;
        AllowsTransparency = true;
        Background = System.Windows.Media.Brushes.Transparent;
        Width = extensionMinutes is { Count: > 0 } ? 480 : 420;
        SizeToContent = SizeToContent.Height;

        var screen = System.Windows.Forms.Screen.PrimaryScreen
            ?? System.Windows.Forms.Screen.AllScreens.First();
        Left = screen.WorkingArea.Left + (screen.WorkingArea.Width - Width) / 2;
        Top = screen.WorkingArea.Top + 48;

        var card = new Border
        {
            Background = UiTheme.CardBrush,
            BorderBrush = UiTheme.BorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(UiTheme.CardRadius),
            Padding = new Thickness(24, 22, 24, 20),
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                BlurRadius = 24,
                ShadowDepth = 8,
                Opacity = 0.45,
                Color = Colors.Black
            }
        };

        var stack = new StackPanel();

        stack.Children.Add(
            new TextBlock
            {
                Text = title,
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Foreground = UiTheme.MutedBrush,
                Margin = new Thickness(0, 0, 0, 8)
            }
        );

        stack.Children.Add(
            new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(message)
                    ? "Your parent wants your attention"
                    : message,
                FontSize = 18,
                FontWeight = FontWeights.SemiBold,
                Foreground = UiTheme.TextBrush,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 20)
            }
        );

        var hasExtensionButtons =
            extensionMinutes is { Count: > 0 } && onExtensionRequest != null;

        var buttonArea = new StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Vertical
        };

        var delay = Math.Max(0, okDelaySeconds);
        var delayedButtons = new List<(WpfButton Button, bool Primary)>();

        if (hasExtensionButtons)
        {
            var extensionRow = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            for (var i = 0; i < extensionMinutes!.Count; i++)
            {
                extensionRow.ColumnDefinitions.Add(
                    new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
                );
            }

            for (var i = 0; i < extensionMinutes.Count; i++)
            {
                var minutes = extensionMinutes[i];
                var label = $"+{minutes} min";
                var btn = UiTheme.SecondaryButton(label);
                btn.Margin = new Thickness(i == 0 ? 0 : 8, 0, 0, 0);
                btn.HorizontalAlignment = WpfHorizontalAlignment.Stretch;
                var requestedMinutes = minutes;
                btn.Click += async (_, _) =>
                {
                    if (_closed || _busy || !btn.IsEnabled)
                    {
                        return;
                    }

                    _busy = true;
                    foreach (var (b, _) in delayedButtons)
                    {
                        b.IsEnabled = false;
                    }

                    btn.Content = "Requesting...";
                    var success = false;
                    try
                    {
                        success = await onExtensionRequest!(requestedMinutes);
                    }
                    catch
                    {
                        success = false;
                    }

                    if (_closed)
                    {
                        return;
                    }

                    if (success)
                    {
                        btn.Content = "Request sent!";
                        await Task.Delay(900);
                        CloseWithResponse($"request:{requestedMinutes}");
                        return;
                    }

                    btn.Content = "Failed";
                    await Task.Delay(1600);
                    if (_closed)
                    {
                        return;
                    }

                    btn.Content = label;
                    foreach (var (b, primary) in delayedButtons)
                    {
                        SetButtonDelayed(b, enabled: true, primary);
                    }

                    _busy = false;
                };
                Grid.SetColumn(btn, i);
                extensionRow.Children.Add(btn);
                delayedButtons.Add((btn, Primary: false));
            }

            buttonArea.Children.Add(extensionRow);
        }

        var ok = UiTheme.PrimaryButton(delay > 0 ? $"OK ({delay})" : "OK");
        ok.HorizontalAlignment = WpfHorizontalAlignment.Stretch;
        ok.MinWidth = 100;
        ok.Click += (_, _) =>
        {
            if (_closed || _busy || !ok.IsEnabled)
            {
                return;
            }

            CloseWithResponse("ok");
        };
        delayedButtons.Add((ok, Primary: true));
        buttonArea.Children.Add(ok);

        if (delay > 0)
        {
            foreach (var (btn, primary) in delayedButtons)
            {
                SetButtonDelayed(btn, enabled: false, primary);
            }

            var remaining = delay;
            _okDelayTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _okDelayTimer.Tick += (_, _) =>
            {
                remaining--;
                if (remaining <= 0)
                {
                    _okDelayTimer.Stop();
                    ok.Content = "OK";
                    if (!_busy)
                    {
                        foreach (var (btn, primary) in delayedButtons)
                        {
                            SetButtonDelayed(btn, enabled: true, primary);
                        }
                    }
                }
                else
                {
                    ok.Content = $"OK ({remaining})";
                }
            };
            _okDelayTimer.Start();
        }

        stack.Children.Add(buttonArea);
        card.Child = stack;
        Content = card;

        Loaded += (_, _) =>
        {
            try
            {
                SystemSounds.Asterisk.Play();
            }
            catch
            {
                // Sound is best-effort.
            }
        };

        Closed += (_, _) =>
        {
            _okDelayTimer?.Stop();
            _closed = true;
        };
    }

    private static void SetButtonDelayed(WpfButton btn, bool enabled, bool primary)
    {
        btn.IsEnabled = enabled;
        if (enabled)
        {
            btn.Opacity = 1;
            if (primary)
            {
                btn.Background = UiTheme.AccentBrush;
                btn.Foreground = UiTheme.AccentOnBrush;
                btn.BorderBrush = System.Windows.Media.Brushes.Transparent;
                btn.BorderThickness = new Thickness(0);
            }
            else
            {
                btn.Background = UiTheme.CardBrush;
                btn.Foreground = UiTheme.TextBrush;
                btn.BorderBrush = UiTheme.BorderBrush;
                btn.BorderThickness = new Thickness(1);
            }

            btn.Cursor = System.Windows.Input.Cursors.Hand;
        }
        else
        {
            btn.Opacity = 0.55;
            btn.Background = UiTheme.BorderBrush;
            btn.Foreground = UiTheme.MutedBrush;
            btn.Cursor = System.Windows.Input.Cursors.Arrow;
        }
    }

    private void CloseWithResponse(string response)
    {
        if (_closed) return;
        Response = response;
        _okDelayTimer?.Stop();
        try
        {
            Close();
        }
        catch
        {
            // Ignore if already closing.
        }
    }
}
