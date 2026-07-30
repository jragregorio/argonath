using System.Diagnostics;
using Microsoft.Win32;

namespace Warden.Tray;

internal static class StartupHelper
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "Warden";

    /// <summary>Task name registered by the per-machine MSI (must match installer authoring).</summary>
    internal const string InstallerTaskName = @"Warden\WardenTray";

    public static bool IsInstallerManaged()
    {
        try
        {
            using var process = Process.Start(
                new ProcessStartInfo
                {
                    FileName = "schtasks.exe",
                    Arguments = $"/Query /TN \"{InstallerTaskName}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                }
            );
            if (process is null)
            {
                return false;
            }

            if (!process.WaitForExit(3000))
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch
                {
                    // ignore
                }

                return false;
            }

            return process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    public static bool IsEnabled()
    {
        if (IsInstallerManaged())
        {
            return true;
        }

        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
        var value = key?.GetValue(RunValueName) as string;
        var exePath = GetExecutablePath();
        return !string.IsNullOrEmpty(value)
            && !string.IsNullOrEmpty(exePath)
            && string.Equals(value.Trim('"'), exePath, StringComparison.OrdinalIgnoreCase);
    }

    public static void SetEnabled(bool enabled)
    {
        if (IsInstallerManaged())
        {
            throw new InvalidOperationException(
                "Startup is managed by the Warden installer and cannot be changed from the tray."
            );
        }

        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
            ?? Registry.CurrentUser.CreateSubKey(RunKeyPath);

        if (!enabled)
        {
            key.DeleteValue(RunValueName, throwOnMissingValue: false);
            return;
        }

        var exePath = GetExecutablePath();
        if (string.IsNullOrEmpty(exePath))
        {
            throw new InvalidOperationException("Could not determine Warden executable path.");
        }

        key.SetValue(RunValueName, $"\"{exePath}\"");
    }

    private static string? GetExecutablePath()
    {
        return Environment.ProcessPath;
    }
}
