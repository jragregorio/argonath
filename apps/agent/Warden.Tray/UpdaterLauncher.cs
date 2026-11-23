using System.Diagnostics;
using System.IO;
using System.Text.Json;
using Warden.Core.Diagnostics;

namespace Warden.Tray;

/// <summary>
/// Starts the SYSTEM task Warden\WardenUpdater and reads its status file. The tray passes no
/// version or URL: the updater asks the server itself.
/// </summary>
internal static class UpdaterLauncher
{
    internal const string UpdaterTaskName = @"Warden\WardenUpdater";

    private static string StatusPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Warden",
        "update-status.json"
    );

    public static bool TryStart()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo(
                Path.Combine(Environment.SystemDirectory, "schtasks.exe"),
                $"/Run /TN \"{UpdaterTaskName}\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            if (process is null)
            {
                return false;
            }

            if (!process.WaitForExit(5000))
            {
                try
                {
                    process.Kill();
                }
                catch
                {
                    // already gone
                }

                return false;
            }

            var ok = process.ExitCode == 0;
            WardenLog.Info("Update", $"schtasks /Run {UpdaterTaskName} exit={process.ExitCode}");
            return ok;
        }
        catch (Exception ex)
        {
            WardenLog.Info("Update", "Could not start updater: " + ex.Message);
            return false;
        }
    }

    public static LastUpdateResult? ReadLastResult()
    {
        try
        {
            if (!File.Exists(StatusPath))
            {
                return null;
            }

            using var doc = JsonDocument.Parse(File.ReadAllText(StatusPath));
            var root = doc.RootElement;
            return new LastUpdateResult(
                root.GetProperty("result").GetString() ?? "",
                root.GetProperty("fromVersion").GetString() ?? "",
                root.GetProperty("at").GetDateTimeOffset()
            );
        }
        catch
        {
            return null;
        }
    }
}
