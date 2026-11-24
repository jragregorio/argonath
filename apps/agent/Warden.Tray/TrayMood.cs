namespace Warden.Tray;

public enum TrayMoodKind
{
    Syncing,
    AllGood,
    HeadsUp,
    AlmostDone,
    TimesUp,
    Locked
}

/// <param name="Fraction">Share of the limit still left (0–1), for the ring.</param>
internal sealed record TrayMoodView(TrayMoodKind Kind, string TimeLabel, string Pill, string Line, double Fraction);

/// <summary>Pure mapping from time left to what the tray window says and how the ring looks.</summary>
internal static class TrayMood
{
    public const int HeadsUpMinutes = 30;
    public const int AlmostDoneMinutes = 10;

    public static TrayMoodView Compute(int remainingSeconds, int limitSeconds, bool locked, bool syncing)
    {
        if (syncing)
        {
            return new TrayMoodView(TrayMoodKind.Syncing, "…", "Syncing", "Getting today's time from your parent…", 0);
        }

        var seconds = Math.Max(0, remainingSeconds);
        var minutes = (seconds + 59) / 60;
        var fraction = Math.Clamp(seconds / (double)Math.Max(1, limitSeconds), 0, 1);
        var label = FormatMinutes(minutes);

        if (locked)
        {
            return new TrayMoodView(TrayMoodKind.Locked, label, "Locked", "The screen is locked right now.", fraction);
        }

        return minutes switch
        {
            0 => new TrayMoodView(TrayMoodKind.TimesUp, label, "Time's up", "That's a wrap for today!", 0),
            <= AlmostDoneMinutes => new TrayMoodView(TrayMoodKind.AlmostDone, label, "Almost done", "A few minutes left. Start wrapping up!", fraction),
            <= HeadsUpMinutes => new TrayMoodView(TrayMoodKind.HeadsUp, label, "Heads up", "Time is running low. Save your stuff soon.", fraction),
            _ => new TrayMoodView(TrayMoodKind.AllGood, label, "All good", "Lots of time left. Have fun!", fraction)
        };
    }

    public static string FormatMinutes(int minutes)
    {
        minutes = Math.Max(0, minutes);
        var h = minutes / 60;
        var m = minutes % 60;
        if (h == 0) return $"{m}m";
        return m == 0 ? $"{h}h" : $"{h}h {m}m";
    }
}
