using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;

namespace Warden.Installer.CA;

/// <summary>
/// The installer runs as SYSTEM and, since in-app updates, can be started by the child. Its
/// file log is only written into a folder that a standard user cannot have planted: it must
/// exist, must not be a junction/symlink, and must be owned by SYSTEM or Administrators.
/// </summary>
public static class InstallLogGuard
{
    public static bool IsTrustedDirectory(string path)
    {
        try
        {
            var info = new DirectoryInfo(path);
            if (!info.Exists || info.Attributes.HasFlag(FileAttributes.ReparsePoint))
            {
                return false;
            }

            var owner = info.GetAccessControl(AccessControlSections.Owner).GetOwner(typeof(SecurityIdentifier));
            return owner is SecurityIdentifier sid
                && (sid.IsWellKnown(WellKnownSidType.LocalSystemSid)
                    || sid.IsWellKnown(WellKnownSidType.BuiltinAdministratorsSid));
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Best-effort append to <paramref name="dir"/>\<paramref name="fileName"/>. Skips (silently)
    /// when the folder or its parent could have been planted by a standard user, or the file is a
    /// link. MSI's own log still records everything via <c>session.Log</c>.
    /// </summary>
    public static void TryAppend(string dir, string fileName, string text)
    {
        try
        {
            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var parent = Path.GetDirectoryName(dir.TrimEnd('\\'));
            if (!IsTrustedDirectory(dir) || (parent != null && !IsTrustedDirectory(parent)))
            {
                return;
            }

            var file = Path.Combine(dir, fileName);
            if (!IsSafeLogFile(file))
            {
                return;
            }

            File.AppendAllText(file, text, System.Text.Encoding.UTF8);
        }
        catch
        {
            // Best-effort; never fail the CA.
        }
    }

    /// <summary>True when <paramref name="file"/> may be appended to (absent, or a plain file).</summary>
    public static bool IsSafeLogFile(string file)
    {
        try
        {
            return !File.Exists(file) || !File.GetAttributes(file).HasFlag(FileAttributes.ReparsePoint);
        }
        catch
        {
            return false;
        }
    }
}
