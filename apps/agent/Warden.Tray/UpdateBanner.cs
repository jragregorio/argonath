using System.Windows;
using System.Windows.Controls;
using Border = System.Windows.Controls.Border;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using WpfButton = System.Windows.Controls.Button;

namespace Warden.Tray;

/// <summary>Slim row under the title bar: "Update available (vX.Y.Z)  [Update]".</summary>
internal sealed class UpdateBanner : Border
{
    private readonly TextBlock _message;
    private readonly WpfButton _button;

    public event Action? UpdateClicked;

    public UpdateBanner()
    {
        Background = UiTheme.CardBrush;
        BorderBrush = UiTheme.GoldBrush;
        BorderThickness = new Thickness(1);
        CornerRadius = new CornerRadius(10);
        Padding = new Thickness(14, 8, 8, 8);
        Margin = new Thickness(0, 0, 0, 16);
        Visibility = Visibility.Collapsed;

        var row = new DockPanel { LastChildFill = true };

        _button = UiTheme.GoldButton("Update");
        _button.Padding = new Thickness(16, 6, 16, 6);
        _button.MinWidth = 0;
        _button.HorizontalAlignment = HorizontalAlignment.Right;
        _button.Margin = new Thickness(10, 0, 0, 0);
        _button.Click += (_, _) => UpdateClicked?.Invoke();
        DockPanel.SetDock(_button, Dock.Right);
        row.Children.Add(_button);

        _message = new TextBlock
        {
            FontSize = 13,
            FontWeight = FontWeights.SemiBold,
            Foreground = UiTheme.TextBrush,
            VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
        };
        row.Children.Add(_message);

        Child = row;
    }

    public void Render(UpdateBannerView view)
    {
        Visibility = view.Visible ? Visibility.Visible : Visibility.Collapsed;
        _message.Text = view.Message;
        _button.Visibility = view.ShowButton ? Visibility.Visible : Visibility.Collapsed;
    }
}
