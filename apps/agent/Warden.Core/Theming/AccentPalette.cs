using System.Globalization;

namespace Warden.Core.Theming;

/// <summary>An sRGB colour.</summary>
public readonly record struct Rgb(byte R, byte G, byte B)
{
    public string Hex => $"#{R:x2}{G:x2}{B:x2}";
}

/// <summary>
/// The whole app's colours, derived from the one colour the child picks.
/// Keeps the picked hue but limits saturation and lightness so text stays
/// readable whatever is chosen (a very grey pick becomes a grey theme).
/// Shared by the tray window and the lock screen.
/// </summary>
public sealed record AccentPalette(
    Rgb Accent,
    Rgb Soft,
    Rgb Background,
    Rgb Card,
    Rgb Border,
    Rgb Track,
    Rgb Glow,
    Rgb Night,
    Rgb Star)
{
    public const string DefaultHex = "#4fd68b";

    /// <summary>Main text on dark surfaces.</summary>
    public static readonly Rgb Text = new(0xee, 0xf2, 0xf0);

    /// <summary>Secondary text on dark surfaces.</summary>
    public static readonly Rgb MutedText = new(0xb8, 0xc2, 0xbe);

    /// <summary>Text drawn on top of the accent colour.</summary>
    public static readonly Rgb OnAccent = new(0x10, 0x14, 0x1a);

    public static IReadOnlyList<(string Name, string Hex)> Presets { get; } =
    [
        ("Mint", DefaultHex),
        ("Ocean", "#4fb3ff"),
        ("Grape", "#b48cff"),
        ("Sunset", "#ff9f5a")
    ];

    /// <summary>Picks with less saturation than this are treated as grey.</summary>
    private const double GreyThreshold = 0.08;

    /// <summary>Accent must be at least this bright so dark text on it and it on the background both pass 4.5:1.</summary>
    private const double MinAccentLuminance = 0.28;

    public static AccentPalette FromHex(string? hex)
    {
        if (!TryNormalizeHex(hex, out var normalized))
        {
            normalized = DefaultHex;
        }

        var (h, s, l) = ToHsl(Parse(normalized));
        var grey = s < GreyThreshold;
        var accentS = grey ? 0 : Math.Clamp(s, 0.45, 0.90);
        var accentL = Math.Clamp(l, 0.58, 0.72);
        var accent = FromHsl(h, accentS, accentL);
        while (RelativeLuminance(accent) < MinAccentLuminance && accentL < 0.9)
        {
            accentL += 0.02;
            accent = FromHsl(h, accentS, accentL);
        }

        var surfaceS = grey ? 0.04 : Math.Clamp(s * 0.35, 0.08, 0.28);

        return new AccentPalette(
            Accent: accent,
            Soft: FromHsl(h, accentS, 0.80),
            Background: FromHsl(h, surfaceS, 0.11),
            Card: FromHsl(h, surfaceS, 0.16),
            Border: FromHsl(h, surfaceS, 0.26),
            Track: FromHsl(h, surfaceS, 0.24),
            Glow: FromHsl(h, surfaceS, 0.17),
            Night: FromHsl(h, surfaceS, 0.08),
            Star: FromHsl(h, grey ? 0 : 0.40, 0.88));
    }

    /// <summary>Accepts "#rrggbb" (any case, surrounding spaces); returns it lower-cased.</summary>
    public static bool TryNormalizeHex(string? hex, out string normalized)
    {
        normalized = "";
        if (string.IsNullOrWhiteSpace(hex)) return false;

        var trimmed = hex.Trim();
        if (trimmed.Length != 7 || trimmed[0] != '#') return false;
        if (!int.TryParse(trimmed.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out _)) return false;

        normalized = trimmed.ToLowerInvariant();
        return true;
    }

    private static Rgb Parse(string normalizedHex)
    {
        var n = int.Parse(normalizedHex.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return new Rgb((byte)((n >> 16) & 255), (byte)((n >> 8) & 255), (byte)(n & 255));
    }

    /// <summary>Hue in degrees (0–360), saturation and lightness 0–1.</summary>
    public static (double H, double S, double L) ToHsl(Rgb c)
    {
        double r = c.R / 255.0, g = c.G / 255.0, b = c.B / 255.0;
        var max = Math.Max(r, Math.Max(g, b));
        var min = Math.Min(r, Math.Min(g, b));
        var d = max - min;
        var l = (max + min) / 2;

        double h = 0;
        if (d > 0)
        {
            if (max == r) h = (g - b) / d % 6;
            else if (max == g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h = (h * 60 + 360) % 360;
        }

        var s = d == 0 ? 0 : d / (1 - Math.Abs(2 * l - 1));
        return (h, Math.Clamp(s, 0, 1), l);
    }

    public static Rgb FromHsl(double h, double s, double l)
    {
        var c = (1 - Math.Abs(2 * l - 1)) * s;
        var x = c * (1 - Math.Abs(h / 60 % 2 - 1));
        var m = l - c / 2;
        var (r, g, b) = h switch
        {
            < 60 => (c, x, 0.0),
            < 120 => (x, c, 0.0),
            < 180 => (0.0, c, x),
            < 240 => (0.0, x, c),
            < 300 => (x, 0.0, c),
            _ => (c, 0.0, x)
        };

        static byte ToByte(double v) => (byte)Math.Clamp(Math.Round(v * 255), 0, 255);
        return new Rgb(ToByte(r + m), ToByte(g + m), ToByte(b + m));
    }

    public static double RelativeLuminance(Rgb c)
    {
        static double Channel(byte v)
        {
            var s = v / 255.0;
            return s <= 0.03928 ? s / 12.92 : Math.Pow((s + 0.055) / 1.055, 2.4);
        }

        return 0.2126 * Channel(c.R) + 0.7152 * Channel(c.G) + 0.0722 * Channel(c.B);
    }
}
