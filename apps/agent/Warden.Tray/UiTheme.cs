using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shell;
using WpfBinding = System.Windows.Data.Binding;
using WpfBorder = System.Windows.Controls.Border;
using WpfButton = System.Windows.Controls.Button;
using WpfBrush = System.Windows.Media.Brush;
using WpfBrushes = System.Windows.Media.Brushes;
using WpfColor = System.Windows.Media.Color;
using WpfFontFamily = System.Windows.Media.FontFamily;
using WpfHorizontalAlignment = System.Windows.HorizontalAlignment;
using WpfOrientation = System.Windows.Controls.Orientation;
using WpfTextBox = System.Windows.Controls.TextBox;

namespace Warden.Tray;

internal static class UiTheme
{
    // Maiev palette — aligned with apps/web globals.css
    public static readonly WpfColor Bg = WpfColor.FromRgb(0x1a, 0x24, 0x20);
    public static readonly WpfColor Card = WpfColor.FromRgb(0x24, 0x30, 0x2c);
    public static readonly WpfColor BorderColor = WpfColor.FromRgb(0x36, 0x45, 0x4f);
    public static readonly WpfColor TextPrimary = WpfColor.FromRgb(0xe0, 0xe0, 0xe0);
    public static readonly WpfColor TextMuted = WpfColor.FromRgb(0xa8, 0xb0, 0xb0);
    public static readonly WpfColor Accent = WpfColor.FromRgb(0x50, 0xc8, 0x78);
    public static readonly WpfColor AccentOn = WpfColor.FromRgb(0x0f, 0x1a, 0x12);
    public static readonly WpfColor Gold = WpfColor.FromRgb(0xc5, 0xa0, 0x59);
    public static readonly WpfColor GoldLight = WpfColor.FromRgb(0xd8, 0xb9, 0x78);
    public static readonly WpfColor Danger = WpfColor.FromRgb(0xb5, 0x4a, 0x3f);
    public static readonly WpfColor CloseBright = WpfColor.FromRgb(0xff, 0x5a, 0x5a);
    public static readonly WpfColor Success = WpfColor.FromRgb(0x50, 0xc8, 0x78);

    public const double ButtonRadius = 14;
    public const double CardRadius = 12;
    public const double WindowRadius = 12;
    public const double TitleBarHeight = 34;

    private const int DwmwaWindowCornerPreference = 33;
    private const int DwmwcpRound = 2;

    public static SolidColorBrush Brush(WpfColor c)
    {
        var brush = new SolidColorBrush(c);
        brush.Freeze();
        return brush;
    }

    public static readonly SolidColorBrush BgBrush = Brush(Bg);
    public static readonly SolidColorBrush CardBrush = Brush(Card);
    public static readonly SolidColorBrush BorderBrush = Brush(BorderColor);
    public static readonly SolidColorBrush TextBrush = Brush(TextPrimary);
    public static readonly SolidColorBrush MutedBrush = Brush(TextMuted);
    public static readonly SolidColorBrush AccentBrush = Brush(Accent);
    public static readonly SolidColorBrush AccentOnBrush = Brush(AccentOn);
    public static readonly SolidColorBrush GoldBrush = Brush(Gold);
    public static readonly SolidColorBrush GoldLightBrush = Brush(GoldLight);
    public static readonly SolidColorBrush DangerBrush = Brush(Danger);
    public static readonly SolidColorBrush CloseBrightBrush = Brush(CloseBright);
    public static readonly SolidColorBrush SuccessBrush = Brush(Success);

    public static SolidColorBrush AccentFillBrush =>
        new(WpfColor.FromArgb(90, Accent.R, Accent.G, Accent.B));

    public static SolidColorBrush DangerFillBrush =>
        new(WpfColor.FromArgb(100, Danger.R, Danger.G, Danger.B));

    public static SolidColorBrush GoldFillBrush =>
        new(WpfColor.FromArgb(80, Gold.R, Gold.G, Gold.B));

    public static SolidColorBrush CloseFillBrush =>
        new(WpfColor.FromArgb(90, CloseBright.R, CloseBright.G, CloseBright.B));

