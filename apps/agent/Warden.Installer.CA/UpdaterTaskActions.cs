using System;
using System.IO;
using System.Security;
using System.Text;
using WixToolset.Dtf.WindowsInstaller;

namespace Warden.Installer.CA;

/// <summary>
/// Deferred custom actions for the on-demand SYSTEM task <c>Warden\WardenUpdater</c>, which the
/// tray's Update button starts. Standard users may run it but not change it.
/// </summary>
public class UpdaterTaskActions
{
    [CustomAction]
    public static ActionResult CreateWardenUpdaterTask(Session session)
    {
        try
        {
            var exePath = session.CustomActionData.ContainsKey("ExePath")
                ? session.CustomActionData["ExePath"]
                : null;
            if (string.IsNullOrWhiteSpace(exePath))
            {
                throw new InvalidOperationException("CustomActionData missing ExePath for CreateWardenUpdaterTask.");
            }

            UpdaterTaskRegistrar.Register(exePath.Trim(), msg => session.Log(msg));
            return ActionResult.Success;
        }
        catch (Exception ex)
        {
            session.Log("CreateWardenUpdaterTask failed: " + ex);
            return ActionResult.Failure;
        }
    }

    [CustomAction]
    public static ActionResult DeleteWardenUpdaterTask(Session session)
    {
        try
        {
            LogonTaskRegistrar.Unregister(UpdaterTaskRegistrar.TaskName, msg => session.Log(msg));
        }
        catch (Exception ex)
        {
            session.Log("DeleteWardenUpdaterTask ignored error: " + ex.Message);
        }

        return ActionResult.Success;
    }
}

public static class UpdaterTaskRegistrar
{
    public const string TaskName = @"Warden\WardenUpdater";

    /// <summary>SYSTEM + Administrators full control; Users read + execute (= may run, not modify).</summary>
    public const string SecurityDescriptor = "D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;BU)";

    public static void Register(string exePath, Action<string> log)
    {
        var tempXml = Path.Combine(Path.GetTempPath(), "WardenUpdaterTask-" + Guid.NewGuid().ToString("N") + ".xml");
        try
        {
            File.WriteAllText(tempXml, BuildTaskXml(exePath), Encoding.Unicode);
            var (exit, output) = LogonTaskRegistrar.RunSchtasks(
                "/Create /TN \"" + TaskName + "\" /XML \"" + tempXml + "\" /F"
            );
            log("schtasks /Create " + TaskName + " exit=" + exit + " output=" + output);
            if (exit != 0)
            {
                throw new InvalidOperationException("schtasks /Create failed with exit code " + exit + ": " + output);
            }
        }
        finally
        {
            try
            {
                File.Delete(tempXml);
            }
            catch
            {
                // ignore
            }
        }
    }

    public static string BuildTaskXml(string exePath)
    {
        var installDir = Path.GetDirectoryName(exePath)
            ?? throw new InvalidOperationException("Could not determine install directory from '" + exePath + "'.");

        return
            "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\r\n"
            + "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\r\n"
            + "  <RegistrationInfo>\r\n"
            + "    <Description>Installs a newer Warden version when the child presses Update in the Warden tray. Runs on demand only.</Description>\r\n"
            + "    <URI>\\" + SecurityElement.Escape(TaskName) + "</URI>\r\n"
            + "    <SecurityDescriptor>" + SecurityDescriptor + "</SecurityDescriptor>\r\n"
            + "  </RegistrationInfo>\r\n"
            + "  <Triggers />\r\n"
            + "  <Principals>\r\n"
            + "    <Principal id=\"Author\">\r\n"
            + "      <UserId>S-1-5-18</UserId>\r\n"
            + "      <RunLevel>HighestAvailable</RunLevel>\r\n"
            + "    </Principal>\r\n"
            + "  </Principals>\r\n"
            + "  <Settings>\r\n"
            + "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n"
            + "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n"
            + "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\r\n"
            + "    <AllowHardTerminate>true</AllowHardTerminate>\r\n"
            + "    <StartWhenAvailable>false</StartWhenAvailable>\r\n"
            + "    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>\r\n"
            + "    <IdleSettings>\r\n"
            + "      <StopOnIdleEnd>false</StopOnIdleEnd>\r\n"
            + "      <RestartOnIdle>false</RestartOnIdle>\r\n"
            + "    </IdleSettings>\r\n"
            + "    <AllowStartOnDemand>true</AllowStartOnDemand>\r\n"
            + "    <Enabled>true</Enabled>\r\n"
            + "    <Hidden>true</Hidden>\r\n"
            + "    <RunOnlyIfIdle>false</RunOnlyIfIdle>\r\n"
            + "    <WakeToRun>false</WakeToRun>\r\n"
            + "    <ExecutionTimeLimit>PT15M</ExecutionTimeLimit>\r\n"
            + "    <Priority>7</Priority>\r\n"
            + "  </Settings>\r\n"
            + "  <Actions Context=\"Author\">\r\n"
            + "    <Exec>\r\n"
            + "      <Command>" + SecurityElement.Escape(exePath) + "</Command>\r\n"
            + "      <WorkingDirectory>" + SecurityElement.Escape(installDir) + "</WorkingDirectory>\r\n"
            + "    </Exec>\r\n"
            + "  </Actions>\r\n"
            + "</Task>\r\n";
    }
}
