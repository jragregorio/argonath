namespace Warden.Updater;

/// <summary>
/// Restarts the tray "as usual": runs every Warden logon task (Warden\WardenTray and the
/// per-user Warden\WardenTray-&lt;sam&gt; variants). Tasks whose user is not signed in fail
/// harmlessly; their logon trigger starts Warden later.
/// </summary>
public static class TrayRelauncher
{
    private const string TrayTaskPrefix = @"Warden\WardenTray";

    public static void RelaunchAll(IUpdaterEnvironment env)
    {
        IReadOnlyList<string> names;
        try
        {
            names = env.QueryTrayTaskNames();
        }
        catch (Exception ex)
        {
            env.Log("Relaunch: could not list tasks: " + ex.Message);
            names = new[] { TrayTaskPrefix };
        }

        foreach (var raw in names)
        {
            var name = raw.Trim().TrimStart('\\');
            if (!IsTrayTask(name))
            {
                continue;
            }

            try
            {
                var exit = env.RunTask(name);
                env.Log($"Relaunch: schtasks /Run {name} exit={exit}");
            }
            catch (Exception ex)
            {
                env.Log($"Relaunch: {name} failed: {ex.Message}");
            }
        }
    }

    private static bool IsTrayTask(string name) =>
        string.Equals(name, TrayTaskPrefix, StringComparison.OrdinalIgnoreCase)
        || name.StartsWith(TrayTaskPrefix + "-", StringComparison.OrdinalIgnoreCase);
}
