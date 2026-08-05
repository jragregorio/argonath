using Warden.Core.Models;

namespace Warden.Core.Services;

public static class PolicyEngine
{
    private static readonly string[] DayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    private static int ParseTime(string time)
    {
        var parts = time.Split(':');
        return int.Parse(parts[0]) * 60 + int.Parse(parts[1]);
    }

    private static string FormatMinutes(int totalMinutes)
    {
        var hours = totalMinutes / 60;
        var minutes = totalMinutes % 60;
        return $"{hours:D2}:{minutes:D2}";
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

    private static int GetSecondsSinceMidnight(DateTime date)
    {
        return date.Hour * 3600 + date.Minute * 60 + date.Second;
    }

    /// <summary>
    /// Seconds left in the current allowed window, or null when there is no active window end.
    /// </summary>
    public static int? GetWindowRemainingSeconds(
        IReadOnlyList<AllowedWindow> windows,
        DateTime now)
    {
        if (windows.Count == 0) return null;

        var (inWindow, _, windowEndMinutes) = ResolveWindowState(windows.ToList(), now);
        if (!inWindow || windowEndMinutes is null) return null;

        return Math.Max(0, windowEndMinutes.Value * 60 - GetSecondsSinceMidnight(now));
    }

    /// <summary>
    /// Per day, sort by start and merge overlapping and adjacent runs.
    /// Does not merge across different days.
    /// </summary>
    public static List<AllowedWindow> MergeWindows(IEnumerable<AllowedWindow> windows)
    {
        var byDay = windows
            .GroupBy(w => w.Day)
            .OrderBy(g => g.Key);

        var result = new List<AllowedWindow>();
        foreach (var group in byDay)
        {
            var sorted = group.OrderBy(w => ParseTime(w.Start)).ToList();
            var merged = new List<AllowedWindow>();
            foreach (var window in sorted)
            {
                var start = ParseTime(window.Start);
                var end = ParseTime(window.End);
                if (merged.Count == 0)
                {
                    merged.Add(new AllowedWindow
                    {
                        Day = group.Key,
                        Start = window.Start,
                        End = window.End
                    });
                    continue;
                }

                var last = merged[^1];
                var lastEnd = ParseTime(last.End);
                if (start <= lastEnd)
                {
                    if (end > lastEnd)
                        last.End = FormatMinutes(end);
                }
                else
                {
                    merged.Add(new AllowedWindow
                    {
                        Day = group.Key,
                        Start = window.Start,
                        End = window.End
                    });
                }
            }

            result.AddRange(merged);
        }

        return result;
    }

    public static int GetWindowCapacityMinutes(IEnumerable<AllowedWindow> windows, int day)
    {
        return MergeWindows(windows)
            .Where(w => w.Day == day)
            .Sum(w => ParseTime(w.End) - ParseTime(w.Start));
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
        var dailyRemainingMinutes = Math.Max(0, effectiveLimit - usedMinutesToday);
        var hasWindows = policy.AllowedWindows.Count > 0;

        var today = GetDayOfWeek(now.Value);
        var windowCapacityToday = hasWindows
            ? GetWindowCapacityMinutes(policy.AllowedWindows, today)
            : effectiveLimit;
        var reachableMinutesToday = Math.Min(effectiveLimit, windowCapacityToday);

        if (!policy.IsActive)
        {
            return new PolicyEvaluation
            {
                Status = "allowed",
                RemainingMinutes = 999,
                DailyRemainingMinutes = dailyRemainingMinutes,
                LimitingFactor = "none",
                ReachableMinutesToday = reachableMinutesToday,
                UsedMinutes = usedMinutesToday,
                DailyLimitMinutes = policy.DailyLimitMinutes,
                BonusMinutes = bonusMinutes
            };
        }

        var (inWindow, nextStart, windowEndMinutes) = ResolveWindowState(policy.AllowedWindows, now.Value);

        if (!inWindow)
        {
            var bonusRemaining = Math.Max(
                0,
                bonusMinutes - Math.Max(0, usedMinutesToday - policy.DailyLimitMinutes));
            if (bonusRemaining > 0)
            {
                return new PolicyEvaluation
                {
                    Status = "allowed",
                    RemainingMinutes = bonusRemaining,
                    DailyRemainingMinutes = dailyRemainingMinutes,
                    LimitingFactor = "daily_limit",
                    ReachableMinutesToday = reachableMinutesToday,
                    UsedMinutes = usedMinutesToday,
                    DailyLimitMinutes = policy.DailyLimitMinutes,
                    BonusMinutes = bonusMinutes
                };
            }

            return new PolicyEvaluation
            {
                Status = "outside_window",
                RemainingMinutes = 0,
                DailyRemainingMinutes = dailyRemainingMinutes,
                LimitingFactor = "window",
                ReachableMinutesToday = reachableMinutesToday,
                UsedMinutes = usedMinutesToday,
                DailyLimitMinutes = policy.DailyLimitMinutes,
                BonusMinutes = bonusMinutes,
                NextWindowStart = nextStart,
                Message = nextStart != null ? $"Not available until {nextStart}" : "Outside allowed hours"
            };
        }

        var currentMinutes = GetMinutesSinceMidnight(now.Value);
        int? windowRemainingMinutes = hasWindows && windowEndMinutes.HasValue
            ? Math.Max(0, windowEndMinutes.Value - currentMinutes)
            : null;

        if (usedMinutesToday >= effectiveLimit)
        {
            return new PolicyEvaluation
            {
                Status = "blocked",
                RemainingMinutes = 0,
                DailyRemainingMinutes = 0,
                WindowRemainingMinutes = windowRemainingMinutes,
                LimitingFactor = "daily_limit",
                ReachableMinutesToday = reachableMinutesToday,
                UsedMinutes = usedMinutesToday,
                DailyLimitMinutes = policy.DailyLimitMinutes,
                BonusMinutes = bonusMinutes,
                Message = "Daily screen time limit reached"
            };
        }

        var limitingFactor = PickLimitingFactor(dailyRemainingMinutes, windowRemainingMinutes, hasWindows);
        var remainingMinutes = windowRemainingMinutes is null
            ? dailyRemainingMinutes
            : Math.Min(dailyRemainingMinutes, windowRemainingMinutes.Value);

        return new PolicyEvaluation
        {
            Status = "allowed",
            RemainingMinutes = remainingMinutes,
            DailyRemainingMinutes = dailyRemainingMinutes,
            WindowRemainingMinutes = windowRemainingMinutes,
            LimitingFactor = limitingFactor,
            ReachableMinutesToday = reachableMinutesToday,
            UsedMinutes = usedMinutesToday,
            DailyLimitMinutes = policy.DailyLimitMinutes,
            BonusMinutes = bonusMinutes
        };
    }

    public static bool ShouldLock(PolicyEvaluation evaluation)
    {
        return evaluation.Status is "blocked" or "outside_window";
    }

    private static string PickLimitingFactor(int dailyRemaining, int? windowRemaining, bool hasWindows)
    {
        if (!hasWindows || windowRemaining is null)
            return "daily_limit";
        // Exact tie → prefer daily_limit
        if (dailyRemaining <= windowRemaining.Value)
            return "daily_limit";
        return "window";
    }

    private static (bool inWindow, string? nextStart, int? windowEndMinutes) ResolveWindowState(
        List<AllowedWindow> windows,
        DateTime now)
    {
        if (windows.Count == 0) return (true, null, null);

        var currentDay = GetDayOfWeek(now);
        var currentMinutes = GetMinutesSinceMidnight(now);
        var merged = MergeWindows(windows);

        foreach (var window in merged.Where(w => w.Day == currentDay))
        {
            var start = ParseTime(window.Start);
            var end = ParseTime(window.End);
            if (currentMinutes >= start && currentMinutes < end)
                return (true, null, end);
        }

        foreach (var window in merged)
        {
            var start = ParseTime(window.Start);
            if (window.Day > currentDay || (window.Day == currentDay && start > currentMinutes))
            {
                return (false, $"{DayNames[window.Day]} {window.Start}", null);
            }
        }

        if (merged.Count > 0)
        {
            var first = merged[0];
            return (false, $"{DayNames[first.Day]} {first.Start}", null);
        }

        return (false, null, null);
    }
}
