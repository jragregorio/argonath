using System.Reflection;

namespace Warden.Core;

/// <summary>
/// Agent version is owned solely by <c>apps/agent/Directory.Build.props</c>
/// (<c>$(Version)</c> → assembly version). See ADR-0004. Never hardcode a product
/// version string here — web/package bumps must not touch the agent line.
/// </summary>
public static class AgentVersionInfo
{
    public static string Current
    {
        get
        {
            var version =
                Assembly.GetEntryAssembly()?.GetName().Version
                ?? Assembly.GetExecutingAssembly().GetName().Version;
            // AssemblyVersion is Major.Minor.Build.Revision from Directory.Build.props.
            return version == null
                ? "0.0.0"
                : $"{version.Major}.{version.Minor}.{version.Build}";
        }
    }
}
