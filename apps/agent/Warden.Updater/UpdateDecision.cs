using System.Text.RegularExpressions;

namespace Warden.Updater;

public static class UpdateDecision
{
    private static readonly Regex StrictVersion = new(@"^\d+\.\d+\.\d+$", RegexOptions.CultureInvariant);

    /// <summary>True when <paramref name="version"/> is exactly Major.Minor.Patch digits.</summary>
    public static bool IsStrictVersion(string? version) =>
        version is not null && StrictVersion.IsMatch(version);

    /// <summary>
    /// True only when <paramref name="candidate"/> is a strict X.Y.Z version strictly greater than
    /// <paramref name="installed"/>. Anything unparsable is never newer.
    /// </summary>
    public static bool IsNewer(string installed, string candidate)
    {
        if (!IsStrictVersion(installed) || !IsStrictVersion(candidate))
        {
            return false;
        }

        return Version.Parse(candidate) > Version.Parse(installed);
    }
}
