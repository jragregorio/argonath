using Warden.Tray;
using Xunit;

namespace Warden.Tests;

public class AttentionStyleTests
{
    [Theory]
    [InlineData("NUDGE")]
    [InlineData("Nudge")]
    public void Nudge_reads_as_a_message_from_the_parent_in_the_childs_colour(string title)
    {
        var style = AttentionStyle.For(title);
        Assert.Equal("Message from your parent", style.Label);
        Assert.Equal(AttentionTone.Accent, style.Tone);
    }

    [Fact]
    public void Time_warning_uses_heads_up_tone()
    {
        var style = AttentionStyle.For("Time remaining");
        Assert.Equal("Time check", style.Label);
        Assert.Equal(AttentionTone.HeadsUp, style.Tone);
    }

    [Fact]
    public void Blocked_app_uses_alert_tone()
    {
        var style = AttentionStyle.For("App blocked");
        Assert.Equal("App blocked", style.Label);
        Assert.Equal(AttentionTone.Alert, style.Tone);
    }

    [Fact]
    public void Extra_time_is_celebratory_in_the_childs_colour()
    {
        var style = AttentionStyle.For("Extra time");
        Assert.Equal("Extra time!", style.Label);
        Assert.Equal(AttentionTone.Accent, style.Tone);
    }

    [Theory]
    [InlineData("Something new")]
    [InlineData("")]
    public void Unknown_titles_keep_their_text_and_use_accent(string title)
    {
        var style = AttentionStyle.For(title);
        Assert.Equal(string.IsNullOrWhiteSpace(title) ? "Warden" : title, style.Label);
        Assert.Equal(AttentionTone.Accent, style.Tone);
        Assert.False(string.IsNullOrEmpty(style.Glyph));
    }
}
