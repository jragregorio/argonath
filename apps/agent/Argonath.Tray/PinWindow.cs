using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace Argonath.Tray;

public class PinWindow : Window
{
    private readonly PasswordBox _pinBox;

    public string Pin => _pinBox.Password;

    public PinWindow()
    {
        Title = "Argonath — Parent PIN";
        Width = 360;
        SizeToContent = SizeToContent.Height;
        UiTheme.ApplyWindowChrome(this);
        ResizeMode = ResizeMode.NoResize;
        WindowStyle = WindowStyle.ToolWindow;
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
            UiTheme.Label("Required to exit Argonath on this device.")
        );

        _pinBox = UiTheme.PasswordField();
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
        Content = root;

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
}
