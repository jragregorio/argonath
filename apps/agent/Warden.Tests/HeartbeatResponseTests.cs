using Warden.Core.Services;
using Xunit;

namespace Warden.Tests;

public class HeartbeatResponseTests
{
    [Fact]
    public void Parses_update_hint()
    {
        var json = """{"ok":true,"update":{"version":"0.6.29","sha256":"ab","sizeBytes":88713542,"mandatory":false,"downloadUrl":"https://github.com/x"}}""";
        var r = WardenApiClient.ParseHeartbeatResponse(json);
        Assert.Equal("0.6.29", r!.Update!.Version);
        Assert.Equal(88713542, r.Update.SizeBytes);
        Assert.Equal("https://github.com/x", r.Update.DownloadUrl);
    }

    [Fact]
    public void Missing_update_is_null() =>
        Assert.Null(WardenApiClient.ParseHeartbeatResponse("""{"ok":true}""")!.Update);

    [Fact]
    public void Garbage_body_returns_null() =>
        Assert.Null(WardenApiClient.ParseHeartbeatResponse("<html>"));
}
