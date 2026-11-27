using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Warden.Tray;

/// <summary>
/// Dev-only preview: <c>Warden.Tray.exe --preview-popups</c> shows each child popup
/// in turn (close one to see the next), then exits. It never starts enforcement,
/// pairing, the API client or the single-instance guard, so it is safe to run on a
/// paired PC.
/// <para>
/// With <c>--snapshot &lt;dir&gt;</c> the popups are shown off-screen, silently and not
/// topmost, and only their own pixels are saved as one contact sheet per popup
/// (frames left to right over time). Nothing else on the screen is captured.
/// </para>
/// </summary>
internal static class PopupPreview
{
    public const string Flag = "--preview-popups";
    public const string SnapshotFlag = "--snapshot";

    /// <summary>Moments (seconds after show) captured in snapshot mode.</summary>
    private static readonly double[] SnapshotTimes = [0.1, 0.3, 0.6, 1.0, 1.6, 2.3, 3.2, 5.5];

    public static bool Requested(string[] args) =>
        args.Skip(1).Any(a => string.Equals(a, Flag, StringComparison.OrdinalIgnoreCase));

    public static string? SnapshotDir(string[] args)
    {
        for (var i = 1; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], SnapshotFlag, StringComparison.OrdinalIgnoreCase)) return args[i + 1];
        }

        return null;
    }

    public static void Run(string[] args)
    {
        var snapshotDir = SnapshotDir(args);
        var app = new System.Windows.Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        var steps = new Queue<(string Name, Func<AttentionWindow> Make)>(Steps());

        void Next()
        {
            if (steps.Count == 0)
            {
                app.Shutdown();
                return;
            }

            var (name, make) = steps.Dequeue();
            var window = make();
            if (snapshotDir == null)
            {
                window.Closed += (_, _) => Next();
                window.Show();
                return;
            }

            window.Quiet = true;
            window.Topmost = false;
            window.ShowActivated = false;
            window.Left = -20000;
            window.Top = 0;
            window.Show();
            _ = CaptureAsync(window, name, snapshotDir, Next);
        }

        app.Startup += (_, _) => Next();
        app.Run();
    }

    /// <summary>Captures frames, saves the sheet, closes the popup (if still open), then moves on.</summary>
    private static async Task CaptureAsync(AttentionWindow window, string name, string dir, Action next)
    {
        System.IO.Directory.CreateDirectory(dir);
        var frames = new List<BitmapSource>();
        var closed = false;
        window.Closed += (_, _) => closed = true;
        var start = DateTime.UtcNow;
        foreach (var t in SnapshotTimes)
        {
            var wait = start.AddSeconds(t) - DateTime.UtcNow;
            if (wait > TimeSpan.Zero) await Task.Delay(wait);
            if (closed) break;
            if (window.Content is FrameworkElement content) frames.Add(Render(content));
        }

        SaveSheet(frames, System.IO.Path.Combine(dir, $"{name}.png"));
        if (!closed) window.Close();
        next();
    }

    /// <summary>Renders the window's own content (live animated values) onto a desktop-blue backdrop.</summary>
    private static BitmapSource Render(FrameworkElement content)
    {
        var w = Math.Max(1, (int)Math.Ceiling(content.ActualWidth));
        var h = Math.Max(1, (int)Math.Ceiling(content.ActualHeight));
        var popup = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
        popup.Render(content);
        var visual = new DrawingVisual();
        using (var dc = visual.RenderOpen())
        {
            dc.DrawRectangle(new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x2b, 0x3a, 0x4a)), null, new Rect(0, 0, w, h));
            dc.DrawImage(popup, new Rect(0, 0, w, h));
        }

        var bmp = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
        bmp.Render(visual);
        bmp.Freeze();
        return bmp;
    }

    private static void SaveSheet(IReadOnlyList<BitmapSource> frames, string path)
    {
        if (frames.Count == 0) return;
        const double scale = 0.6;
        const double gap = 6;
        var fw = frames.Max(f => f.PixelWidth) * scale;
        var fh = frames.Max(f => f.PixelHeight) * scale;
        var sheetW = (int)Math.Ceiling(frames.Count * (fw + gap));
        var sheet = new DrawingVisual();
        using (var dc = sheet.RenderOpen())
        {
            dc.DrawRectangle(System.Windows.Media.Brushes.Black, null, new Rect(0, 0, sheetW, fh));
            for (var i = 0; i < frames.Count; i++)
            {
                dc.DrawImage(frames[i], new Rect(i * (fw + gap), 0, frames[i].PixelWidth * scale, frames[i].PixelHeight * scale));
            }
        }

        var bmp = new RenderTargetBitmap(sheetW, (int)Math.Ceiling(fh), 96, 96, PixelFormats.Pbgra32);
        bmp.Render(sheet);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bmp));
        using var file = System.IO.File.Create(path);
        encoder.Save(file);
    }

    private static IEnumerable<(string, Func<AttentionWindow>)> Steps()
    {
        static async Task<bool> FakeRequest(int _)
        {
            await Task.Delay(600);
            return true;
        }

        yield return ("1-nudge", () => new AttentionWindow("NUDGE", "Dinner's ready, come downstairs", okDelaySeconds: 5, enableNudgeReply: true, autoDismissSeconds: 45));
        yield return ("2-bonus", () => new AttentionWindow("Extra time", "Your parent added +30 minutes", okDelaySeconds: 0));
        foreach (var minutes in new[] { 10, 5, 1 })
        {
            var m = minutes;
            yield return ($"3-time-{m}", () => new AttentionWindow(
                "Time remaining",
                m == 1 ? "1 minute of screen time left" : $"{m} minutes of screen time left",
                okDelaySeconds: 3,
                extensionMinutes: [15, 30, 60],
                onExtensionRequest: FakeRequest,
                thresholdMinutes: m));
        }

        yield return ("4-nudge-long", () => new AttentionWindow(
            "NUDGE",
            string.Concat(Enumerable.Repeat("This is a long note from your parent to check typing speed. ", 4)).Trim()[..200],
            okDelaySeconds: 5,
            enableNudgeReply: true,
            autoDismissSeconds: 45));
        yield return ("5-nudge-empty", () => new AttentionWindow("NUDGE", "", okDelaySeconds: 5, enableNudgeReply: true, autoDismissSeconds: 45));
        yield return ("6-blocked", () => new AttentionWindow("App blocked", "Roblox is blocked right now", okDelaySeconds: 0, autoDismissSeconds: 3));
    }
}
