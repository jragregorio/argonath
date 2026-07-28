using Microsoft.Win32;

namespace Warden.Tray;

internal static class StartupHelper
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "Warden";

    public static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
        var value = key?.GetValue(RunValueName) as string;
        var exePath = GetExecutablePath();
        return !string.IsNullOrEmpty(value)
            && !string.IsNullOrEmpty(exePath)
            && string.Equals(value.Trim('"'), exePath, StringComparison.OrdinalIgnoreCase);
    }

    public static void SetEnabled(bool enabled)
    {
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
