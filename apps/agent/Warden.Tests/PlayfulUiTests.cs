using Warden.Core.Models;
using Warden.Core.Theming;
using Warden.Tray;
using Xunit;

namespace Warden.Tests;

public class AccentPaletteTests
{
    private static double RelativeLuminance(Rgb c)
    {
        static double Channel(byte v)
        {
            var s = v / 255.0;
            return s <= 0.03928 ? s / 12.92 : Math.Pow((s + 0.055) / 1.055, 2.4);
        }

        return 0.2126 * Channel(c.R) + 0.7152 * Channel(c.G) + 0.0722 * Channel(c.B);
    }

    private static double Contrast(Rgb a, Rgb b)
    {
        var la = RelativeLuminance(a);
        var lb = RelativeLuminance(b);
        return (Math.Max(la, lb) + 0.05) / (Math.Min(la, lb) + 0.05);
    }

    [Fact]
    public void Black_pick_is_lifted_to_a_readable_accent()
    {
        var p = AccentPalette.FromHex("#000000");
        var (_, _, l) = AccentPalette.ToHsl(p.Accent);
        Assert.InRange(l, 0.57, 0.73);
    }

    [Fact]
    public void Washed_out_pick_gets_minimum_saturation()
    {
        var p = AccentPalette.FromHex("#f0eef2");
        var (_, s, _) = AccentPalette.ToHsl(p.Accent);
        Assert.True(s >= 0.44, $"saturation {s}");
    }

    [Fact]
    public void Surfaces_keep_the_picked_hue()
    {
        var p = AccentPalette.FromHex("#4fb3ff");
        var (accentHue, _, _) = AccentPalette.ToHsl(p.Accent);
        var (bgHue, _, _) = AccentPalette.ToHsl(p.Background);
        Assert.InRange(accentHue, 200, 210);
        Assert.InRange(bgHue, 195, 215);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("nope")]
    [InlineData("#12345")]
    [InlineData("#gg0000")]
    public void Invalid_colour_falls_back_to_mint(string? hex)
    {
        Assert.Equal(AccentPalette.FromHex(AccentPalette.DefaultHex), AccentPalette.FromHex(hex));
    }

    [Fact]
    public void Surfaces_get_lighter_from_background_to_border()
    {
        var p = AccentPalette.FromHex("#b48cff");
        Assert.True(RelativeLuminance(p.Background) < RelativeLuminance(p.Card));
        Assert.True(RelativeLuminance(p.Card) < RelativeLuminance(p.Border));
        Assert.True(RelativeLuminance(p.Night) < RelativeLuminance(p.Glow));
    }

    [Theory]
    [InlineData("#ff0000")]
    [InlineData("#ffff00")]
    [InlineData("#00ff00")]
    [InlineData("#0000ff")]
    [InlineData("#ff00ff")]
    [InlineData("#000000")]
    [InlineData("#ffffff")]
    [InlineData("#4fd68b")]
    public void Any_pick_keeps_text_readable(string hex)
    {
        var p = AccentPalette.FromHex(hex);
        Assert.True(Contrast(AccentPalette.OnAccent, p.Accent) >= 4.5, $"dark text on accent for {hex}");
        Assert.True(Contrast(AccentPalette.Text, p.Card) >= 4.5, $"text on card for {hex}");
        Assert.True(Contrast(AccentPalette.MutedText, p.Background) >= 4.5, $"muted text on bg for {hex}");
        Assert.True(Contrast(p.Accent, p.Background) >= 4.5, $"accent on bg for {hex}");
    }

    [Fact]
    public void Presets_are_the_four_approved_colours()
    {
        Assert.Equal(
            new[] { "Mint", "Ocean", "Grape", "Sunset" },
            AccentPalette.Presets.Select(x => x.Name).ToArray());
        Assert.Equal(AccentPalette.DefaultHex, AccentPalette.Presets[0].Hex);
    }

    [Fact]
    public void Hex_is_normalised_to_lowercase()
    {
        Assert.True(AccentPalette.TryNormalizeHex(" #4FB3FF ", out var hex));
        Assert.Equal("#4fb3ff", hex);
    }
}

public class UiPreferencesStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "warden-ui-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    [Fact]
    public void Missing_file_gives_default_accent()
    {
        Assert.Equal(AccentPalette.DefaultHex, new UiPreferencesStore(_dir).LoadAccentHex());
    }

    [Fact]
    public void Saved_accent_round_trips()
    {
        var store = new UiPreferencesStore(_dir);
        store.SaveAccentHex("#B48CFF");
        Assert.Equal("#b48cff", new UiPreferencesStore(_dir).LoadAccentHex());
    }

    [Fact]
    public void Corrupt_file_gives_default_accent()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "ui.json"), "{not json");
        Assert.Equal(AccentPalette.DefaultHex, new UiPreferencesStore(_dir).LoadAccentHex());
    }

    [Fact]
    public void Invalid_saved_colour_gives_default_accent()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "ui.json"), "{\"accent\":\"red\"}");
        Assert.Equal(AccentPalette.DefaultHex, new UiPreferencesStore(_dir).LoadAccentHex());
    }

    [Fact]
    public void Saving_an_invalid_colour_is_ignored()
    {
        var store = new UiPreferencesStore(_dir);
        store.SaveAccentHex("#4fb3ff");
        store.SaveAccentHex("blue");
        Assert.Equal("#4fb3ff", store.LoadAccentHex());
    }
}

