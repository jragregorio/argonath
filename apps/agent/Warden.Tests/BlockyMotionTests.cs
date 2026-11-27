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
        Assert.Null(BlockyMotion.Fill(new Border(), 100, TimeSpan.FromSeconds(1), () => called = true));
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
