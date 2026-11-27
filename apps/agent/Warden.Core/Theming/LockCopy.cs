using Warden.Core.Models;

namespace Warden.Core.Theming;

/// <summary>Friendly lock-screen wording for each reason the screen is locked.</summary>
public sealed record LockCopy(string Title, string Body, string Detail)
{
    /// <summary>The message <see cref="EnforcementEngine"/> sets for a parent lock-down.</summary>
    public const string AdminLockMessage = "Locked down by parent";

    public const string Tagline = "Good time to stretch, grab a snack, or read a book.";

    /// <summary>True when a parent locked the screen from the dashboard (not the clock).</summary>
    public static bool IsParentLock(PolicyEvaluation? evaluation) => evaluation?.Message == AdminLockMessage;

    public static LockCopy For(PolicyEvaluation? evaluation, string? childName)
    {
        var name = string.IsNullOrWhiteSpace(childName) ? null : childName.Trim();

        if (IsParentLock(evaluation))
        {
            return new LockCopy(
                "Game paused",
                "Your parent has paused the screen for now.",
                "");
        }

        if (evaluation?.Status == "outside_window")
        {
            var body = string.IsNullOrWhiteSpace(evaluation.NextWindowStart)
                ? "Your screen time comes back later."
                : $"Your screen time comes back at {evaluation.NextWindowStart}.";
            var detail = evaluation.DailyRemainingMinutes > 0
                ? $"You'll still have {evaluation.DailyRemainingMinutes} min of today's time."
                : "";
            return new LockCopy(
                name is null ? "That's a wrap for now!" : $"That's a wrap for now, {name}!",
                body,
                detail);
        }

        var used = evaluation is null
            ? ""
            : $"You used {evaluation.UsedMinutes} of {evaluation.DailyLimitMinutes + evaluation.BonusMinutes} minutes today.";
        return new LockCopy(
            name is null ? "That's a wrap for today!" : $"That's a wrap for today, {name}!",
            "Your screen time comes back tomorrow.",
            used);
    }
}
