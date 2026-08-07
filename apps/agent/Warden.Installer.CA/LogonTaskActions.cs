using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security;
using System.Security.Principal;
using System.Text;
using WixToolset.Dtf.WindowsInstaller;

namespace Warden.Installer.CA;

/// <summary>
/// Deferred custom actions that create/delete the Warden logon scheduled task
/// via schtasks.exe. Preferred over PowerShell + WixQuietExec so failures
/// surface as real MSI errors with CustomActionData logging.
/// </summary>
public class LogonTaskActions
{
    private const string InstallLogDir = @"C:\ProgramData\Warden\logs";
    private const string InstallLogFile = "install-startup.log";
    private const string DefaultTaskName = @"Warden\WardenTray";

    [CustomAction]
    public static ActionResult CreateWardenLogonTask(Session session)
    {
        try
        {
            var data = ParseCustomActionData(session);
            LogBoth(session, "CreateWardenLogonTask: begin; " + FormatData(data));

            if (!data.TryGetValue("ExePath", out var exePath) || string.IsNullOrWhiteSpace(exePath))
            {
                throw new InvalidOperationException(
                    "CustomActionData missing ExePath. The deferred CreateWardenTask property was empty — check SetProperty sequencing."
                );
            }

            var startupMode = data.TryGetValue("StartupMode", out var sm) && !string.IsNullOrWhiteSpace(sm)
                ? sm.Trim()
                : CustomActions.StartupModeSingle;

            if (string.Equals(startupMode, CustomActions.StartupModeAllStandard, StringComparison.OrdinalIgnoreCase))
            {
                LogonTaskRegistrar.RegisterAllStandardUsers(exePath.Trim(), msg => LogBoth(session, msg));
                LogBoth(session, "CreateWardenLogonTask: AllStandard success");
                return ActionResult.Success;
            }

            if (!data.TryGetValue("UserId", out var userId) || string.IsNullOrWhiteSpace(userId))
            {
                throw new InvalidOperationException(
                    "CustomActionData missing UserId (CHILDUSER). Pass CHILDUSER=\"COMPUTER\\ChildAccount\" or select the supervised account in the installer UI."
                );
            }

            if (string.Equals(userId.Trim(), CustomActions.AllStandardSentinel, StringComparison.OrdinalIgnoreCase)
                || userId.Trim().EndsWith("\\" + CustomActions.AllStandardSentinel, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    "CHILDUSER is the AllStandard sentinel but StartupMode is Single. Re-run setup and choose an account, or pass WARDEN_STARTUP_ALL=1."
                );
            }

            var taskName = data.TryGetValue("TaskName", out var tn) && !string.IsNullOrWhiteSpace(tn)
                ? tn.Trim()
                : DefaultTaskName;

            LogonTaskRegistrar.UnregisterPerUserTasks(msg => LogBoth(session, msg));
            LogonTaskRegistrar.Register(exePath.Trim(), userId.Trim(), taskName, msg => LogBoth(session, msg));
            LogBoth(session, "CreateWardenLogonTask: Single success");

            // Best-effort immediate start into the child's session (if signed in).
            // Must never fail the install — no session is a normal case.
            try
            {
                var launch = LogonTaskRegistrar.TryLaunch(taskName, msg => LogBoth(session, msg));
                LogBoth(
                    session,
                    "LaunchWardenLogonTask: attempted=yes; exit="
                        + launch.ExitCode
                        + "; outcome="
                        + launch.Outcome
                        + "; detail="
                        + launch.Detail
                );
            }
            catch (Exception launchEx)
            {
                LogBoth(
                    session,
                    "LaunchWardenLogonTask: attempted=yes; outcome=unexpected_failure; detail="
                        + launchEx.Message
                );
            }

            return ActionResult.Success;
        }
        catch (Exception ex)
        {
            LogBoth(session, "CreateWardenLogonTask ERROR: " + ex);
            session.Log("CreateWardenLogonTask failed: " + ex.Message);
            return ActionResult.Failure;
        }
    }

