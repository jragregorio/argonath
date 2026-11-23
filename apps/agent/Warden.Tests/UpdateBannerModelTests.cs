using Warden.Tray;
using Xunit;

namespace Warden.Tests;

public class UpdateBannerModelTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 24, 10, 0, 0, TimeSpan.Zero);

    private static UpdateBannerInput Input(
        string? available = null,
        LastUpdateResult? last = null,
        bool locked = false,
        UpdatePhase phase = UpdatePhase.Idle,
        DateTimeOffset? startedAt = null
    ) => new("0.6.29", available, last, locked, phase, startedAt);

    [Fact]
    public void Hidden_when_no_update_and_no_failure() =>
        Assert.False(UpdateBannerModel.Compute(Input()).Visible);

    [Fact]
    public void Shows_available_with_button()
    {
        var view = UpdateBannerModel.Compute(Input(available: "0.6.30"));
        Assert.True(view.Visible);
        Assert.Equal("Update available (v0.6.30)", view.Message);
        Assert.True(view.ShowButton);
    }

    [Fact]
    public void Hidden_while_locked() =>
        Assert.False(UpdateBannerModel.Compute(Input(available: "0.6.30", locked: true)).Visible);

    [Fact]
    public void Starting_shows_updating_without_button()
    {
        var view = UpdateBannerModel.Compute(Input(available: "0.6.30", phase: UpdatePhase.Starting, startedAt: T0));
        Assert.Equal("Updating… Warden will restart.", view.Message);
        Assert.False(view.ShowButton);
    }

    [Fact]
    public void StartFailed_shows_retry()
    {
        var view = UpdateBannerModel.Compute(Input(available: "0.6.30", phase: UpdatePhase.StartFailed));
        Assert.Equal("Couldn't start the update. Try again.", view.Message);
        Assert.True(view.ShowButton);
    }

    [Fact]
    public void Failed_last_run_on_same_version_shows_retry()
    {
        var view = UpdateBannerModel.Compute(Input(last: new("failed", "0.6.29", T0)));
        Assert.True(view.Visible);
        Assert.Equal("Update failed — try again", view.Message);
        Assert.True(view.ShowButton);
    }

    [Fact]
    public void Failed_last_run_from_older_version_is_ignored() =>
        Assert.False(UpdateBannerModel.Compute(Input(last: new("failed", "0.6.28", T0))).Visible);

    [Fact]
    public void Starting_then_updater_reports_failure_shows_retry()
    {
        var view = UpdateBannerModel.Compute(Input(
            available: "0.6.30",
            last: new("failed", "0.6.29", T0.AddSeconds(30)),
            phase: UpdatePhase.Starting,
            startedAt: T0));
        Assert.Equal("Update failed — try again", view.Message);
        Assert.True(view.ShowButton);
    }

    [Fact]
    public void Starting_ignores_status_written_before_the_click()
    {
        var view = UpdateBannerModel.Compute(Input(
            available: "0.6.30",
            last: new("failed", "0.6.29", T0.AddMinutes(-5)),
            phase: UpdatePhase.Starting,
            startedAt: T0));
        Assert.Equal("Updating… Warden will restart.", view.Message);
    }
}
