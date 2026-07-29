using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using WpfBinding = System.Windows.Data.Binding;
using WpfBorder = System.Windows.Controls.Border;
using WpfButton = System.Windows.Controls.Button;
using WpfBrush = System.Windows.Media.Brush;
using WpfBrushes = System.Windows.Media.Brushes;
using WpfColor = System.Windows.Media.Color;
using WpfFontFamily = System.Windows.Media.FontFamily;
using WpfHorizontalAlignment = System.Windows.HorizontalAlignment;
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
    public static readonly WpfColor Danger = WpfColor.FromRgb(0xb5, 0x4a, 0x3f);
    public static readonly WpfColor Success = WpfColor.FromRgb(0x50, 0xc8, 0x78);

    public const double ButtonRadius = 14;
    public const double CardRadius = 12;

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
    public static readonly SolidColorBrush DangerBrush = Brush(Danger);
    public static readonly SolidColorBrush SuccessBrush = Brush(Success);

    public static SolidColorBrush AccentFillBrush =>
        new(WpfColor.FromArgb(90, Accent.R, Accent.G, Accent.B));

    public static SolidColorBrush DangerFillBrush =>
        new(WpfColor.FromArgb(100, Danger.R, Danger.G, Danger.B));

    public static void ApplyWindowChrome(Window window)
    {
        window.Background = BgBrush;
        window.Foreground = TextBrush;
        window.FontFamily = new WpfFontFamily("Segoe UI");
        window.WindowStartupLocation = WindowStartupLocation.CenterScreen;
        window.ResizeMode = ResizeMode.CanMinimize;
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
            CaretBrush = TextBrush
        };
        if (placeholder != null)
        {
            box.Tag = placeholder;
        }
        return box;
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
