using System;
using System.IO;
using System.Linq;
using System.Text;
using WixToolset.Dtf.WindowsInstaller;

namespace Warden.Installer.CA;

public class CustomActions
{
    private const string PlaceholderValue = "__SELECT_CHILD_ACCOUNT__";
    private const string PlaceholderText = "(select child account)";
    private const string InstallLogDir = @"C:\ProgramData\Warden\logs";
    private const string InstallLogFile = "install-startup.log";

    /// <summary>
    /// Immediate CA: enumerate local users into the ComboBox table for CHILDUSER.
    /// Never leaves the ComboBox empty (keeps/restores placeholder on failure).
    /// </summary>
    [CustomAction]
    public static ActionResult PopulateChildUserCombo(Session session)
    {
        try
        {
            LogBoth(session, "PopulateChildUserCombo: begin");

            var enumResult = AccountEnumeration.Enumerate(msg => LogBoth(session, msg));
            var candidates = enumResult.Candidates;
            LogBoth(session, enumResult.SummaryLine());

            if (candidates.Count > 0)
            {
                try
                {
                    DeleteChildUserComboRows(session);
                    InsertCandidates(session, candidates);
                }
                catch (Exception ex)
                {
                    LogBoth(session, "PopulateChildUserCombo insert failed: " + ex);
                    EnsurePlaceholder(session);
                }
            }
            else
            {
                LogBoth(session, "PopulateChildUserCombo: zero candidates - leaving placeholder intact");
                EnsurePlaceholder(session);
            }

            // Final safety: never leave an empty CHILDUSER ComboBox (renders as garbage like ROOTDRIVE).
            if (CountChildUserComboRows(session) == 0)
            {
                LogBoth(session, "PopulateChildUserCombo: SAFETY re-insert placeholder (row count was 0)");
                EnsurePlaceholder(session);
            }

            var machine = Environment.MachineName;
            var current = (session["CHILDUSER"] ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(current) && !current.Contains("\\"))
            {
                var qualified = machine + "\\" + current;
                session["CHILDUSER"] = qualified;
                LogBoth(session, "PopulateChildUserCombo: qualified bare CHILDUSER -> " + qualified);
                current = qualified;
            }

            var nonAdmins = candidates.Where(c => !c.IsAdmin).ToList();
            if (string.IsNullOrEmpty(current)
                || current.Equals(PlaceholderValue, StringComparison.OrdinalIgnoreCase))
            {
                if (nonAdmins.Count == 1)
                {
                    session["CHILDUSER"] = nonAdmins[0].Value;
                    LogBoth(session, "PopulateChildUserCombo: auto-selected sole non-admin " + nonAdmins[0].Value);
                    current = nonAdmins[0].Value;
                }
            }

            if (!string.IsNullOrEmpty(current)
                && !current.Equals(PlaceholderValue, StringComparison.OrdinalIgnoreCase)
                && candidates.Count > 0
                && !candidates.Any(c => c.Value.Equals(current, StringComparison.OrdinalIgnoreCase)))
            {
                // Persisted value not in the live list — surface it for correction.
                try
                {
                    InsertComboRow(session, 0, current, current + " (saved - please confirm)");
                    LogBoth(session, "PopulateChildUserCombo: surfaced persisted value " + current);
                }
                catch (Exception ex)
                {
                    LogBoth(session, "PopulateChildUserCombo: could not surface persisted value: " + ex.Message);
                }
            }

            session["CHILDUSER_CANDIDATE_COUNT"] = candidates.Count.ToString();
            LogBoth(session, "PopulateChildUserCombo: done; comboRows=" + CountChildUserComboRows(session));
            return ActionResult.Success;
        }
        catch (Exception ex)
        {
            LogBoth(session, "PopulateChildUserCombo ERROR: " + ex);
            try
            {
                EnsurePlaceholder(session);
            }
            catch
            {
                // ignore
            }

            return ActionResult.Success;
        }
    }

