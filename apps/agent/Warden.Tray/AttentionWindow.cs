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

    public string? Response { get; private set; }

    public AttentionWindow(string title, string message, int okDelaySeconds)
    {
        Title = "Warden";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Topmost = true;
        AllowsTransparency = true;
        Background = System.Windows.Media.Brushes.Transparent;
        Width = 420;
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

        var buttons = new StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Horizontal,
            HorizontalAlignment = WpfHorizontalAlignment.Right
        };

        var delay = Math.Max(0, okDelaySeconds);
        var ok = UiTheme.PrimaryButton(delay > 0 ? $"OK ({delay})" : "OK");
        ok.HorizontalAlignment = WpfHorizontalAlignment.Left;
        ok.MinWidth = 100;
        ok.Click += (_, _) => CloseWithOk();

        if (delay > 0)
        {
            SetOkDelayed(ok, enabled: false);
            var remaining = delay;
            _okDelayTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _okDelayTimer.Tick += (_, _) =>
            {
                remaining--;
                if (remaining <= 0)
                {
                    _okDelayTimer.Stop();
                    ok.Content = "OK";
                    SetOkDelayed(ok, enabled: true);
                }
                else
                {
                    ok.Content = $"OK ({remaining})";
                }
            };
            _okDelayTimer.Start();
        }

        buttons.Children.Add(ok);
        stack.Children.Add(buttons);
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

    private static void SetOkDelayed(WpfButton ok, bool enabled)
    {
        ok.IsEnabled = enabled;
        if (enabled)
        {
            ok.Opacity = 1;
            ok.Background = UiTheme.AccentBrush;
            ok.Foreground = UiTheme.TextBrush;
            ok.Cursor = System.Windows.Input.Cursors.Hand;
        }
        else
        {
            ok.Opacity = 0.55;
            ok.Background = UiTheme.BorderBrush;
            ok.Foreground = UiTheme.MutedBrush;
            ok.Cursor = System.Windows.Input.Cursors.Arrow;
        }
    }

    private void CloseWithOk()
    {
        if (_closed) return;
        Response = "ok";
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
