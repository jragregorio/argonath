using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Warden.Core.Diagnostics;
using Warden.Core.Models;

namespace Warden.Core.Services;

public static class RunningAppEnumerator
{
    private const int GwlExStyle = -20;
    private const uint WsExToolWindow = 0x00000080;
    private const uint WsExAppWindow = 0x00040000;
    private const uint GwOwner = 4;
    private const int DwmwaCloaked = 14;
    private const int MaxApps = 40;

    private static readonly HashSet<string> SkipProcessNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "dwm",
        "csrss",
        "winlogon",
        "SearchHost",
        "StartMenuExperienceHost",
        "ShellExperienceHost",
        "RuntimeBroker",
        "TextInputHost",
        "LockApp",
        "Warden.LockUI",
    };

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr hwnd,
        int dwAttribute,
        out int pvAttribute,
        int cbAttribute
    );

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    private sealed class WindowCandidate
    {
        public IntPtr Hwnd { get; init; }
        public string Title { get; init; } = "";
        public string ProcessName { get; init; } = "";
    }

    public static List<RunningAppInfo> Enumerate()
    {
        try
        {
            var foregroundHwnd = GetForegroundWindow();
            var byPid = new Dictionary<uint, WindowCandidate>();

            EnumWindows(
                (hWnd, _) =>
                {
                    try
                    {
                        if (!IsEligibleWindow(hWnd))
                            return true;

                        var title = GetWindowTitle(hWnd);
                        GetWindowThreadProcessId(hWnd, out var pid);

                        string processName;
                        try
                        {
                            using var proc = Process.GetProcessById((int)pid);
                            processName = proc.ProcessName;
                        }
                        catch
                        {
                            return true;
                        }

                        if (ShouldSkipProcess(processName, title))
                            return true;

                        if (string.IsNullOrWhiteSpace(title))
                            return true;

                        if (byPid.TryGetValue(pid, out var existing))
                        {
                            var preferNew =
                                hWnd == foregroundHwnd
                                || (
                                    existing.Hwnd != foregroundHwnd
                                    && title.Length > existing.Title.Length
                                );
                            if (preferNew)
                            {
                                byPid[pid] = new WindowCandidate
                                {
                                    Hwnd = hWnd,
                                    Title = title,
                                    ProcessName = processName,
                                };
                            }
                        }
                        else
                        {
                            byPid[pid] = new WindowCandidate
                            {
                                Hwnd = hWnd,
                                Title = title,
                                ProcessName = processName,
                            };
                        }
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Debug("RunningApps", "Window enumeration row failed", ex);
                    }

                    return true;
                },
                IntPtr.Zero
            );

            var apps = byPid.Values
                .Select(candidate => new RunningAppInfo
                {
                    ProcessName = candidate.ProcessName,
                    Title = candidate.Title,
                    IsForeground = candidate.Hwnd == foregroundHwnd,
                })
                .OrderByDescending(a => a.IsForeground)
                .ThenBy(a => a.Title, StringComparer.OrdinalIgnoreCase)
                .Take(MaxApps)
                .ToList();

            return apps;
        }
        catch (Exception ex)
        {
            WardenLog.Warn("RunningApps", "Enumerate failed", ex);
            return new List<RunningAppInfo>();
        }
    }

    private static bool IsEligibleWindow(IntPtr hWnd)
    {
        if (!IsWindowVisible(hWnd))
            return false;

        if (GetWindow(hWnd, GwOwner) != IntPtr.Zero)
            return false;

        var exStyle = (uint)GetWindowLong(hWnd, GwlExStyle);
        if ((exStyle & WsExToolWindow) != 0 && (exStyle & WsExAppWindow) == 0)
            return false;

        if (
            DwmGetWindowAttribute(hWnd, DwmwaCloaked, out var cloaked, sizeof(int)) == 0
            && cloaked != 0
        )
            return false;

        return true;
    }

    private static string GetWindowTitle(IntPtr hWnd)
    {
        var length = GetWindowTextLength(hWnd);
        if (length <= 0)
            return "";

        var sb = new StringBuilder(length + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString().Trim();
    }

    private static bool ShouldSkipProcess(string processName, string title)
    {
        if (SkipProcessNames.Contains(processName))
            return true;

        if (
            processName.Equals("ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(title)
        )
            return true;

        return false;
    }
}
