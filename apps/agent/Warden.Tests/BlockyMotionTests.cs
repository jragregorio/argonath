using System.Runtime.ExceptionServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using Warden.Core.Theming;
using Warden.LockUI;
using Xunit;
using Point = System.Windows.Point;
using Rectangle = System.Windows.Shapes.Rectangle;

namespace Warden.Tests;

public class BlockyMotionTests
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

    [Fact]
    public void Disabled_play_text_sets_final_text_immediately() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var tb = new TextBlock();
        var sb = BlockyMotion.PlayText(tb, BlockyTimeline.TypingFrames("Hello"), "Hello");
        Assert.Null(sb);
        Assert.Equal("Hello", tb.Text);
    });

    [Fact]
    public void Play_text_with_no_frames_sets_final_text() => RunSta(() =>
    {
        var tb = new TextBlock();
        var sb = BlockyMotion.PlayText(tb, [], "Your parent added extra screen time");
        Assert.Null(sb);
        Assert.Equal("Your parent added extra screen time", tb.Text);
    });

    [Fact]
    public void Disabled_burst_adds_no_particles() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var c = new Canvas();
        Assert.Null(BlockyMotion.Burst(c, new Point(10, 10), new[] { Colors.White }, 20, TimeSpan.Zero));
        Assert.Empty(c.Children);
    });

    [Fact]
    public void Disabled_pulse_adds_no_ring() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var c = new Canvas();
        Assert.Null(BlockyMotion.Pulse(c, new Point(20, 20), 38, Colors.Gold, TimeSpan.Zero, 3));
        Assert.Empty(c.Children);
    });

    [Fact]
    public void Disabled_life_lost_hides_block() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var r = new Rectangle { Opacity = 1 };
        Assert.Null(BlockyMotion.LifeLost(r, TimeSpan.Zero));
        Assert.Equal(0, r.Opacity);
    });

    [Fact]
    public void Disabled_loop_does_nothing() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var b = new Border();
        Assert.Null(BlockyMotion.Loop(b, LoopKind.Twinkle));
        Assert.Null(b.RenderTransform as TransformGroup);
    });

    [Fact]
    public void Disabled_fill_does_not_animate() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        var called = false;
        Assert.Null(BlockyMotion.Fill(new Border(), TimeSpan.FromSeconds(1), () => called = true));
        Assert.False(called);
    });

    [Fact]
    public void Enabled_burst_adds_requested_particles() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = false;
        if (!BlockyMotion.Enabled) return; // machine with Windows animations turned off
        var c = new Canvas();
        Assert.NotNull(BlockyMotion.Burst(c, new Point(10, 10), new[] { Colors.White }, 20, TimeSpan.Zero));
        Assert.Equal(20, c.Children.Count);
        Assert.All(c.Children.OfType<Rectangle>(), r => Assert.InRange(r.Width, 4, 8));
    });

    private static void Pump(TimeSpan duration)
    {
        var frame = new System.Windows.Threading.DispatcherFrame();
        var timer = new System.Windows.Threading.DispatcherTimer { Interval = duration };
        timer.Tick += (_, _) => { timer.Stop(); frame.Continue = false; };
        timer.Start();
        System.Windows.Threading.Dispatcher.PushFrame(frame);
    }

    [Fact]
    public void Fill_completes_in_a_shown_window() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = false;
        if (!BlockyMotion.Enabled) return;
        var bar = new Border { Width = 100, Height = 10 };
        var window = new Window { Content = bar, WindowStyle = WindowStyle.None, AllowsTransparency = true, Background = System.Windows.Media.Brushes.Transparent, Left = -20000, Top = 0, Width = 200, Height = 100, ShowActivated = false, ShowInTaskbar = false };
        window.Show();
        var done = false;
        bar.Dispatcher.Invoke(() => BlockyMotion.Fill(bar, TimeSpan.FromMilliseconds(200), () => done = true));
        Pump(TimeSpan.FromMilliseconds(800));
        window.Close();
        Assert.True(done);
    });

    [Fact]
    public void Drop_in_moves_the_card_then_lands() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = false;
        if (!BlockyMotion.Enabled) return;
        var card = new Border { Width = 100, Height = 50 };
        var window = new Window { Content = card, WindowStyle = WindowStyle.None, AllowsTransparency = true, Background = System.Windows.Media.Brushes.Transparent, Left = -20000, Top = 0, Width = 200, Height = 100, ShowActivated = false, ShowInTaskbar = false };
        window.Show();
        BlockyMotion.DropIn(card);
        Pump(TimeSpan.FromMilliseconds(120));
        var t = (TranslateTransform)((TransformGroup)card.RenderTransform).Children[^1];
        var midway = t.Y;
        Pump(TimeSpan.FromMilliseconds(800));
        var landed = t.Y;
        window.Close();
        Assert.True(midway < -5, $"midway Y was {midway}");
        Assert.Equal(0, landed, 1);
    });

    [Fact]
    public void Typing_plays_partial_text_then_full_text() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = false;
        if (!BlockyMotion.Enabled) return;
        var tb = new TextBlock();
        var window = new Window { Content = tb, Left = -20000, Top = 0, Width = 200, Height = 100, ShowActivated = false, ShowInTaskbar = false };
        window.Show();
        BlockyMotion.PlayText(tb, BlockyTimeline.TypingFrames("Hello there", TimeSpan.FromMilliseconds(50)), "Hello there");
        Pump(TimeSpan.FromMilliseconds(170));
        var partial = tb.Text;
        Pump(TimeSpan.FromMilliseconds(700));
        var full = tb.Text;
        window.Close();
        Assert.EndsWith("▌", partial);
        Assert.Equal("Hello there", full);
    });

    [Fact]
    public void Finish_runs_final_state_even_without_storyboard() => RunSta(() =>
    {
        var tb = new TextBlock { Text = "Hel▌" };
        BlockyMotion.Finish(null, tb, () => tb.Text = "Hello");
        Assert.Equal("Hello", tb.Text);
    });

    [Fact]
    public void Finish_stops_typing_and_shows_full_text() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = false;
        if (!BlockyMotion.Enabled) return;
        var tb = new TextBlock();
        var sb = BlockyMotion.PlayText(tb, BlockyTimeline.TypingFrames("Hello", TimeSpan.FromSeconds(5)), "Hello");
        Assert.NotNull(sb);
        BlockyMotion.Finish(sb, tb, () => tb.Text = "Hello");
        Assert.Equal("Hello", tb.Text);
    });
}
