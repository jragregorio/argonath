namespace Warden.Updater;

/// <summary>Side effects of an update run (network, msiexec, Task Scheduler, ACLs, logging).</summary>
public interface IUpdaterEnvironment
{
    /// <summary>Installed agent version (X.Y.Z), from Warden.Tray.exe next to the updater.</summary>
    string InstalledVersion();

    /// <summary>Latest stable release from the server, or null when none is published.</summary>
    Task<ReleaseInfo?> FetchLatestAsync();

    /// <summary>
    /// Creates <paramref name="path"/> if missing. Callers only pass folders under the updater
    /// account's own LocalAppData (see <see cref="UpdaterPaths"/>), so no ACL work is needed.
    /// </summary>
    void EnsureWorkDirectory(string path);

    Task DownloadAsync(string url, string dest);

    /// <summary>Runs a silent msiexec install and returns its exit code.</summary>
    int RunMsiexec(string msiPath, string logPath);

    /// <summary>All scheduled task names (as Task Scheduler reports them, e.g. "\Warden\WardenTray").</summary>
    IReadOnlyList<string> QueryTrayTaskNames();

    /// <summary>Starts a scheduled task now; returns the schtasks exit code.</summary>
    int RunTask(string name);

    void Log(string line);
}
