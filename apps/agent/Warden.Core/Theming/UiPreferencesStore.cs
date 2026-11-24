using System.Text.Json;
using System.Text.Json.Serialization;
using Warden.Core.Diagnostics;

namespace Warden.Core.Theming;

/// <summary>
/// The child's look-and-feel choices, saved per Windows account in
/// %LOCALAPPDATA%\Warden\ui.json (separate from the pairing config).
/// Purely cosmetic: a missing or broken file just means the default colour.
/// </summary>
public sealed class UiPreferencesStore
{
    private readonly string _path;

    public UiPreferencesStore(string? directory = null)
    {
        var dir = directory
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Warden");
        _path = Path.Combine(dir, "ui.json");
    }

    public string LoadAccentHex()
    {
        try
        {
            if (!File.Exists(_path)) return AccentPalette.DefaultHex;
            var prefs = JsonSerializer.Deserialize<UiPreferences>(File.ReadAllText(_path));
            return AccentPalette.TryNormalizeHex(prefs?.Accent, out var hex) ? hex : AccentPalette.DefaultHex;
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            WardenLog.Debug("UiPrefs", "ui.json unreadable; using default colour", ex);
            return AccentPalette.DefaultHex;
        }
    }

    public void SaveAccentHex(string? hex)
    {
        if (!AccentPalette.TryNormalizeHex(hex, out var normalized)) return;

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(new UiPreferences { Accent = normalized }));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            WardenLog.Warn("UiPrefs", "Could not save ui.json", ex);
        }
    }

    private sealed class UiPreferences
    {
        [JsonPropertyName("accent")]
        public string? Accent { get; set; }
    }
}
