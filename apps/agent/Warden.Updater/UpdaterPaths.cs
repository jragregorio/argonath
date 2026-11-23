namespace Warden.Updater;

/// <summary>
/// SYSTEM work folders. They live under the updater account's own LocalAppData — for SYSTEM
/// that is <c>C:\Windows\System32\config\systemprofile\AppData\Local</c>, which only SYSTEM and
/// Administrators can write — never under child-writable <c>C:\ProgramData\Warden</c>.
/// </summary>
public sealed record UpdaterPaths(string DownloadsDir, string LogsDir)
{
    public static UpdaterPaths Under(string localAppData)
    {
        var root = Path.Combine(localAppData, "Warden", "updater");
        return new UpdaterPaths(Path.Combine(root, "downloads"), Path.Combine(root, "logs"));
    }

    public static UpdaterPaths ForCurrentAccount() =>
        Under(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
}