    public static void ApplyWindowChrome(Window window)
    {
        window.Background = BgBrush;
        window.Foreground = TextBrush;
        window.FontFamily = new WpfFontFamily("Segoe UI");
        window.WindowStartupLocation = WindowStartupLocation.CenterScreen;
        window.ResizeMode = ResizeMode.CanMinimize;

        var chrome = new WindowChrome
        {
            CaptionHeight = TitleBarHeight,
            ResizeBorderThickness = new Thickness(0),
            GlassFrameThickness = new Thickness(0),
            UseAeroCaptionButtons = false,
            CornerRadius = new CornerRadius(WindowRadius),
            NonClientFrameEdges = NonClientFrameEdges.None
        };
        WindowChrome.SetWindowChrome(window, chrome);

        window.SourceInitialized -= OnWindowSourceInitialized;
        window.SourceInitialized += OnWindowSourceInitialized;
    }

    private static void OnWindowSourceInitialized(object? sender, EventArgs e)
    {
        if (sender is not Window window) return;
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == IntPtr.Zero) return;

        var preference = DwmwcpRound;
        _ = DwmSetWindowAttribute(
            hwnd,
            DwmwaWindowCornerPreference,
            ref preference,
            sizeof(int)
        );
    }

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(
        IntPtr hwnd,
        int attr,
        ref int attrValue,
        int attrSize
    );

    /// <summary>
    /// Wraps <paramref name="body"/> with a custom dark caption (shield + title, minimize/close).
    /// Call after <see cref="ApplyWindowChrome"/>.
    /// </summary>
    public static void WithCustomTitleBar(Window window, UIElement body, string title)
    {
        var titleBar = new Grid { Height = TitleBarHeight };
        titleBar.ColumnDefinitions.Add(
            new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
        );
        titleBar.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var left = new StackPanel
        {
            Orientation = WpfOrientation.Horizontal,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(12, 0, 0, 0)
        };
        left.Children.Add(
            new TextBlock
            {
                Text = "\uE756",
                FontFamily = new WpfFontFamily("Segoe MDL2 Assets"),
                FontSize = 14,
                Foreground = GoldBrush,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            }
        );
        left.Children.Add(
            new TextBlock
            {
                Text = title,
                FontSize = 12,
                Foreground = TextBrush,
                VerticalAlignment = VerticalAlignment.Center
            }
        );
        Grid.SetColumn(left, 0);
        titleBar.Children.Add(left);

        var buttons = new StackPanel { Orientation = WpfOrientation.Horizontal };
        var minimize = CreateTitleBarButton("\uE921", GoldBrush, isClose: false);
        minimize.Click += (_, _) => window.WindowState = WindowState.Minimized;
        buttons.Children.Add(minimize);

        var close = CreateTitleBarButton("\uE8BB", CloseBrightBrush, isClose: true);
        close.Click += (_, _) => window.Close();
        buttons.Children.Add(close);

        Grid.SetColumn(buttons, 1);
        titleBar.Children.Add(buttons);

        var caption = new WpfBorder
        {
            Background = BgBrush,
            BorderBrush = BorderBrush,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = titleBar
        };

        var root = new DockPanel();
        DockPanel.SetDock(caption, Dock.Top);
        root.Children.Add(caption);
        root.Children.Add(body);

        var shell = new WpfBorder
        {
            Background = BgBrush,
            BorderBrush = BorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(WindowRadius),
            Child = root,
            SnapsToDevicePixels = true
        };
        shell.SizeChanged += (_, _) =>
        {
            var w = shell.ActualWidth;
            var h = shell.ActualHeight;
            if (w <= 0 || h <= 0) return;
            shell.Clip = new RectangleGeometry(
                new Rect(0, 0, w, h),
                WindowRadius,
                WindowRadius
            );
        };

        window.Content = shell;
    }

    private static WpfButton CreateTitleBarButton(string glyph, WpfBrush glyphBrush, bool isClose)
    {
        var btn = new WpfButton
        {
            Content = new TextBlock
            {
                Text = glyph,
                FontFamily = new WpfFontFamily("Segoe MDL2 Assets"),
                FontSize = 10,
                Foreground = glyphBrush,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = WpfHorizontalAlignment.Center
            },
            Width = 46,
            Height = TitleBarHeight,
            Background = WpfBrushes.Transparent,
            BorderThickness = new Thickness(0),
            Padding = new Thickness(0),
            Cursor = System.Windows.Input.Cursors.Hand,
            HorizontalAlignment = WpfHorizontalAlignment.Right,
            Template = CreateFlatButtonTemplate()
        };

        WindowChrome.SetIsHitTestVisibleInChrome(btn, true);

        btn.MouseEnter += (_, _) =>
            btn.Background = isClose ? CloseFillBrush : GoldFillBrush;
        btn.MouseLeave += (_, _) => btn.Background = WpfBrushes.Transparent;

        return btn;
    }

    private static ControlTemplate CreateFlatButtonTemplate()
    {
        var factory = new FrameworkElementFactory(typeof(WpfBorder));
        factory.SetBinding(
            WpfBorder.BackgroundProperty,
            new WpfBinding(nameof(WpfButton.Background))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );

        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetValue(
            FrameworkElement.HorizontalAlignmentProperty,
            WpfHorizontalAlignment.Center
        );
        presenter.SetValue(
            FrameworkElement.VerticalAlignmentProperty,
            VerticalAlignment.Center
        );
        factory.AppendChild(presenter);

        return new ControlTemplate(typeof(WpfButton)) { VisualTree = factory };
    }

    public static TextBlock Label(string text, double size = 13, bool muted = true, bool bold = false) =>
        new()
        {
            Text = text,
            FontSize = size,
            FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal,
            Foreground = muted ? MutedBrush : TextBrush,
            Margin = new Thickness(0, 0, 0, 6),
            TextWrapping = TextWrapping.Wrap
        };

    public static WpfTextBox TextField(string? text = null, string? placeholder = null)
    {
        var box = new WpfTextBox
        {
            Text = text ?? "",
            FontSize = 14,
            Padding = new Thickness(10, 8, 10, 8),
            Background = CardBrush,
            Foreground = TextBrush,
            BorderBrush = BorderBrush,
            BorderThickness = new Thickness(1),
            CaretBrush = TextBrush,
            Template = CreateRoundedTextBoxTemplate()
        };
        if (placeholder != null)
        {
            box.Tag = placeholder;
            ApplyPlaceholder(box, placeholder);
        }
        return box;
    }

    /// <summary>
    /// Overlays muted placeholder text when the box is empty (Tag-only was not visible).
    /// </summary>
    public static void ApplyPlaceholder(WpfTextBox box, string placeholder)
    {
        void Clear()
        {
            var layer = AdornerLayer.GetAdornerLayer(box);
            if (layer == null) return;

            var existing = layer.GetAdorners(box);
            if (existing == null) return;

            foreach (var a in existing)
            {
                if (a is PlaceholderAdorner) layer.Remove(a);
            }
        }

        void Sync()
        {
            Clear();
            // Adorners live on a parent AdornerLayer and do not auto-hide with Collapsed
            // ancestors — only draw when the box is actually visible and empty.
            if (!box.IsVisible || !string.IsNullOrEmpty(box.Text)) return;

            var layer = AdornerLayer.GetAdornerLayer(box);
            if (layer == null) return;

            layer.Add(new PlaceholderAdorner(box, placeholder));
        }

        box.Loaded += (_, _) => Sync();
        box.Unloaded += (_, _) => Clear();
        box.TextChanged += (_, _) => Sync();
        box.IsVisibleChanged += (_, _) => Sync();
    }

    private sealed class PlaceholderAdorner : Adorner
    {
        private readonly TextBlock _label;

        public PlaceholderAdorner(UIElement adorned, string text)
            : base(adorned)
        {
            IsHitTestVisible = false;
            _label = new TextBlock
            {
                Text = text,
                FontSize = 14,
                Foreground = MutedBrush,
                HorizontalAlignment = WpfHorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(10, 0, 10, 0),
                TextAlignment = TextAlignment.Center
            };
            AddVisualChild(_label);
        }

        protected override int VisualChildrenCount => 1;

        protected override Visual GetVisualChild(int index) => _label;

        protected override System.Windows.Size ArrangeOverride(System.Windows.Size finalSize)
        {
            _label.Arrange(new Rect(finalSize));
            return finalSize;
        }
    }

    public static PasswordBox PasswordField() =>
        new()
        {
            FontSize = 14,
            Padding = new Thickness(10, 8, 10, 8),
            Background = CardBrush,
            Foreground = TextBrush,
            BorderBrush = BorderBrush,
            BorderThickness = new Thickness(1),
            CaretBrush = TextBrush
        };

    public static WpfButton PrimaryButton(string content) =>
        CreateRoundedButton(content, AccentBrush, AccentOnBrush, null);

    public static WpfButton SecondaryButton(string content) =>
        CreateRoundedButton(content, CardBrush, TextBrush, BorderBrush);

    public static WpfButton GoldButton(string content) =>
        CreateRoundedButton(content, GoldLightBrush, AccentOnBrush, null);

    public static WpfButton DangerButton(string content) =>
        CreateRoundedButton(content, DangerBrush, TextBrush, null);

    private static WpfButton CreateRoundedButton(
        string content,
        WpfBrush background,
        WpfBrush foreground,
        WpfBrush? borderBrush)
    {
        return new WpfButton
        {
            Content = content,
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Padding = new Thickness(16, 12, 16, 12),
            Background = background,
            Foreground = foreground,
            BorderBrush = borderBrush ?? WpfBrushes.Transparent,
            BorderThickness = new Thickness(borderBrush == null ? 0 : 1),
            Cursor = System.Windows.Input.Cursors.Hand,
            HorizontalAlignment = WpfHorizontalAlignment.Stretch,
            Template = CreateRoundedButtonTemplate()
        };
    }

    private static ControlTemplate CreateRoundedTextBoxTemplate()
    {
        var border = new FrameworkElementFactory(typeof(WpfBorder));
        border.SetValue(WpfBorder.CornerRadiusProperty, new CornerRadius(ButtonRadius));
        border.SetValue(WpfBorder.SnapsToDevicePixelsProperty, true);
        border.SetBinding(
            WpfBorder.BackgroundProperty,
            new WpfBinding(nameof(WpfTextBox.Background))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );
        border.SetBinding(
            WpfBorder.BorderBrushProperty,
            new WpfBinding(nameof(WpfTextBox.BorderBrush))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );
        border.SetBinding(
            WpfBorder.BorderThicknessProperty,
            new WpfBinding(nameof(WpfTextBox.BorderThickness))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );
        border.SetBinding(
            WpfBorder.PaddingProperty,
            new WpfBinding(nameof(WpfTextBox.Padding))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );

        var host = new FrameworkElementFactory(typeof(ScrollViewer));
        host.Name = "PART_ContentHost";
        host.SetValue(UIElement.FocusableProperty, false);
        host.SetValue(
            ScrollViewer.HorizontalScrollBarVisibilityProperty,
            ScrollBarVisibility.Hidden
        );
        host.SetValue(
            ScrollViewer.VerticalScrollBarVisibilityProperty,
            ScrollBarVisibility.Hidden
        );
        border.AppendChild(host);

        var template = new ControlTemplate(typeof(WpfTextBox)) { VisualTree = border };
        var focus = new Trigger
        {
            Property = UIElement.IsKeyboardFocusedProperty,
            Value = true
        };
        focus.Setters.Add(new Setter(System.Windows.Controls.Control.BorderBrushProperty, GoldLightBrush));
        template.Triggers.Add(focus);
        return template;
    }

    private static ControlTemplate CreateRoundedButtonTemplate()
    {
        var factory = new FrameworkElementFactory(typeof(WpfBorder));
        factory.SetValue(WpfBorder.CornerRadiusProperty, new CornerRadius(ButtonRadius));
        factory.SetValue(WpfBorder.SnapsToDevicePixelsProperty, true);
        factory.SetBinding(
            WpfBorder.BackgroundProperty,
            new WpfBinding(nameof(WpfButton.Background))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );
        factory.SetBinding(
            WpfBorder.BorderBrushProperty,
            new WpfBinding(nameof(WpfButton.BorderBrush))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );
        factory.SetBinding(
            WpfBorder.BorderThicknessProperty,
            new WpfBinding(nameof(WpfButton.BorderThickness))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );

        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetValue(
            FrameworkElement.HorizontalAlignmentProperty,
            WpfHorizontalAlignment.Center
        );
        presenter.SetValue(
            FrameworkElement.VerticalAlignmentProperty,
            VerticalAlignment.Center
        );
        presenter.SetBinding(
            FrameworkElement.MarginProperty,
            new WpfBinding(nameof(WpfButton.Padding))
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            }
        );
        factory.AppendChild(presenter);

        return new ControlTemplate(typeof(WpfButton)) { VisualTree = factory };
    }

    public static WpfBorder CardPanel(UIElement child) =>
        new()
        {
            Background = CardBrush,
            BorderBrush = BorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(CardRadius),
            Padding = new Thickness(16),
            Child = child,
            Margin = new Thickness(0, 0, 0, 12)
        };
}
