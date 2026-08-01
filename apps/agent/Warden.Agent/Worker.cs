using System.Windows.Forms;
using Warden.Core;
using Warden.Core.Services;
using Warden.LockUI;

namespace Warden.Agent;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly EnforcementEngine _engine;
    private readonly ConfigStore _configStore;
    private RealtimeService? _realtime;

    public Worker(
        ILogger<Worker> logger,
        EnforcementEngine engine,
        ConfigStore configStore)
    {
        _logger = logger;
        _engine = engine;
        _configStore = configStore;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_configStore.IsPaired())
        {
            _logger.LogWarning("Agent not paired. Run Warden.Tray to pair first.");
            return;
        }

        _engine.LockRequired += () =>
        {
            var monitors = Screen.AllScreens
                .Select(s => new MonitorBounds(
                    s.Bounds.Left,
                    s.Bounds.Top,
                    s.Bounds.Width,
                    s.Bounds.Height,
                    s.Primary
                ))
                .ToList();

            LockWindowManager.Show(
                minutes => _engine.RequestExtensionAsync(minutes),
                async pin =>
                {
                    var result = _engine.ValidateParentPin(pin);
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

                    LockWindowManager.Hide();
                    // Stopping the service host ends enforcement until the agent is started again.
                    Environment.Exit(0);
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
            try
            {
                await _engine.HandleCaptureAsync(payload, type);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "HandleCaptureAsync failed (non-fatal)");
            }
        };

        _realtime = new RealtimeService(_configStore, evt => _engine.HandleRealtimeEvent(evt));

        try
        {
            await _engine.InitializeAsync();
            await _realtime.ConnectAsync();
        }
        catch (DeviceUnpairedException ex)
        {
            _logger.LogWarning(ex, "Device is no longer paired. Run Warden.Tray to pair again.");
            return;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Background init failed; service continues offline with last policy");
        }

        _logger.LogInformation("Warden Agent service started");

        var lastHeartbeat = DateTime.UtcNow;

        while (!stoppingToken.IsCancellationRequested)
        {
            _engine.Tick();

            if (
                _engine.IsLocked ||
                (DateTime.UtcNow - lastHeartbeat).TotalSeconds >= 5
            )
            {
                try
                {
                    await _engine.SendHeartbeatAsync();
                    lastHeartbeat = DateTime.UtcNow;
                }
                catch (DeviceUnpairedException ex)
                {
                    _logger.LogWarning(ex, "Device is no longer paired. Stopping service loop.");
                    return;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Heartbeat failed (non-fatal)");
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }

        _realtime.Dispose();
    }
}
