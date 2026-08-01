using System.Diagnostics;
using System.Threading;
using Warden.Core.Diagnostics;

namespace Warden.Tray;

/// <summary>
/// Session-scoped single-instance guard for Warden.Tray.
/// Uses Local\ (not Global\) so each Windows user can run their own instance.
/// </summary>
internal static class SingleInstanceGuard
{
    /// <summary>Session-local mutex name. Keep in sync with any harnesses.</summary>
    internal const string MutexName = @"Local\Warden.Tray";

    /// <summary>
    /// Tries to acquire the single-instance mutex.
    /// Returns false only when another live Warden.Tray process holds it.
    /// Abandoned mutexes from crashed instances are taken over.
    /// If the mutex is held but no Tray process exists (squat), continues without
    /// the guard so a one-line script cannot permanently block startup.
    /// </summary>
    public static bool TryAcquire(out Mutex? mutex, out string message)
    {
        mutex = null;
        message = "";

        Mutex? created = null;
        try
        {
            created = new Mutex(initiallyOwned: false, MutexName, out _);
            try
            {
                // Zero timeout: either we own it now or another live holder does.
                var acquired = created.WaitOne(0);
                if (!acquired)
                {
                    var otherPid = TryFindOtherTrayPid();
                    if (otherPid is int pid)
                    {
                        message =
                            $"Another Warden.Tray instance is already running in this session (pid={pid}); exiting silently.";
                        created.Dispose();
                        created = null;
                        return false;
                    }

                    // Mutex held with no Tray process = squat / stale holder.
                    // Cannot steal a non-abandoned mutex; continue without guard.
                    WardenLog.Warn(
                        "Startup",
                        "Local\\Warden.Tray mutex is held but no Warden.Tray process was found (possible squat). Continuing without single-instance guard."
                    );
                    created.Dispose();
                    created = null;
                    mutex = null;
                    message =
                        "Mutex squat detected; continuing without single-instance guard.";
                    return true;
                }
            }
            catch (AbandonedMutexException)
            {
                // Previous owner crashed without ReleaseMutex — we now own it.
                WardenLog.Warn(
                    "Startup",
                    "Acquired abandoned Local\\Warden.Tray mutex (prior instance crashed)."
                );
            }

            mutex = created;
            created = null;
            message = "Acquired single-instance mutex " + MutexName;
            return true;
        }
        catch (Exception ex)
        {
            created?.Dispose();
            message = "Single-instance mutex acquisition failed; continuing without guard: " + ex.Message;
            // Fail open: better a duplicate than no enforcement.
            mutex = null;
            return true;
        }
    }

    public static void Release(ref Mutex? mutex)
    {
        if (mutex == null)
        {
            return;
        }

        try
        {
            mutex.ReleaseMutex();
        }
        catch (Exception ex)
        {
            WardenLog.Debug("Shutdown", "ReleaseMutex failed", ex);
        }

        try
        {
            mutex.Dispose();
        }
        catch (Exception ex)
        {
            WardenLog.Debug("Shutdown", "Mutex Dispose failed", ex);
        }

        mutex = null;
    }

    internal static int? TryFindOtherTrayPid()
    {
        try
        {
            var self = Environment.ProcessId;
            foreach (var name in new[] { "Warden.Tray", "Warden.Tray.exe" })
            {
                foreach (var p in Process.GetProcessesByName(name.Replace(".exe", "")))
                {
                    try
                    {
                        if (p.Id != self)
                        {
                            return p.Id;
                        }
                    }
                    finally
                    {
                        p.Dispose();
                    }
                }
            }
        }
        catch
        {
            // ignore
        }

        return null;
    }
}
