using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace Warden.Tray;

public class PinWindow : Window
{
    private readonly PasswordBox _pinBox;

    public string Pin => _pinBox.Password;

    public PinWindow()
    {
        Title = "Warden — Parent PIN";
        Width = 360;
        SizeToContent = SizeToContent.Height;
        UiTheme.ApplyWindowChrome(this);
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;

        var root = new StackPanel { Margin = new Thickness(24) };

        root.Children.Add(
            new TextBlock
            {
                Text = "Enter parent PIN",
                FontSize = 18,
                FontWeight = FontWeights.SemiBold,
                Foreground = UiTheme.TextBrush,
                Margin = new Thickness(0, 0, 0, 8)
            }
        );
        root.Children.Add(
            UiTheme.Label("Required to exit Warden on this device.")
        );

        _pinBox = UiTheme.PasswordField();
        _pinBox.FontFamily = new System.Windows.Media.FontFamily("Consolas");
        _pinBox.FontSize = 22;
        _pinBox.HorizontalContentAlignment = System.Windows.HorizontalAlignment.Center;
        _pinBox.Template = CreateCenteredPasswordTemplate();
        _pinBox.MaxLength = 8;
        _pinBox.Margin = new Thickness(0, 8, 0, 16);
        root.Children.Add(_pinBox);

        var buttons = new Grid { Margin = new Thickness(0, 4, 0, 0) };
        buttons.ColumnDefinitions.Add(
            new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
        );
        buttons.ColumnDefinitions.Add(
            new ColumnDefinition { Width = new GridLength(12) }
        );
        buttons.ColumnDefinitions.Add(
            new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }
        );

        var cancel = UiTheme.SecondaryButton("Cancel");
        cancel.Click += (_, _) =>
        {
            DialogResult = false;
            Close();
        };
        Grid.SetColumn(cancel, 0);
        buttons.Children.Add(cancel);

        var confirm = UiTheme.PrimaryButton("Confirm");
        confirm.IsDefault = true;
        confirm.Click += (_, _) =>
        {
            DialogResult = true;
            Close();
        };
        Grid.SetColumn(confirm, 2);
        buttons.Children.Add(confirm);

        root.Children.Add(buttons);

        UiTheme.WithCustomTitleBar(this, root, "Warden — Parent PIN");

        Loaded += (_, _) => _pinBox.Focus();
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape)
            {
                DialogResult = false;
                Close();
            }
        };
    }

    /// <summary>
    /// Default PasswordBox templates ignore HorizontalContentAlignment; this hosts
    /// PART_ContentHost centered so the masked PIN matches the pairing code field.
    /// </summary>
    private static ControlTemplate CreateCenteredPasswordTemplate()
    {
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(
            Border.BackgroundProperty,
            new TemplateBindingExtension(BackgroundProperty)
        );
        border.SetValue(
            Border.BorderBrushProperty,
            new TemplateBindingExtension(BorderBrushProperty)
        );
        border.SetValue(
            Border.BorderThicknessProperty,
            new TemplateBindingExtension(BorderThicknessProperty)
        );
        border.SetValue(Border.SnapsToDevicePixelsProperty, true);

        var host = new FrameworkElementFactory(typeof(ScrollViewer));
        host.Name = "PART_ContentHost";
        host.SetValue(
            FrameworkElement.MarginProperty,
            new TemplateBindingExtension(PaddingProperty)
        );
        host.SetValue(
            FrameworkElement.HorizontalAlignmentProperty,
            System.Windows.HorizontalAlignment.Center
        );
        host.SetValue(
            FrameworkElement.VerticalAlignmentProperty,
            VerticalAlignment.Center
        );
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

        return new ControlTemplate(typeof(PasswordBox)) { VisualTree = border };
    }
}