    /// <summary>
    /// Immediate CA: validate CHILDUSER. Sets CHILDUSER_VALID, CHILDUSER_IS_ADMIN, CHILDUSER_VALID_MSG.
    /// </summary>
    [CustomAction]
    public static ActionResult ValidateChildUser(Session session)
    {
        try
        {
            session["CHILDUSER_VALID"] = "0";
            session["CHILDUSER_IS_ADMIN"] = "0";
            session["CHILDUSER_VALID_MSG"] = string.Empty;

            var raw = (session["CHILDUSER"] ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(raw)
                || raw.Equals(PlaceholderValue, StringComparison.OrdinalIgnoreCase))
            {
                session["CHILDUSER_VALID_MSG"] =
                    "Choose or type the Windows account the child uses to sign in.";
                return ActionResult.Success;
            }

            if (!raw.Contains("\\"))
            {
                raw = Environment.MachineName + "\\" + raw;
                session["CHILDUSER"] = raw;
            }

            if (AccountEnumeration.IsSystemOrMachineAccount(raw))
            {
                session["CHILDUSER_VALID_MSG"] =
                    "'" + raw + "' is a system or machine account and cannot be used. Pick the child's Windows sign-in account.";
                return ActionResult.Success;
            }

            string sid;
            try
            {
                sid = new System.Security.Principal.NTAccount(raw)
                    .Translate(typeof(System.Security.Principal.SecurityIdentifier))
                    .Value;
            }
            catch (Exception ex)
            {
                session["CHILDUSER_VALID_MSG"] =
                    "'" + raw + "' is not a real Windows account on this PC. Check the spelling (use COMPUTER\\ChildAccount). ("
                    + ex.Message + ")";
                return ActionResult.Success;
            }

            LogBoth(session, "ValidateChildUser: " + raw + " -> " + sid);

            if (AccountEnumeration.IsLocalAdministrator(raw, msg => LogBoth(session, msg)))
            {
                session["CHILDUSER_IS_ADMIN"] = "1";
                LogBoth(session, "ValidateChildUser: " + raw + " is a local administrator");
            }

            session["CHILDUSER_VALID"] = "1";
            return ActionResult.Success;
        }
        catch (Exception ex)
        {
            LogBoth(session, "ValidateChildUser ERROR: " + ex);
            session["CHILDUSER_VALID"] = "0";
            session["CHILDUSER_VALID_MSG"] = "Could not validate the account: " + ex.Message;
            return ActionResult.Success;
        }
    }

    private static void InsertCandidates(Session session, System.Collections.Generic.List<AccountCandidate> candidates)
    {
        var order = 1;
        foreach (var c in candidates)
        {
            InsertComboRow(session, order++, c.Value, c.DisplayText);
            LogBoth(session, "PopulateChildUserCombo: added " + c.DisplayText);
        }
    }

    private static void InsertComboRow(Session session, int order, string value, string text)
    {
        using (var view = session.Database.OpenView("SELECT * FROM ComboBox"))
        {
            view.Execute();
            using (var record = session.Database.CreateRecord(4))
            {
                record.SetString(1, "CHILDUSER");
                record.SetInteger(2, order);
                record.SetString(3, value);
                record.SetString(4, text);
                view.Modify(ViewModifyMode.InsertTemporary, record);
            }
        }
    }

    private static void DeleteChildUserComboRows(Session session)
    {
        using (var deleteView = session.Database.OpenView(
                   "DELETE FROM ComboBox WHERE Property = 'CHILDUSER'"))
        {
            deleteView.Execute();
        }
    }

    private static int CountChildUserComboRows(Session session)
    {
        var count = 0;
        using (var view = session.Database.OpenView(
                   "SELECT Value FROM ComboBox WHERE Property = 'CHILDUSER'"))
        {
            view.Execute();
            while (true)
            {
                using (var record = view.Fetch())
                {
                    if (record == null)
                    {
                        break;
                    }

                    count++;
                }
            }
        }

        return count;
    }

    private static void EnsurePlaceholder(Session session)
    {
        if (CountChildUserComboRows(session) > 0)
        {
            return;
        }

        InsertComboRow(session, 1, PlaceholderValue, PlaceholderText);
        LogBoth(session, "PopulateChildUserCombo: inserted placeholder row");
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
                       + " [UI] "
                       + message
                       + Environment.NewLine;
            File.AppendAllText(
                Path.Combine(InstallLogDir, InstallLogFile),
                line,
                Encoding.UTF8);
        }
        catch
        {
            // Best-effort; never fail the CA.
        }
    }
}
