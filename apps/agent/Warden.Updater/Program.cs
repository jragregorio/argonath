namespace Warden.Updater;

/// <summary>
/// Entry point for the SYSTEM task Warden\WardenUpdater (started on demand by the tray's
/// Update button). Takes no arguments: everything it acts on comes from the server.
/// </summary>
internal static class Program
{
    private const string MutexName = @"Global\WardenUpdater";

    /// <summary>Read by the tray (as the child), so it lives in the shared data folder.</summary>
    internal static string StatusPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Warden",
        "update-status.json"
    );

    // Synchronous on purpose: the mutex must be released on the thread that acquired it, and an
    // async Main would resume on a thread-pool thread after the first await.
    private static int Main()
    {
        bool acquired;
        IDisposable? handle;
        try
        {
            acquired = SingleRun.TryAcquire(MutexName, out handle);
        }
        catch (UnauthorizedAccessException)
        {
            return 1; // mutex name squatted with a hostile DACL; nothing safe to do
        }

        if (!acquired)
        {
            return 0; // an update is already running
        }

        using (handle)
        {
            var paths = UpdaterPaths.ForCurrentAccount();
            var logPath = Path.Combine(paths.LogsDir, $"updater-{DateTime.Now:yyyyMMdd}.log");
            try
            {
                Directory.CreateDirectory(paths.LogsDir);
            }
            catch
            {
                // continue without a log file
            }

            using var env = new SystemUpdaterEnvironment(AppContext.BaseDirectory, logPath);
            var status = new UpdaterRunner(env, StatusPath, paths.DownloadsDir).RunAsync().GetAwaiter().GetResult();
            return status.Result == "failed" ? 1 : 0;
        }
    }
}
