using System.Diagnostics;
using System.IO;
using System.Security.Principal;
using System.Text;
using System.Xml.Linq;
using Microsoft.Win32;
using Warden.Core.Diagnostics;

namespace Warden.Tray;

internal enum InstallerTaskState
{
    Missing,
    Disabled,
    WrongUser,
    Ok,
    Unknown,
}

internal sealed class StartupDiagnosis
{
    public InstallerTaskState TaskState { get; init; } = InstallerTaskState.Unknown;
    public string? TaskTriggerUser { get; init; }
    public string? TaskPrincipalUser { get; init; }
    public string? CurrentUser { get; init; }
    public string? HkcuRunValue { get; init; }
    public bool HkcuRunMatchesExe { get; init; }
    public bool IsEffectivelyEnabled { get; init; }
    public string Summary { get; init; } = "";
}

internal static class StartupHelper
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "Warden";
    private const int SchtasksTimeoutMs = 3000;
    private static readonly XNamespace TaskNs =
        "http://schemas.microsoft.com/windows/2004/02/mit/task";

    private static readonly object CacheGate = new();
    private static StartupDiagnosis? _cachedDiagnosis;
    private static bool _cachedAfterSelfHeal;

    /// <summary>Task name registered by the per-machine MSI (must match installer authoring).</summary>
    internal const string InstallerTaskName = @"Warden\WardenTray";
    internal const string InstallerPerUserTaskPrefix = @"Warden\WardenTray-";

    public static StartupDiagnosis Diagnose(bool selfHeal = true)
    {
        try
        {
            lock (CacheGate)
            {
                // Reuse prior result: a self-heal snapshot satisfies any later read;
                // a non-heal snapshot only satisfies non-heal callers.
                if (_cachedDiagnosis is not null && (_cachedAfterSelfHeal || !selfHeal))
                {
                    return _cachedDiagnosis;
                }
            }

            var currentUser = $"{Environment.UserDomainName}\\{Environment.UserName}";
            var taskState = GetInstallerTaskState(out var triggerUser, out var principalUser);
            var hkcu = GetHkcuRunValue();
            var exePath = GetExecutablePath();
            var hkcuMatches = HkcuMatchesExe(hkcu, exePath);

            if (selfHeal
                && taskState is InstallerTaskState.Missing
                    or InstallerTaskState.Disabled
                    or InstallerTaskState.WrongUser)
            {
                TryInstallHkcuFallback(exePath, hkcu, hkcuMatches, taskState, triggerUser);
                hkcu = GetHkcuRunValue();
                hkcuMatches = HkcuMatchesExe(hkcu, exePath);
            }
            else if (selfHeal && taskState == InstallerTaskState.Ok)
            {
                // Task is healthy — remove leftover HKCU Run so logon does not double-start.
                TryRetireHkcuFallback(hkcu);
                hkcu = GetHkcuRunValue();
                hkcuMatches = HkcuMatchesExe(hkcu, exePath);
            }

            var enabled = taskState == InstallerTaskState.Ok || hkcuMatches;
            var summary =
                $"task={taskState}; trigger={triggerUser ?? "(none)"}; current={currentUser}; "
                + $"hkcu={(hkcuMatches ? "ok" : (string.IsNullOrEmpty(hkcu) ? "absent" : "mismatch"))}";

            WardenLog.Info("Startup", summary);
            if (taskState == InstallerTaskState.WrongUser)
            {
                WardenLog.Warn(
                    "Startup",
                    $"Installer task bound to '{triggerUser ?? principalUser}' but current user is '{currentUser}'."
                );
            }

            var diagnosis = new StartupDiagnosis
            {
                TaskState = taskState,
                TaskTriggerUser = triggerUser,
                TaskPrincipalUser = principalUser,
                CurrentUser = currentUser,
                HkcuRunValue = hkcu,
                HkcuRunMatchesExe = hkcuMatches,
                IsEffectivelyEnabled = enabled,
                Summary = summary,
            };

            lock (CacheGate)
            {
                _cachedDiagnosis = diagnosis;
                _cachedAfterSelfHeal = selfHeal;
            }

            return diagnosis;
        }
        catch (Exception ex)
        {
            WardenLog.Warn("Startup", "Diagnose failed", ex);
            return new StartupDiagnosis
            {
                TaskState = InstallerTaskState.Unknown,
                Summary = "diagnose-failed",
            };
        }
    }

    /// <summary>Invalidate cached diagnosis after the user toggles HKCU Run.</summary>
    public static void InvalidateCache()
    {
        lock (CacheGate)
        {
            _cachedDiagnosis = null;
            _cachedAfterSelfHeal = false;
        }
    }

    public static InstallerTaskState GetInstallerTaskState(
        out string? triggerUser,
        out string? principalUser
    )
    {
        triggerUser = null;
        principalUser = null;

        var taskNames = new[]
        {
            InstallerTaskName,
            InstallerPerUserTaskPrefix + SanitizeSamForTaskName(Environment.UserName),
        };

        foreach (var taskName in taskNames)
        {
            var state = QueryInstallerTaskState(taskName, out triggerUser, out principalUser);
            if (state != InstallerTaskState.Missing)
            {
                return state;
            }
        }

        return InstallerTaskState.Missing;
    }

    private static string SanitizeSamForTaskName(string sam)
    {
        if (string.IsNullOrWhiteSpace(sam))
        {
            return "_";
        }

        var sb = new StringBuilder(sam.Length);
        foreach (var ch in sam)
        {
            if ((ch >= 'A' && ch <= 'Z')
                || (ch >= 'a' && ch <= 'z')
                || (ch >= '0' && ch <= '9')
                || ch == '.'
                || ch == '_'
                || ch == '-')
            {
                sb.Append(ch);
            }
            else
            {
                sb.Append('_');
            }
        }

        return sb.Length > 0 ? sb.ToString() : "_";
    }

    private static InstallerTaskState QueryInstallerTaskState(
        string taskName,
        out string? triggerUser,
        out string? principalUser
    )
    {
        triggerUser = null;
        principalUser = null;
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "schtasks.exe",
                    Arguments = $"/Query /TN \"{taskName}\" /XML",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    // Do not set StandardOutputEncoding — schtasks may emit UTF-16 or
                    // UTF-8 depending on OS/locale; we decode from raw bytes below.
                },
            };

            if (!process.Start())
            {
                return InstallerTaskState.Unknown;
            }

            // Read both pipes concurrently so a full buffer cannot deadlock, and so
            // WaitForExit(timeout) actually bounds the whole operation (ReadToEnd alone
            // blocks until the child closes the pipe and defeats the timeout).
            var stdoutBytesTask = ReadAllBytesAsync(process.StandardOutput.BaseStream);
            var stderrTask = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(SchtasksTimeoutMs))
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch
                {
                    // ignore
                }

                try
                {
                    _ = Task.WhenAny(
                        Task.WhenAll(stdoutBytesTask, stderrTask),
                        Task.Delay(500)
                    ).GetAwaiter().GetResult();
                }
                catch
                {
                    // ignore
                }

                WardenLog.Warn("Startup", "schtasks /Query timed out");
                return InstallerTaskState.Unknown;
            }

            // Process exited; finish draining pipes (should already be done).
            if (!Task.WaitAll(new Task[] { stdoutBytesTask, stderrTask }, 1000))
            {
                WardenLog.Warn("Startup", "schtasks /Query stream drain timed out");
                return InstallerTaskState.Unknown;
            }

            var stdoutBytes = stdoutBytesTask.Result;
            var stderr = stderrTask.Result;

            if (process.ExitCode != 0)
            {
                WardenLog.Debug(
                    "Startup",
                    $"schtasks /Query exit={process.ExitCode} stderr={Truncate(stderr, 200)}"
                );
                return InstallerTaskState.Missing;
            }

            var xmlText = DecodeSchtasksXml(stdoutBytes);
            if (string.IsNullOrWhiteSpace(xmlText))
            {
                return InstallerTaskState.Unknown;
            }

            XDocument doc;
            try
            {
                doc = XDocument.Parse(xmlText);
            }
            catch (Exception ex)
            {
                WardenLog.Warn("Startup", "Failed to parse schtasks XML", ex);
                return InstallerTaskState.Unknown;
            }

            triggerUser = doc.Descendants(TaskNs + "LogonTrigger")
                .Elements(TaskNs + "UserId")
                .Select(e => e.Value?.Trim())
                .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
            principalUser = doc.Descendants(TaskNs + "Principal")
                .Elements(TaskNs + "UserId")
                .Select(e => e.Value?.Trim())
                .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

            triggerUser ??= doc.Descendants()
                .Where(e => e.Name.LocalName == "LogonTrigger")
                .Elements()
                .Where(e => e.Name.LocalName == "UserId")
                .Select(e => e.Value?.Trim())
                .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
            principalUser ??= doc.Descendants()
                .Where(e => e.Name.LocalName == "Principal")
                .Elements()
                .Where(e => e.Name.LocalName == "UserId")
                .Select(e => e.Value?.Trim())
                .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

            var enabledText = doc.Descendants(TaskNs + "Settings")
                .Elements(TaskNs + "Enabled")
                .Select(e => e.Value?.Trim())
                .FirstOrDefault();
            if (string.Equals(enabledText, "false", StringComparison.OrdinalIgnoreCase))
            {
                return InstallerTaskState.Disabled;
            }

            var bindUser = triggerUser ?? principalUser;
            if (string.IsNullOrWhiteSpace(bindUser))
            {
                return InstallerTaskState.Unknown;
            }

            if (UsersMatch(bindUser, Environment.UserDomainName, Environment.UserName))
            {
                return InstallerTaskState.Ok;
            }

            return InstallerTaskState.WrongUser;
        }
        catch (Exception ex)
        {
            WardenLog.Warn("Startup", "GetInstallerTaskState failed", ex);
            return InstallerTaskState.Unknown;
        }
    }

    public static bool IsEnabled()
    {
        try
        {
            return Diagnose(selfHeal: false).IsEffectivelyEnabled;
        }
        catch
        {
            return false;
        }
    }

    public static void SetEnabled(bool enabled)
    {
        var state = GetInstallerTaskState(out _, out _);
        if (state == InstallerTaskState.Ok)
        {
            throw new InvalidOperationException(
                "Startup is managed by the Warden installer and cannot be changed from the tray."
            );
        }

        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
            ?? Registry.CurrentUser.CreateSubKey(RunKeyPath);

        if (!enabled)
        {
            key.DeleteValue(RunValueName, throwOnMissingValue: false);
            WardenLog.Info("Startup", "Removed HKCU Run\\Warden fallback");
            InvalidateCache();
            return;
        }

        var exePath = GetExecutablePath();
        if (string.IsNullOrEmpty(exePath))
        {
            throw new InvalidOperationException("Could not determine Warden executable path.");
        }

        key.SetValue(RunValueName, $"\"{exePath}\"");
        WardenLog.Info("Startup", $"Set HKCU Run\\Warden to \"{exePath}\"");
        InvalidateCache();
    }

    public static string BuildDiagnosticsClipboardText(StartupDiagnosis? diagnosis = null)
    {
        try
        {
            diagnosis ??= Diagnose(selfHeal: false);
            var exe = GetExecutablePath() ?? "(unknown)";
            var logDir = WardenLog.GetLogDirectory();
            return string.Join(
                Environment.NewLine,
                [
                    $"Warden diagnostics {DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}",
                    $"Version: {Warden.Core.AgentVersionInfo.Current}",
                    $"Exe: {exe}",
                    $"User: {diagnosis.CurrentUser}",
                    $"Autostart: {diagnosis.Summary}",
                    $"Task trigger user: {diagnosis.TaskTriggerUser ?? "(none)"}",
                    $"Task principal user: {diagnosis.TaskPrincipalUser ?? "(none)"}",
                    $"HKCU Run: {diagnosis.HkcuRunValue ?? "(not set)"}",
                    $"Log folder: {logDir}",
                ]
            );
        }
        catch (Exception ex)
        {
            return $"Warden diagnostics unavailable: {ex.Message}";
        }
    }

    private static bool HkcuMatchesExe(string? hkcu, string? exePath) =>
        !string.IsNullOrEmpty(hkcu)
        && !string.IsNullOrEmpty(exePath)
        && string.Equals(hkcu.Trim('"'), exePath, StringComparison.OrdinalIgnoreCase);

    private static void TryInstallHkcuFallback(
        string? exePath,
        string? currentValue,
        bool alreadyMatches,
        InstallerTaskState state,
        string? triggerUser
    )
    {
        try
        {
            if (alreadyMatches || string.IsNullOrEmpty(exePath))
            {
                return;
            }

            var desired = $"\"{exePath}\"";
            if (!string.IsNullOrEmpty(currentValue)
                && string.Equals(currentValue, desired, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
                ?? Registry.CurrentUser.CreateSubKey(RunKeyPath);
            key.SetValue(RunValueName, desired);
            WardenLog.Warn(
                "Startup",
                $"Installer task state={state} (trigger={triggerUser ?? "n/a"}); "
                    + "installed per-user HKCU Run fallback because the task will not fire for this account."
            );
        }
        catch (Exception ex)
        {
            WardenLog.Warn("Startup", "Failed to install HKCU Run fallback", ex);
        }
    }

    /// <summary>
    /// When the installer logon task is healthy, remove HKCU Run\Warden so logon
    /// does not start two instances (task + leftover self-heal Run key).
    /// </summary>
    private static void TryRetireHkcuFallback(string? currentValue)
    {
        try
        {
            if (string.IsNullOrEmpty(currentValue))
            {
                return;
            }

            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
            if (key == null)
            {
                return;
            }

            key.DeleteValue(RunValueName, throwOnMissingValue: false);
            WardenLog.Info(
                "Startup",
                "Removed HKCU Run\\Warden per-user fallback because installer task is Ok."
            );
        }
        catch (Exception ex)
        {
            WardenLog.Warn("Startup", "Failed to retire HKCU Run fallback", ex);
        }
    }

    private static string? GetHkcuRunValue()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            return key?.GetValue(RunValueName) as string;
        }
        catch
        {
            return null;
        }
    }

    private static async Task<byte[]> ReadAllBytesAsync(Stream stream)
    {
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms).ConfigureAwait(false);
        return ms.ToArray();
    }

    /// <summary>
    /// schtasks /XML may emit UTF-16 LE (with BOM) or UTF-8 depending on OS/locale.
    /// Forcing one encoding in ProcessStartInfo garbles the other and yields Unknown.
    /// </summary>
    private static string DecodeSchtasksXml(byte[] bytes)
    {
        if (bytes.Length == 0)
        {
            return "";
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
        {
            return Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2).TrimStart('\0').Trim();
        }

        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
        {
            return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3).Trim();
        }

        // Heuristic: UTF-16 LE without BOM often has many zero high-bytes.
        var zeroCount = 0;
        var sample = Math.Min(bytes.Length, 64);
        for (var i = 1; i < sample; i += 2)
        {
            if (bytes[i] == 0)
            {
                zeroCount++;
            }
        }

        if (zeroCount >= sample / 4)
        {
            return Encoding.Unicode.GetString(bytes).TrimStart('\uFEFF', '\0').Trim();
        }

        return Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF').Trim();
    }

    private static bool UsersMatch(string taskUser, string domain, string userName)
    {
        try
        {
            var current = $"{domain}\\{userName}";
            if (string.Equals(taskUser, current, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var taskBare = taskUser.Contains('\\')
                ? taskUser[(taskUser.LastIndexOf('\\') + 1)..]
                : taskUser;

            var taskSid = TryTranslateToSid(taskUser) ?? TryTranslateToSid(taskBare);
            var currentSid = TryTranslateToSid(current) ?? WindowsIdentity.GetCurrent().User?.Value;
            if (!string.IsNullOrEmpty(taskSid)
                && !string.IsNullOrEmpty(currentSid)
                && string.Equals(taskSid, currentSid, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            // Bare SAM name match only when task UserId is unqualified or clearly local.
            return string.Equals(taskBare, userName, StringComparison.OrdinalIgnoreCase)
                && (!taskUser.Contains('\\')
                    || taskUser.StartsWith(domain + "\\", StringComparison.OrdinalIgnoreCase)
                    || taskUser.StartsWith(".\\", StringComparison.OrdinalIgnoreCase)
                    || taskUser.StartsWith(
                        Environment.MachineName + "\\",
                        StringComparison.OrdinalIgnoreCase
                    ));
        }
        catch
        {
            return false;
        }
    }

    private static string? TryTranslateToSid(string account)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(account))
            {
                return null;
            }

            if (account.StartsWith("S-1-", StringComparison.OrdinalIgnoreCase))
            {
                return account;
            }

            var nt = new NTAccount(account);
            return nt.Translate(typeof(SecurityIdentifier)).Value;
        }
        catch
        {
            return null;
        }
    }

    private static string? GetExecutablePath() => Environment.ProcessPath;

    private static string Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value.Length <= max ? value : value[..max];
    }
}
