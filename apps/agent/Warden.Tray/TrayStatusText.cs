using Warden.Core;

namespace Warden.Tray;

internal static class TrayStatusText
{
    public static string Format(EnforcementEngine engine)
    {
        if (engine.IsAdminLocked)
        {
            return "Warden — Locked down by parent";
        }

        if (engine.IsLocked)
        {
            return "Warden — Screen locked";
        }

        var eval = engine.CurrentEvaluation;
        if (eval == null)
        {
            return "Warden — Syncing policy...";
        }

        var limitSeconds = Math.Max(1, eval.DailyLimitMinutes + eval.BonusMinutes) * 60;
        var remainingSeconds = Math.Max(
            0,
            (int)Math.Floor(limitSeconds - engine.UsedSecondsToday)
        );
        remainingSeconds = Math.Min(remainingSeconds, Math.Max(0, eval.RemainingMinutes) * 60);

        if (remainingSeconds <= 0)
        {
            return "Warden — Time is up";
        }

        var hours = remainingSeconds / 3600;
        var minutes = remainingSeconds % 3600 / 60;
        var seconds = remainingSeconds % 60;

        if (hours > 0)
        {
            return $"Warden — {hours}h {minutes}m left";
        }

        return $"Warden — {minutes}:{seconds:D2} left";
    }
}
