using System.Diagnostics;
using Warden.Core.Diagnostics;

namespace Warden.Core.Services;

/// <summary>
/// Closes processes whose names appear on the child's blocked-apps list.
/// </summary>
public sealed class BlockedAppEnforcer
{
    private static readonly HashSet<string> NeverKillProcessNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Warden.Tray",
        "Warden.LockUI",
        "dwm",
        "csrss",
        "winlogon",
        "SearchHost",
        "StartMenuExperienceHost",
        "ShellExperienceHost",
        "RuntimeBroker",
        "TextInputHost",
        "LockApp",
        "explorer",
        "ApplicationFrameHost",
    };

    private readonly Dictionary<string, DateTime> _lastLogUtcByProcessName =
        new(StringComparer.OrdinalIgnoreCase);

    private const double LogThrottleSeconds = 10;

    public void Enforce(IReadOnlyList<string>? blockedProcessNames)
    {
        if (blockedProcessNames == null || blockedProcessNames.Count == 0)
            return;

        var currentPid = Environment.ProcessId;
        var now = DateTime.UtcNow;

        foreach (var blockedName in blockedProcessNames)
        {
            if (string.IsNullOrWhiteSpace(blockedName))
                continue;
            if (NeverKillProcessNames.Contains(blockedName))
                continue;

            try
            {
                var processes = Process.GetProcessesByName(blockedName);
                foreach (var proc in processes)
                {
                    try
                    {
                        if (proc.Id == currentPid)
                            continue;

                        var procName = proc.ProcessName;
                        if (NeverKillProcessNames.Contains(procName))
                            continue;

                        if (proc.HasExited)
                            continue;

                        // Do not WaitForExit on the 1s evaluate tick (would stall lock).
                        proc.CloseMainWindow();
                        if (!proc.HasExited)
                            proc.Kill(entireProcessTree: true);
                    }
                    catch (Exception ex)
                    {
                        LogThrottled(
                            blockedName,
                            $"Close/kill failed for {proc.ProcessName} pid={proc.Id}",
                            ex,
                            now
                        );
                    }
                    finally
                    {
                        proc.Dispose();
                    }
                }
            }
            catch (Exception ex)
            {
                LogThrottled(
                    blockedName,
                    $"GetProcessesByName failed for {blockedName}",
                    ex,
                    now
                );
            }
        }
    }

    private void LogThrottled(
        string processName,
        string message,
        Exception ex,
        DateTime now
    )
    {
        if (
            _lastLogUtcByProcessName.TryGetValue(processName, out var last)
            && (now - last).TotalSeconds < LogThrottleSeconds
        )
            return;

        _lastLogUtcByProcessName[processName] = now;
        WardenLog.Warn("BlockedApps", message, ex);
    }
}
