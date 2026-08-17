using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Windows;
using System.Windows.Threading;
using Warden.Core;
using Warden.Core.Diagnostics;
using Warden.Core.Services;
using Warden.LockUI;
using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;

namespace Warden.Tray;

static class Program
{
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessBasicInformation
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
    }

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr processHandle,
        int processInformationClass,
        ref ProcessBasicInformation processInformation,
        int processInformationLength,
        out int returnLength
    );

    private static EnforcementEngine? _engine;
    private static RealtimeService? _realtime;
    private static System.Windows.Forms.Timer? _tickTimer;
    private static System.Windows.Forms.Timer? _captureTimer;
    private static NotifyIcon? _trayIcon;
    private static Icon? _trayIconOwned;
    private static MainWindow? _mainWindow;
    private static DateTime _lastHeartbeatAt = DateTime.UtcNow;
    private static ConfigStore? _configStore;
    private static bool _capturePollInFlight;
    private static readonly HashSet<string> _activeNudgeWindows = new();
    private static readonly object _nudgeUiLock = new();
    private static bool _attentionBusy;
    private static readonly Queue<(AttentionItemKind Kind, Action Show)> _attentionQueue = new();
    private static readonly object _attentionLock = new();
    private static AttentionWindow? _activeTimeWarningWindow;
    /// <summary>Drop late time-warning dispatcher work after a bonus notice (race with Tick).</summary>
    private static DateTime _suppressTimeWarningUiUntil = DateTime.MinValue;
    private static readonly Dictionary<string, DateTime> _lastBlockedNoticeUtcByProcess =
        new(StringComparer.OrdinalIgnoreCase);
    private static string? _blockedNoticeActiveOrQueued;
    private const int BlockedNoticeThrottleSeconds = 30;
    private const int BlockedNoticeAutoDismissSeconds = 3;

    private enum AttentionItemKind
    {
        General,
        TimeWarning
    }
    private static StartupDiagnosis? _startupDiagnosis;
    private static string? _lastErrorSummary;
    private static readonly HeartbeatHealthTracker _heartbeatHealth = new();
    private static Mutex? _singleInstanceMutex;
    private static bool _previousSessionUnclean;
    private static bool _uncleanExitReported;

    private static DateTime _lastNudgePollAt = DateTime.MinValue;

    [STAThread]
    static void Main()
    {
        InstallGlobalExceptionHandlers();

        try
        {
            WardenLog.Init("Startup");

            // Session-scoped single-instance (Local\, not Global\): each Windows user
            // may run their own tray. Duplicate logon launches exit silently (code 0).
            if (!SingleInstanceGuard.TryAcquire(out _singleInstanceMutex, out var mutexMsg))
            {
                WardenLog.Warn("Startup", mutexMsg);
                return;
            }

            WardenLog.Info("Startup", mutexMsg);
            LogBootContext();

            _previousSessionUnclean = SessionMarker.HadUncleanPreviousSession();
            if (_previousSessionUnclean)
            {
                WardenLog.Warn(
                    "Session",
                    "Previous session ended uncleanly (marker still present — force-kill, crash, or abrupt power/logoff)."
                );
            }

            WardenLog.Info("Startup", "WinForms init");
            System.Windows.Forms.Application.EnableVisualStyles();
            System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);

            WardenLog.Info("Startup", "Creating WPF Application");
            var app = new Application
            {
                ShutdownMode = ShutdownMode.OnExplicitShutdown
            };
            app.DispatcherUnhandledException += OnDispatcherUnhandledException;

            WardenLog.Info("Startup", "Constructing services");
            _configStore = new ConfigStore();
            var http = NetworkResilience.CreateAgentHttpClient();
            var api = new WardenApiClient(http, _configStore);

            WardenLog.Info("Startup", "Loading config");
            _ = _configStore.Load();
            if (_configStore.ConsumeCorruptConfigRecovery())
            {
                WardenLog.Warn("Startup", "Corrupt/missing config recovered; re-pairing required");
                MessageBox.Show(
                    "The local Warden configuration was missing or damaged, so this device needs to be paired again.\n\n"
                        + "Open the parent dashboard, generate a pairing code, and enter it on the next screen.",
                    "Warden",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning
                );
            }

            if (!_configStore.IsPaired())
            {
                WardenLog.Info("Startup", "Pairing gate entered");
                var pairing = new PairingWindow(api, _configStore);
                if (pairing.ShowDialog() != true || !_configStore.IsPaired())
                {
                    WardenLog.Info("Startup", "Exiting: pairing cancelled or incomplete");
                    return;
                }

                WardenLog.Info("Startup", "Pairing gate completed");
            }
            else
            {
                WardenLog.Info("Startup", "Already paired");
            }

            WardenLog.Info("Startup", "Creating EnforcementEngine");
            _engine = new EnforcementEngine(api, _configStore);

            WardenLog.Info("Startup", "Wiring engine event handlers");
            _engine.LockRequired += () =>
            {
                _ = app.Dispatcher.BeginInvoke(() =>
                {
                    try
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
                            async () =>
                            {
                                try
                                {
                                    SessionMarker.ClearClean();
                                    return await Task.FromResult(SystemShutdown.Initiate());
                                }
                                catch (Exception ex)
                                {
                                    WardenLog.Error("LockUI", "Shutdown PC handler failed", ex);
                                    return (false, "Unexpected error. Try the Start menu.");
                                }
                            },
                            async pin =>
                            {
                                try
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
                                    catch (Exception ex)
                                    {
                                        WardenLog.Warn("Shutdown", "ClearAdminLockAsync failed during PIN unlock", ex);
                                    }

                                    ShutdownWarden("parent-pin-unlock");
                                    return result;
                                }
                                catch (Exception ex)
                                {
                                    WardenLog.Error("LockUI", "PIN unlock handler failed", ex);
                                    return (false, "Unexpected error. Try again.");
                                }
                            },
                            _engine.CurrentEvaluation,
                            monitors
                        );
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("LockUI", "LockRequired Show failed", ex);
                    }
                });
            };

            _engine.UnlockRequired += () =>
            {
                _ = app.Dispatcher.BeginInvoke(() =>
                {
                    try
                    {
                        LockWindowManager.Hide();
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("LockUI", "UnlockRequired Hide failed", ex);
                    }
                });
            };
            _engine.PolicyChanged += eval =>
            {
                LockWindowManager.Update(eval);
                UpdateTrayStatusText();
            };

            _engine.CaptureRequested += (payload, type) =>
            {
                _ = app.Dispatcher.InvokeAsync(async () =>
                {
                    try
                    {
                        if (_engine == null)
                        {
                            return;
                        }

                        await _engine.HandleCaptureAsync(payload, type);
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("Capture", "HandleCaptureAsync failed", ex);
                    }
                });
            };

            _engine.NudgeRequested += payload =>
            {
                _ = app.Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        EnqueueAttention(() => ShowNudge(payload));
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("Nudge", "NudgeRequested UI enqueue failed", ex);
                    }
                });
            };

            _engine.TimeWarningRequested += payload =>
            {
                _ = app.Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        if (DateTime.UtcNow < _suppressTimeWarningUiUntil)
                        {
                            return;
                        }

                        EnqueueAttention(() => ShowTimeWarning(payload), AttentionItemKind.TimeWarning);
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("TimeWarning", "TimeWarningRequested UI enqueue failed", ex);
                    }
                });
            };

            _engine.ExtensionApprovedNoticeRequested += payload =>
            {
                _ = app.Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        OnExtensionApprovedNotice(payload);
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("Extension", "ExtensionApprovedNotice UI enqueue failed", ex);
                    }
                });
            };

            _engine.AppBlockedNoticeRequested += processName =>
            {
                _ = app.Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        TryShowAppBlockedNotice(processName);
                    }
                    catch (Exception ex)
                    {
                        WardenLog.Warn("BlockedApps", "AppBlockedNotice UI enqueue failed", ex);
                    }
                });
            };

            WardenLog.Info("Startup", "Creating RealtimeService");
            _realtime = new RealtimeService(_configStore, evt => _engine!.HandleRealtimeEvent(evt));

            WardenLog.Info("Startup", "Starting background init task");
            _ = Task.Run(async () =>
            {
                try
                {
                    await _engine.InitializeAsync();
                    await _realtime.ConnectAsync();
                    await app.Dispatcher.InvokeAsync(async () =>
                    {
                        try
                        {
                            await PollPendingCapturesAsync();
                            await PollPendingNudgesAsync();
                        }
                        catch (Exception ex) when (ex is not DeviceUnpairedException)
                        {
                            WardenLog.Warn("Startup", "Post-init poll failed (non-fatal)", ex);
                        }
                    });
                    WardenLog.Info("Startup", "Background init completed");
                }
                catch (DeviceUnpairedException ex)
                {
                    WardenLog.Warn("Startup", "Device unpaired during background init", ex);
                    _ = app.Dispatcher.BeginInvoke(() =>
                    {
                        MessageBox.Show(
                            ex.Message,
                            "Warden",
                            MessageBoxButton.OK,
                            MessageBoxImage.Information
                        );
                        ShutdownWarden("device-unpaired-init");
                    });
                }
                catch (Exception ex)
                {
                    // Offline / transient failure at boot must not kill the agent.
                    // Tick() keeps enforcing the last known local policy until heartbeat recovers.
                    WardenLog.Error("Startup", "Background init failed (agent continues offline)", ex);
                    _lastErrorSummary = ex.Message;
                }
            });

            WardenLog.Info("Startup", "Starting timers");
            _tickTimer = new System.Windows.Forms.Timer { Interval = 1000 };
            _tickTimer.Tick += async (_, _) =>
            {
                try
                {
                    if (_engine == null)
                    {
                        return;
                    }

                    _engine.Tick();
                    UpdateTrayStatusText();

                    var shouldPollServer =
                        (DateTime.UtcNow - _lastHeartbeatAt).TotalSeconds >= 5;

                    if (!shouldPollServer)
                    {
                        return;
                    }

                    try
                    {
                        var reportUnclean =
                            _previousSessionUnclean && !_uncleanExitReported;
                        await _engine.SendHeartbeatAsync(reportUnclean);
                        _lastHeartbeatAt = DateTime.UtcNow;
                        if (reportUnclean)
                        {
                            _uncleanExitReported = true;
                            WardenLog.Info("Session", "Reported previousSessionUnclean to server");
                        }
                        _heartbeatHealth.RecordSuccess();
                        UpdateTrayStatusText();
                    }
                    catch (DeviceUnpairedException ex)
                    {
                        WardenLog.Warn("Heartbeat", "Device unpaired", ex);
                        MessageBox.Show(
                            ex.Message,
                            "Warden",
                            MessageBoxButton.OK,
                            MessageBoxImage.Information
                        );
                        ShutdownWarden("device-unpaired-heartbeat");
                    }
                    catch (Exception ex)
                    {
                        // Transient network errors must never tear down the agent.
                        _heartbeatHealth.RecordFailure(ex);
                        _lastErrorSummary = ex.Message;
                    }

                    if ((DateTime.UtcNow - _lastNudgePollAt).TotalSeconds >= 5)
                    {
                        _lastNudgePollAt = DateTime.UtcNow;
                        try
                        {
                            await PollPendingNudgesAsync();
                        }
                        catch (DeviceUnpairedException ex)
                        {
                            WardenLog.Warn("Poll", "Device unpaired during nudge poll", ex);
                            MessageBox.Show(
                                ex.Message,
                                "Warden",
                                MessageBoxButton.OK,
                                MessageBoxImage.Information
                            );
                            ShutdownWarden("device-unpaired-poll");
                        }
                        catch (Exception ex)
                        {
                            WardenLog.Warn("Poll", "Nudge poll failed (non-fatal)", ex);
                        }
                    }
                }
                catch (Exception ex)
                {
                    WardenLog.Warn("Heartbeat", "Tick handler failed (non-fatal)", ex);
                }
            };
            _tickTimer.Start();

            _captureTimer = new System.Windows.Forms.Timer { Interval = 15_000 };
            _captureTimer.Tick += async (_, _) =>
            {
                try
                {
                    await PollPendingCapturesAsync();
                }
                catch (DeviceUnpairedException ex)
                {
                    WardenLog.Warn("Poll", "Device unpaired during capture poll", ex);
                    MessageBox.Show(
                        ex.Message,
                        "Warden",
                        MessageBoxButton.OK,
                        MessageBoxImage.Information
                    );
                    ShutdownWarden("device-unpaired-poll");
                }
                catch (Exception ex)
                {
                    WardenLog.Warn("Poll", "Capture poll failed (non-fatal)", ex);
                }
            };
            _captureTimer.Start();

            WardenLog.Info("Startup", "Creating main window");
            _mainWindow = new MainWindow(
                _engine,
                _configStore,
                pin =>
                {
                    var result = _engine!.ValidateParentPin(pin);
                    if (result.ok)
                    {
                        ShutdownWarden("main-window-pin-exit");
                        return (true, null);
                    }

                    return result;
                }
            );

            WardenLog.Info("Startup", "Creating tray");
            SetupTray();
            WardenLog.Info("Startup", "Showing main window");
            _mainWindow.Show();

            WardenLog.Info("Startup", "Entering message loop");
            SessionMarker.MarkRunning();
            try
            {
                Microsoft.Win32.SystemEvents.SessionEnding += OnSessionEnding;
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Session", "SystemEvents.SessionEnding subscribe failed", ex);
            }

            app.Run();
            WardenLog.Info("Startup", "Message loop exited");
            SessionMarker.ClearClean();
        }
        catch (Exception ex)
        {
            _lastErrorSummary = ex.Message;
            WardenLog.Error("Startup", "Fatal error in Main", ex);
            throw;
        }
        finally
        {
            try
            {
                Microsoft.Win32.SystemEvents.SessionEnding -= OnSessionEnding;
            }
            catch
            {
                // ignore
            }

            SingleInstanceGuard.Release(ref _singleInstanceMutex);
        }
    }

    private static void OnSessionEnding(object sender, Microsoft.Win32.SessionEndingEventArgs e)
    {
        // Logoff / shutdown is a clean OS exit — do not treat as End Task.
        SessionMarker.ClearClean();
        WardenLog.Info("Session", $"SessionEnding reason={e.Reason}; cleared session marker");
    }

    /// <summary>
    /// Policy: parental-control agents must survive transient network failures. Mark
    /// HttpRequestException / IO / socket / timeout / websocket (and inners) as Handled
    /// so a wifi blip cannot uninstall enforcement. Genuine logic bugs (NRE, invalid UI
    /// state, OOM) still terminate so we do not run corrupt.
    /// </summary>
    private static void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        _lastErrorSummary = e.Exception.Message;
        if (NetworkResilience.IsRecoverable(e.Exception))
        {
            WardenLog.Error(
                "Unhandled",
                "DispatcherUnhandledException recovered (network/transient) — agent continues",
                e.Exception
            );
            e.Handled = true;
            return;
        }

        WardenLog.Error("Unhandled", "DispatcherUnhandledException (not recovered)", e.Exception);
    }

    private static void InstallGlobalExceptionHandlers()
    {
        try
        {
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                var ex = e.ExceptionObject as Exception;
                _lastErrorSummary = ex?.Message ?? e.ExceptionObject?.ToString();
                WardenLog.Error(
                    "Unhandled",
                    $"AppDomain.UnhandledException (IsTerminating={e.IsTerminating})",
                    ex
                );
            };
        }
        catch
        {
            // ignore
        }

        try
        {
            System.Windows.Forms.Application.ThreadException += (_, e) =>
            {
                _lastErrorSummary = e.Exception.Message;
                if (NetworkResilience.IsRecoverable(e.Exception))
                {
                    WardenLog.Error(
                        "Unhandled",
                        "WinForms ThreadException recovered (network/transient) — agent continues",
                        e.Exception
                    );
                    return;
                }

                WardenLog.Error("Unhandled", "WinForms Application.ThreadException", e.Exception);
            };
        }
        catch
        {
            // ignore
        }

        try
        {
            TaskScheduler.UnobservedTaskException += (_, e) =>
            {
                _lastErrorSummary = e.Exception.Message;
                if (NetworkResilience.IsRecoverable(e.Exception))
                {
                    WardenLog.Error(
                        "Unhandled",
                        "UnobservedTaskException recovered (network/transient)",
                        e.Exception
                    );
                    e.SetObserved();
                    return;
                }

                WardenLog.Error("Unhandled", "TaskScheduler.UnobservedTaskException", e.Exception);
            };
        }
        catch
        {
            // ignore
        }
    }

    private static void LogBootContext()
    {
        try
        {
            var sid = WindowsIdentity.GetCurrent().User?.Value ?? "(unknown)";
            var args = string.Join(" ", Environment.GetCommandLineArgs().Skip(1));
            var parent = TryGetParentProcessDescription();
            WardenLog.Info(
                "Boot",
                $"version={AgentVersionInfo.Current}; path={Environment.ProcessPath}; pid={Environment.ProcessId}; "
                    + $"args=[{args}]; user={Environment.UserDomainName}\\{Environment.UserName}; sid={sid}; "
                    + $"session={Process.GetCurrentProcess().SessionId}; os={Environment.OSVersion}; "
                    + $"machine={Environment.MachineName}; cwd={Environment.CurrentDirectory}; parent={parent}"
            );

            _startupDiagnosis = StartupHelper.Diagnose(selfHeal: true);
            WardenLog.Info("Boot", $"autostart: {_startupDiagnosis.Summary}");
        }
        catch (Exception ex)
        {
            WardenLog.Warn("Boot", "Failed to log boot context", ex);
        }
    }

    private static string TryGetParentProcessDescription()
    {
        try
        {
            using var self = Process.GetCurrentProcess();
            var pbi = new ProcessBasicInformation();
            var status = NtQueryInformationProcess(
                self.Handle,
                0,
                ref pbi,
                Marshal.SizeOf<ProcessBasicInformation>(),
                out _
            );
            if (status != 0)
            {
                return "(unknown)";
            }

            var ppid = pbi.InheritedFromUniqueProcessId.ToInt32();
            var parentName = "?";
            try
            {
                using var parent = Process.GetProcessById(ppid);
                parentName = parent.ProcessName;
            }
            catch
            {
                // Parent may have exited (common for Task Scheduler).
            }

            return $"{parentName} (pid {ppid})";
        }
        catch (Exception ex)
        {
            WardenLog.Debug("Boot", "Parent process lookup failed", ex);
            return "(unknown)";
        }
    }

    private static Icon? TryLoadEmbeddedTrayIcon()
    {
        try
        {
            var asm = typeof(Program).Assembly;
            using var stream = asm.GetManifestResourceStream("Warden.Tray.warden_icon.ico");
            if (stream is null)
            {
                return null;
            }

            using var loaded = new Icon(stream, 16, 16);
            return (Icon)loaded.Clone();
        }
        catch (Exception ex)
        {
            WardenLog.Debug("Tray", "Failed to load embedded tray icon", ex);
            return null;
        }
    }

    private static void SetupTray()
    {
        _trayIconOwned = TryLoadEmbeddedTrayIcon();
        _trayIcon = new NotifyIcon
        {
            Icon = _trayIconOwned ?? SystemIcons.Shield,
            Text = "Warden",
            Visible = true
        };
        UpdateTrayStatusText();

        var menu = new ContextMenuStrip();
        menu.ShowItemToolTips = true;
        menu.Items.Add(
            "Open Warden",
            null,
            (_, _) => _mainWindow?.Dispatcher.Invoke(() => _mainWindow.ShowFromTray())
        );

        var diagnosis = _startupDiagnosis ?? StartupHelper.Diagnose(selfHeal: false);
        _startupDiagnosis = diagnosis;
        var taskOk = diagnosis.TaskState == InstallerTaskState.Ok;
        var taskBroken = diagnosis.TaskState is InstallerTaskState.WrongUser
            or InstallerTaskState.Disabled
            or InstallerTaskState.Missing;

        var startupItem = new ToolStripMenuItem("Start with Windows")
        {
            Checked = diagnosis.IsEffectivelyEnabled,
            CheckOnClick = !taskOk,
            Enabled = !taskOk,
        };
        if (taskOk)
        {
            startupItem.ToolTipText = "Startup is managed by the Warden installer.";
        }
        else if (taskBroken)
        {
            startupItem.ToolTipText =
                diagnosis.TaskState == InstallerTaskState.WrongUser
                    ? "The installer's startup task is registered for a different Windows account; Warden installed a per-user fallback."
                    : $"Installer startup task state: {diagnosis.TaskState}. A per-user fallback may be used.";
        }

        if (!taskOk)
        {
            startupItem.Click += (_, _) =>
            {
                try
                {
                    StartupHelper.SetEnabled(startupItem.Checked);
                    StartupHelper.InvalidateCache();
                    _startupDiagnosis = StartupHelper.Diagnose(selfHeal: false);
                }
                catch (Exception ex)
                {
                    WardenLog.Warn("Tray", "Toggle Start with Windows failed", ex);
                    startupItem.Checked = StartupHelper.IsEnabled();
                    MessageBox.Show(
                        ex.Message,
                        "Warden",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning
                    );
                }
            };
        }
        menu.Items.Add(startupItem);
        menu.Items.Add(
            "Refresh policy",
            null,
            async (_, _) =>
            {
                try
                {
                    if (_engine == null)
                    {
                        WardenLog.Warn("Tray", "Refresh policy clicked before engine ready");
                        return;
                    }

                    await _engine.SendHeartbeatAsync();
                    _heartbeatHealth.RecordSuccess();
                    _mainWindow?.Dispatcher.Invoke(() => _mainWindow.ShowFromTray());
                }
                catch (DeviceUnpairedException ex)
                {
                    WardenLog.Warn("Tray", "Device unpaired during refresh", ex);
                    MessageBox.Show(
                        ex.Message,
                        "Warden",
                        MessageBoxButton.OK,
                        MessageBoxImage.Information
                    );
                    ShutdownWarden("device-unpaired-refresh");
                }
                catch (Exception ex)
                {
                    _heartbeatHealth.RecordFailure(ex);
                    MessageBox.Show(
                        "Could not refresh policy right now (network error). Warden keeps enforcing the last known rules.",
                        "Warden",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning
                    );
                }
            }
        );
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(
            "Open logs folder",
            null,
            (_, _) =>
            {
                try
                {
                    var dir = WardenLog.GetLogDirectory();
                    Directory.CreateDirectory(dir);
                    Process.Start(
                        new ProcessStartInfo
                        {
                            FileName = "explorer.exe",
                            Arguments = $"\"{dir}\"",
                            UseShellExecute = true,
                        }
                    );
                }
                catch (Exception ex)
                {
                    WardenLog.Warn("Tray", "Open logs folder failed", ex);
                    MessageBox.Show(
                        ex.Message,
                        "Warden",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning
                    );
                }
            }
        );
        menu.Items.Add(
            "Copy diagnostics",
            null,
            (_, _) =>
            {
                try
                {
                    var text = StartupHelper.BuildDiagnosticsClipboardText(
                        _startupDiagnosis ?? StartupHelper.Diagnose(selfHeal: false)
                    );
                    if (!string.IsNullOrEmpty(_lastErrorSummary))
                    {
                        text += Environment.NewLine + $"Last error: {_lastErrorSummary}";
                    }

                    System.Windows.Forms.Clipboard.SetText(text);
                    WardenLog.Info("Tray", "Diagnostics copied to clipboard");
                }
                catch (Exception ex)
                {
                    WardenLog.Warn("Tray", "Copy diagnostics failed", ex);
                    MessageBox.Show(
                        ex.Message,
                        "Warden",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning
                    );
                }
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
                    if (result.ok)
                    {
                        ShutdownWarden("tray-pin-exit");
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

    private static async Task PollPendingCapturesAsync()
    {
        if (_engine == null || _capturePollInFlight)
        {
            return;
        }

        _capturePollInFlight = true;
        try
        {
            await _engine.ProcessPendingCapturesAsync();
        }
        finally
        {
            _capturePollInFlight = false;
        }
    }

    private static void EnqueueAttention(Action show, AttentionItemKind kind = AttentionItemKind.General)
    {
        lock (_attentionLock)
        {
            if (_attentionBusy)
            {
                _attentionQueue.Enqueue((kind, show));
                return;
            }

            _attentionBusy = true;
        }

        show();
    }

    private static void PurgeQueuedTimeWarnings()
    {
        lock (_attentionLock)
        {
            if (_attentionQueue.Count == 0)
            {
                return;
            }

            var kept = new Queue<(AttentionItemKind Kind, Action Show)>();
            while (_attentionQueue.Count > 0)
            {
                var item = _attentionQueue.Dequeue();
                if (item.Kind != AttentionItemKind.TimeWarning)
                {
                    kept.Enqueue(item);
                }
            }

            while (kept.Count > 0)
            {
                _attentionQueue.Enqueue(kept.Dequeue());
            }
        }
    }

    private static void DismissActiveTimeWarning()
    {
        var window = _activeTimeWarningWindow;
        if (window == null)
        {
            return;
        }

        try
        {
            window.Close();
        }
        catch (Exception ex)
        {
            WardenLog.Debug("TimeWarning", "Dismiss active time warning failed", ex);
            if (ReferenceEquals(_activeTimeWarningWindow, window))
            {
                _activeTimeWarningWindow = null;
            }

            ReleaseAttentionSlot();
        }
    }

    private static void OnExtensionApprovedNotice(Warden.Core.Models.ExtensionPayload payload)
    {
        // Cover in-flight TimeWarningRequested dispatcher callbacks after purge.
        _suppressTimeWarningUiUntil = DateTime.UtcNow.AddSeconds(5);
        PurgeQueuedTimeWarnings();
        DismissActiveTimeWarning();
        var extraMinutes = payload.ExtraMinutes;
        // Prefer bonus notice ahead of any other queued attention (except leave current nudge).
        EnqueueAttention(() => ShowBonusGranted(extraMinutes));
    }

    private static void ShowBonusGranted(int extraMinutes)
    {
        // Any positive grant size (15/30/60/custom) — never special-case a single preset.
        // okDelaySeconds: 0 — immediate OK. Delayed OK used a DispatcherTimer that can
        // freeze at OK (N) on this WinForms+WPF hybrid message loop after unlock.
        var body = extraMinutes > 0
            ? $"Your parent added +{extraMinutes} minutes"
            : "Your parent added extra screen time";
        var window = new AttentionWindow("Extra time", body, okDelaySeconds: 0);
        window.Closed += (_, _) => ReleaseAttentionSlot();
        window.Show();
        WardenLog.Info("Extension", $"Showing Extra time UI for +{extraMinutes}m");
    }

    private static void TryShowAppBlockedNotice(string processName)
    {
        if (string.IsNullOrWhiteSpace(processName))
            return;
        if (_engine == null || _engine.IsLocked)
            return;

        var now = DateTime.UtcNow;
        if (
            _lastBlockedNoticeUtcByProcess.TryGetValue(processName, out var last)
            && (now - last).TotalSeconds < BlockedNoticeThrottleSeconds
        )
        {
            return;
        }

        lock (_attentionLock)
        {
            if (
                _blockedNoticeActiveOrQueued != null
                && string.Equals(
                    _blockedNoticeActiveOrQueued,
                    processName,
                    StringComparison.OrdinalIgnoreCase
                )
            )
            {
                return;
            }

            if (_blockedNoticeActiveOrQueued != null)
                return;

            _blockedNoticeActiveOrQueued = processName;
        }

        EnqueueAttention(() => ShowAppBlockedNotice(processName));
    }

    private static void ShowAppBlockedNotice(string processName)
    {
        if (_engine == null || _engine.IsLocked)
        {
            ClearBlockedNoticeSlot();
            ReleaseAttentionSlot();
            return;
        }

        _lastBlockedNoticeUtcByProcess[processName] = DateTime.UtcNow;
        var window = new AttentionWindow(
            "App blocked",
            $"{processName} isn't allowed on this PC.",
            okDelaySeconds: 0,
            autoDismissSeconds: BlockedNoticeAutoDismissSeconds
        );
        window.Closed += (_, _) =>
        {
            ClearBlockedNoticeSlot();
            ReleaseAttentionSlot();
        };
        window.Show();
        WardenLog.Info("BlockedApps", $"Showing App blocked UI for {processName}");
    }

    private static void ClearBlockedNoticeSlot()
    {
        lock (_attentionLock)
        {
            _blockedNoticeActiveOrQueued = null;
        }
    }

    private static void ReleaseAttentionSlot()
    {
        Action? next = null;
        lock (_attentionLock)
        {
            if (_attentionQueue.Count > 0)
            {
                next = _attentionQueue.Dequeue().Show;
            }
            else
            {
                _attentionBusy = false;
            }
        }

        next?.Invoke();
    }

    private static async Task PollPendingNudgesAsync()
    {
        if (_engine == null)
        {
            return;
        }

        await _engine.ProcessPendingNudgesAsync();
    }

    private static void ShowNudge(Warden.Core.Models.NudgePayload payload)
    {
        if (_engine == null || string.IsNullOrWhiteSpace(payload.NudgeId))
        {
            ReleaseAttentionSlot();
            return;
        }

        lock (_nudgeUiLock)
        {
            if (!_activeNudgeWindows.Add(payload.NudgeId))
            {
                ReleaseAttentionSlot();
                return;
            }
        }

        var window = new AttentionWindow(
            "NUDGE",
            string.IsNullOrWhiteSpace(payload.Message)
                ? "Your parent wants your attention"
                : payload.Message,
            okDelaySeconds: 5
        );

        _ = Task.Run(async () =>
        {
            try
            {
                await _engine.AckNudgeAsync(payload.NudgeId, "delivered");
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Nudge", "Ack delivered failed", ex);
            }
        });

        window.Closed += (_, _) =>
        {
            lock (_nudgeUiLock)
            {
                _activeNudgeWindows.Remove(payload.NudgeId);
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    await _engine.AckNudgeAsync(payload.NudgeId, "seen", "ok");
                }
                catch (Exception ex)
                {
                    WardenLog.Debug("Nudge", "Ack seen failed", ex);
                }
            });

            ReleaseAttentionSlot();
        };

        window.Show();
    }

    private static void ShowTimeWarning(Warden.Core.Models.TimeWarningPayload payload)
    {
        if (DateTime.UtcNow < _suppressTimeWarningUiUntil)
        {
            ReleaseAttentionSlot();
            return;
        }

        var allowExtensionRequest = payload.ThresholdMinutes is 10 or 5 or 1;
        var window = new AttentionWindow(
            "Time remaining",
            payload.Message,
            okDelaySeconds: 3,
            extensionMinutes: allowExtensionRequest ? [15, 30, 60] : null,
            onExtensionRequest: allowExtensionRequest
                ? minutes => _engine!.RequestExtensionAsync(minutes)
                : null
        );

        _activeTimeWarningWindow = window;
        window.Closed += (_, _) =>
        {
            if (ReferenceEquals(_activeTimeWarningWindow, window))
            {
                _activeTimeWarningWindow = null;
            }

            ReleaseAttentionSlot();
        };
        window.Show();
    }

    private static void UpdateTrayStatusText()
    {
        if (_trayIcon == null || _engine == null)
        {
            return;
        }

        _trayIcon.Text = TrayStatusText.Format(_engine);
    }

    private static void ShutdownWarden(string reason = "unspecified")
    {
        WardenLog.Info("Shutdown", $"ShutdownWarden requested; reason={reason}");

        var engine = _engine;
        _ = Task.Run(async () =>
        {
            if (engine == null) return;
            try
            {
                await engine.ClearAdminLockAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                WardenLog.Warn("Shutdown", "ClearAdminLockAsync failed", ex);
            }
        });

        void Exit()
        {
            WardenLog.Info("Shutdown", "Tearing down UI and exiting process");
            SessionMarker.ClearClean();
            try
            {
                LockWindowManager.Hide();
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Shutdown", "LockWindowManager.Hide failed", ex);
            }

            try
            {
                _captureTimer?.Stop();
                _captureTimer?.Dispose();
                _captureTimer = null;
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Shutdown", "captureTimer dispose failed", ex);
            }

            try
            {
                _tickTimer?.Stop();
                _tickTimer?.Dispose();
                _tickTimer = null;
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Shutdown", "tickTimer dispose failed", ex);
            }

            try
            {
                _realtime?.Dispose();
                _realtime = null;
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Shutdown", "realtime dispose failed", ex);
            }

            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }

            if (_trayIconOwned != null)
            {
                _trayIconOwned.Dispose();
                _trayIconOwned = null;
            }

            try
            {
                _mainWindow?.AllowCloseAndShutdown();
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Shutdown", "AllowCloseAndShutdown failed", ex);
            }

            try
            {
                Application.Current?.Shutdown();
            }
            catch (Exception ex)
            {
                WardenLog.Debug("Shutdown", "Application.Shutdown failed", ex);
            }

            SingleInstanceGuard.Release(ref _singleInstanceMutex);
            WardenLog.Info("Shutdown", "Environment.Exit(0)");
            Environment.Exit(0);
        }

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
