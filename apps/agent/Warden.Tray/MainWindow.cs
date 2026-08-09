using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Warden.Core;
using Warden.Core.Services;
using Brush = System.Windows.Media.Brush;
using FontFamily = System.Windows.Media.FontFamily;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using MessageBox = System.Windows.MessageBox;
using Orientation = System.Windows.Controls.Orientation;
using WpfButton = System.Windows.Controls.Button;
using WpfTextBox = System.Windows.Controls.TextBox;

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
    private readonly WpfButton _requestToggleBtn;
    private readonly StackPanel _requestPanel;
    private readonly IReadOnlyList<WpfButton> _presetButtons;
    private readonly WpfTextBox _customMinutesBox;
    private readonly WpfButton _customSendBtn;
    private readonly TextBlock _requestStatusLine;
    private readonly TextBlock _requestValidationLine;
    private bool _allowClose;
    private bool _requestExpanded;
    private bool _requestBusy;
    private double _remainingFraction = 1;

    private const int ExtensionMinMinutes = 1;
    private const int ExtensionMaxMinutes = 120;
    private static readonly int[] ExtensionPresets = [15, 30, 60];

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

        var requestSection = new StackPanel { Margin = new Thickness(0, 0, 0, 12) };

        _requestToggleBtn = UiTheme.GoldButton("Request");
        _requestToggleBtn.Margin = new Thickness(0, 0, 0, 0);
        _requestToggleBtn.Click += (_, _) => ToggleRequestPanel();
        requestSection.Children.Add(_requestToggleBtn);

        _requestPanel = new StackPanel
        {
            Margin = new Thickness(0, 10, 0, 0),
            Visibility = Visibility.Collapsed
        };

        var presetRow = new Grid();
        for (var i = 0; i < ExtensionPresets.Length; i++)
        {
            presetRow.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
            );
        }

        var presetButtons = new List<WpfButton>();
        for (var i = 0; i < ExtensionPresets.Length; i++)
        {
            var minutes = ExtensionPresets[i];
            var presetBtn = UiTheme.SecondaryButton($"+{minutes} mins");
            presetBtn.Margin = new Thickness(i == 0 ? 0 : 8, 0, 0, 0);
            var requestedMinutes = minutes;
            presetBtn.Click += async (_, _) => await SendExtensionRequestAsync(requestedMinutes);
            Grid.SetColumn(presetBtn, i);
            presetRow.Children.Add(presetBtn);
            presetButtons.Add(presetBtn);
        }

        _presetButtons = presetButtons;
        _requestPanel.Children.Add(presetRow);

        _requestStatusLine = new TextBlock
        {
            FontSize = 12,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(0, 10, 0, 0),
            TextWrapping = TextWrapping.Wrap
        };

        _requestValidationLine = new TextBlock
        {
            FontSize = 12,
            Foreground = UiTheme.DangerBrush,
            Margin = new Thickness(0, 4, 0, 0),
            TextWrapping = TextWrapping.Wrap
        };

        var customRow = new Grid { Margin = new Thickness(0, 10, 0, 0) };
        customRow.ColumnDefinitions.Add(
            new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
        );
        customRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
        customRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        _customMinutesBox = UiTheme.TextField(placeholder: "Minutes (1–120)");
        _customMinutesBox.MaxLength = 3;
        _customMinutesBox.TextAlignment = TextAlignment.Center;
        _customMinutesBox.PreviewTextInput += OnDigitsOnlyPreviewTextInput;
        System.Windows.DataObject.AddPastingHandler(_customMinutesBox, OnDigitsOnlyPaste);
        _customMinutesBox.TextChanged += (_, _) => _requestValidationLine.Text = "";
        Grid.SetColumn(_customMinutesBox, 0);
        customRow.Children.Add(_customMinutesBox);

        _customSendBtn = UiTheme.PrimaryButton("Send");
        _customSendBtn.Padding = new Thickness(16, 10, 16, 10);
        _customSendBtn.Click += async (_, _) => await SendCustomExtensionRequestAsync();
        Grid.SetColumn(_customSendBtn, 2);
        customRow.Children.Add(_customSendBtn);

        _requestPanel.Children.Add(customRow);
        _requestPanel.Children.Add(_requestStatusLine);
        _requestPanel.Children.Add(_requestValidationLine);

        requestSection.Children.Add(_requestPanel);
        root.Children.Add(requestSection);

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

        UiTheme.WithCustomTitleBar(this, root, "Warden");

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
                // BeginInvoke avoids deadlock with lock-UI / attention windows on this dispatcher.
                Dispatcher.BeginInvoke(RefreshStatus);
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
        string usageLabel;

        var remainingSeconds = _engine.GetRemainingSeconds();
        var extensionOutsideWindow = _engine.TryGetOutsideExtensionUsage(
            out var extensionUsedMinutes,
            out var extensionLimitMinutes
        );

        if (extensionOutsideWindow)
        {
            usedMinutes = extensionUsedMinutes;
            limitMinutes = extensionLimitMinutes;
            usageLabel = $"{usedMinutes} / {limitMinutes} min extension";
        }
        else
        {
            usedMinutes = eval.UsedMinutes;
            limitMinutes = Math.Max(1, eval.DailyLimitMinutes + eval.BonusMinutes);
            usageLabel = $"{usedMinutes} / {limitMinutes} min used";
        }

        var limitSeconds = Math.Max(1, limitMinutes) * 60.0;

        _remainingFraction = Math.Clamp(remainingSeconds / limitSeconds, 0, 1);
        SetTimerDisplay(remainingSeconds);

        if (remainingSeconds <= 0)
        {
            _usageDetail.Text = extensionOutsideWindow
                ? $"{usedMinutes} / {limitMinutes} min extension · time is up"
                : $"{usedMinutes} / {limitMinutes} min used · time is up";
            _usageFill.Background = UiTheme.DangerFillBrush;
            _remainingFraction = 0;
        }
        else
        {
            _usageDetail.Text = usageLabel;
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

    private void ToggleRequestPanel()
    {
        if (_requestBusy) return;

        _requestExpanded = !_requestExpanded;
        _requestPanel.Visibility = _requestExpanded ? Visibility.Visible : Visibility.Collapsed;
        if (!_requestExpanded)
        {
            _requestStatusLine.Text = "";
            _requestValidationLine.Text = "";
            _customMinutesBox.Text = "";
        }
    }

    private async Task SendCustomExtensionRequestAsync()
    {
        if (_requestBusy) return;

        var raw = _customMinutesBox.Text.Trim();
        if (string.IsNullOrEmpty(raw))
        {
            _requestValidationLine.Text = "Enter minutes (1–120).";
            return;
        }

        if (!int.TryParse(raw, out var minutes)
            || minutes < ExtensionMinMinutes
            || minutes > ExtensionMaxMinutes)
        {
            _requestValidationLine.Text = $"Enter {ExtensionMinMinutes}–{ExtensionMaxMinutes} minutes.";
            return;
        }

        _requestValidationLine.Text = "";
        await SendExtensionRequestAsync(minutes);
    }

    private async Task SendExtensionRequestAsync(int minutes)
    {
        if (_requestBusy) return;

        _requestBusy = true;
        SetRequestControlsEnabled(false);
        _requestStatusLine.Text = "Requesting…";
        _requestValidationLine.Text = "";

        var success = false;
        try
        {
            success = await _engine.RequestExtensionAsync(minutes);
        }
        catch
        {
            success = false;
        }

        if (!IsLoaded)
        {
            return;
        }

        if (success)
        {
            _requestStatusLine.Text = "Request sent!";
            await Task.Delay(1000);
            if (!IsLoaded)
            {
                return;
            }

            _requestExpanded = false;
            _requestPanel.Visibility = Visibility.Collapsed;
            _requestStatusLine.Text = "";
            _customMinutesBox.Text = "";
        }
        else
        {
            _requestStatusLine.Text = "Couldn't send — try again";
        }

        _requestBusy = false;
        SetRequestControlsEnabled(true);
    }

    private void SetRequestControlsEnabled(bool enabled)
    {
        _requestToggleBtn.IsEnabled = enabled;
        foreach (var btn in _presetButtons)
        {
            btn.IsEnabled = enabled;
        }

        _customMinutesBox.IsEnabled = enabled;
        _customSendBtn.IsEnabled = enabled;
    }

    private static void OnDigitsOnlyPreviewTextInput(object sender, TextCompositionEventArgs e)
    {
        e.Handled = e.Text.Length == 0 || e.Text.Any(c => !char.IsDigit(c));
    }

    private static void OnDigitsOnlyPaste(object sender, DataObjectPastingEventArgs e)
    {
        if (!e.DataObject.GetDataPresent(typeof(string)))
        {
            e.CancelCommand();
            return;
        }

        var text = e.DataObject.GetData(typeof(string)) as string ?? "";
        if (text.Length == 0 || text.Any(c => !char.IsDigit(c)))
        {
            e.CancelCommand();
        }
    }
}