    [CustomAction]
    public static ActionResult DeleteWardenLogonTask(Session session)
    {
        try
        {
            LogBoth(session, "DeleteWardenLogonTask: begin");
            LogonTaskRegistrar.UnregisterAllWardenTasks(msg => LogBoth(session, msg));
            LogBoth(session, "DeleteWardenLogonTask: done");
            return ActionResult.Success;
        }
        catch (Exception ex)
        {
            // Uninstall/rollback should not block on a missing task.
            LogBoth(session, "DeleteWardenLogonTask WARN: " + ex.Message);
            return ActionResult.Success;
        }
    }

    [CustomAction]
    public static ActionResult RollbackWardenLogonTask(Session session)
    {
        // Same implementation as delete; Execute="rollback" is set in Package.wxs.
        return DeleteWardenLogonTask(session);
    }

    private static Dictionary<string, string> ParseCustomActionData(Session session)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // DTF populates CustomActionData from the property named like this CA
        // (SetProperty Id="CreateWardenTask" Value="ExePath=...;UserId=...").
        try
        {
            if (session.CustomActionData != null)
            {
                foreach (string key in session.CustomActionData.Keys)
                {
                    map[key] = session.CustomActionData[key] ?? string.Empty;
                }
            }
        }
        catch (Exception ex)
        {
            LogBoth(session, "CustomActionData Keys enumeration failed: " + ex.Message);
        }

        // Fallback: parse raw "a=b;c=d" if the dictionary was empty.
        if (map.Count == 0)
        {
            string raw = string.Empty;
            try
            {
                raw = session.CustomActionData?.ToString() ?? string.Empty;
            }
            catch
            {
                // ignore
            }

            LogBoth(session, "CustomActionData raw length=" + raw.Length);
            foreach (var part in raw.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = part.IndexOf('=');
                if (eq <= 0)
                {
                    continue;
                }

                var key = part.Substring(0, eq).Trim();
                var value = part.Substring(eq + 1).Trim();
                if (key.Length > 0)
                {
                    map[key] = value;
                }
            }
        }

        LogBoth(session, "CustomActionData keys=" + map.Count);
        return map;
    }

    private static string FormatData(Dictionary<string, string> data)
    {
        var sb = new StringBuilder();
        foreach (var kv in data)
        {
            if (sb.Length > 0)
            {
                sb.Append("; ");
            }

            sb.Append(kv.Key).Append('=').Append(kv.Value);
        }

        return sb.ToString();
    }

    private static void LogBoth(Session session, string message)
    {
        try
        {
            session.Log(message);
        }
        catch
        {
            // ignore
        }

        AppendInstallLog(message);
    }

    private static void AppendInstallLog(string message)
    {
        try
        {
            if (!Directory.Exists(InstallLogDir))
            {
                Directory.CreateDirectory(InstallLogDir);
            }

            var line = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                       + " [Task] "
                       + message
                       + Environment.NewLine;
            File.AppendAllText(
                Path.Combine(InstallLogDir, InstallLogFile),
                line,
                Encoding.UTF8);
        }
        catch
        {
            // Best-effort.
        }
    }
}

/// <summary>
/// Creates/deletes the Warden logon task via schtasks.exe (no PowerShell).
/// Callable from MSI CAs and from a local harness.
/// </summary>
public static class LogonTaskRegistrar
{
    public const string DefaultTaskName = @"Warden\WardenTray";
    public const string TaskNamePrefix = @"Warden\WardenTray";

    public static string SanitizeSamForTaskName(string sam)
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

    public static string BuildPerUserTaskName(string samAccountName) =>
        TaskNamePrefix + "-" + SanitizeSamForTaskName(samAccountName);

