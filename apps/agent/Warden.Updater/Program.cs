namespace Warden.Updater;

/// <summary>
/// Entry point for the SYSTEM task Warden\WardenUpdater (started on demand by the tray's
/// Update button). Takes no arguments: everything it acts on comes from the server.
/// </summary>
internal static class Program
{
    private const string MutexName = @"Global\WardenUpdater";

    private static readonly string DataRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Warden"
    );

    internal static string StatusPath => Path.Combine(DataRoot, "update-status.json");

    private static async Task<int> Main()
    {
        if (!SingleRun.TryAcquire(MutexName, out var handle))
        {
            return 0; // an update is already running
        }

        using (handle)
        {
            var updaterRoot = Path.Combine(DataRoot, "updater");
            var logsDir = Path.Combine(updaterRoot, "logs");
            var downloadsDir = Path.Combine(updaterRoot, "downloads");
            var logPath = Path.Combine(logsDir, $"updater-{DateTime.Now:yyyyMMdd}.log");

            using var env = new SystemUpdaterEnvironment(AppContext.BaseDirectory, logPath);
            try
            {
                EnsureLogsDirectory(env, updaterRoot, logsDir);
            }
            catch
            {
                // continue without a log file
            }

            var status = await new UpdaterRunner(env, StatusPath, downloadsDir).RunAsync();
            return status.Result == "failed" ? 1 : 0;
        }
    }

    /// <summary>
    /// The protected updater root is created once (SYSTEM/Administrators only) and keeps its
    /// logs across runs; downloads\ is recreated by the runner on each install.
    /// </summary>
    private static void EnsureLogsDirectory(SystemUpdaterEnvironment env, string updaterRoot, string logsDir)
    {
        if (!IsProtectedByAdmins(updaterRoot))
        {
            env.PrepareSecureDirectory(updaterRoot);
        }

        Directory.CreateDirectory(logsDir);
    }

    private static bool IsProtectedByAdmins(string path)
    {
        if (!Directory.Exists(path))
        {
            return false;
        }

        var owner = new DirectoryInfo(path)
            .GetAccessControl()
            .GetOwner(typeof(System.Security.Principal.SecurityIdentifier));
        return owner is System.Security.Principal.SecurityIdentifier sid
            && (sid.IsWellKnown(System.Security.Principal.WellKnownSidType.BuiltinAdministratorsSid)
                || sid.IsWellKnown(System.Security.Principal.WellKnownSidType.LocalSystemSid));
    }
}
