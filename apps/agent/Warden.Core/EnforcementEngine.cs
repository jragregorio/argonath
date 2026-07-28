using System.Text.Json;
using Warden.Core.Models;
using Warden.Core.Services;

namespace Warden.Core;

public class EnforcementEngine
{
    private readonly WardenApiClient _api;
    private readonly ConfigStore _configStore;
    private double _activeSecondsToday;
    private double _idleSecondsToday;
    private int _otherDevicesMinutes;
    private PolicyData? _currentPolicy;
    private bool _isLocked;
    private DateTime _lastTick = DateTime.UtcNow;
    private bool _wasActive;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public event Action<PolicyEvaluation>? PolicyChanged;
    public event Action? LockRequired;
    public event Action? UnlockRequired;
    public event Action<RealtimeEvent>? RealtimeEventReceived;
    public event Action<CapturePayload, string>? CaptureRequested;

    public bool IsLocked => _isLocked;
    public bool IsAdminLocked => _currentPolicy?.AdminLock ?? false;
    public int ActiveMinutesToday => (int)(_activeSecondsToday / 60);
    public int IdleMinutesToday => (int)(_idleSecondsToday / 60);
    public double ActiveSecondsToday => _activeSecondsToday;
    public double UsedSecondsToday => _otherDevicesMinutes * 60.0 + _activeSecondsToday;
    public PolicyEvaluation? CurrentEvaluation { get; private set; }

    public EnforcementEngine(WardenApiClient api, ConfigStore configStore)
    {
        _api = api;
        _configStore = configStore;
    }

    public void HandleRealtimeEvent(RealtimeEvent evt)
    {
        RealtimeEventReceived?.Invoke(evt);

        switch (evt.Type)
        {
            case "extension:approved":
                _ = RefreshPolicyAsync(syncUsageFromServer: false);
                break;
            case "extension:denied":
                break;
            case "policy:updated":
            case "device:locked":
            case "device:unlocked":
                _ = RefreshPolicyAsync(syncUsageFromServer: false);
                break;
            case "capture:screen":
            case "capture:webcam":
                if (evt.Payload != null)
                {
                    var json = evt.Payload is JsonElement el
                        ? el.GetRawText()
                        : JsonSerializer.Serialize(evt.Payload);
                    var payload = JsonSerializer.Deserialize<CapturePayload>(json, JsonOptions);
                    if (payload != null)
                        CaptureRequested?.Invoke(payload, evt.Type);
                }
                break;
        }
    }

    public async Task InitializeAsync()
    {
        await RefreshPolicyAsync(syncUsageFromServer: true);
    }

    public async Task RefreshPolicyAsync(bool syncUsageFromServer = false)
    {
        _currentPolicy = await _api.GetPolicyAsync();
        if (_currentPolicy == null) return;

        var thisDevice = _currentPolicy.ThisDeviceMinutes;
        var childTotal = _currentPolicy.UsedMinutesToday;
        _otherDevicesMinutes = Math.Max(0, childTotal - thisDevice);

        if (syncUsageFromServer)
        {
            _activeSecondsToday = thisDevice * 60.0;
            _idleSecondsToday = 0;
        }
        else if (thisDevice > ActiveMinutesToday)
        {
            // Server has more for this device (e.g. after restart gap); catch up without losing local progress.
            _activeSecondsToday = thisDevice * 60.0;
        }

        var config = _configStore.Load();
        if (_currentPolicy.ParentPin != null)
        {
            config.ParentPin = _currentPolicy.ParentPin;
            _configStore.Save(config);
        }

        EvaluateAndEnforce();
    }

    public void Tick()
    {
        var now = DateTime.UtcNow;
        var elapsedSeconds = (now - _lastTick).TotalSeconds;
        _lastTick = now;

        // Ignore tiny jitter and huge gaps (sleep/hibernate).
        if (elapsedSeconds <= 0 || elapsedSeconds > 120) return;

        if (IdleTimeDetector.IsUserActive())
        {
            _activeSecondsToday += elapsedSeconds;
            _wasActive = true;
        }
        else if (_wasActive)
        {
            _idleSecondsToday += elapsedSeconds;
        }

        EvaluateAndEnforce();
    }

    private int UsedMinutesForEnforcement()
    {
        return _otherDevicesMinutes + ActiveMinutesToday;
    }

    private void EvaluateAndEnforce()
    {
        if (_currentPolicy == null) return;

        var evaluation = PolicyEngine.Evaluate(
            _currentPolicy.Policy,
            UsedMinutesForEnforcement(),
            _currentPolicy.BonusMinutes
        );

        if (_currentPolicy.AdminLock)
        {
            evaluation.Status = "blocked";
            evaluation.RemainingMinutes = 0;
            evaluation.Message = "Locked down by parent";
        }

        CurrentEvaluation = evaluation;
        PolicyChanged?.Invoke(evaluation);

        var shouldLock = _currentPolicy.AdminLock || PolicyEngine.ShouldLock(evaluation);

        if (shouldLock && !_isLocked)
        {
            _isLocked = true;
            LockRequired?.Invoke();
            _ = _api.SetLockedAsync(true);
        }
        else if (!shouldLock && _isLocked)
        {
            _isLocked = false;
            UnlockRequired?.Invoke();
            _ = _api.SetLockedAsync(false);
        }
    }

    public async Task SendHeartbeatAsync()
    {
        await _api.SendHeartbeatAsync(ActiveMinutesToday, IdleMinutesToday, _isLocked);
        // Refresh policy/bonus only — do not clobber local accumulation from a stale server value.
        await RefreshPolicyAsync(syncUsageFromServer: false);
    }

    public async Task<bool> RequestExtensionAsync(int minutes)
    {
        return await _api.RequestExtensionAsync(minutes);
    }

    public (bool ok, string? error) ValidateParentPin(string pin)
    {
        var config = _configStore.Load();

        if (string.IsNullOrEmpty(config.ParentPin))
        {
            return (
                false,
                "No parent PIN set. Open the dashboard Settings page and set a PIN first."
            );
        }

        if (pin != config.ParentPin)
        {
            return (false, "Incorrect PIN.");
        }

        return (true, null);
    }

    /// <summary>
    /// Clears remote LOCK DOWN after a successful parent PIN so the dashboard resets.
    /// Does not tear down the lock UI — callers must shut down or unlock separately
    /// to avoid deadlocking the lock-screen dispatcher.
    /// </summary>
    public async Task ClearAdminLockAsync()
    {
        try
        {
            await _api.ClearAdminLockAsync().ConfigureAwait(false);
        }
        catch
        {
            // Best-effort; local flag still cleared below.
        }

        if (_currentPolicy != null)
        {
            _currentPolicy.AdminLock = false;
        }

        _isLocked = false;
    }

    public async Task HandleCaptureAsync(CapturePayload payload, string type)
    {
        byte[]? imageData = null;
        string? error = null;

        try
        {
            if (type == "capture:screen")
            {
                imageData = CaptureService.CaptureScreen();
                if (imageData == null) error = "Screen capture failed";
            }
            else
            {
                error = "Webcam capture not available";
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        if (imageData != null)
        {
            var uploaded = await CaptureService.UploadCaptureAsync(payload.UploadUrl, imageData);
            await _api.ConfirmSnapshotAsync(payload.SnapshotId, uploaded, uploaded ? null : "Upload failed");
        }
        else
        {
            await _api.ConfirmSnapshotAsync(payload.SnapshotId, false, error);
        }
    }
}