    public static List<string> QueryWardenTaskNames(Action<string> log)
    {
        var names = new List<string>();
        var (exit, output) = RunSchtasks("/Query /FO CSV /NH");
        log("schtasks /Query exit=" + exit);
        if (exit != 0 || string.IsNullOrWhiteSpace(output))
        {
            return names;
        }

        foreach (var line in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = line.Trim().Trim('"');
            if (trimmed.IndexOf(@"\Warden\", StringComparison.OrdinalIgnoreCase) >= 0
                || trimmed.StartsWith(@"Warden\", StringComparison.OrdinalIgnoreCase))
            {
                names.Add(trimmed);
            }
        }

        log("QueryWardenTaskNames found " + names.Count + " task(s)");
        return names;
    }

    public static void UnregisterAllWardenTasks(Action<string> log)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in QueryWardenTaskNames(log))
        {
            if (seen.Add(name))
            {
                Unregister(name, log);
            }
        }

        if (seen.Add(DefaultTaskName))
        {
            Unregister(DefaultTaskName, log);
        }
    }

    public static void UnregisterPerUserTasks(Action<string> log)
    {
        foreach (var name in QueryWardenTaskNames(log))
        {
            if (name.StartsWith(TaskNamePrefix + "-", StringComparison.OrdinalIgnoreCase))
            {
                Unregister(name, log);
            }
        }
    }

    public static void RegisterAllStandardUsers(string exePath, Action<string> log)
    {
        UnregisterAllWardenTasks(log);

        var enumResult = AccountEnumeration.Enumerate(log);
        var nonAdmins = enumResult.Candidates
            .Where(c => !c.IsAdmin && !c.IsDisabled)
            .ToList();

        log("RegisterAllStandardUsers: nonAdminCount=" + nonAdmins.Count);
        if (nonAdmins.Count == 0)
        {
            throw new InvalidOperationException(
                "No standard (non-admin) Windows accounts were found for AllStandard startup mode."
            );
        }

        foreach (var candidate in nonAdmins)
        {
            var taskName = BuildPerUserTaskName(candidate.SamAccountName);
            Register(exePath, candidate.Value, taskName, log);

            try
            {
                var launch = TryLaunch(taskName, log);
                log(
                    "LaunchWardenLogonTask AllStandard "
                        + candidate.Value
                        + ": exit="
                        + launch.ExitCode
                        + "; outcome="
                        + launch.Outcome
                );
            }
            catch (Exception ex)
            {
                log("LaunchWardenLogonTask AllStandard " + candidate.Value + " WARN: " + ex.Message);
            }
        }
    }

    public static void Register(string exePath, string userId, string taskName, Action<string> log)
    {
        if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
        {
            throw new InvalidOperationException("Warden executable not found: " + exePath);
        }

        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new InvalidOperationException(
                "UserId (CHILDUSER) is empty. Pass CHILDUSER=\"COMPUTER\\ChildAccount\" to msiexec."
            );
        }

        if (AccountEnumeration.IsSystemOrMachineAccount(userId))
        {
            throw new InvalidOperationException(
                "CHILDUSER='" + userId + "' is a system/machine account and cannot own the Warden logon task."
            );
        }

        string sid;
        try
        {
            sid = new NTAccount(userId)
                .Translate(typeof(SecurityIdentifier))
                .Value;
            log("Resolved UserId SID=" + sid);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "CHILDUSER='" + userId + "' does not resolve to an existing account: " + ex.Message,
                ex
            );
        }

        if (AccountEnumeration.IsLocalAdministrator(userId, log))
        {
            log("WARNING: CHILDUSER=" + userId + " is a local administrator (often the installing parent).");
        }

        var installDir = Path.GetDirectoryName(exePath);
        if (string.IsNullOrWhiteSpace(installDir))
        {
            throw new InvalidOperationException("Could not determine install directory from ExePath='" + exePath + "'.");
        }

        TryRemoveLegacyRunKey(sid, log);

        var exeAttr = SecurityElement.Escape(exePath);
        var userAttr = SecurityElement.Escape(userId);
        var cwdAttr = SecurityElement.Escape(installDir);

