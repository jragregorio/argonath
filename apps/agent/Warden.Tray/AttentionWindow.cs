using System.Media;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Warden.LockUI;
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

    /// <summary>Transparent room around the card so particles can fly outside it.</summary>
    private const double ParticleMargin = 60;

    private readonly AttentionStyle _style;
    private readonly int? _thresholdMinutes;
    private readonly string _message;
    private readonly Canvas _particleLayer;
    private readonly Border _card;
    private readonly Border _icon;
    private readonly TextBlock _iconGlyph;
    private readonly TextBlock _messageText;
    private readonly Grid _messageHost;
    private readonly List<(WpfButton Button, bool Primary)> _delayedButtons;
    private readonly WpfButton _ok;
    private System.Windows.Media.Animation.Storyboard? _typing;
    private FrameworkElement? _typingDots;

    public string? Response { get; private set; }

    /// <summary>Skip the chime (dev preview snapshots only).</summary>
    internal bool Quiet { get; set; }

    /// <summary>Captured on the UI thread at close. Safe to read after Close().</summary>
    public string? ReplyText { get; private set; }

    public AttentionWindow(
        string title,
        string message,
        int okDelaySeconds,
        IReadOnlyList<int>? extensionMinutes = null,
        Func<int, Task<bool>>? onExtensionRequest = null,
        bool enableNudgeReply = false,
        int autoDismissSeconds = 0,
        int? thresholdMinutes = null
    )
    {
        _thresholdMinutes = thresholdMinutes;
        _message = string.IsNullOrWhiteSpace(message) ? "Your parent wants your attention" : message;
        Title = "Warden";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Topmost = true;
        AllowsTransparency = true;
        Background = System.Windows.Media.Brushes.Transparent;
        var cardWidth = extensionMinutes is { Count: > 0 } ? 480 : 420;
        Width = cardWidth + 2 * ParticleMargin;
        SizeToContent = SizeToContent.Height;

        // The card keeps its usual spot (top centre, 48 px down); the window is bigger
        // by an invisible, click-through margin so particles are not clipped.
        var screen = System.Windows.Forms.Screen.PrimaryScreen
            ?? System.Windows.Forms.Screen.AllScreens.First();
        Left = screen.WorkingArea.Left + (screen.WorkingArea.Width - Width) / 2;
        Top = screen.WorkingArea.Top + 48 - ParticleMargin;

        FontFamily = UiTheme.BodyFont;
        var style = AttentionStyle.For(title);
        _style = style;
        var tone = ToneBrush(style.Tone);

        var card = new Border
        {
            Background = UiTheme.CardBrush,
            BorderBrush = new SolidColorBrush(
                System.Windows.Media.Color.FromArgb(140, tone.Color.R, tone.Color.G, tone.Color.B)
            ),
            BorderThickness = new Thickness(3),
            CornerRadius = new CornerRadius(UiTheme.BlockyCardRadius),
            Padding = new Thickness(24, 22, 24, 20),
            Margin = new Thickness(ParticleMargin),
            // Hard "block" shadow straight down, no blur.
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                BlurRadius = 0,
                ShadowDepth = 6,
                Direction = 270,
                Opacity = 0.45,
                Color = Colors.Black
            }
        };
        _card = card;

        var stack = new StackPanel();

        var header = new StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Horizontal,
            Margin = new Thickness(0, 0, 0, 14)
        };
        _iconGlyph = new TextBlock
        {
            Text = style.Glyph,
            FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
            FontSize = 17,
            Foreground = UiTheme.AccentOnBrush,
            HorizontalAlignment = WpfHorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
        _icon = new Border
        {
            Width = 38,
            Height = 38,
            CornerRadius = new CornerRadius(UiTheme.BlockyIconRadius),
            Background = tone,
            Child = _iconGlyph
        };
        header.Children.Add(_icon);
        header.Children.Add(
            new TextBlock
            {
                Text = style.Label,
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = tone,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 0, 0)
            }
        );
        stack.Children.Add(header);

        _messageText = new TextBlock
        {
            Text = _message,
            FontSize = 19,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.TextBrush,
            TextWrapping = TextWrapping.Wrap
        };
        _messageHost = new Grid { Margin = new Thickness(0, 0, 0, 20) };
        _messageHost.Children.Add(_messageText);
        stack.Children.Add(_messageHost);

        var hasExtensionButtons =
            extensionMinutes is { Count: > 0 } && onExtensionRequest != null;

        var buttonArea = new StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Vertical
        };

        var delay = Math.Max(0, okDelaySeconds);
        var delayedButtons = new List<(WpfButton Button, bool Primary)>();
        _delayedButtons = delayedButtons;

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
                var btn = UiTheme.SecondaryButton(label, UiTheme.BlockyButtonRadius);
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

        var ok = UiTheme.PrimaryButton(delay > 0 ? $"OK ({delay})" : "OK", UiTheme.BlockyButtonRadius);
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
        _ok = ok;

        // OK sits on top of a fill bar: with animations on, the bar fills during the wait
        // (the waiting button is see-through) instead of an "OK (N)" countdown.
        var useFill = delay > 0 && BlockyMotion.Enabled;
        var okFill = new Border
        {
            Background = new SolidColorBrush(
                System.Windows.Media.Color.FromArgb(140, UiTheme.Accent.R, UiTheme.Accent.G, UiTheme.Accent.B)
            ),
            CornerRadius = new CornerRadius(UiTheme.BlockyButtonRadius),
            HorizontalAlignment = WpfHorizontalAlignment.Stretch,
            IsHitTestVisible = false,
            Visibility = useFill ? Visibility.Visible : Visibility.Collapsed
        };
        var okHost = new Grid();
        okHost.Children.Add(okFill);
        okHost.Children.Add(ok);
        if (useFill)
        {
            ok.Content = "OK";
        }

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

            var onMyWay = UiTheme.SecondaryButton("On my way", UiTheme.BlockyButtonRadius);
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

            var needFew = UiTheme.SecondaryButton("Need a few min", UiTheme.BlockyButtonRadius);
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

            var replyToggle = UiTheme.SecondaryButton("Reply", UiTheme.BlockyButtonRadius);
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

                SkipTyping();
                expandPanel.Visibility = Visibility.Visible;
                replyToggle.Visibility = Visibility.Collapsed;
                Grid.SetColumn(okHost, 0);
                Grid.SetColumnSpan(okHost, 2);
                okHost.Margin = new Thickness(0);
                _replyField.Focus();
            };

            delayedButtons.Add((replyToggle, Primary: false));
            Grid.SetColumn(replyToggle, 0);
            Grid.SetColumn(okHost, 1);
            compactRow.Children.Add(replyToggle);
            compactRow.Children.Add(okHost);
            buttonArea.Children.Add(compactRow);
        }
        else
        {
            buttonArea.Children.Add(okHost);
        }

        if (delay > 0)
        {
            foreach (var (btn, primary) in delayedButtons)
            {
                SetButtonDelayed(btn, enabled: false, primary);
            }
        }

        if (useFill)
        {
            okHost.Loaded += (_, _) =>
                BlockyMotion.Fill(okFill, TimeSpan.FromSeconds(delay), () =>
                {
                    okFill.Visibility = Visibility.Collapsed;
                    if (_closed || _busy) return;
                    foreach (var (btn, primary) in delayedButtons)
                    {
                        SetButtonDelayed(btn, enabled: true, primary);
                    }
                });
        }
        else if (delay > 0)
        {
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

        // Null background: the margin around the card lets clicks through.
        var root = new Grid { Background = null };
        root.Children.Add(card);
        _particleLayer = new Canvas { IsHitTestVisible = false };
        root.Children.Add(_particleLayer);
        Content = root;

        Loaded += (_, _) =>
        {
            try
            {
                if (!Quiet) SystemSounds.Asterisk.Play();
            }
            catch
            {
                // Sound is best-effort.
            }

            if (_autoDismissTimer != null && !_closed)
            {
                _autoDismissTimer.Start();
            }

            StartMotion();
        };

        Closed += (_, _) =>
        {
            BlockyMotion.StopAll(this);
            _okDelayTimer?.Stop();
            _autoDismissTimer?.Stop();
            _closed = true;
        };
    }

    /// <summary>Plays this popup's "smooth Blocky" entrance (nothing when Windows animations are off).</summary>
    private void StartMotion()
    {
        switch (_style.Motion)
        {
            case AttentionMotion.Nudge:
                BlockyMotion.DropIn(_card);
                StartNudgeMotion();
                break;
            case AttentionMotion.TimeCheck:
                BlockyMotion.DropIn(_card);
                break;
        }
    }

    /// <summary>Nudge: hopping "typing" dots, then the message types itself out, then the icon pops.</summary>
    private void StartNudgeMotion()
    {
        if (!BlockyMotion.Enabled) return;

        // Keep the card from changing height while the text types in.
        _messageHost.MinHeight = _messageText.ActualHeight;

        var dotsPanel = new StackPanel { Orientation = System.Windows.Controls.Orientation.Horizontal };
        var dots = new List<System.Windows.Shapes.Rectangle>();
        for (var i = 0; i < 3; i++)
        {
            var dot = new System.Windows.Shapes.Rectangle
            {
                Width = 6,
                Height = 6,
                Fill = UiTheme.AccentBrush,
                Margin = new Thickness(i == 0 ? 0 : 5, 0, 0, 0)
            };
            dots.Add(dot);
            dotsPanel.Children.Add(dot);
        }

        var chip = new Border
        {
            Background = UiTheme.TrackBrush,
            CornerRadius = new CornerRadius(UiTheme.BlockyButtonRadius),
            Padding = new Thickness(8, 7, 8, 5),
            HorizontalAlignment = WpfHorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Top,
            IsHitTestVisible = false,
            Opacity = 0,
            Child = dotsPanel
        };
        _messageHost.Children.Add(chip);
        _typingDots = chip;

        var typingStart = TimeSpan.FromMilliseconds(2050);
        var fade = new System.Windows.Media.Animation.DoubleAnimationUsingKeyFrames();
        foreach (var (ms, value) in new[] { (0.0, 0.0), (550, 0), (700, 1), (1900, 1), (2050, 0) })
        {
            fade.KeyFrames.Add(new System.Windows.Media.Animation.LinearDoubleKeyFrame(value, System.Windows.Media.Animation.KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(ms))));
        }

        chip.BeginAnimation(OpacityProperty, fade);
        for (var i = 0; i < dots.Count; i++)
        {
            BlockyMotion.Loop(dots[i], LoopKind.Hop, TimeSpan.FromMilliseconds(150 * i));
        }

        var frames = Warden.Core.Theming.BlockyTimeline.TypingFrames(_message, typingStart);
        _typing = BlockyMotion.PlayText(_messageText, frames, _message);
        if (frames.Count > 0)
        {
            BlockyMotion.Bump(_icon, frames[^1].At, peak: 1.35, tiltDeg: -8);
        }
    }

    /// <summary>Shows the whole nudge message at once (Reply, OK, or any answer while typing).</summary>
    internal void SkipTyping()
    {
        if (_typing == null && _typingDots == null) return;
        BlockyMotion.Finish(_typing, _messageText, () =>
        {
            if (_typingDots != null)
            {
                _typingDots.BeginAnimation(OpacityProperty, null);
                _typingDots.Visibility = Visibility.Collapsed;
            }

            _messageText.Text = _message;
        });
        _typing = null;
        _typingDots = null;
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
            // Waiting for the countdown: a soft version of the child's colour, not flat grey.
            btn.Opacity = 1;
            if (primary)
            {
                btn.Background = UiTheme.AccentFillBrush;
                btn.Foreground = UiTheme.TextBrush;
                btn.BorderThickness = new Thickness(0);
            }
            else
            {
                btn.Background = UiTheme.CardBrush;
                btn.Foreground = UiTheme.MutedBrush;
                btn.BorderBrush = UiTheme.BorderBrush;
                btn.BorderThickness = new Thickness(1);
            }

            btn.Cursor = System.Windows.Input.Cursors.Arrow;
        }
    }

    private static SolidColorBrush ToneBrush(AttentionTone tone) =>
        tone switch
        {
            AttentionTone.HeadsUp => UiTheme.HeadsUpBrush,
            AttentionTone.Alert => UiTheme.AlmostDoneBrush,
            _ => UiTheme.AccentBrush
        };

    private void CloseWithResponse(string response)
    {
        if (_closed) return;
        SkipTyping();
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
