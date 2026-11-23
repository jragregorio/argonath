using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace Warden.Updater;

/// <summary>Real side effects; runs as SYSTEM from the Warden\WardenUpdater task.</summary>
internal sealed class SystemUpdaterEnvironment : IUpdaterEnvironment, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    private readonly string _installDir;
    private readonly string _logPath;
    private readonly HttpClient _http;

    public SystemUpdaterEnvironment(string installDir, string logPath)
    {
        _installDir = installDir;
        _logPath = logPath;
        _http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("Warden-Updater");
    }

    public string InstalledVersion()
    {
        var info = FileVersionInfo.GetVersionInfo(Path.Combine(_installDir, "Warden.Tray.exe"));
        return $"{info.FileMajorPart}.{info.FileMinorPart}.{info.FileBuildPart}";
    }

    public async Task<ReleaseInfo?> FetchLatestAsync()
    {
        var apiBaseUrl = ReadApiBaseUrl();
        using var response = await _http.GetAsync($"{apiBaseUrl}/api/agent/release/latest?channel=stable");
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<ReleaseInfo>(JsonOptions);
    }

    private string ReadApiBaseUrl()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(_installDir, "warden.json")));
        var value = doc.RootElement.GetProperty("apiBaseUrl").GetString()?.Trim().TrimEnd('/');
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && !uri.IsLoopback))
        {
            throw new InvalidOperationException("warden.json apiBaseUrl is missing or not https.");
        }

        return value!;
    }

    /// <summary>
    /// (Re)creates <paramref name="path"/> owned by Administrators with only SYSTEM and
    /// Administrators allowed. An existing folder is removed first because a standard user
    /// could have pre-created it (and, as owner, could change its ACL later).
    /// </summary>
    public void PrepareSecureDirectory(string path)
    {
        SafeDirectory.RemoveExisting(path);

        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var admins = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        foreach (var sid in new[] { system, admins })
        {
            security.AddAccessRule(new FileSystemAccessRule(
                sid,
                FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow));
        }

        security.SetOwner(admins);
        new DirectoryInfo(path).Create(security);
    }

    public async Task DownloadAsync(string url, string dest)
    {
        using var response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        await using var file = new FileStream(dest, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await response.Content.CopyToAsync(file);
    }

    public int RunMsiexec(string msiPath, string logPath)
    {
        var msiexec = Path.Combine(Environment.SystemDirectory, "msiexec.exe");
        var (exit, _) = Run(msiexec, $"/i \"{msiPath}\" /qn /norestart /l*v \"{logPath}\"", TimeSpan.FromMinutes(14));
        return exit;
    }

    public IReadOnlyList<string> QueryTrayTaskNames()
    {
        var (exit, output) = Run(Schtasks, "/Query /FO CSV /NH", TimeSpan.FromSeconds(30));
        if (exit != 0)
        {
            throw new InvalidOperationException("schtasks /Query exit " + exit);
        }

        var names = new List<string>();
        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            // "TaskName","Next Run Time","Status"
            var trimmed = line.Trim();
            if (trimmed.Length < 2 || trimmed[0] != '"')
            {
                continue;
            }

            var end = trimmed.IndexOf('"', 1);
            if (end > 1)
            {
                names.Add(trimmed[1..end]);
            }
        }

        return names.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public int RunTask(string name) => Run(Schtasks, $"/Run /TN \"{name}\"", TimeSpan.FromSeconds(30)).Exit;

    public void Log(string line)
    {
        try
        {
            File.AppendAllText(_logPath, $"{DateTimeOffset.Now:O} {line}{Environment.NewLine}", Encoding.UTF8);
        }
        catch
        {
            // logging must never break an update
        }
    }

    public void Dispose() => _http.Dispose();

    private static string Schtasks => Path.Combine(Environment.SystemDirectory, "schtasks.exe");

    private static (int Exit, string Output) Run(string exe, string args, TimeSpan timeout)
    {
        using var process = Process.Start(new ProcessStartInfo(exe, args)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        }) ?? throw new InvalidOperationException("Could not start " + exe);

        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(timeout))
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch
            {
                // already gone
            }

            return (-1, "timeout");
        }

        return (process.ExitCode, stdout.Result + stderr.Result);
    }
}
