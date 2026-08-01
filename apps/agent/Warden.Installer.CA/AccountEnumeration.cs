using System;
using System.Collections.Generic;
using System.DirectoryServices.AccountManagement;
using System.Linq;
using System.Management;
using System.Security.Principal;
using Microsoft.Win32;

namespace Warden.Installer.CA;

/// <summary>One Windows account candidate for the CHILDUSER combo.</summary>
public sealed class AccountCandidate
{
    public string Sid { get; set; }
    public string Value { get; set; } // COMPUTER\Sam or DOMAIN\Sam
    public string SamAccountName { get; set; }
    public string DisplayText { get; set; }
    public bool IsAdmin { get; set; }
    public bool IsDisabled { get; set; }
}

/// <summary>
/// Layered local-user enumeration used by the MSI custom action.
/// Kept free of WixToolset types so a console harness can call it directly.
/// </summary>
public static class AccountEnumeration
{
    public static readonly HashSet<string> ExcludedSamNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "DefaultAccount",
        "Guest",
        "WDAGUtilityAccount",
        "WsiAccount",
        "SYSTEM",
        "LOCAL SERVICE",
        "NETWORK SERVICE",
    };

    public sealed class EnumerateResult
    {
        public List<AccountCandidate> Candidates { get; } = new List<AccountCandidate>();
        public int ProfileListCount { get; set; }
        public int WmiCount { get; set; }
        public int AccountManagementCount { get; set; }
        public string ProfileListError { get; set; }
        public string WmiError { get; set; }
        public string AccountManagementError { get; set; }

        public string SummaryLine()
        {
            return string.Format(
                "enum: ProfileList={0}{1}; WMI={2}{3}; AccountManagement={4}{5}; final={6} (nonAdmin={7}, admin={8})",
                ProfileListCount,
                ProfileListError != null ? " ERR:" + ProfileListError : "",
                WmiCount,
                WmiError != null ? " ERR:" + WmiError : "",
                AccountManagementCount,
                AccountManagementError != null ? " ERR:" + AccountManagementError : "",
                Candidates.Count,
                Candidates.Count(c => !c.IsAdmin),
                Candidates.Count(c => c.IsAdmin));
        }
    }

    public static EnumerateResult Enumerate(Action<string> log)
    {
        if (log == null)
        {
            log = _ => { };
        }

        var machine = Environment.MachineName;
        var bySid = new Dictionary<string, AccountCandidate>(StringComparer.OrdinalIgnoreCase);
        var result = new EnumerateResult();

        try
        {
            var fromProfiles = EnumerateFromProfileList(log);
            result.ProfileListCount = fromProfiles.Count;
            Merge(bySid, fromProfiles, log, "ProfileList");
        }
        catch (Exception ex)
        {
            result.ProfileListError = ex.Message;
            log("ProfileList enumeration failed: " + ex);
        }

        try
        {
            var fromWmi = EnumerateFromWmi(log);
            result.WmiCount = fromWmi.Count;
            Merge(bySid, fromWmi, log, "WMI");
        }
        catch (Exception ex)
        {
            result.WmiError = ex.Message;
            log("WMI enumeration failed: " + ex);
        }

        try
        {
            var fromAm = EnumerateFromAccountManagement(log, machine);
            result.AccountManagementCount = fromAm.Count;
            Merge(bySid, fromAm, log, "AccountManagement");
        }
        catch (Exception ex)
        {
            result.AccountManagementError = ex.Message;
            log("AccountManagement enumeration failed: " + ex);
        }

        // Admin membership pass (best-effort; never throws out).
        MarkAdministrators(bySid.Values, log);

        foreach (var c in bySid.Values)
        {
            if (c.IsDisabled)
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(c.SamAccountName)
                || ExcludedSamNames.Contains(c.SamAccountName)
                || c.SamAccountName.EndsWith("$", StringComparison.Ordinal))
            {
                continue;
            }

            if (IsSystemOrMachineAccount(c.Value))
            {
                continue;
            }

            // Prefer fully-qualified COMPUTER\Sam when bare.
            if (!string.IsNullOrEmpty(c.Value) && !c.Value.Contains("\\"))
            {
                c.Value = machine + "\\" + c.Value;
            }

            if (string.IsNullOrWhiteSpace(c.Value))
            {
                continue;
            }

            c.DisplayText = c.IsAdmin
                ? c.Value + " (administrator - probably you)"
                : c.Value;

            result.Candidates.Add(c);
        }

        // Non-admins first, then name.
        var ordered = result.Candidates
            .OrderBy(c => c.IsAdmin ? 1 : 0)
            .ThenBy(c => c.Value, StringComparer.OrdinalIgnoreCase)
            .ToList();
        result.Candidates.Clear();
        result.Candidates.AddRange(ordered);

        log(result.SummaryLine());
        foreach (var c in result.Candidates)
        {
            log("  candidate: " + c.DisplayText + " sid=" + (c.Sid ?? "?"));
        }

        return result;
    }

    public static bool IsLocalAdministrator(string account, Action<string> log)
    {
        try
        {
            var sid = TryTranslateToSid(account);
            if (!string.IsNullOrEmpty(sid))
            {
                var admins = GetLocalAdministratorsSids(log);
                if (admins.Contains(sid))
                {
                    return true;
                }
            }

            // Fallback: AccountManagement
            using (var context = new PrincipalContext(ContextType.Machine))
            using (var group = GroupPrincipal.FindByIdentity(context, IdentityType.Name, "Administrators"))
            {
                if (group == null)
                {
                    return false;
                }

                var bare = account.Contains("\\")
                    ? account.Substring(account.LastIndexOf('\\') + 1)
                    : account;
                using (var user = UserPrincipal.FindByIdentity(context, IdentityType.SamAccountName, bare))
                {
                    if (user != null && user.IsMemberOf(group))
                    {
                        return true;
                    }
                }

                using (var user2 = UserPrincipal.FindByIdentity(context, account))
                {
                    return user2 != null && user2.IsMemberOf(group);
                }
            }
        }
        catch (Exception ex)
        {
            if (log != null)
            {
                log("IsLocalAdministrator ERROR: " + ex.Message);
            }

            return false;
        }
    }

    public static bool IsSystemOrMachineAccount(string account)
    {
        if (string.IsNullOrWhiteSpace(account))
        {
            return true;
        }

        var normalized = account.Trim();
        var bare = normalized.Contains("\\")
            ? normalized.Substring(normalized.LastIndexOf('\\') + 1)
            : normalized;
        var machine = Environment.MachineName;

        if (bare.Equals("SYSTEM", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("NT AUTHORITY\\SYSTEM", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("LOCAL SYSTEM", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("LOCALSYSTEM", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (bare.EndsWith("$", StringComparison.Ordinal)
            && bare.TrimEnd('$').Equals(machine, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static void Merge(
        Dictionary<string, AccountCandidate> bySid,
        List<AccountCandidate> incoming,
        Action<string> log,
        string source)
    {
        foreach (var c in incoming)
        {
            if (string.IsNullOrEmpty(c.Sid))
            {
                // No SID — key by value.
                var key = "name:" + (c.Value ?? c.SamAccountName ?? "");
                if (!bySid.ContainsKey(key))
                {
                    bySid[key] = c;
                    log(source + " added (no sid): " + c.Value);
                }

                continue;
            }

            if (bySid.TryGetValue(c.Sid, out var existing))
            {
                if (string.IsNullOrEmpty(existing.Value) && !string.IsNullOrEmpty(c.Value))
                {
                    existing.Value = c.Value;
                }

                if (string.IsNullOrEmpty(existing.SamAccountName) && !string.IsNullOrEmpty(c.SamAccountName))
                {
                    existing.SamAccountName = c.SamAccountName;
                }

                existing.IsDisabled = existing.IsDisabled || c.IsDisabled;
                existing.IsAdmin = existing.IsAdmin || c.IsAdmin;
            }
            else
            {
                bySid[c.Sid] = c;
                log(source + " added: " + c.Value + " sid=" + c.Sid);
            }
        }
    }

    private static List<AccountCandidate> EnumerateFromProfileList(Action<string> log)
    {
        var list = new List<AccountCandidate>();
        using (var key = Registry.LocalMachine.OpenSubKey(
                   @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList"))
        {
            if (key == null)
            {
                log("ProfileList key missing");
                return list;
            }

            foreach (var sidName in key.GetSubKeyNames())
            {
                if (!sidName.StartsWith("S-1-5-21-", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                try
                {
                    var sid = new SecurityIdentifier(sidName);
                    string accountName;
                    try
                    {
                        accountName = sid.Translate(typeof(NTAccount)).Value;
                    }
                    catch (Exception ex)
                    {
                        log("ProfileList SID translate failed for " + sidName + ": " + ex.Message);
                        continue;
                    }

                    var bare = accountName.Contains("\\")
                        ? accountName.Substring(accountName.LastIndexOf('\\') + 1)
                        : accountName;

                    list.Add(new AccountCandidate
                    {
                        Sid = sidName,
                        Value = accountName,
                        SamAccountName = bare,
                    });
                }
                catch (Exception ex)
                {
                    log("ProfileList entry " + sidName + " skipped: " + ex.Message);
                }
            }
        }

        return list;
    }

    private static List<AccountCandidate> EnumerateFromWmi(Action<string> log)
    {
        var list = new List<AccountCandidate>();
        using (var searcher = new ManagementObjectSearcher(
                   "SELECT Name, Disabled, LocalAccount, SID FROM Win32_UserAccount WHERE LocalAccount=True"))
        using (var results = searcher.Get())
        {
            foreach (ManagementBaseObject obj in results)
            {
                using (obj)
                {
                    var name = Convert.ToString(obj["Name"]);
                    var sid = Convert.ToString(obj["SID"]);
                    var disabled = false;
                    try
                    {
                        disabled = Convert.ToBoolean(obj["Disabled"]);
                    }
                    catch
                    {
                        // ignore
                    }

                    if (string.IsNullOrWhiteSpace(name))
                    {
                        continue;
                    }

                    var value = Environment.MachineName + "\\" + name;
                    list.Add(new AccountCandidate
                    {
                        Sid = sid,
                        Value = value,
                        SamAccountName = name,
                        IsDisabled = disabled,
                    });
                }
            }
        }

        return list;
    }

    private static List<AccountCandidate> EnumerateFromAccountManagement(Action<string> log, string machine)
    {
        var list = new List<AccountCandidate>();
        using (var context = new PrincipalContext(ContextType.Machine))
        using (var searcher = new PrincipalSearcher(new UserPrincipal(context)))
        {
            foreach (var principal in searcher.FindAll())
            {
                try
                {
                    var user = principal as UserPrincipal;
                    if (user == null)
                    {
                        continue;
                    }

                    var sam = user.SamAccountName;
                    if (string.IsNullOrWhiteSpace(sam))
                    {
                        continue;
                    }

                    var disabled = user.Enabled.HasValue && user.Enabled.Value == false;
                    var sid = user.Sid != null ? user.Sid.Value : null;
                    list.Add(new AccountCandidate
                    {
                        Sid = sid,
                        Value = machine + "\\" + sam,
                        SamAccountName = sam,
                        IsDisabled = disabled,
                    });
                }
                finally
                {
                    principal.Dispose();
                }
            }
        }

        return list;
    }

    private static void MarkAdministrators(IEnumerable<AccountCandidate> candidates, Action<string> log)
    {
        HashSet<string> adminSids;
        try
        {
            adminSids = GetLocalAdministratorsSids(log);
        }
        catch (Exception ex)
        {
            log("MarkAdministrators: " + ex.Message);
            adminSids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        foreach (var c in candidates)
        {
            if (!string.IsNullOrEmpty(c.Sid) && adminSids.Contains(c.Sid))
            {
                c.IsAdmin = true;
            }
        }
    }

    private static HashSet<string> GetLocalAdministratorsSids(Action<string> log)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var wql = "ASSOCIATORS OF {Win32_Group.Domain='" + Environment.MachineName
                      + "',Name='Administrators'} WHERE AssocClass=Win32_GroupUser ResultClass=Win32_UserAccount";
            using (var searcher = new ManagementObjectSearcher(wql))
            using (var results = searcher.Get())
            {
                foreach (ManagementBaseObject obj in results)
                {
                    using (obj)
                    {
                        var sid = Convert.ToString(obj["SID"]);
                        if (!string.IsNullOrEmpty(sid))
                        {
                            set.Add(sid);
                        }
                    }
                }
            }

            log("GetLocalAdministratorsSids WMI count=" + set.Count);
        }
        catch (Exception ex)
        {
            log("GetLocalAdministratorsSids WMI failed: " + ex.Message);
        }

        // Fallback via AccountManagement
        if (set.Count == 0)
        {
            try
            {
                using (var context = new PrincipalContext(ContextType.Machine))
                using (var group = GroupPrincipal.FindByIdentity(context, IdentityType.Name, "Administrators"))
                {
                    if (group != null)
                    {
                        foreach (var m in group.GetMembers(true))
                        {
                            try
                            {
                                var up = m as UserPrincipal;
                                if (up != null && up.Sid != null)
                                {
                                    set.Add(up.Sid.Value);
                                }
                            }
                            finally
                            {
                                m.Dispose();
                            }
                        }
                    }
                }

                log("GetLocalAdministratorsSids AM count=" + set.Count);
            }
            catch (Exception ex)
            {
                log("GetLocalAdministratorsSids AM failed: " + ex.Message);
            }
        }

        return set;
    }

    private static string TryTranslateToSid(string account)
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

            return new NTAccount(account).Translate(typeof(SecurityIdentifier)).Value;
        }
        catch
        {
            return null;
        }
    }
}
