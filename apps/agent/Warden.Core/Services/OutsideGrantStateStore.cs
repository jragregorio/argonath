using System.Text.Json;

namespace Warden.Core.Services;

/// <summary>
/// Persists after-hours extension pierce baseline across tray restarts so a
/// parent-PIN quit cannot reset the grant to a fresh full bonus.
/// </summary>
public sealed class OutsideGrantStateStore
{
    private readonly string _path;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public OutsideGrantStateStore()
        : this(null)
    {
    }

    public OutsideGrantStateStore(string? configDirectory)
    {
        var dir = string.IsNullOrWhiteSpace(configDirectory)
            ? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Warden")
            : configDirectory;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "outside-grant.json");
    }

    public OutsideGrantState? Load()
    {
        if (!File.Exists(_path)) return null;
        try
        {
            var json = File.ReadAllText(_path);
            if (string.IsNullOrWhiteSpace(json)) return null;
            return JsonSerializer.Deserialize<OutsideGrantState>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    public void Save(OutsideGrantState state)
    {
        var json = JsonSerializer.Serialize(state, JsonOptions);
        var tempPath = _path + ".tmp";
        File.WriteAllText(tempPath, json);
        if (File.Exists(_path))
        {
            File.Replace(tempPath, _path, null);
        }
        else
        {
            File.Move(tempPath, _path);
        }
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(_path))
            {
                File.Delete(_path);
            }
        }
        catch
        {
            // Best-effort
        }
    }
}

public sealed class OutsideGrantState
{
    /// <summary>Family-calendar date (yyyy-MM-dd) the grant applies to.</summary>
    public string Date { get; set; } = "";

    public int BaselineUsedMinutes { get; set; }

    public int BonusMinutes { get; set; }
}
