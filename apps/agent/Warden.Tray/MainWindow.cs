using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using Warden.Core;
using Warden.Core.Models;
using Warden.Core.Services;
using Warden.Core.Theming;
using Brush = System.Windows.Media.Brush;
using Brushes = System.Windows.Media.Brushes;
using Color = System.Windows.Media.Color;
using Cursors = System.Windows.Input.Cursors;
using FontFamily = System.Windows.Media.FontFamily;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using MessageBox = System.Windows.MessageBox;
using Orientation = System.Windows.Controls.Orientation;
using Path = System.Windows.Shapes.Path;
using Point = System.Windows.Point;
using Size = System.Windows.Size;
using WpfButton = System.Windows.Controls.Button;
using WpfTextBox = System.Windows.Controls.TextBox;

namespace Warden.Tray;

/// <summary>
/// The child's tray window ("Option B — Playful"): greeting, time-left ring,
/// ask for more time, quick messages and a colour picker that re-themes the app.
/// </summary>
public class MainWindow : Window
{
    private readonly EnforcementEngine _engine;
    private readonly ConfigStore _configStore;
    private readonly UiPreferencesStore _uiPrefs = new();
    private readonly Func<string, (bool ok, string? error)> _tryExitWithPin;
    private readonly DispatcherTimer _uiTimer;
    private readonly DispatcherTimer _updateStatusTimer;

    // Rebuilt whenever the colour changes (see BuildBody).
    private UpdateBanner _updateBanner = null!;
    private TextBlock _greeting = null!;
    private TextBlock _moodLine = null!;
    private Ellipse _ringFull = null!;
    private Path _ringArc = null!;
    private TextBlock _timeBig = null!;
    private TextBlock _usedText = null!;
    private TextBlock _usedOf = null!;
    private Border _pill = null!;
    private TextBlock _pillText = null!;
    private WpfButton _askButton = null!;
    private Grid _requestPanel = null!;
    private List<WpfButton> _presetButtons = [];
    private TextBlock _requestStatusLine = null!;
    private List<WpfButton> _messageTiles = [];
    private Grid _composeRow = null!;
    private WpfTextBox _messageBox = null!;
    private WpfButton _messageSendBtn = null!;
    private TextBlock _messageStatusLine = null!;
    private List<WpfButton> _colourButtons = [];

    private UpdatePhase _updatePhase = UpdatePhase.Idle;
    private DateTimeOffset? _updateStartedAt;
    private static readonly TimeSpan UpdateStatusPollLimit = TimeSpan.FromMinutes(20);
    private bool _allowClose;
    private bool _requestBusy;
    private bool _messageBusy;

    private const double RingSize = 150;
    private const double RingThickness = 18;

    private static readonly int[] ExtensionPresets = [15, 30, 60];

    private const int MessageMaxLength = 200;

    /// <summary>Quick-button key (stored server-side), caption and Segoe MDL2 glyph.</summary>
    private static readonly (string Key, string Caption, string Glyph)[] QuickMessages =
    [
        ("come_here", "Come here?", ""),
        ("done", "I'm done", ""),
        ("need_help", "Need help", "")
    ];

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

        _updateStatusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _updateStatusTimer.Tick += (_, _) => PollUpdateStatus();

        BuildBody();

        _engine.UpdateAvailabilityChanged += _ => Dispatcher.BeginInvoke(RefreshUpdateBanner);
        _engine.LockRequired += () => Dispatcher.BeginInvoke(RefreshUpdateBanner);
        _engine.UnlockRequired += () => Dispatcher.BeginInvoke(RefreshUpdateBanner);

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

    // ── Layout ────────────────────────────────────────────────────────────

