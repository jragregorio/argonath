using System.Reflection;

namespace Warden.Core;

public static class AgentVersionInfo
{
    public const string Fallback = "0.2.5";

    public static string Current
    {
        get
        {
            var version =
                Assembly.GetEntryAssembly()?.GetName().Version
                ?? Assembly.GetExecutingAssembly().GetName().Version;
            return version == null
                ? Fallback
                : $"{version.Major}.{version.Minor}.{version.Build}";
        }
    }
}
