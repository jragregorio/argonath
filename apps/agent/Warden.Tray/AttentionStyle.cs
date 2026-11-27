namespace Warden.Tray;

/// <summary>Which colour a popup's header uses.</summary>
public enum AttentionTone
{
    /// <summary>The child's chosen colour.</summary>
    Accent,
    /// <summary>Yellow, same as the "Heads up" pill.</summary>
    HeadsUp,
    /// <summary>Coral, same as the "Almost done" pill.</summary>
    Alert
}

/// <summary>Which "smooth Blocky" animation a popup plays.</summary>
public enum AttentionMotion
{
    /// <summary>No motion (blocked-app notice, unknown popups).</summary>
    None,
    /// <summary>Parent nudge: typing dots, then the message types out.</summary>
    Nudge,
    /// <summary>Bonus time: pop, spinning star, particle burst, count-up.</summary>
    Celebrate,
    /// <summary>Time warning: lives bar, livelier as time runs out.</summary>
    TimeCheck
}

/// <summary>Friendly header (label, icon, colour) and animation for an <see cref="AttentionWindow"/>.</summary>
public sealed record AttentionStyle(string Label, string Glyph, AttentionTone Tone, AttentionMotion Motion = AttentionMotion.None)
{
    // Segoe MDL2 Assets glyphs.
    private const string ChatGlyph = "";
    private const string ClockGlyph = "";
    private const string BlockGlyph = "";
    private const string StarGlyph = "";
    private const string BellGlyph = "";

    public static AttentionStyle For(string? title)
    {
        var t = (title ?? string.Empty).Trim();
        return t.ToLowerInvariant() switch
        {
            "nudge" => new AttentionStyle("Message from your parent", ChatGlyph, AttentionTone.Accent, AttentionMotion.Nudge),
            "time remaining" => new AttentionStyle("Time check", ClockGlyph, AttentionTone.HeadsUp, AttentionMotion.TimeCheck),
            "app blocked" => new AttentionStyle("App blocked", BlockGlyph, AttentionTone.Alert),
            "extra time" => new AttentionStyle("Extra time!", StarGlyph, AttentionTone.Accent, AttentionMotion.Celebrate),
            "" => new AttentionStyle("Warden", BellGlyph, AttentionTone.Accent),
            _ => new AttentionStyle(t, BellGlyph, AttentionTone.Accent)
        };
    }
}
