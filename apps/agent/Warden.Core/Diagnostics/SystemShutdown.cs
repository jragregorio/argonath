using System.Diagnostics;

namespace Warden.Core.Diagnostics;

/// <summary>
/// Initiates a real Windows system shutdown (not just exiting the agent).
/// Uses shutdown.exe so standard child user accounts can power off without admin rights.
/// </summary>
public static class SystemShutdown
{
    public static (bool ok, string? error) Initiate()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "shutdown.exe",
                Arguments = "/s /t 0",
                CreateNoWindow = true,
                UseShellExecute = false,
            };
            Process.Start(psi);
            WardenLog.Info("Shutdown", "Initiated Windows shutdown via shutdown.exe /s /t 0");
            return (true, null);
        }
        catch (Exception ex)
        {
            WardenLog.Error("Shutdown", "Failed to initiate Windows shutdown", ex);
            return (false, "Could not shut down. Try the Start menu.");
        }
    }
}
