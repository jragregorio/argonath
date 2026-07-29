using Warden.Core.Models;

namespace Warden.Core.Services;

public static class PolicyEngine
{
    private static int ParseTime(string time)
    {
        var parts = time.Split(':');
        return int.Parse(parts[0]) * 60 + int.Parse(parts[1]);
    }

    private static int GetDayOfWeek(DateTime date)
    {
        var day = (int)date.DayOfWeek;
        return day == 0 ? 7 : day;
    }

    private static int GetMinutesSinceMidnight(DateTime date)
    {
        return date.Hour * 60 + date.Minute;
    }

    /// <summary>
    /// Resolves "now" in the family IANA timezone when provided; otherwise local clock.
    /// </summary>
    public static DateTime ResolveNow(string? timeZoneIana, DateTime? utcNow = null)
    {
        var utc = utcNow ?? DateTime.UtcNow;
        if (string.IsNullOrWhiteSpace(timeZoneIana))
            return DateTime.Now;

        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(timeZoneIana);
            return TimeZoneInfo.ConvertTimeFromUtc(
                DateTime.SpecifyKind(utc, DateTimeKind.Utc),
                tz);
        }
        catch (TimeZoneNotFoundException)
        {
            return DateTime.Now;
        }
        catch (InvalidTimeZoneException)
        {
            return DateTime.Now;
        }
    }

    public static PolicyEvaluation Evaluate(
        PolicyInfo policy,
        int usedMinutesToday,
        int bonusMinutes,
        DateTime? now = null,
        string? timeZoneIana = null)
    {
        now ??= ResolveNow(timeZoneIana);
        var effectiveLimit = policy.DailyLimitMinutes + bonusMinutes;
        var remaining = Math.Max(0, effectiveLimit - usedMinutesToday);

        if (!policy.IsActive)
        {
            return new PolicyEvaluation
            {
                Status = "allowed",
                RemainingMinutes = 999,
                UsedMinutes = usedMinutesToday,
                DailyLimitMinutes = policy.DailyLimitMinutes,
                BonusMinutes = bonusMinutes
            };
        }

        var (inWindow, nextStart) = IsWithinWindow(policy.AllowedWindows, now.Value);

        if (!inWindow)
        {
            return new PolicyEvaluation
            {
                Status = "outside_window",
                RemainingMinutes = 0,
                UsedMinutes = usedMinutesToday,
                DailyLimitMinutes = policy.DailyLimitMinutes,
                BonusMinutes = bonusMinutes,
                NextWindowStart = nextStart,
                Message = nextStart != null ? $"Not available until {nextStart}" : "Outside allowed hours"
            };
        }

        if (usedMinutesToday >= effectiveLimit)
        {
            return new PolicyEvaluation
            {
                Status = "blocked",
                RemainingMinutes = 0,
                UsedMinutes = usedMinutesToday,
                DailyLimitMinutes = policy.DailyLimitMinutes,
                BonusMinutes = bonusMinutes,
                Message = "Daily screen time limit reached"
            };
        }

        return new PolicyEvaluation
        {
            Status = "allowed",
            RemainingMinutes = remaining,
            UsedMinutes = usedMinutesToday,
            DailyLimitMinutes = policy.DailyLimitMinutes,
            BonusMinutes = bonusMinutes
        };
    }

    public static bool ShouldLock(PolicyEvaluation evaluation)
    {
        return evaluation.Status is "blocked" or "outside_window";
    }

    private static (bool inWindow, string? nextStart) IsWithinWindow(
        List<AllowedWindow> windows,
        DateTime now)
    {
        if (windows.Count == 0) return (true, null);

        var currentDay = GetDayOfWeek(now);
        var currentMinutes = GetMinutesSinceMidnight(now);

        foreach (var window in windows.Where(w => w.Day == currentDay))
        {
            var start = ParseTime(window.Start);
            var end = ParseTime(window.End);
            if (currentMinutes >= start && currentMinutes < end)
                return (true, null);
        }

        string[] dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        var sorted = windows.OrderBy(w => w.Day).ThenBy(w => ParseTime(w.Start)).ToList();

        foreach (var window in sorted)
        {
            var start = ParseTime(window.Start);
            if (window.Day > currentDay || (window.Day == currentDay && start > currentMinutes))
            {
                return (false, $"{dayNames[window.Day]} {window.Start}");
            }
        }

        if (sorted.Count > 0)
        {
            var first = sorted[0];
            return (false, $"{dayNames[first.Day]} {first.Start}");
        }

        return (false, null);
    }
}