        var xml =
            "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\r\n"
            + "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\r\n"
            + "  <RegistrationInfo>\r\n"
            + "    <Description>Starts Warden Tray at logon for the child Windows account, and relaunches about every minute while logged on if the process is missing.</Description>\r\n"
            + "    <URI>\\" + SecurityElement.Escape(taskName) + "</URI>\r\n"
            + "  </RegistrationInfo>\r\n"
            + "  <Triggers>\r\n"
            + "    <LogonTrigger>\r\n"
            // Re-fire every minute while the child stays logged on. IgnoreNew +
            // single-instance mutex make this a no-op while Tray is healthy; after
            // End Task / crash the next tick relaunches within ~1 minute.
            + "      <Repetition>\r\n"
            + "        <Interval>PT1M</Interval>\r\n"
            + "        <StopAtDurationEnd>false</StopAtDurationEnd>\r\n"
            + "      </Repetition>\r\n"
            + "      <Enabled>true</Enabled>\r\n"
            + "      <UserId>" + userAttr + "</UserId>\r\n"
            + "    </LogonTrigger>\r\n"
            + "  </Triggers>\r\n"
            + "  <Principals>\r\n"
            + "    <Principal id=\"Author\">\r\n"
            + "      <UserId>" + userAttr + "</UserId>\r\n"
            + "      <LogonType>InteractiveToken</LogonType>\r\n"
            + "      <RunLevel>LeastPrivilege</RunLevel>\r\n"
            + "    </Principal>\r\n"
            + "  </Principals>\r\n"
            + "  <Settings>\r\n"
            + "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n"
            + "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n"
            + "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\r\n"
            + "    <AllowHardTerminate>true</AllowHardTerminate>\r\n"
            + "    <StartWhenAvailable>true</StartWhenAvailable>\r\n"
            + "    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>\r\n"
            + "    <IdleSettings>\r\n"
            + "      <StopOnIdleEnd>false</StopOnIdleEnd>\r\n"
            + "      <RestartOnIdle>false</RestartOnIdle>\r\n"
            + "    </IdleSettings>\r\n"
            + "    <AllowStartOnDemand>true</AllowStartOnDemand>\r\n"
            + "    <Enabled>true</Enabled>\r\n"
            + "    <Hidden>false</Hidden>\r\n"
            + "    <RunOnlyIfIdle>false</RunOnlyIfIdle>\r\n"
            + "    <WakeToRun>false</WakeToRun>\r\n"
            + "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>\r\n"
            + "    <Priority>7</Priority>\r\n"
            + "    <RestartOnFailure>\r\n"
            + "      <Interval>PT1M</Interval>\r\n"
            + "      <Count>65535</Count>\r\n"
            + "    </RestartOnFailure>\r\n"
            + "  </Settings>\r\n"
            + "  <Actions Context=\"Author\">\r\n"
            + "    <Exec>\r\n"
            + "      <Command>" + exeAttr + "</Command>\r\n"
            + "      <WorkingDirectory>" + cwdAttr + "</WorkingDirectory>\r\n"
            + "    </Exec>\r\n"
            + "  </Actions>\r\n"
            + "</Task>\r\n";

