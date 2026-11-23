using System.Text.Json;

namespace Warden.Updater;

/// <summary>
/// Outcome of the last updater run. The tray reads this file (with its own DTO) to show
/// "Update failed — try again". <c>Result</c> is "succeeded", "failed" or "up_to_date".
/// </summary>
public sealed record UpdateStatus(
    string Result,
    string FromVersion,
    string? ToVersion,
    DateTimeOffset At,
    int? MsiExitCode,
    string? Message
);

public static class UpdateStatusStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    /// <summary>
    /// Writes the status file. The status file lives in a folder other accounts may be able to
    /// write to, so any existing entry (which could be a planted link) is deleted first and the
    /// file is created fresh with <see cref="FileMode.CreateNew"/>.
    /// </summary>
    public static void Write(string path, UpdateStatus status)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        if (File.Exists(path) || Directory.Exists(path))
        {
            File.Delete(path);
        }

        using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
        JsonSerializer.Serialize(stream, status, JsonOptions);
    }

    public static UpdateStatus? Read(string path)
    {
        try
        {
            return JsonSerializer.Deserialize<UpdateStatus>(File.ReadAllText(path), JsonOptions);
        }
        catch
        {
            return null;
        }
    }
}
