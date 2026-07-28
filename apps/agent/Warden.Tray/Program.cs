using System.Net.Http;
using System.Windows;
using Warden.Core;
using Warden.Core.Services;
using Warden.LockUI;
using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;

namespace Warden.Tray;

static class Program
{
    private static EnforcementEngine? _engine;
    private static RealtimeService? _realtime;
    private static System.Windows.Forms.Timer? _tickTimer;
    private static NotifyIcon? _trayIcon;
    private static MainWindow? _mainWindow;
    private static DateTime _lastHeartbeatAt = DateTime.UtcNow;
    private static ConfigStore? _configStore;

    [STAThread]
    static void Main()
    {
        System.Windows.Forms.Application.EnableVisualStyles();
        System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);

        var app = new Application
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown
        };

        _configStore = new ConfigStore();
        var http = new HttpClient();
        var api = new WardenApiClient(http, _configStore);

        if (!_configStore.IsPaired())
        {
            var pairing = new PairingWindow(api, _configStore);
            if (pairing.ShowDialog() != true || !_configStore.IsPaired())
            {
                return;
            }
        }

        _engine = new EnforcementEngine(api, _configStore);

        _engine.LockRequired += () =>
        {
            var monitors = System.Windows.Forms.Screen.AllScreens
                .Select(s => new MonitorBounds(
                    s.Bounds.Left,
                    s.Bounds.Top,
                    s.Bounds.Width,
                    s.Bounds.Height,
                    s.Primary
                ))
                .ToList();

            LockWindowManager.Show(
                minutes => _engine!.RequestExtensionAsync(minutes),
                async pin =>
                {
                    var result = _engine!.ValidateParentPin(pin);
                    if (!result.ok)
                    {
                        return result;
                    }

                    try
                    {
                        await _engine.ClearAdminLockAsync();
                    }
                    catch
                    {
                        // Still shut down even if the dashboard clear fails.
                    }

                    ShutdownWarden();
                    return result;
                },
                _engine.CurrentEvaluation,
                monitors
            );
        };

        _engine.UnlockRequired += () => LockWindowManager.Hide();
        _engine.PolicyChanged += eval => LockWindowManager.Update(eval);

        _engine.CaptureRequested += async (payload, type) =>
        {
            await _engine.HandleCaptureAsync(payload, type);
        };

        _realtime = new RealtimeService(_configStore, evt => _engine!.HandleRealtimeEvent(evt));

        _ = Task.Run(async () =>
        {
            await _engine.InitializeAsync();
            await _realtime.ConnectAsync();
        });

        _tickTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _tickTimer.Tick += async (_, _) =>
        {
            _engine.Tick();

            var shouldPollServer =
                _engine.IsLocked || (DateTime.UtcNow - _lastHeartbeatAt).TotalSeconds >= 5;

            if (shouldPollServer)
            {
                await _engine.SendHeartbeatAsync();
                _lastHeartbeatAt = DateTime.UtcNow;
            }
        };
        _tickTimer.Start();

        _mainWindow = new MainWindow(
            _engine,
            _configStore,
            pin =>
            {
                var result = _engine!.ValidateParentPin(pin);
                if (result.ok || string.IsNullOrEmpty(_configStore.Load().ParentPin))
                {
                    ShutdownWarden();
                    return (true, null);
                }

                return result;
            }
        );

        SetupTray();
        _mainWindow.Show();

        app.Run();
    }

    private static void SetupTray()
    {
        _trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Shield,
            Text = "Warden Agent",
            Visible = true
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add(
            "Open Warden",
            null,
            (_, _) => _mainWindow?.Dispatcher.Invoke(() => _mainWindow.ShowFromTray())
        );
        menu.Items.Add(
            "Refresh policy",
            null,
            async (_, _) =>
            {
                await _engine!.SendHeartbeatAsync();
                _mainWindow?.Dispatcher.Invoke(() => _mainWindow.ShowFromTray());
            }
        );
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(
            "Exit (requires parent PIN)",
            null,
            (_, _) =>
            {
                void PromptExit()
                {
                    _mainWindow?.ShowFromTray();
                    var pinWindow = new PinWindow { Owner = _mainWindow };
                    if (pinWindow.ShowDialog() != true) return;

                    var result = _engine!.ValidateParentPin(pinWindow.Pin);
                    if (result.ok || string.IsNullOrEmpty(_configStore!.Load().ParentPin))
                    {
                        ShutdownWarden();
                    }
                    else
                    {
                        MessageBox.Show(
                            result.error ?? "Incorrect PIN.",
                            "Warden",
                            MessageBoxButton.OK,
                            MessageBoxImage.Warning
                        );
                    }
                }

                var dispatcher = Application.Current?.Dispatcher;
                if (dispatcher != null && !dispatcher.CheckAccess())
                {
                    dispatcher.BeginInvoke(PromptExit);
                }
                else
                {
                    PromptExit();
                }
            }
        );

        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.DoubleClick += (_, _) =>
            _mainWindow?.Dispatcher.Invoke(() => _mainWindow.ShowFromTray());
    }

    private static void ShutdownWarden()
    {
        // Never block the UI thread on network (GetResult deadlocks the WPF sync context).
        var engine = _engine;
        _ = Task.Run(async () =>
        {
            if (engine == null) return;
            try
            {
                await engine.ClearAdminLockAsync().ConfigureAwait(false);
            }
            catch
            {
                // Best-effort dashboard unlock.
            }
        });

        void Exit()
        {
            try
            {
                LockWindowManager.Hide();
            }
            catch
            {
                // Ignore if lock UI already torn down.
            }

            try
            {
                _tickTimer?.Stop();
                _tickTimer?.Dispose();
                _tickTimer = null;
            }
            catch
            {
                // Ignore.
            }

            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }

            try
            {
                _mainWindow?.AllowCloseAndShutdown();
            }
            catch
            {
                // Ignore.
            }

            try
            {
                Application.Current?.Shutdown();
            }
            catch
            {
                // Ignore.
            }

            // LockUI runs a background STA dispatcher that can keep the process alive.
            Environment.Exit(0);
        }

        // Always defer so we unwind modal PIN / click handlers before tearing down.
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher != null)
        {
            dispatcher.BeginInvoke(Exit);
        }
        else
        {
            Exit();
        }
    }
}
