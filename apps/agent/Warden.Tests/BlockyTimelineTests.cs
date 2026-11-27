using Warden.Core.Theming;
using Xunit;

namespace Warden.Tests;

public class BlockyTimelineTests
{
    [Theory]
    [InlineData(60, 9)]
    [InlineData(30, 8)]
    [InlineData(10, 7)]
    [InlineData(5, 4)]
    [InlineData(1, 1)]
    [InlineData(15, 5)]
    public void Lit_blocks_follow_threshold(int threshold, int lit) =>
        Assert.Equal(lit, BlockyTimeline.LitBlocks(threshold));

    [Fact]
    public void Life_lost_runs_right_to_left_ending_next_to_lit_blocks()
    {
        var order = BlockyTimeline.LifeLostOrder(lit: 4);
        Assert.Equal(new[] { 9, 8, 7, 6, 5, 4 }, order.Select(o => o.Index));
        Assert.Equal(TimeSpan.FromMilliseconds(650), order[0].Delay);
        Assert.Equal(TimeSpan.FromMilliseconds(650 + 5 * 140), order[^1].Delay);
    }

    [Fact]
    public void Life_lost_is_empty_when_all_blocks_lit() =>
        Assert.Empty(BlockyTimeline.LifeLostOrder(lit: 10));

    [Fact]
    public void Typing_shows_caret_until_last_frame()
    {
        var f = BlockyTimeline.TypingFrames("Hi!");
        Assert.Equal(new[] { "H▌", "Hi▌", "Hi!" }, f.Select(x => x.Text));
        Assert.Equal(TimeSpan.FromMilliseconds(38), f[1].At - f[0].At);
    }

    [Fact]
    public void Long_message_types_within_two_seconds()
    {
        var f = BlockyTimeline.TypingFrames(new string('a', 200), TimeSpan.FromSeconds(2));
        Assert.True(f[^1].At - f[0].At <= TimeSpan.FromSeconds(2));
        Assert.Equal(new string('a', 200), f[^1].Text);
        Assert.True(f[0].At >= TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void Typing_empty_text_has_no_frames() =>
        Assert.Empty(BlockyTimeline.TypingFrames(""));

    [Fact]
    public void Count_up_starts_at_zero_ends_at_target_never_decreases()
    {
        var f = BlockyTimeline.CountUpFrames(30, TimeSpan.FromMilliseconds(700));
        Assert.Equal("+0", f[0].Text);
        Assert.Equal(new TextFrame(TimeSpan.FromMilliseconds(700), "+30"), f[^1]);
        var values = f.Select(x => int.Parse(x.Text.TrimStart('+'))).ToList();
        Assert.True(values.Zip(values.Skip(1)).All(p => p.Second > p.First));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void Count_up_for_no_minutes_is_empty(int to) =>
        Assert.Empty(BlockyTimeline.CountUpFrames(to, TimeSpan.FromMilliseconds(700)));
}