public class LockCopyTests
{
    [Fact]
    public void Daily_limit_says_back_tomorrow_with_name()
    {
        var copy = LockCopy.For(
            new PolicyEvaluation { Status = "blocked", Message = "Daily screen time limit reached", UsedMinutes = 180, DailyLimitMinutes = 180 },
            "Mia");
        Assert.Equal("That's a wrap for today, Mia!", copy.Title);
        Assert.Equal("Your screen time comes back tomorrow.", copy.Body);
        Assert.Equal("You used 180 of 180 minutes today.", copy.Detail);
    }

    [Fact]
    public void Without_a_name_the_title_still_reads_well()
    {
        var copy = LockCopy.For(new PolicyEvaluation { Status = "blocked" }, "  ");
        Assert.Equal("That's a wrap for today!", copy.Title);
    }

    [Fact]
    public void Outside_window_says_when_time_comes_back()
    {
        var copy = LockCopy.For(
            new PolicyEvaluation { Status = "outside_window", NextWindowStart = "3:00 PM", DailyRemainingMinutes = 40 },
            "Mia");
        Assert.Equal("That's a wrap for now, Mia!", copy.Title);
        Assert.Equal("Your screen time comes back at 3:00 PM.", copy.Body);
        Assert.Equal("You'll still have 40 min of today's time.", copy.Detail);
    }

    [Fact]
    public void Parent_lock_says_paused()
    {
        var copy = LockCopy.For(
            new PolicyEvaluation { Status = "blocked", Message = LockCopy.AdminLockMessage },
            "Mia");
        Assert.Equal("Time for a break, Mia", copy.Title);
        Assert.Equal("Your parent has paused the screen for now.", copy.Body);
    }

    [Fact]
    public void No_evaluation_yet_uses_the_daily_wording()
    {
        var copy = LockCopy.For(null, "Mia");
        Assert.Equal("That's a wrap for today, Mia!", copy.Title);
        Assert.Equal("", copy.Detail);
    }
}

public class TrayMoodTests
{
    private const int Limit = 180 * 60;

    [Fact]
    public void Plenty_of_time_is_all_good()
    {
        var v = TrayMood.Compute(85 * 60, Limit, locked: false, syncing: false);
        Assert.Equal(TrayMoodKind.AllGood, v.Kind);
        Assert.Equal("1h 25m", v.TimeLabel);
        Assert.Equal("All good", v.Pill);
        Assert.Equal("Lots of time left. Have fun!", v.Line);
        Assert.Equal(85.0 / 180, v.Fraction, 3);
    }

    [Theory]
    [InlineData(30, TrayMoodKind.HeadsUp, "30m")]
    [InlineData(11, TrayMoodKind.HeadsUp, "11m")]
    [InlineData(10, TrayMoodKind.AlmostDone, "10m")]
    [InlineData(1, TrayMoodKind.AlmostDone, "1m")]
    [InlineData(0, TrayMoodKind.TimesUp, "0m")]
    public void Mood_follows_minutes_left(int minutes, TrayMoodKind kind, string label)
    {
        var v = TrayMood.Compute(minutes * 60, Limit, locked: false, syncing: false);
        Assert.Equal(kind, v.Kind);
        Assert.Equal(label, v.TimeLabel);
    }

    [Fact]
    public void Partial_minute_rounds_up_so_time_left_never_reads_zero()
    {
        var v = TrayMood.Compute(59, Limit, locked: false, syncing: false);
        Assert.Equal("1m", v.TimeLabel);
        Assert.Equal(TrayMoodKind.AlmostDone, v.Kind);
    }

    [Fact]
    public void Lock_wins_over_time()
    {
        var v = TrayMood.Compute(85 * 60, Limit, locked: true, syncing: false);
        Assert.Equal(TrayMoodKind.Locked, v.Kind);
        Assert.Equal("Locked", v.Pill);
    }

    [Fact]
    public void Syncing_shows_no_time_yet()
    {
        var v = TrayMood.Compute(0, Limit, locked: false, syncing: true);
        Assert.Equal(TrayMoodKind.Syncing, v.Kind);
        Assert.Equal("…", v.TimeLabel);
        Assert.Equal(0, v.Fraction);
    }

    [Theory]
    [InlineData(0, "0m")]
    [InlineData(45, "45m")]
    [InlineData(60, "1h")]
    [InlineData(95, "1h 35m")]
    public void Durations_read_naturally(int minutes, string expected)
    {
        Assert.Equal(expected, TrayMood.FormatMinutes(minutes));
    }
}