    private void BuildBody()
    {
        Background = UiTheme.BgBrush;
        var root = new StackPanel { Margin = new Thickness(22, 10, 22, 16) };
        System.Windows.Documents.TextElement.SetFontFamily(root, UiTheme.BodyFont);

        _updateBanner = new UpdateBanner();
        _updateBanner.UpdateClicked += StartUpdate;
        root.Children.Add(_updateBanner);

        _greeting = new TextBlock
        {
            FontFamily = UiTheme.DisplayFont,
            FontSize = 28,
            FontWeight = FontWeights.Bold,
            Foreground = UiTheme.TextBrush,
            TextTrimming = TextTrimming.CharacterEllipsis
        };
        _moodLine = new TextBlock
        {
            FontSize = 15,
            FontWeight = FontWeights.Normal,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(0, 2, 0, 14),
            TextWrapping = TextWrapping.Wrap
        };
        root.Children.Add(_greeting);
        root.Children.Add(_moodLine);

        root.Children.Add(BuildTimeCard());

        _askButton = UiTheme.PrimaryButton("");
        _askButton.Content = IconLabel("", "Ask for more time", UiTheme.AccentOnBrush, 16, FontWeights.SemiBold);
        _askButton.Height = 52;
        _askButton.Padding = new Thickness(0);
        _askButton.Click += (_, _) => ToggleRequestPanel();
        root.Children.Add(_askButton);

        _requestPanel = new Grid { Margin = new Thickness(0, 10, 0, 0), Visibility = Visibility.Collapsed };
        _presetButtons = [];
        for (var i = 0; i < ExtensionPresets.Length; i++)
        {
            _requestPanel.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var minutes = ExtensionPresets[i];
            var btn = UiTheme.SecondaryButton($"+{minutes} min");
            btn.Background = Brushes.Transparent;
            btn.BorderBrush = UiTheme.AccentBrush;
            btn.BorderThickness = new Thickness(2);
            btn.FontSize = 15;
            btn.FontWeight = FontWeights.SemiBold;
            btn.Height = 46;
            btn.Padding = new Thickness(0);
            btn.Margin = new Thickness(i == 0 ? 0 : 8, 0, 0, 0);
            btn.Click += async (_, _) => await SendExtensionRequestAsync(minutes);
            Grid.SetColumn(btn, i);
            _requestPanel.Children.Add(btn);
            _presetButtons.Add(btn);
        }

        root.Children.Add(_requestPanel);

        _requestStatusLine = StatusLine();
        root.Children.Add(_requestStatusLine);

        root.Children.Add(new TextBlock
        {
            Text = "Quick message",
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(0, 14, 0, 8)
        });
        root.Children.Add(BuildMessageTiles());

        _composeRow = new Grid { Margin = new Thickness(0, 8, 0, 0), Visibility = Visibility.Collapsed };
        _composeRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        _composeRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
        _composeRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        _messageBox = UiTheme.TextField(placeholder: "Type a message…");
        _messageBox.MaxLength = MessageMaxLength;
        _messageBox.BorderBrush = UiTheme.AccentBrush;
        _messageBox.BorderThickness = new Thickness(2);
        _messageBox.Background = UiTheme.BgBrush;
        _messageBox.KeyDown += async (_, e) =>
        {
            if (e.Key == Key.Enter)
            {
                e.Handled = true;
                await SendTypedMessageAsync();
            }
        };
        _messageBox.TextChanged += (_, _) =>
        {
            if (!_messageBusy) _messageStatusLine.Text = "";
        };
        Grid.SetColumn(_messageBox, 0);
        _composeRow.Children.Add(_messageBox);

        _messageSendBtn = UiTheme.PrimaryButton("");
        _messageSendBtn.Content = Glyph("", UiTheme.AccentOnBrush, 16);
        _messageSendBtn.Width = 46;
        _messageSendBtn.Height = 46;
        _messageSendBtn.Padding = new Thickness(0);
        _messageSendBtn.ToolTip = "Send message";
        System.Windows.Automation.AutomationProperties.SetName(_messageSendBtn, "Send message");
        _messageSendBtn.Click += async (_, _) => await SendTypedMessageAsync();
        Grid.SetColumn(_messageSendBtn, 2);
        _composeRow.Children.Add(_messageSendBtn);
        root.Children.Add(_composeRow);

        _messageStatusLine = StatusLine();
        root.Children.Add(_messageStatusLine);

        root.Children.Add(BuildFooter());

        root.Children.Add(new TextBlock
        {
            Text = $"v{AgentVersionInfo.Current}",
            FontSize = 10,
            Foreground = UiTheme.MutedBrush,
            Opacity = 0.7,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 10, 0, 0)
        });

