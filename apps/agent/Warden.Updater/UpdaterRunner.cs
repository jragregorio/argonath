namespace Warden.Updater;

/// <summary>
/// One update attempt: fetch → decide → URL policy → download → verify → msiexec → relaunch tray.
/// The tray keeps running until msiexec starts, and is always relaunched once msiexec has run.
/// Nothing the tray says is trusted; the server's answer and the SHA-256 decide.
/// </summary>
public sealed class UpdaterRunner(IUpdaterEnvironment env, string statusPath, string updatesDir)
{
    private const string Succeeded = "succeeded";
    private const string Failed = "failed";
    private const string UpToDate = "up_to_date";

    public async Task<UpdateStatus> RunAsync()
    {
        var installed = "unknown";
        string? target = null;
        UpdateStatus status;

        try
        {
            installed = env.InstalledVersion();
            env.Log("Installed version " + installed);

            var release = await env.FetchLatestAsync();
            if (release is null || !UpdateDecision.IsNewer(installed, release.Version))
            {
                status = Make(UpToDate, installed, release?.Version, null, "No newer release.");
            }
            else
            {
                target = release.Version;
                status = await InstallAsync(installed, release);
            }
        }
        catch (Exception ex)
        {
            status = Make(Failed, installed, target, null, ex.Message);
        }

        env.Log($"Result {status.Result} ({status.Message})");
        try
        {
            UpdateStatusStore.Write(statusPath, status);
        }
        catch (Exception ex)
        {
            env.Log("Could not write status: " + ex.Message);
        }

        return status;
    }

    private async Task<UpdateStatus> InstallAsync(string installed, ReleaseInfo release)
    {
        if (!Uri.TryCreate(release.DownloadUrl, UriKind.Absolute, out var url) || !ReleaseUrlPolicy.IsAllowed(url))
        {
            return Make(Failed, installed, release.Version, null, "Download URL not allowed.");
        }

        env.PrepareSecureDirectory(updatesDir);
        // Version is strict X.Y.Z (IsNewer checked it), so it is safe in a file name.
        var msiPath = Path.Combine(updatesDir, $"Warden-{release.Version}-x64.msi");
        var logPath = Path.Combine(updatesDir, $"msiexec-{release.Version}.log");

        try
        {
            env.Log("Downloading " + url);
            await env.DownloadAsync(url.AbsoluteUri, msiPath);

            // Hold the file open (no writers, no deleters) from verification until msiexec exits,
            // so the verified bytes are the bytes that get installed.
            int exitCode;
            using (var locked = new FileStream(msiPath, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (!FileVerifier.Verify(locked, release.Sha256, release.SizeBytes))
                {
                    return Make(Failed, installed, release.Version, null, "Downloaded file failed SHA-256/size check.");
                }

                env.Log("Verified; running msiexec");
                try
                {
                    exitCode = env.RunMsiexec(msiPath, logPath);
                }
                finally
                {
                    TrayRelauncher.RelaunchAll(env);
                }
            }

            env.Log("msiexec exit " + exitCode);
            return exitCode is 0 or 3010
                ? Make(Succeeded, installed, release.Version, exitCode, "Installed.")
                : Make(Failed, installed, release.Version, exitCode, "msiexec failed.");
        }
        finally
        {
            TryDelete(msiPath);
        }
    }

    private void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception ex)
        {
            env.Log("Could not delete " + path + ": " + ex.Message);
        }
    }

    private static UpdateStatus Make(string result, string from, string? to, int? exit, string message) =>
        new(result, from, to, DateTimeOffset.UtcNow, exit, message);
}
