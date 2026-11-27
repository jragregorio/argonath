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
        while (!w.IsLoaded) Pump(TimeSpan.FromMilliseconds(50));
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

    private static List<System.Windows.Shapes.Rectangle> Lives(AttentionWindow w) =>
        (List<System.Windows.Shapes.Rectangle>)typeof(AttentionWindow).GetField("_lives", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(w)!;

    private static AttentionWindow TimeCheck(int minutes) =>
        new("Time remaining", $"{minutes} minutes of screen time left", okDelaySeconds: 3,
            extensionMinutes: [15, 30, 60], onExtensionRequest: _ => Task.FromResult(true), thresholdMinutes: minutes);

    [Theory]
    [InlineData(10, 3)]
    [InlineData(5, 6)]
    [InlineData(1, 9)]
    public void Time_check_loses_one_life_per_used_block(int minutes, int lost) => RunSta(() =>
    {
        var w = ShowOffscreen(TimeCheck(minutes));
        var lives = Lives(w);
        Assert.Equal(lost, lives.Count);
        Pump(TimeSpan.FromMilliseconds(2900));
        var allGone = lives.All(l => l.Opacity < 0.01);
        w.Close();
        Assert.True(allGone);
    });

    [Fact]
    public void Engine_time_warning_window_gets_the_lives_bar() => RunSta(() =>
    {
        var payload = new Warden.Core.Models.TimeWarningPayload { ThresholdMinutes = 5, Message = "5 minutes of screen time left" };
        var w = ShowOffscreen(Program.CreateTimeWarningWindow(payload, _ => Task.FromResult(true)));
        var lives = Lives(w).Count;
        w.Close();
        Assert.Equal(6, lives);
    });

    [Fact]
    public void One_minute_check_glows_and_closes_cleanly() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowOffscreen(TimeCheck(1));
        var card = (System.Windows.Controls.Border)typeof(AttentionWindow).GetField("_card", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(w)!;
        var before = ((System.Windows.Media.SolidColorBrush)card.BorderBrush).Color;
        Pump(TimeSpan.FromMilliseconds(700));
        var during = ((System.Windows.Media.SolidColorBrush)card.BorderBrush).Color;
        w.Close();
        Pump(TimeSpan.FromMilliseconds(300));
        Assert.NotEqual(before, during);
    });

    [Fact]
    public void Five_minute_check_pulses_from_the_icon() => RunSta(() =>
    {
        if (!BlockyMotion.Enabled) return;
        var w = ShowOffscreen(TimeCheck(5));
        Pump(TimeSpan.FromMilliseconds(900));
        var rings = Particles(w).Children.Count;
        w.Close();
        Assert.Equal(1, rings);
    });

    [Fact]
    public void Animations_off_shows_final_states_and_keeps_the_countdown() => RunSta(() =>
    {
        BlockyMotion.ForceDisabled = true;
        try
        {
            var nudge = ShowOffscreen(new AttentionWindow("NUDGE", "Dinner's ready, come downstairs", okDelaySeconds: 5, enableNudgeReply: true));
            Pump(TimeSpan.FromMilliseconds(200));
            var nudgeText = MessageText(nudge);
            var okLabel = Ok(nudge).Content as string;
            nudge.Close();

            var bonus = ShowOffscreen(new AttentionWindow("Extra time", "Your parent added +30 minutes", okDelaySeconds: 0, bonusMinutes: 30));
            Pump(TimeSpan.FromMilliseconds(200));
            var count = CountText(bonus)!.Text;
            var particles = Particles(bonus).Children.Count;
            bonus.Close();

            var check = ShowOffscreen(TimeCheck(5));
            Pump(TimeSpan.FromMilliseconds(200));
            var livesGone = Lives(check).All(l => l.Opacity == 0);
            check.Close();

            Assert.Equal("Dinner's ready, come downstairs", nudgeText);
            Assert.Equal("OK (5)", okLabel);
            Assert.Equal("+30", count);
            Assert.Equal(0, particles);
            Assert.True(livesGone);
        }
        finally
        {
            BlockyMotion.ForceDisabled = false;
        }
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
