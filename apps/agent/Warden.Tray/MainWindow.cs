using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Warden.Core;
using Warden.Core.Services;
using Brush = System.Windows.Media.Brush;
using FontFamily = System.Windows.Media.FontFamily;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using MessageBox = System.Windows.MessageBox;
using Orientation = System.Windows.Controls.Orientation;

namespace Warden.Tray;

public class MainWindow : Window
{
    private readonly EnforcementEngine _engine;
    private readonly ConfigStore _configStore;
    private readonly Func<string, (bool ok, string? error)> _tryExitWithPin;
    private readonly TextBlock _childLabel;
    private readonly TextBlock _statusValue;
    private readonly TextBlock _timerHours;
    private readonly TextBlock _timerMinutes;
    private readonly TextBlock _timerSeconds;
    private readonly TextBlock _usageDetail;
    private readonly Border _usageFill;
    private readonly Border _usageCard;
    private readonly DispatcherTimer _uiTimer;
    private bool _allowClose;
    private double _remainingFraction = 1;

    public MainWindow(
        EnforcementEngine engine,
        ConfigStore configStore,
        Func<string, (bool ok, string? error)> tryExitWithPin)
    {
        _engine = engine;
        _configStore = configStore;
        _tryExitWithPin = tryExitWithPin;

        Title = "Warden";
        Width = 420;
        SizeToContent = SizeToContent.Height;
        UiTheme.ApplyWindowChrome(this);

        var root = new StackPanel { Margin = new Thickness(24) };

        var header = new StackPanel { Margin = new Thickness(0, 0, 0, 20) };
        header.Children.Add(
            new TextBlock
            {
                Text = "Warden",
                FontSize = 28,
                FontWeight = FontWeights.Bold,
                Foreground = UiTheme.TextBrush
            }
        );
        _childLabel = new TextBlock
        {
            FontSize = 14,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(0, 4, 0, 0)
        };
        header.Children.Add(_childLabel);
        root.Children.Add(header);

        var statusRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            VerticalAlignment = VerticalAlignment.Center
        };
        statusRow.Children.Add(
            new TextBlock
            {
                Text = "Status",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = UiTheme.TextBrush,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 10, 0)
            }
        );
        _statusValue = new TextBlock
        {
            FontSize = 16,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.SuccessBrush,
            VerticalAlignment = VerticalAlignment.Center
        };
        statusRow.Children.Add(_statusValue);
        var statusCard = UiTheme.CardPanel(statusRow);
        statusCard.Padding = new Thickness(16, 12, 16, 12);
        root.Children.Add(statusCard);

        _usageCard = new Border
        {
            Background = UiTheme.CardBrush,
            BorderBrush = UiTheme.BorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(UiTheme.CardRadius),
            Margin = new Thickness(0, 0, 0, 12),
            MinHeight = 130
        };

        var usageGrid = new Grid();
        var radius = UiTheme.CardRadius;
        _usageFill = new Border
        {
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Stretch,
            Background = UiTheme.AccentFillBrush,
            CornerRadius = new CornerRadius(radius, 0, 0, radius),
            Width = 0
        };
        usageGrid.Children.Add(_usageFill);

        var usageContentPanel = new StackPanel
        {
            Margin = new Thickness(16, 18, 16, 14),
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        };

        usageContentPanel.Children.Add(
            new TextBlock
            {
                Text = "Time remaining",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = UiTheme.MutedBrush,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 8)
            }
        );

        var timerRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        _timerHours = CreateTimerDigit("00");
        _timerMinutes = CreateTimerDigit("00");
        _timerSeconds = CreateTimerDigit("00");
        timerRow.Children.Add(_timerHours);
        timerRow.Children.Add(CreateTimerColon());
        timerRow.Children.Add(_timerMinutes);
        timerRow.Children.Add(CreateTimerColon());
        timerRow.Children.Add(_timerSeconds);
        usageContentPanel.Children.Add(timerRow);

        _usageDetail = new TextBlock
        {
            FontSize = 12,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(0, 10, 0, 0),
            HorizontalAlignment = HorizontalAlignment.Center
        };
        usageContentPanel.Children.Add(_usageDetail);
        usageGrid.Children.Add(usageContentPanel);

        _usageCard.Child = usageGrid;
        _usageCard.SizeChanged += (_, _) =>
        {
            UpdateUsageCardClip();
            UpdateUsageFillWidth();
        };
        root.Children.Add(_usageCard);

        var exitBtn = UiTheme.DangerButton("PARENT");
        exitBtn.Content = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center,
            Children =
            {
                new TextBlock
                {
                    Text = "\uE72E",
                    FontFamily = new FontFamily("Segoe MDL2 Assets"),
                    FontSize = 15,
                    Foreground = UiTheme.TextBrush,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 8, 0)
                },
                new TextBlock
                {
                    Text = "PARENT",
                    FontSize = 14,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = UiTheme.TextBrush,
                    VerticalAlignment = VerticalAlignment.Center
                }
            }
        };
        exitBtn.Margin = new Thickness(0, 4, 0, 0);
        exitBtn.Click += (_, _) => RequestExit();
        root.Children.Add(exitBtn);

        var versionLabel = new TextBlock
        {
            Text = $"Made by JRAG v{AgentVersionInfo.Current}",
            FontSize = 11,
            Foreground = UiTheme.MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 16, 0, 0)
        };
        root.Children.Add(versionLabel);

        Content = root;

        Closing += (_, e) =>
        {
            if (_allowClose) return;
            e.Cancel = true;
            Hide();
        };

        _engine.PolicyChanged += _ =>
        {
            try
            {
                Dispatcher.Invoke(RefreshStatus);
            }
            catch
            {
                // Window may be closing.
            }
        };

        _uiTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _uiTimer.Tick += (_, _) => RefreshStatus();
        Loaded += (_, _) =>
        {
            RefreshStatus();
            _uiTimer.Start();
        };
        Closed += (_, _) => _uiTimer.Stop();
    }

    public void ShowFromTray()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    public void AllowCloseAndShutdown()
    {
        _allowClose = true;
        _uiTimer.Stop();
        Close();
    }

    private void RefreshStatus()
    {
        var config = _configStore.Load();
        _childLabel.Text = string.IsNullOrEmpty(config.ChildName)
            ? "Device agent"
            : $"Watching {config.ChildName}";

        string status;
        Brush statusBrush;
        if (_engine.IsAdminLocked)
        {
            status = "Locked down by parent";
            statusBrush = UiTheme.DangerBrush;
        }
        else if (_engine.IsLocked)
        {
            status = "Screen locked";
            statusBrush = UiTheme.DangerBrush;
        }
        else
        {
            status = "Running";
            statusBrush = UiTheme.SuccessBrush;
        }

        _statusValue.Text = status;
        _statusValue.Foreground = statusBrush;

        var eval = _engine.CurrentEvaluation;
        if (eval == null)
        {
            _statusValue.Text = "Syncing";
            _statusValue.Foreground = UiTheme.MutedBrush;
            _usageDetail.Text = "Syncing policy from dashboard...";
            _remainingFraction = 0;
            _usageFill.Background = UiTheme.AccentFillBrush;
            SetTimerDisplay(0);
            UpdateUsageFillWidth();
            return;
        }

        int usedMinutes;
        int limitMinutes;

        usedMinutes = eval.UsedMinutes;
        limitMinutes = Math.Max(1, eval.DailyLimitMinutes + eval.BonusMinutes);

        var limitSeconds = Math.Max(1, limitMinutes) * 60.0;
        var remainingSeconds = Math.Max(
            0,
            (int)Math.Floor(limitSeconds - _engine.UsedSecondsToday)
        );

        if (_engine.IsLocked || _engine.IsAdminLocked)
            remainingSeconds = 0;

        _remainingFraction = Math.Clamp(remainingSeconds / limitSeconds, 0, 1);
        SetTimerDisplay(remainingSeconds);

        if (remainingSeconds <= 0)
        {
            _usageDetail.Text = $"{usedMinutes} / {limitMinutes} min used · time is up";
            _usageFill.Background = UiTheme.DangerFillBrush;
            _remainingFraction = 0;
        }
        else
        {
            _usageDetail.Text = $"{usedMinutes} / {limitMinutes} min used";
            _usageFill.Background =
                _remainingFraction <= 0.2 ? UiTheme.DangerFillBrush : UiTheme.AccentFillBrush;
        }

        UpdateUsageFillWidth();
    }

    private static TextBlock CreateTimerDigit(string text) =>
        new()
        {
            Text = text,
            FontSize = 48,
            FontWeight = FontWeights.Bold,
            Foreground = UiTheme.TextBrush,
            FontFamily = new FontFamily("Segoe UI"),
            VerticalAlignment = VerticalAlignment.Center
        };

    private static TextBlock CreateTimerColon() =>
        new()
        {
            Text = ":",
            FontSize = 42,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(8, 0, 8, 2),
            VerticalAlignment = VerticalAlignment.Center
        };

    private void SetTimerDisplay(int totalSeconds)
    {
        var hours = totalSeconds / 3600;
        var minutes = totalSeconds % 3600 / 60;
        var seconds = totalSeconds % 60;
        _timerHours.Text = hours.ToString("D2");
        _timerMinutes.Text = minutes.ToString("D2");
        _timerSeconds.Text = seconds.ToString("D2");
    }

    private void UpdateUsageCardClip()
    {
        // ClipToBounds ignores CornerRadius in WPF — clip to a rounded rect instead.
        var w = _usageCard.ActualWidth;
        var h = _usageCard.ActualHeight;
        if (w <= 0 || h <= 0) return;

        var radius = UiTheme.CardRadius;
        _usageCard.Clip = new RectangleGeometry(new Rect(0, 0, w, h), radius, radius);
    }

    private void UpdateUsageFillWidth()
    {
        var width = _usageCard.ActualWidth;
        if (width <= 0) return;

        var fillWidth = width * _remainingFraction;
        _usageFill.Width = fillWidth;

        var radius = UiTheme.CardRadius;
        // When nearly full, also round the trailing edge to match the card.
        _usageFill.CornerRadius =
            fillWidth >= width - 1
                ? new CornerRadius(radius)
                : new CornerRadius(radius, 0, 0, radius);
    }

    private void RequestExit()
    {
        var pinWindow = new PinWindow { Owner = this };
        if (pinWindow.ShowDialog() != true) return;

        var (ok, error) = _tryExitWithPin(pinWindow.Pin);
        if (!ok)
        {
            MessageBox.Show(
                error ?? "Incorrect PIN.",
                "Warden",
                MessageBoxButton.OK,
                MessageBoxImage.Warning
            );
        }
    }
}
