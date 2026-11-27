using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Windows;
using System.Windows.Threading;
using Warden.LockUI;
using Warden.Tray;
using Xunit;
using WpfButton = System.Windows.Controls.Button;

namespace Warden.Tests;

public class AttentionWindowMotionTests
{
    private static void RunSta(Action body)
    {
        ExceptionDispatchInfo? error = null;
        var thread = new Thread(() =>
        {
            try { body(); }
            catch (Exception ex) { error = ExceptionDispatchInfo.Capture(ex); }
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

    private static WpfButton Ok(AttentionWindow w) =>
        (WpfButton)typeof(AttentionWindow).GetField("_ok", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(w)!;

    private static string MessageText(AttentionWindow w) =>
        ((System.Windows.Controls.TextBlock)typeof(AttentionWindow).GetField("_messageText", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(w)!).Text;

    private static AttentionWindow ShowOffscreen(AttentionWindow w)
    {
        w.Quiet = true;
        w.Topmost = false;
        w.ShowActivated = false;
        w.Left = -20000;
        w.Show();
        return w;
    }

    [Fact]
    public void Nudge_shows_typing_dots_then_types_the_message() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowOffscreen(new AttentionWindow("NUDGE", "Dinner's ready, come downstairs", okDelaySeconds: 5, enableNudgeReply: true));
        Pump(TimeSpan.FromMilliseconds(1000));
        var duringDots = MessageText(w);
        Pump(TimeSpan.FromMilliseconds(1400));
        var typing = MessageText(w);
        Pump(TimeSpan.FromMilliseconds(1600));
        var done = MessageText(w);
        w.Close();
        Assert.Equal("", duringDots);
        Assert.EndsWith("▌", typing);
        Assert.Equal("Dinner's ready, come downstairs", done);
    });

    [Fact]
    public void Skipping_typing_shows_the_full_message_at_once() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowOffscreen(new AttentionWindow("NUDGE", "Dinner's ready, come downstairs", okDelaySeconds: 5, enableNudgeReply: true));
        Pump(TimeSpan.FromMilliseconds(400));
        w.SkipTyping();
        var text = MessageText(w);
        Pump(TimeSpan.FromMilliseconds(2500));
        var later = MessageText(w);
        w.Close();
        Assert.Equal("Dinner's ready, come downstairs", text);
        Assert.Equal("Dinner's ready, come downstairs", later);
    });

    [Fact]
    public void Empty_nudge_types_the_default_message() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowOffscreen(new AttentionWindow("NUDGE", "", okDelaySeconds: 5, enableNudgeReply: true));
        Pump(TimeSpan.FromMilliseconds(4200));
        var done = MessageText(w);
        w.Close();
        Assert.Equal("Your parent wants your attention", done);
    });

    private static System.Windows.Controls.TextBlock? CountText(AttentionWindow w) =>
        (System.Windows.Controls.TextBlock?)typeof(AttentionWindow).GetField("_countText", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(w);

    private static System.Windows.Controls.Canvas Particles(AttentionWindow w) =>
        (System.Windows.Controls.Canvas)typeof(AttentionWindow).GetField("_particleLayer", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(w)!;

    [Fact]
    public void Bonus_bursts_particles_and_counts_up_to_the_minutes() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowOffscreen(new AttentionWindow("Extra time", "Your parent added +30 minutes", okDelaySeconds: 0, bonusMinutes: 30));
        Pump(TimeSpan.FromMilliseconds(250));
        var startCount = CountText(w)!.Text;
        Pump(TimeSpan.FromMilliseconds(250));
        var particles = Particles(w).Children.Count;
        Pump(TimeSpan.FromMilliseconds(1400));
        var endCount = CountText(w)!.Text;
        var particlesAfter = Particles(w).Children.Count;
        w.Close();
        Assert.Equal("+0", startCount);
        Assert.Equal(20, particles);
        Assert.Equal("+30", endCount);
        Assert.Equal(0, particlesAfter);
    });

    [Fact]
    public void Bonus_without_minutes_keeps_extra_screen_time_wording() => RunSta(() =>
    {
        var w = ShowOffscreen(new AttentionWindow("Extra time", "Your parent added extra screen time", okDelaySeconds: 0, bonusMinutes: 0));
        Pump(TimeSpan.FromMilliseconds(1200));
        var text = MessageText(w);
        var count = CountText(w);
        w.Close();
        Assert.Equal("Your parent added extra screen time", text);
        Assert.Null(count);
    });

    [Fact]
    public void Ok_becomes_clickable_when_the_fill_finishes() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = new AttentionWindow("NUDGE", "Hi", okDelaySeconds: 1, enableNudgeReply: true) { Quiet = true };
        w.Topmost = false;
        w.ShowActivated = false;
        w.Left = -20000;
        w.Show();
        Assert.False(Ok(w).IsEnabled);
        Pump(TimeSpan.FromMilliseconds(1600));
        var enabled = Ok(w).IsEnabled;
        w.Close();
        Assert.True(enabled);
    });
}
