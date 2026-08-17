using System.Media;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using WpfButton = System.Windows.Controls.Button;
using WpfHorizontalAlignment = System.Windows.HorizontalAlignment;
using WpfTextBox = System.Windows.Controls.TextBox;

namespace Warden.Tray;

/// <summary>
/// Topmost attention card with delayed OK. Optional auto-dismiss (blocked-app notice).
/// Used for parent nudges, time-remaining warnings, and blocked-app notices.
/// </summary>
public sealed class AttentionWindow : Window
{
    private readonly DispatcherTimer? _okDelayTimer;
    private readonly DispatcherTimer? _autoDismissTimer;
    private readonly WpfTextBox? _replyField;
    private bool _closed;
    private bool _busy;

    public string? Response { get; private set; }

    /// <summary>Captured on the UI thread at close. Safe to read after Close().</summary>
    public string? ReplyText { get; private set; }

    public AttentionWindow(
        string title,
        string message,
        int okDelaySeconds,
        IReadOnlyList<int>? extensionMinutes = null,
        Func<int, Task<bool>>? onExtensionRequest = null,
        bool enableNudgeReply = false,
        int autoDismissSeconds = 0
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

        if (enableNudgeReply)
        {
            _replyField = UiTheme.TextField(placeholder: "Reply (optional)");
            _replyField.MaxLength = 200;
            _replyField.Margin = new Thickness(0, 0, 0, 12);

            var cannedRow = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            cannedRow.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
            );
            cannedRow.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
            );

            var onMyWay = UiTheme.SecondaryButton("On my way");
            onMyWay.Margin = new Thickness(0, 0, 8, 0);
            onMyWay.HorizontalAlignment = WpfHorizontalAlignment.Stretch;
            onMyWay.Click += (_, _) =>
            {
                if (_closed || _busy || !onMyWay.IsEnabled)
                {
                    return;
                }

                CloseWithResponse("on_my_way");
            };

            var needFew = UiTheme.SecondaryButton("Need a few min");
            needFew.Margin = new Thickness(0);
            needFew.HorizontalAlignment = WpfHorizontalAlignment.Stretch;
            needFew.Click += (_, _) =>
            {
                if (_closed || _busy || !needFew.IsEnabled)
                {
                    return;
                }

                CloseWithResponse("need_a_few");
            };

            Grid.SetColumn(onMyWay, 0);
            Grid.SetColumn(needFew, 1);
            cannedRow.Children.Add(onMyWay);
            cannedRow.Children.Add(needFew);
            delayedButtons.Add((onMyWay, Primary: false));
            delayedButtons.Add((needFew, Primary: false));

            var expandPanel = new StackPanel { Visibility = Visibility.Collapsed };
            expandPanel.Children.Add(_replyField);
            expandPanel.Children.Add(cannedRow);
            buttonArea.Children.Add(expandPanel);

            var compactRow = new Grid();
            compactRow.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
            );
            compactRow.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
            );

            var replyToggle = UiTheme.SecondaryButton("Reply");
            replyToggle.Margin = new Thickness(0, 0, 8, 0);
            replyToggle.HorizontalAlignment = WpfHorizontalAlignment.Stretch;
            replyToggle.Click += (_, _) =>
            {
                if (_closed || _busy || !replyToggle.IsEnabled)
                {
                    return;
                }

                if (expandPanel.Visibility == Visibility.Visible)
                {
                    return;
                }

                expandPanel.Visibility = Visibility.Visible;
                replyToggle.Visibility = Visibility.Collapsed;
                Grid.SetColumn(ok, 0);
                Grid.SetColumnSpan(ok, 2);
                ok.Margin = new Thickness(0);
                _replyField.Focus();
            };

            delayedButtons.Add((replyToggle, Primary: false));
            Grid.SetColumn(replyToggle, 0);
            Grid.SetColumn(ok, 1);
            compactRow.Children.Add(replyToggle);
            compactRow.Children.Add(ok);
            buttonArea.Children.Add(compactRow);
        }
        else
        {
            buttonArea.Children.Add(ok);
        }

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

        var dismissAfter = Math.Max(0, autoDismissSeconds);
        if (dismissAfter > 0)
        {
            _autoDismissTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(dismissAfter)
            };
            _autoDismissTimer.Tick += (_, _) =>
            {
                _autoDismissTimer.Stop();
                if (!_closed && !_busy)
                {
                    CloseWithResponse("auto");
                }
            };
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

            if (_autoDismissTimer != null && !_closed)
            {
                _autoDismissTimer.Start();
            }
        };

        Closed += (_, _) =>
        {
            _okDelayTimer?.Stop();
            _autoDismissTimer?.Stop();
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
        if (response != "auto" && _replyField != null)
        {
            var trimmed = _replyField.Text.Trim();
            ReplyText = trimmed.Length > 0 ? trimmed : null;
        }
        else
        {
            ReplyText = null;
        }
        _okDelayTimer?.Stop();
        _autoDismissTimer?.Stop();
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
