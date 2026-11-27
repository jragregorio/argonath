using System.Runtime.ExceptionServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using Warden.LockUI;
using Xunit;
using Rectangle = System.Windows.Shapes.Rectangle;

namespace Warden.Tests;

public class LockWindowMotionTests
{
    private static void RunSta(Action body)
    {
        ExceptionDispatchInfo? error = null;
        var thread = new Thread(() =>
        {
            try { body(); }
            catch (Exception ex) { error = ExceptionDispatchInfo.Capture(ex); }
            finally { BlockyMotion.ForceDisabled = false; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        error?.Throw();
    }

    private static void Pump(TimeSpan duration)
    {
        var frame = new DispatcherFrame();
        var timer = new DispatcherTimer { Interval = duration };
        timer.Tick += (_, _) => { timer.Stop(); frame.Continue = false; };
        timer.Start();
        Dispatcher.PushFrame(frame);
    }

    private static LockWindow ShowPreview(bool primary = true)
    {
        var w = new LockWindow(
            new MonitorBounds(-20000, 0, 1280, 800, primary),
            _ => Task.FromResult(true),
            () => Task.FromResult((true, (string?)null)),
            _ => Task.FromResult((false, (string?)"no")),
            new LockAppearance("#4fd68b", "Sam"))
        {
            Preview = true
        };
        w.Show();
        return w;
    }

    private static List<FrameworkElement> Tagged(DependencyObject root, string tag)
    {
        var found = new List<FrameworkElement>();
        void Walk(DependencyObject node)
        {
            if (node is FrameworkElement fe && Equals(fe.Tag, tag)) found.Add(fe);
            for (var i = 0; i < VisualTreeHelper.GetChildrenCount(node); i++) Walk(VisualTreeHelper.GetChild(node, i));
        }

        Walk(root);
        return found;
    }

    private static int Count<T>(DependencyObject root)
    {
        var n = 0;
        void Walk(DependencyObject node)
        {
            if (node is T) n++;
            for (var i = 0; i < VisualTreeHelper.GetChildrenCount(node); i++) Walk(VisualTreeHelper.GetChild(node, i));
        }

        Walk(root);
        return n;
    }

    [Fact]
    public void Stars_are_squares_that_twinkle() => RunSta(() =>
    {
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(300));
        var stars = Tagged(w, "star");
        var ellipses = Count<Ellipse>(w);
        var animated = stars.Count(s => s.HasAnimatedProperties);
        w.Close();
        Assert.Equal(34, stars.Count);
        Assert.All(stars, s => Assert.IsType<Rectangle>(s));
        Assert.Equal(0, ellipses);
        if (BlockyMotion.Enabled) Assert.True(animated > 0);
    });

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Pixel_moon_has_no_stray_dot_on_any_monitor(bool primary) => RunSta(() =>
    {
        var w = ShowPreview(primary);
        Pump(TimeSpan.FromMilliseconds(200));
        var cells = Tagged(w, "moon-cell").Count;
        var sparkles = Tagged(w, "sparkle").Count;
        w.Close();
        Assert.Equal(8, cells);
        Assert.Equal(0, sparkles);
    });

    [Fact]
    public void Pixel_moon_is_one_piece_joined_along_edges() => RunSta(() =>
    {
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(200));
        var rects = Tagged(w, "moon-cell");
        var cell = rects.Min(r => r.Height);
        var pixels = new HashSet<(int X, int Y)>();
        foreach (var r in rects)
        {
            var x0 = (int)Math.Round(System.Windows.Controls.Canvas.GetLeft(r) / cell);
            var y0 = (int)Math.Round(System.Windows.Controls.Canvas.GetTop(r) / cell);
            for (var dx = 0; dx < (int)Math.Round(r.Width / cell); dx++)
                for (var dy = 0; dy < (int)Math.Round(r.Height / cell); dy++)
                    pixels.Add((x0 + dx, y0 + dy));
        }

        w.Close();
        var seen = new HashSet<(int X, int Y)> { pixels.First() };
        var stack = new Stack<(int X, int Y)>(seen);
        while (stack.Count > 0)
        {
            var (x, y) = stack.Pop();
            foreach (var n in new[] { (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1) })
            {
                if (pixels.Contains(n) && seen.Add(n)) stack.Push(n);
            }
        }

        Assert.Equal(pixels.Count, seen.Count);
    });

    [Fact]
    public void Three_pixel_clouds_drift_across_the_middle() => RunSta(() =>
    {
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(300));
        var clouds = Tagged(w, "cloud");
        var tops = clouds.Select(c => System.Windows.Controls.Canvas.GetTop(c) / 800).ToList();
        var puffs = clouds.Select(c => Count<Rectangle>(c)).ToList();
        var drifting = clouds.Count(c => c.RenderTransform is TransformGroup g && g.Children[^1].HasAnimatedProperties);
        w.Close();
        Assert.Equal(3, clouds.Count);
        Assert.All(tops, t => Assert.InRange(t, 0.25, 0.65));
        Assert.All(puffs, n => Assert.True(n > 20, "clouds are built from many pixel blocks"));
        if (BlockyMotion.Enabled) Assert.Equal(3, drifting);
    });