        var tempXml = Path.Combine(
            Path.GetTempPath(),
            "WardenLogonTask-" + Guid.NewGuid().ToString("N") + ".xml"
        );
        try
        {
            File.WriteAllText(tempXml, xml, Encoding.Unicode);
            var (exit, output) = RunSchtasks(
                "/Create /TN \"" + taskName + "\" /XML \"" + tempXml + "\" /F"
            );
            log("schtasks /Create exit=" + exit + " output=" + output);
            if (exit != 0)
            {
                throw new InvalidOperationException(
                    "schtasks /Create failed with exit code " + exit + ": " + output
                );
            }

            log("Register-WardenStartup (managed) completed successfully");
        }
        finally
        {
            try
            {
                if (File.Exists(tempXml))
                {
                    File.Delete(tempXml);
                }
            }
            catch
            {
                // ignore
            }
        }
    }

    public static void Unregister(string taskName, Action<string> log)
    {
        var (exit, output) = RunSchtasks("/Delete /TN \"" + taskName + "\" /F");
        log("schtasks /Delete exit=" + exit + " output=" + output);
        // 0 = deleted; non-zero often means "not found" — treat as success for uninstall.
    }

    /// <summary>
    /// Runs the logon task immediately (as the task principal in their session).
    /// Never throws for expected "user not signed in" cases.
    /// </summary>
    public static LaunchResult TryLaunch(string taskName, Action<string> log)
    {
        log("schtasks /Run attempting TaskName=" + taskName);
        var (exit, output) = RunSchtasks("/Run /TN \"" + taskName + "\"");
        log("schtasks /Run exit=" + exit + " output=" + output);

        if (exit == 0)
        {
            return new LaunchResult(
                exit,
                "started_successfully",
                string.IsNullOrWhiteSpace(output) ? "schtasks /Run returned 0" : output
            );
        }

        if (LooksLikeUserNotSignedIn(output, exit))
        {
            return new LaunchResult(
                exit,
                "child_not_signed_in",
                "Child account has no interactive session; logon trigger will start Warden later. "
                    + output
            );
        }

        return new LaunchResult(
            exit,
            "unexpected_failure",
            string.IsNullOrWhiteSpace(output) ? ("exit " + exit) : output
        );
    }

    private static bool LooksLikeUserNotSignedIn(string output, int exitCode)
    {
        var text = (output ?? string.Empty).ToLowerInvariant();
        if (text.Contains("not logged on")
            || text.Contains("not currently logged")
            || text.Contains("no session")
            || text.Contains("user is not logged")
            || text.Contains("has not logged on")
            || text.Contains("there is no interactive logon")
            || text.Contains("interactive logon session")
            || text.Contains("logon session"))
        {
            return true;
        }

        // ERROR_NO_SUCH_LOGON_SESSION (0x80070520 / 1312) and similar session-missing codes.
        if (exitCode == 1312 || exitCode == -2147023584 || exitCode == 267011)
        {
            return true;
        }

        return false;
    }

    public readonly struct LaunchResult
    {
        public LaunchResult(int exitCode, string outcome, string detail)
        {
            ExitCode = exitCode;
            Outcome = outcome;
            Detail = detail ?? string.Empty;
        }

        public int ExitCode { get; }
        /// <summary>started_successfully | child_not_signed_in | unexpected_failure</summary>
        public string Outcome { get; }
        public string Detail { get; }
    }

    private static void TryRemoveLegacyRunKey(string sid, Action<string> log)
    {
        try
        {
            using (var hive = Microsoft.Win32.Registry.Users.OpenSubKey(
                       sid + @"\Software\Microsoft\Windows\CurrentVersion\Run",
                       writable: true))
            {
                if (hive != null)
                {
                    hive.DeleteValue("Warden", throwOnMissingValue: false);
                    log("Removed HKU\\" + sid + " Run\\Warden if present");
                }
            }
        }
        catch (Exception ex)
        {
            log("Best-effort HKU Run cleanup skipped: " + ex.Message);
        }

        try
        {
            using (var hkcu = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                       @"Software\Microsoft\Windows\CurrentVersion\Run",
                       writable: true))
            {
                hkcu?.DeleteValue("Warden", throwOnMissingValue: false);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static (int exit, string output) RunSchtasks(string arguments)
    {
        var psi = new ProcessStartInfo
        {
            FileName = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "schtasks.exe"
            ),
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        using (var proc = Process.Start(psi))
        {
            if (proc == null)
            {
                return (-1, "failed to start schtasks.exe");
            }

            var stdout = proc.StandardOutput.ReadToEnd();
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(60_000);
            var combined = (stdout + " " + stderr).Trim();
            return (proc.ExitCode, combined);
        }
    }
}
