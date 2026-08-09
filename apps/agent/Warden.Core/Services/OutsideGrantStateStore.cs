using System.Text.Json;

namespace Warden.Core.Services;

/// <summary>
/// Persists after-hours extension pierce baseline across tray restarts so a
/// parent-PIN quit cannot reset the grant to a fresh full bonus.
/// </summary>
public sealed class OutsideGrantStateStore
{
    private readonly string _path;
    private static readonly object FileLock = new();
    private const int MaxIoRetries = 3;

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
        lock (FileLock)
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
    }

    public void Save(OutsideGrantState state)
    {
        var json = JsonSerializer.Serialize(state, JsonOptions);
        var directory = Path.GetDirectoryName(_path)!;

        lock (FileLock)
        {
            string? tempPath = null;
            try
            {
                for (var attempt = 1; attempt <= MaxIoRetries; attempt++)
                {
                    tempPath = Path.Combine(directory, $"outside-grant.{Guid.NewGuid():N}.tmp");
                    try
                    {
                        File.WriteAllText(tempPath, json);

                        if (File.Exists(_path))
                        {
                            File.Replace(tempPath, _path, null);
                        }
                        else
                        {
                            File.Move(tempPath, _path);
                        }

                        tempPath = null;
                        return;
                    }
                    catch (IOException) when (attempt < MaxIoRetries)
                    {
                        if (tempPath != null)
                        {
                            TryDeleteTemp(tempPath);
                        }

                        tempPath = null;
                        Thread.Sleep(attempt * 20);
                    }
                }

                throw new IOException(
                    $"Failed to persist outside-grant state after {MaxIoRetries} attempts.");
            }
            finally
            {
                if (tempPath != null)
                {
                    TryDeleteTemp(tempPath);
                }
            }
        }
    }

    public void Clear()
    {
        lock (FileLock)
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

    private static void TryDeleteTemp(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Best-effort cleanup of partial temp file.
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
