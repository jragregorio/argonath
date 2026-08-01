namespace Warden.Core.Diagnostics;

/// <summary>
/// Crash / hard-kill detector via a marker file under %LOCALAPPDATA%\Warden.
/// Written while the agent is running; cleared only on clean shutdown / logoff.
/// If the marker is still present at the next start, the prior session ended uncleanly
/// (End Task, crash, power loss, etc.).
/// </summary>
public static class SessionMarker
{
    private const string FileName = "session.running";

    private static string MarkerPath()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Warden"
        );
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, FileName);
    }

    /// <summary>
    /// Returns true when a previous run left the marker behind (unclean exit).
    /// Does not modify the file.
    /// </summary>
    public static bool HadUncleanPreviousSession()
    {
        try
        {
            return File.Exists(MarkerPath());
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Mark this process as actively running.</summary>
    public static void MarkRunning()
    {
        try
        {
            File.WriteAllText(
                MarkerPath(),
                $"pid={Environment.ProcessId}; startedUtc={DateTime.UtcNow:O}"
            );
        }
        catch (Exception ex)
        {
            WardenLog.Debug("Session", "MarkRunning failed", ex);
        }
    }

    /// <summary>Clear the marker on intentional clean exit.</summary>
    public static void ClearClean()
    {
        try
        {
            var path = MarkerPath();
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception ex)
        {
            WardenLog.Debug("Session", "ClearClean failed", ex);
        }
    }
}
