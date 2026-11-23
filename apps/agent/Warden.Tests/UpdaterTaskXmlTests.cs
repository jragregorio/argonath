extern alias ca;
using System.Xml.Linq;
using ca::Warden.Installer.CA;
using Xunit;

namespace Warden.Tests;

public class UpdaterTaskXmlTests
{
    private static readonly XNamespace Ns = "http://schemas.microsoft.com/windows/2004/02/mit/task";

    private static XDocument Build(string exe = @"C:\Program Files\Warden\Warden.Updater.exe") =>
        XDocument.Parse(UpdaterTaskRegistrar.BuildTaskXml(exe));

    [Fact]
    public void Runs_as_SYSTEM_with_highest_privileges()
    {
        var principal = Build().Descendants(Ns + "Principal").Single();
        Assert.Equal("S-1-5-18", principal.Element(Ns + "UserId")!.Value);
        Assert.Equal("HighestAvailable", principal.Element(Ns + "RunLevel")!.Value);
    }

    [Fact]
    public void Has_no_triggers_and_runs_on_demand_only()
    {
        var doc = Build();
        Assert.Empty(doc.Descendants(Ns + "Triggers").SelectMany(t => t.Elements()));
        var settings = doc.Descendants(Ns + "Settings").Single();
        Assert.Equal("true", settings.Element(Ns + "AllowStartOnDemand")!.Value);
        Assert.Equal("IgnoreNew", settings.Element(Ns + "MultipleInstancesPolicy")!.Value);
        Assert.Equal("PT15M", settings.Element(Ns + "ExecutionTimeLimit")!.Value);
    }

    [Fact]
    public void Users_may_run_but_not_modify()
    {
        var sddl = Build().Descendants(Ns + "SecurityDescriptor").Single().Value;
        Assert.Equal("D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;BU)", sddl);
    }

    [Fact]
    public void Command_is_the_escaped_updater_path_with_no_arguments()
    {
        var exec = Build(@"C:\Program Files\W&rden\Warden.Updater.exe").Descendants(Ns + "Exec").Single();
        Assert.Equal(@"C:\Program Files\W&rden\Warden.Updater.exe", exec.Element(Ns + "Command")!.Value);
        Assert.Null(exec.Element(Ns + "Arguments"));
        Assert.Equal(@"C:\Program Files\W&rden", exec.Element(Ns + "WorkingDirectory")!.Value);
    }
}
