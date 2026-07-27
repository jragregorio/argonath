using System.Windows;
using System.Windows.Controls;
using Argonath.Core.Services;
using Button = System.Windows.Controls.Button;
using TextBox = System.Windows.Controls.TextBox;

namespace Argonath.Tray;

public class PairingWindow : Window
{
    private readonly ArgonathApiClient _api;
    private readonly ConfigStore _configStore;
    private readonly TextBox _codeInput;
    private readonly TextBox _apiUrlInput;
    private readonly TextBox _supabaseUrlInput;
    private readonly TextBox _supabaseKeyInput;
    private readonly TextBlock _statusLabel;
    private readonly Button _pairButton;

    public PairingWindow(ArgonathApiClient api, ConfigStore configStore)
    {
        _api = api;
        _configStore = configStore;

        Title = "Argonath — Device Pairing";
        Width = 440;
        SizeToContent = SizeToContent.Height;
        UiTheme.ApplyWindowChrome(this);
        ResizeMode = ResizeMode.NoResize;

        var config = configStore.Load();
        var root = new StackPanel { Margin = new Thickness(28) };

        root.Children.Add(
            new TextBlock
            {
                Text = "Argonath Agent Setup",
                FontSize = 22,
                FontWeight = FontWeights.Bold,
                Foreground = UiTheme.TextBrush,
                Margin = new Thickness(0, 0, 0, 6)
            }
        );
        root.Children.Add(
            UiTheme.Label("Enter the 6-digit code from the parent dashboard.")
        );

        root.Children.Add(UiTheme.Label("Pairing code", muted: false, bold: true));
        _codeInput = UiTheme.TextField();
        _codeInput.FontFamily = new System.Windows.Media.FontFamily("Consolas");
        _codeInput.FontSize = 22;
        _codeInput.TextAlignment = TextAlignment.Center;
        _codeInput.MaxLength = 6;
        _codeInput.Margin = new Thickness(0, 0, 0, 14);
        root.Children.Add(_codeInput);

        root.Children.Add(UiTheme.Label("API URL", muted: false, bold: true));
        _apiUrlInput = UiTheme.TextField(config.ApiBaseUrl);
        _apiUrlInput.Margin = new Thickness(0, 0, 0, 14);
        root.Children.Add(_apiUrlInput);

        root.Children.Add(
            UiTheme.Label("Supabase URL (optional — skip for core testing)", muted: false)
        );
        _supabaseUrlInput = UiTheme.TextField(config.SupabaseUrl ?? "");
        _supabaseUrlInput.Margin = new Thickness(0, 0, 0, 14);
        root.Children.Add(_supabaseUrlInput);

        root.Children.Add(UiTheme.Label("Supabase Anon Key (optional)", muted: false));
        _supabaseKeyInput = UiTheme.TextField(config.SupabaseAnonKey ?? "");
        _supabaseKeyInput.Margin = new Thickness(0, 0, 0, 12);
        root.Children.Add(_supabaseKeyInput);

        _statusLabel = new TextBlock
        {
            FontSize = 13,
            Foreground = UiTheme.MutedBrush,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 12),
            MinHeight = 20
        };
        root.Children.Add(_statusLabel);

        _pairButton = UiTheme.PrimaryButton("Pair Device");
        _pairButton.Click += async (_, _) => await PairAsync();
        root.Children.Add(_pairButton);

        Content = root;
        Loaded += (_, _) => _codeInput.Focus();
    }

    private async Task PairAsync()
    {
        if (_codeInput.Text.Trim().Length != 6)
        {
            _statusLabel.Foreground = UiTheme.DangerBrush;
            _statusLabel.Text = "Please enter a 6-digit code";
            return;
        }

        var config = _configStore.Load();
        config.ApiBaseUrl = _apiUrlInput.Text.Trim().TrimEnd('/');
        config.SupabaseUrl = _supabaseUrlInput.Text.Trim();
        config.SupabaseAnonKey = _supabaseKeyInput.Text.Trim();
        _configStore.Save(config);

        _pairButton.IsEnabled = false;
        _statusLabel.Foreground = UiTheme.MutedBrush;
        _statusLabel.Text = "Pairing…";

        try
        {
            var result = await _api.PairAsync(_codeInput.Text.Trim());
            if (result != null)
            {
                _statusLabel.Foreground = UiTheme.SuccessBrush;
                _statusLabel.Text = $"Paired with {result.ChildName}!";
                await Task.Delay(1200);
                DialogResult = true;
                Close();
            }
            else
            {
                _statusLabel.Foreground = UiTheme.DangerBrush;
                _statusLabel.Text = "Invalid or expired code. Try again.";
                _pairButton.IsEnabled = true;
            }
        }
        catch (Exception ex)
        {
            _statusLabel.Foreground = UiTheme.DangerBrush;
            _statusLabel.Text = $"Pairing failed: {ex.Message}";
            _pairButton.IsEnabled = true;
        }
    }
}
