using Warden.Tray;
using Xunit;

namespace Warden.Tests;

public class PopupPreviewTests
{
    [Theory]
    [InlineData(new[] { "Warden.Tray.exe", "--preview-popups" }, true)]
    [InlineData(new[] { "Warden.Tray.exe", "--PREVIEW-POPUPS" }, true)]
    [InlineData(new[] { "Warden.Tray.exe" }, false)]
    [InlineData(new[] { "Warden.Tray.exe", "--preview" }, false)]
    public void Preview_runs_only_with_its_flag(string[] args, bool expected) =>
        Assert.Equal(expected, PopupPreview.Requested(args));

    [Fact]
    public void Snapshot_dir_follows_its_flag() =>
        Assert.Equal(@"C:\shots", PopupPreview.SnapshotDir(["Warden.Tray.exe", "--preview-popups", "--snapshot", @"C:\shots"]));

    [Fact]
    public void No_snapshot_flag_means_on_screen_preview() =>
        Assert.Null(PopupPreview.SnapshotDir(["Warden.Tray.exe", "--preview-popups"]));

    [Fact]
    public void Snapshot_flag_without_dir_is_ignored() =>
        Assert.Null(PopupPreview.SnapshotDir(["Warden.Tray.exe", "--preview-popups", "--snapshot"]));
}