        UiTheme.WithCustomTitleBar(this, root, "Warden");
        RefreshUpdateBanner();
    }

    private Border BuildTimeCard()
    {
        var ring = new Grid { Width = RingSize, Height = RingSize };
        var inset = RingThickness / 2;
        ring.Children.Add(new Ellipse
        {
            Stroke = UiTheme.TrackBrush,
            StrokeThickness = RingThickness,
            Margin = new Thickness(0)
        });
        _ringFull = new Ellipse
        {
            StrokeThickness = RingThickness,
            Visibility = Visibility.Collapsed
        };
        ring.Children.Add(_ringFull);
        _ringArc = new Path
        {
            StrokeThickness = RingThickness,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Round
        };
        ring.Children.Add(_ringArc);

        var centre = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
        _timeBig = new TextBlock
        {
            FontFamily = UiTheme.DisplayFont,
            FontSize = 28,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.TextBrush,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        centre.Children.Add(_timeBig);
        centre.Children.Add(new TextBlock
        {
            Text = "left",
            FontSize = 12,
            FontWeight = FontWeights.Normal,
            Foreground = UiTheme.MutedBrush,
            HorizontalAlignment = HorizontalAlignment.Center
        });
        ring.Children.Add(centre);
        _ = inset;

        var side = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(18, 0, 0, 0) };
        side.Children.Add(new TextBlock
        {
            Text = "TODAY",
            FontSize = 12,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(0, 0, 0, 8)
        });
        _usedText = new TextBlock { FontSize = 18, FontWeight = FontWeights.SemiBold, Foreground = UiTheme.TextBrush };
        side.Children.Add(_usedText);
        _usedOf = new TextBlock
        {
            FontSize = 13,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(0, 0, 0, 10),
            TextWrapping = TextWrapping.Wrap
        };
        side.Children.Add(_usedOf);
        _pillText = new TextBlock { FontSize = 13, FontWeight = FontWeights.SemiBold, Foreground = UiTheme.AccentOnBrush };
        _pill = new Border
        {
            Padding = new Thickness(12, 4, 12, 4),
            HorizontalAlignment = HorizontalAlignment.Left,
            Child = _pillText
        };
        // Capsule: WPF stretches an oversized CornerRadius (e.g. 999) into an oval
        // instead of capping it like CSS does, so use exactly half the height.
        _pill.SizeChanged += (_, e) => _pill.CornerRadius = new CornerRadius(e.NewSize.Height / 2);
        side.Children.Add(_pill);

        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        Grid.SetColumn(ring, 0);
        Grid.SetColumn(side, 1);
        row.Children.Add(ring);
        row.Children.Add(side);

        return new Border
        {
            Background = UiTheme.CardBrush,
            BorderBrush = UiTheme.BorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(UiTheme.CardRadius),
            Padding = new Thickness(18),
            Margin = new Thickness(0, 0, 0, 14),
            Child = row
        };
    }

    private Grid BuildMessageTiles()
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(8) });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        _messageTiles = [];
        var tiles = QuickMessages
            .Select(q => (q.Caption, q.Glyph, Action: (Func<Task>)(() => SendMessageAsync(q.Key, null))))
            .Append(("Write my own", "", () => { ToggleCompose(); return Task.CompletedTask; }))
            .ToList();

        for (var i = 0; i < tiles.Count; i++)
        {
            var (caption, glyph, action) = tiles[i];
            var tile = UiTheme.SecondaryButton("");
            tile.Content = IconLabel(glyph, caption, UiTheme.TextBrush, 14, FontWeights.SemiBold, UiTheme.AccentBrush);
            tile.Height = 56;
            tile.Padding = new Thickness(0);
            tile.Click += async (_, _) => await action();
            Grid.SetColumn(tile, i % 2 == 0 ? 0 : 2);
            Grid.SetRow(tile, i < 2 ? 0 : 2);
            grid.Children.Add(tile);
            _messageTiles.Add(tile);
        }

        return grid;
    }

    private DockPanel BuildFooter()
    {
        var footer = new DockPanel { Margin = new Thickness(0, 16, 0, 0), LastChildFill = false };

        var parents = new WpfButton
        {
            Content = IconLabel("", "Parents", UiTheme.MutedBrush, 12, FontWeights.SemiBold),
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            Padding = new Thickness(8, 6, 8, 6),
            Cursor = Cursors.Hand,
            Template = FlatTemplate()
        };
        parents.Click += (_, _) => RequestExit();
        DockPanel.SetDock(parents, Dock.Right);
        footer.Children.Add(parents);

        var colours = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        colours.Children.Add(new TextBlock
        {
            Text = "My colour",
            FontSize = 12,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.MutedBrush,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 8, 0)
        });

        _colourButtons = [];
        var current = UiTheme.AccentHex;
        var matchedPreset = false;
        foreach (var (name, hex) in AccentPalette.Presets)
        {
            var selected = hex == current;
            matchedPreset |= selected;
            var swatch = Swatch(UiTheme.Brush(UiTheme.ToColor(AccentPalette.FromHex(hex).Accent)), name, selected);
            var chosen = hex;
            swatch.Click += (_, _) => ApplyColour(chosen);
            colours.Children.Add(swatch);
            _colourButtons.Add(swatch);
        }

        var rainbow = new LinearGradientBrush
        {
            StartPoint = new Point(0, 0),
            EndPoint = new Point(1, 1),
            GradientStops =
            {
                new GradientStop(Color.FromRgb(0xff, 0x5a, 0x5a), 0),
                new GradientStop(Color.FromRgb(0xff, 0xd2, 0x3f), 0.3),
                new GradientStop(Color.FromRgb(0x4f, 0xd6, 0x8b), 0.55),
                new GradientStop(Color.FromRgb(0x4f, 0xb3, 0xff), 0.8),
                new GradientStop(Color.FromRgb(0xb4, 0x8c, 0xff), 1)
            }
        };
        rainbow.Freeze();
        var picker = Swatch(rainbow, "Pick any colour", selected: !matchedPreset);
        picker.Content = new TextBlock
        {
            Text = "+",
            FontSize = 15,
            FontWeight = FontWeights.Bold,
            Foreground = Brushes.White,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, -2, 0, 0)
        };
        picker.Click += (_, _) => PickCustomColour();
        colours.Children.Add(picker);
        _colourButtons.Add(picker);

        footer.Children.Add(colours);
        return footer;
    }

    private static WpfButton Swatch(Brush fill, string name, bool selected)
    {
        var btn = UiTheme.SecondaryButton("");
        btn.Width = 26;
        btn.Height = 26;
        btn.Padding = new Thickness(0);
        btn.Margin = new Thickness(0, 0, 6, 0);
        btn.Background = fill;
        btn.BorderBrush = selected ? Brushes.White : Brushes.Transparent;
        btn.BorderThickness = new Thickness(3);
        btn.ToolTip = name;
        System.Windows.Automation.AutomationProperties.SetName(btn, name);
        return btn;
    }

    private static TextBlock StatusLine() =>
        new()
        {
            FontSize = 13,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.MutedBrush,
            Margin = new Thickness(2, 8, 0, 0),
            TextWrapping = TextWrapping.Wrap,
            Visibility = Visibility.Collapsed
        };

    private static void SetStatus(TextBlock line, string text, Brush? brush = null)
    {
        line.Text = text;
        line.Foreground = brush ?? UiTheme.MutedBrush;
        line.Visibility = string.IsNullOrEmpty(text) ? Visibility.Collapsed : Visibility.Visible;
    }

    private static TextBlock Glyph(string glyph, Brush brush, double size) =>
        new()
        {
            Text = glyph,
            FontFamily = new FontFamily("Segoe MDL2 Assets"),
            FontSize = size,
            Foreground = brush,
            VerticalAlignment = VerticalAlignment.Center
        };

    private static StackPanel IconLabel(
        string glyph,
        string text,
        Brush textBrush,
        double size,
        FontWeight weight,
        Brush? glyphBrush = null)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
        var icon = Glyph(glyph, glyphBrush ?? textBrush, size + 2);
        icon.Margin = new Thickness(0, 0, 9, 0);
        panel.Children.Add(icon);
        panel.Children.Add(new TextBlock
        {
            Text = text,
            FontSize = size,
            FontWeight = weight,
            Foreground = textBrush,
            VerticalAlignment = VerticalAlignment.Center
        });
        return panel;
    }

    private static ControlTemplate FlatTemplate()
    {
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(10));
        border.SetBinding(Border.BackgroundProperty, new System.Windows.Data.Binding(nameof(Background))
        {
            RelativeSource = new System.Windows.Data.RelativeSource(System.Windows.Data.RelativeSourceMode.TemplatedParent)
        });
        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetBinding(MarginProperty, new System.Windows.Data.Binding(nameof(Padding))
        {
            RelativeSource = new System.Windows.Data.RelativeSource(System.Windows.Data.RelativeSourceMode.TemplatedParent)
        });
        border.AppendChild(presenter);
        return new ControlTemplate(typeof(WpfButton)) { VisualTree = border };
    }

    // ── Colour ────────────────────────────────────────────────────────────

    private void PickCustomColour()
    {
        var current = UiTheme.Accent;
        using var dialog = new System.Windows.Forms.ColorDialog
        {
            FullOpen = true,
            AnyColor = true,
            Color = System.Drawing.Color.FromArgb(current.R, current.G, current.B)
        };
        if (dialog.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;

        var c = dialog.Color;
        ApplyColour($"#{c.R:x2}{c.G:x2}{c.B:x2}");
    }

    private void ApplyColour(string hex)
    {
        if (_requestBusy || _messageBusy) return;

        _uiPrefs.SaveAccentHex(hex);
        UiTheme.Apply(hex);
        BuildBody();
        RefreshStatus();
    }

    // ── Update banner ─────────────────────────────────────────────────────

    private void RefreshUpdateBanner()
    {
        var view = UpdateBannerModel.Compute(new UpdateBannerInput(
            AgentVersionInfo.Current,
            _engine.AvailableUpdate?.Version,
            UpdaterLauncher.ReadLastResult(),
            _engine.IsLocked || _engine.IsAdminLocked,
            _updatePhase,
            _updateStartedAt
        ));
        _updateBanner.Render(view);
    }

    private void StartUpdate()
    {
        _updateStartedAt = DateTimeOffset.UtcNow;
        _updatePhase = UpdatePhase.Starting;
        RefreshUpdateBanner();

        if (UpdaterLauncher.TryStart())
        {
            // On success msiexec closes this process and the updater relaunches Warden.
            // Poll the status file so a failure before install (e.g. hash mismatch) is shown.
            _updateStatusTimer.Start();
        }
        else
        {
            _updatePhase = UpdatePhase.StartFailed;
        }

        RefreshUpdateBanner();
    }

    private void PollUpdateStatus()
    {
        var last = UpdaterLauncher.ReadLastResult();
        var reported = last is not null && _updateStartedAt is { } started && last.At > started;
        var gaveUp = _updateStartedAt is { } s && DateTimeOffset.UtcNow - s > UpdateStatusPollLimit;
        if (reported || gaveUp)
        {
            _updateStatusTimer.Stop();
            _updatePhase = UpdatePhase.Idle;
            _updateStartedAt = null;
        }

        RefreshUpdateBanner();
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

    // ── Status ────────────────────────────────────────────────────────────

    private void RefreshStatus()
    {
        var config = _configStore.Load();
        _greeting.Text = string.IsNullOrWhiteSpace(config.ChildName)
            ? "Hey there!"
            : $"Hey {config.ChildName.Trim()}!";

        var locked = _engine.IsAdminLocked || _engine.IsLocked;
        var eval = _engine.CurrentEvaluation;
        if (eval == null)
        {
            RenderMood(TrayMood.Compute(0, 1, locked, syncing: true), "…", "Getting today's time");
            return;
        }

        int usedMinutes;
        int limitMinutes;
        string usedOf;

        var remainingSeconds = _engine.GetRemainingSeconds();
        if (_engine.TryGetOutsideExtensionUsage(out var extensionUsedMinutes, out var extensionLimitMinutes))
        {
            usedMinutes = extensionUsedMinutes;
            limitMinutes = Math.Max(1, extensionLimitMinutes);
            usedOf = $"used of {TrayMood.FormatMinutes(limitMinutes)} extra time";
        }
        else
        {
            usedMinutes = eval.UsedMinutes;
            limitMinutes = Math.Max(1, eval.DailyLimitMinutes + eval.BonusMinutes);
            usedOf = $"used of {TrayMood.FormatMinutes(limitMinutes)}";
        }

        var mood = TrayMood.Compute(remainingSeconds, limitMinutes * 60, locked, syncing: false);
        RenderMood(mood, TrayMood.FormatMinutes(usedMinutes), usedOf);
    }

    private void RenderMood(TrayMoodView mood, string used, string usedOf)
    {
        _moodLine.Text = mood.Line;
        _timeBig.Text = mood.TimeLabel;
        _usedText.Text = used;
        _usedOf.Text = usedOf;
        _pillText.Text = mood.Pill;

        var brush = mood.Kind switch
        {
            TrayMoodKind.AllGood => UiTheme.AccentBrush,
            TrayMoodKind.HeadsUp => UiTheme.HeadsUpBrush,
            TrayMoodKind.AlmostDone => UiTheme.AlmostDoneBrush,
            _ => UiTheme.TimesUpBrush
        };
        _pill.Background = brush;
        DrawRing(mood.Fraction, brush);
    }

    private void DrawRing(double fraction, Brush brush)
    {
        _ringFull.Stroke = brush;
        _ringArc.Stroke = brush;

        if (fraction >= 0.999)
        {
            _ringFull.Visibility = Visibility.Visible;
            _ringArc.Visibility = Visibility.Collapsed;
            return;
        }

        _ringFull.Visibility = Visibility.Collapsed;
        if (fraction <= 0.005)
        {
            _ringArc.Visibility = Visibility.Collapsed;
            return;
        }

        var radius = (RingSize - RingThickness) / 2;
        var centre = RingSize / 2;
        var angle = fraction * 2 * Math.PI;
        var start = new Point(centre, centre - radius);
        var end = new Point(centre + radius * Math.Sin(angle), centre - radius * Math.Cos(angle));
        var figure = new PathFigure { StartPoint = start, IsClosed = false };
        figure.Segments.Add(new ArcSegment(end, new Size(radius, radius), 0, fraction > 0.5, SweepDirection.Clockwise, true));
        _ringArc.Data = new PathGeometry([figure]);
        _ringArc.Visibility = Visibility.Visible;
    }

    // ── Parent exit ───────────────────────────────────────────────────────

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

    // ── Ask for more time ─────────────────────────────────────────────────

    private void ToggleRequestPanel()
    {
        if (_requestBusy) return;

        var open = _requestPanel.Visibility != Visibility.Visible;
        _requestPanel.Visibility = open ? Visibility.Visible : Visibility.Collapsed;
        SetStatus(_requestStatusLine, "");
    }

    private async Task SendExtensionRequestAsync(int minutes)
    {
        if (_requestBusy) return;

        _requestBusy = true;
        SetRequestControlsEnabled(false);
        SetStatus(_requestStatusLine, "Asking…");

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
            _requestPanel.Visibility = Visibility.Collapsed;
            SetStatus(_requestStatusLine, $"Asked for {minutes} more minutes! Your parent will see it.", UiTheme.AccentBrush);
        }
        else
        {
            SetStatus(_requestStatusLine, "Couldn't send. Try again.", UiTheme.AlmostDoneBrush);
        }

        _requestBusy = false;
        SetRequestControlsEnabled(true);
    }

    private void SetRequestControlsEnabled(bool enabled)
    {
        _askButton.IsEnabled = enabled;
        foreach (var btn in _presetButtons)
        {
            btn.IsEnabled = enabled;
        }
    }

    // ── Messages ──────────────────────────────────────────────────────────

    private void ToggleCompose()
    {
        if (_messageBusy) return;

        var open = _composeRow.Visibility != Visibility.Visible;
        _composeRow.Visibility = open ? Visibility.Visible : Visibility.Collapsed;
        _messageTiles[^1].BorderBrush = open ? UiTheme.AccentBrush : UiTheme.BorderBrush;
        SetStatus(_messageStatusLine, "");
        if (open)
        {
            _messageBox.Focus();
        }
        else
        {
            _messageBox.Text = "";
        }
    }

    private async Task SendTypedMessageAsync()
    {
        if (_messageBusy) return;

        var text = _messageBox.Text.Trim();
        if (text.Length == 0)
        {
            SetStatus(_messageStatusLine, "Type a message first.", UiTheme.AlmostDoneBrush);
            return;
        }

        await SendMessageAsync(null, text);
    }

    private async Task SendMessageAsync(string? quick, string? text)
    {
        if (_messageBusy) return;

        _messageBusy = true;
        SetMessageControlsEnabled(false);
        SetStatus(_messageStatusLine, "Sending…");

        ChildMessageSendResult result;
        try
        {
            result = await _engine.SendMessageAsync(quick, text);
        }
        catch
        {
            result = ChildMessageSendResult.Failed();
        }

        if (!IsLoaded)
        {
            return;
        }

        if (result.Ok)
        {
            SetStatus(_messageStatusLine, "Sent to your parent!", UiTheme.AccentBrush);
            _messageBox.Text = "";
            if (_composeRow.Visibility == Visibility.Visible)
            {
                _composeRow.Visibility = Visibility.Collapsed;
                _messageTiles[^1].BorderBrush = UiTheme.BorderBrush;
            }
        }
        else if (result.IsRateLimited)
        {
            SetStatus(
                _messageStatusLine,
                result.RetryAfterSeconds >= 120
                    ? $"Too many messages. Try again in {result.RetryAfterSeconds / 60} min."
                    : $"Please wait {result.RetryAfterSeconds}s before sending another message.",
                UiTheme.AlmostDoneBrush);
        }
        else
        {
            SetStatus(_messageStatusLine, "Couldn't send. Try again.", UiTheme.AlmostDoneBrush);
        }

        _messageBusy = false;
        SetMessageControlsEnabled(true);
    }

    private void SetMessageControlsEnabled(bool enabled)
    {
        foreach (var btn in _messageTiles)
        {
            btn.IsEnabled = enabled;
        }

        _messageBox.IsEnabled = enabled;
        _messageSendBtn.IsEnabled = enabled;
    }
}
