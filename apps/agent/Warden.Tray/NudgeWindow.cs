using System.Media;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using WpfHorizontalAlignment = System.Windows.HorizontalAlignment;

namespace Warden.Tray;

/// <summary>
/// Phase 1 gentle nudge: topmost card, soft sound, OK / On my way, auto-dismiss.
/// Does not block input outside the window (unlike lockdown).
/// </summary>
public sealed class NudgeWindow : Window
{
    private readonly DispatcherTimer _autoDismissTimer;
    private bool _closed;

    public string NudgeId { get; }
    public string? Response { get; private set; }
    public bool Expired { get; private set; }

    public NudgeWindow(string nudgeId, string message, int autoDismissSeconds)
    {
        NudgeId = nudgeId;

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
                Text = "Parent nudge",
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

        var onMyWay = UiTheme.SecondaryButton("On my way");
        onMyWay.HorizontalAlignment = WpfHorizontalAlignment.Left;
        onMyWay.Margin = new Thickness(0, 0, 10, 0);
        onMyWay.MinWidth = 110;
        onMyWay.Click += (_, _) => CloseWith("on_my_way");

        var ok = UiTheme.PrimaryButton("OK");
        ok.HorizontalAlignment = WpfHorizontalAlignment.Left;
        ok.MinWidth = 88;
        ok.Click += (_, _) => CloseWith("ok");

        buttons.Children.Add(onMyWay);
        buttons.Children.Add(ok);
        stack.Children.Add(buttons);
        card.Child = stack;
        Content = card;

        var seconds = Math.Clamp(autoDismissSeconds, 5, 120);
        _autoDismissTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(seconds)
        };
        _autoDismissTimer.Tick += (_, _) =>
        {
            Expired = true;
            CloseQuietly();
        };
        _autoDismissTimer.Start();

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
            _autoDismissTimer.Stop();
            _closed = true;
        };
    }

    private void CloseWith(string response)
    {
        if (_closed) return;
        Response = response;
        Expired = false;
        CloseQuietly();
    }

    private void CloseQuietly()
    {
        if (_closed) return;
        _autoDismissTimer.Stop();
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
