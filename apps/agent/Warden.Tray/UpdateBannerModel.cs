namespace Warden.Tray;

internal enum UpdatePhase
{
    Idle,
    Starting,
    StartFailed,
}

/// <summary>Subset of the updater's update-status.json the tray cares about.</summary>
internal sealed record LastUpdateResult(string Result, string FromVersion, DateTimeOffset At);

internal sealed record UpdateBannerInput(
    string CurrentVersion,
    string? AvailableVersion,
    LastUpdateResult? LastResult,
    bool IsLocked,
    UpdatePhase Phase,
    DateTimeOffset? StartedAt
);

internal sealed record UpdateBannerView(bool Visible, string Message, bool ShowButton)
{
    public static readonly UpdateBannerView Hidden = new(false, "", false);
}

/// <summary>Decides what the "update available" banner under the title bar shows.</summary>
internal static class UpdateBannerModel
{
    public const string UpdatingText = "Updating… Warden will restart.";
    public const string StartFailedText = "Couldn't start the update. Try again.";
    public const string FailedText = "Update failed — try again";

    public static UpdateBannerView Compute(UpdateBannerInput input)
    {
        if (input.IsLocked)
        {
            return UpdateBannerView.Hidden;
        }

        var last = input.LastResult;
        var failedOnThisVersion =
            last is not null
            && last.Result == "failed"
            && string.Equals(last.FromVersion, input.CurrentVersion, StringComparison.Ordinal);

        switch (input.Phase)
        {
            case UpdatePhase.Starting:
                var reportedSinceClick = last is not null && input.StartedAt is { } started && last.At > started;
                if (!reportedSinceClick)
                {
                    return new UpdateBannerView(true, UpdatingText, false);
                }

                return failedOnThisVersion
                    ? new UpdateBannerView(true, FailedText, true)
                    : UpdateBannerView.Hidden;

            case UpdatePhase.StartFailed:
                return new UpdateBannerView(true, StartFailedText, true);
        }

        if (failedOnThisVersion)
        {
            return new UpdateBannerView(true, FailedText, true);
        }

        return string.IsNullOrEmpty(input.AvailableVersion)
            ? UpdateBannerView.Hidden
            : new UpdateBannerView(true, $"Update available (v{input.AvailableVersion})", true);
    }
}