    [Fact]
    public void Six_stars_flash_a_glint() => RunSta(() =>
    {
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(300));
        var glints = Tagged(w, "glint");
        var animated = glints.Count(g => g.HasAnimatedProperties);
        w.Close();
        Assert.Equal(6, glints.Count);
        if (BlockyMotion.Enabled) Assert.Equal(6, animated);
    });

    [Fact]
    public void A_shooting_star_crosses_now_and_then() => RunSta(() =>
    {
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(300));
        var shooting = Tagged(w, "shooting-star");
        var animated = shooting.Count(s => s.HasAnimatedProperties);
        w.Close();
        Assert.Single(shooting);
        if (BlockyMotion.Enabled) Assert.Equal(1, animated);
    });

    [Fact]
    public void Content_fades_in() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(150));
        var content = Tagged(w, "lock-content").Single();
        var early = content.Opacity;
        Pump(TimeSpan.FromMilliseconds(1800));
        var late = content.Opacity;
        w.Close();
        Assert.True(early < 0.6, $"early opacity {early}");
        Assert.Equal(1, late, 2);
    });

    [Fact]
    public void Animations_off_shows_the_still_sky_at_once() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(150));
        var content = Tagged(w, "lock-content").Single();
        var opacity = content.Opacity;
        var animated = Tagged(w, "star").Count(s => s.HasAnimatedProperties);
        var glintsShown = Tagged(w, "glint").Count(g => g.Opacity > 0);
        var shootingShown = Tagged(w, "shooting-star").Count(g => g.Opacity > 0);
        w.Close();
        Assert.Equal(1, opacity, 2);
        Assert.Equal(0, animated);
        Assert.Equal(0, glintsShown);
        Assert.Equal(0, shootingShown);
    });

    private static Warden.Core.Models.PolicyEvaluation ParentLock() =>
        new() { Status = "blocked", Message = Warden.Core.Theming.LockCopy.AdminLockMessage };

    private static Warden.Core.Models.PolicyEvaluation TimesUp() =>
        new() { Status = "blocked", Message = "Daily limit reached", UsedMinutes = 120, DailyLimitMinutes = 120 };

    private static bool Shown(FrameworkElement e) => e.Visibility == Visibility.Visible;

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Parent_lock_shows_the_buddy_dozing_by_his_desk(bool primary) => RunSta(() =>
    {
        var w = ShowPreview(primary);
        w.UpdateEvaluation(ParentLock());
        Pump(TimeSpan.FromMilliseconds(200));
        var scene = Tagged(w, "paused-scene").Single();
        var backdrop = Tagged(w, "paused-backdrop").Single();
        var night = Tagged(w, "night-sky").Single();
        var moon = Tagged(w, "moon").Single();
        var parts = new[] { "desk", "crt", "tower", "keyboard", "mouse", "controller", "buddy" }
            .ToDictionary(t => t, t => Tagged(w, t).Count);
        var zs = Tagged(w, "zzz").Count;
        var title = Texts(w).Contains("Game paused");
        w.Close();
        Assert.True(Shown(scene));
        Assert.True(Shown(backdrop));
        Assert.False(Shown(night));
        Assert.False(Shown(moon));
        Assert.All(parts, kv => Assert.True(kv.Value == 1, $"{kv.Key} count {kv.Value}"));
        Assert.Equal(3, zs);
        Assert.True(title);
    });

    [Fact]
    public void Times_up_keeps_the_starry_night() => RunSta(() =>
    {
        var w = ShowPreview();
        w.UpdateEvaluation(TimesUp());
        Pump(TimeSpan.FromMilliseconds(200));
        var scene = Shown(Tagged(w, "paused-scene").Single());
        var night = Shown(Tagged(w, "night-sky").Single());
        var moon = Shown(Tagged(w, "moon").Single());
        w.Close();
        Assert.False(scene);
        Assert.True(night);
        Assert.True(moon);
    });

    [Fact]
    public void Lifting_a_parent_lock_into_times_up_switches_back_to_night() => RunSta(() =>
    {
        var w = ShowPreview();
        w.UpdateEvaluation(ParentLock());
        Pump(TimeSpan.FromMilliseconds(150));
        w.UpdateEvaluation(TimesUp());
        Pump(TimeSpan.FromMilliseconds(150));
        var scene = Shown(Tagged(w, "paused-scene").Single());
        var night = Shown(Tagged(w, "night-sky").Single());
        var title = Texts(w).Any(t => t.StartsWith("That's a wrap"));
        w.Close();
        Assert.False(scene);
        Assert.True(night);
        Assert.True(title);
    });

    [Fact]
    public void Sleeping_buddy_breathes_and_snores() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowPreview();
        w.UpdateEvaluation(ParentLock());
        Pump(TimeSpan.FromMilliseconds(400));
        var buddy = Tagged(w, "buddy").Single();
        var breathing = buddy.RenderTransform is TransformGroup g && g.Children.Any(c => c.HasAnimatedProperties);
        var snoring = Tagged(w, "zzz").Count(z => z.HasAnimatedProperties);
        w.Close();
        Assert.True(breathing);
        Assert.Equal(3, snoring);
    });

    [Fact]
    public void Animations_off_shows_a_still_sleeping_scene() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var w = ShowPreview();
        w.UpdateEvaluation(ParentLock());
        Pump(TimeSpan.FromMilliseconds(150));
        var zsVisible = Tagged(w, "zzz").Count(z => z.Opacity > 0);
        var buddyStill = !(Tagged(w, "buddy").Single().RenderTransform is TransformGroup g && g.Children.Any(c => c.HasAnimatedProperties));
        w.Close();
        Assert.Equal(3, zsVisible);
        Assert.True(buddyStill);
    });

    private static List<string> Texts(DependencyObject root)
    {
        var found = new List<string>();
        void Walk(DependencyObject node)
        {
            if (node is System.Windows.Controls.TextBlock tb && tb.IsVisible && !string.IsNullOrEmpty(tb.Text)) found.Add(tb.Text);
            for (var i = 0; i < VisualTreeHelper.GetChildrenCount(node); i++) Walk(VisualTreeHelper.GetChild(node, i));
        }

        Walk(root);
        return found;
    }

    /// <summary>
    /// Opt-in visual check: set WARDEN_LOCK_SNAPSHOT_DIR to save a contact sheet of the
    /// preview lock window (rendered off-screen, nothing else on the desktop is captured).
    /// </summary>
    [Fact]
    public void Lock_snapshot_sheet_when_requested() => RunSta(() =>
    {
        var dir = Environment.GetEnvironmentVariable("WARDEN_LOCK_SNAPSHOT_DIR");
        if (string.IsNullOrWhiteSpace(dir)) return;
        Directory.CreateDirectory(dir);
        foreach (var (primary, parent) in new[] { (true, false), (false, false), (true, true), (false, true) })
        {
            var w = ShowPreview(primary);
            if (parent) w.UpdateEvaluation(ParentLock());
            var frames = new List<System.Windows.Media.Imaging.BitmapSource>();
            var start = DateTime.UtcNow;
            foreach (var t in new[] { 0.15, 0.6, 1.4, 2.6, 4.0 })
            {
                var wait = start.AddSeconds(t) - DateTime.UtcNow;
                if (wait > TimeSpan.Zero) Pump(wait);
                var bmp = new System.Windows.Media.Imaging.RenderTargetBitmap(1280, 800, 96, 96, PixelFormats.Pbgra32);
                var visual = new DrawingVisual();
                using (var dc = visual.RenderOpen())
                {
                    dc.DrawRectangle(w.Background, null, new Rect(0, 0, 1280, 800));
                }

                bmp.Render(visual);
                bmp.Render((Visual)w.Content);
                bmp.Freeze();
                frames.Add(bmp);
            }

            w.Close();
            var sheet = new DrawingVisual();
            const double scale = 0.35;
            using (var dc = sheet.RenderOpen())
            {
                for (var i = 0; i < frames.Count; i++) dc.DrawImage(frames[i], new Rect(i * (1280 * scale + 6), 0, 1280 * scale, 800 * scale));
            }

            var outBmp = new System.Windows.Media.Imaging.RenderTargetBitmap((int)(frames.Count * (1280 * scale + 6)), (int)(800 * scale), 96, 96, PixelFormats.Pbgra32);
            outBmp.Render(sheet);
            var enc = new System.Windows.Media.Imaging.PngBitmapEncoder();
            enc.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(outBmp));
            using var file = File.Create(System.IO.Path.Combine(dir, (parent ? "parent-" : "") + (primary ? "lock-primary.png" : "lock-secondary.png")));
            enc.Save(file);
        }
    });

    [Fact]
    public void Closing_stops_the_loops() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowPreview();
        Pump(TimeSpan.FromMilliseconds(300));
        var stars = Tagged(w, "star");
        w.Close();
        Assert.All(stars, s => Assert.False(s.HasAnimatedProperties));
    });
}
