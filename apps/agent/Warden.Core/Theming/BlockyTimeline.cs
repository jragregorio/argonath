namespace Warden.Core.Theming;

/// <summary>Text shown from <see cref="At"/> (since the animation started) onwards.</summary>
public readonly record struct TextFrame(TimeSpan At, string Text);

/// <summary>
/// Timing tables for the "smooth Blocky" popup animations: typing, count-up,
/// and the time-check lives bar. Pure, so the WPF side only plays them back.
/// </summary>
public static class BlockyTimeline
{
    /// <summary>Blocks in the time-check lives bar.</summary>
    public const int TimeBlocks = 10;

    private const string Caret = "▌";
    private static readonly TimeSpan TypingInterval = TimeSpan.FromMilliseconds(38);
    private static readonly TimeSpan MaxTypingTime = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan LifeLostStart = TimeSpan.FromMilliseconds(650);
    private static readonly TimeSpan LifeLostGap = TimeSpan.FromMilliseconds(140);

    /// <summary>
    /// How many blocks stay lit for a time warning. A mood bar, not a gauge:
    /// the warning only knows its threshold, not the daily limit.
    /// </summary>
    public static int LitBlocks(int thresholdMinutes) =>
        thresholdMinutes switch
        {
            60 => 9,
            30 => 8,
            10 => 7,
            5 => 4,
            1 => 1,
            _ => 5
        };

    /// <summary>Used-up blocks (<paramref name="lit"/>..total-1), right to left, with their start delays.</summary>
    public static IReadOnlyList<(int Index, TimeSpan Delay)> LifeLostOrder(int lit, int total = TimeBlocks)
    {
        var order = new List<(int, TimeSpan)>();
        var n = 0;
        for (var i = total - 1; i >= Math.Max(0, lit); i--, n++)
        {
            order.Add((i, LifeLostStart + LifeLostGap * n));
        }

        return order;
    }

    /// <summary>
    /// One frame per character with a block caret, the last frame without it.
    /// 38 ms per character, but never longer than 2 s in total.
    /// </summary>
    public static IReadOnlyList<TextFrame> TypingFrames(string text, TimeSpan? start = null)
    {
        if (string.IsNullOrEmpty(text)) return [];

        var begin = start ?? TimeSpan.Zero;
        var interval = TimeSpan.FromTicks(Math.Min(TypingInterval.Ticks, MaxTypingTime.Ticks / text.Length));
        var frames = new List<TextFrame>(text.Length);
        for (var k = 1; k <= text.Length; k++)
        {
            var shown = k == text.Length ? text : text[..k] + Caret;
            frames.Add(new TextFrame(begin + interval * (k - 1), shown));
        }

        return frames;
    }

    /// <summary>"+0" up to "+<paramref name="to"/>" with an ease-out, ending exactly at <paramref name="duration"/>.</summary>
    public static IReadOnlyList<TextFrame> CountUpFrames(int to, TimeSpan duration)
    {
        if (to <= 0) return [];

        var steps = Math.Min(to, 30);
        var frames = new List<TextFrame>(steps + 1);
        var last = -1;
        for (var k = 0; k <= steps; k++)
        {
            var t = (double)k / steps;
            var value = (int)Math.Round(to * (1 - Math.Pow(1 - t, 3)));
            var frame = new TextFrame(TimeSpan.FromTicks((long)(duration.Ticks * t)), $"+{value}");
            if (value == last)
            {
                if (k == steps) frames[^1] = frame;
                continue;
            }

            frames.Add(frame);
            last = value;
        }

        return frames;
    }
}
