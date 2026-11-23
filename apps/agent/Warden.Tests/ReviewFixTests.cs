using System.Reflection;
using Warden.Installer.CA;
using Warden.Updater;
using Xunit;

namespace Warden.Tests;

/// <summary>Regression tests for the whole-branch review findings.</summary>
public class ReviewFixTests
{
    // Critical 1: SYSTEM work folders must live under the updater account's own (SYSTEM-only)
    // LocalAppData, never under child-writable C:\ProgramData\Warden.
    [Fact]
    public void Updater_work_folders_live_under_local_app_data()
    {
        var paths = UpdaterPaths.Under(@"C:\Windows\System32\config\systemprofile\AppData\Local");
        Assert.Equal(@"C:\Windows\System32\config\systemprofile\AppData\Local\Warden\updater\downloads", paths.DownloadsDir);
        Assert.Equal(@"C:\Windows\System32\config\systemprofile\AppData\Local\Warden\updater\logs", paths.LogsDir);
    }

    [Fact]
    public void Updater_no_longer_ships_recursive_delete_helper() =>
        Assert.Null(typeof(UpdaterRunner).Assembly.GetType("Warden.Updater.SafeDirectory"));

    // Important 2: async Main releases the mutex on a thread-pool thread -> ApplicationException.
    [Fact]
    public void Updater_main_is_synchronous()
    {
        var program = typeof(UpdaterRunner).Assembly.GetType("Warden.Updater.Program", throwOnError: true)!;
        var main = program.GetMethod("Main", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)!;
        Assert.Equal(typeof(int), main.ReturnType);
    }

    // Important 3: the updater task must survive RemoveExistingProducts during an upgrade.
    [Fact]
    public void Updater_task_is_not_deleted_during_major_upgrade()
    {
        var wxs = File.ReadAllText(Path.Combine(AgentRoot(), "Warden.Installer", "Package.wxs"));
        var line = wxs.Split('\n').Single(l => l.Contains("Action=\"DeleteWardenUpdaterTask\"") && l.Contains("Custom "));
        Assert.Contains("NOT UPGRADINGPRODUCTCODE", line);
    }

    // Important 4: SYSTEM installer log writes only into an admin/SYSTEM-owned, non-link folder.
    [Fact]
    public void Install_log_dir_owned_by_current_user_is_not_trusted()
    {
        var dir = Path.Combine(Path.GetTempPath(), "warden-log-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            Assert.False(InstallLogGuard.IsTrustedDirectory(dir));
        }
        finally
        {
            Directory.Delete(dir);
        }
    }

    [Fact]
    public void Install_log_dir_owned_by_system_is_trusted() =>
        Assert.True(InstallLogGuard.IsTrustedDirectory(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData)));

    [Fact]
    public void Missing_install_log_dir_is_not_trusted() =>
        Assert.False(InstallLogGuard.IsTrustedDirectory(@"C:\definitely-missing-" + Guid.NewGuid().ToString("N")));

    private static string AgentRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Warden.sln")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("Warden.sln not found");
    }
}
