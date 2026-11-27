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
