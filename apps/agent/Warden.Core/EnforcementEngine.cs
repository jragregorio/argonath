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

    private readonly HashSet<string> _captureInFlight = new();
    private readonly object _captureLock = new();
    private readonly HashSet<string> _nudgeShown = new();
    private readonly object _nudgeLock = new();

    private static readonly int[] TimeWarningThresholds = [60, 30, 10, 5, 1];
    private readonly HashSet<int> _firedTimeWarnings = new();
    private int? _lastRemainingMinutes;
    private DateTime _usageDayLocal = DateTime.Today;

    public event Action<PolicyEvaluation>? PolicyChanged;
    public event Action? LockRequired;
    public event Action? UnlockRequired;
    public event Action<RealtimeEvent>? RealtimeEventReceived;
    public event Action<CapturePayload, string>? CaptureRequested;
    public event Action<NudgePayload>? NudgeRequested;
    public event Action<TimeWarningPayload>? TimeWarningRequested;

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
            case "nudge:show":
                if (evt.Payload != null)
                {
                    var json = evt.Payload is JsonElement el
                        ? el.GetRawText()
                        : JsonSerializer.Serialize(evt.Payload);
                    var payload = JsonSerializer.Deserialize<NudgePayload>(json, JsonOptions);
                    if (payload != null)
                        TryRequestNudge(payload);
                }
                break;
        }
    }

    private void TryRequestNudge(NudgePayload payload)
    {
        if (string.IsNullOrWhiteSpace(payload.NudgeId)) return;

        lock (_nudgeLock)
        {
            if (!_nudgeShown.Add(payload.NudgeId)) return;
        }

        NudgeRequested?.Invoke(payload);
    }

    public void MarkNudgeComplete(string nudgeId)
    {
        lock (_nudgeLock)
        {
            _nudgeShown.Remove(nudgeId);
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

        // Align local usage day with family timezone once policy (and timezone) is known.
        var familyToday = PolicyEngine.ResolveNow(_currentPolicy.Timezone).Date;
        if (familyToday != _usageDayLocal)
        {
            _usageDayLocal = familyToday;
            if (syncUsageFromServer)
            {
                // Fresh day boundary while syncing: trust server minutes for this calendar day.
                _firedTimeWarnings.Clear();
                _lastRemainingMinutes = null;
            }
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

        var today = PolicyEngine.ResolveNow(_currentPolicy?.Timezone).Date;
        if (today != _usageDayLocal)
        {
            _usageDayLocal = today;
            _firedTimeWarnings.Clear();
            _lastRemainingMinutes = null;
            _activeSecondsToday = 0;
            _idleSecondsToday = 0;
        }

        if (IdleTimeDetector.IsUserActive())
        {
            // Do not burn daily budget while the lock screen is up (mouse jiggling, etc.).
            // Still evaluate every tick so a window opening can unlock.
            if (!_isLocked)
            {
                _activeSecondsToday += elapsedSeconds;
            }
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
            _currentPolicy.BonusMinutes,
            timeZoneIana: _currentPolicy.Timezone
        );

        if (_currentPolicy.AdminLock)
        {
            evaluation.Status = "blocked";
            evaluation.RemainingMinutes = 0;
            evaluation.DailyRemainingMinutes = 0;
            evaluation.LimitingFactor = "daily_limit";
            evaluation.Message = "Locked down by parent";
        }

        CurrentEvaluation = evaluation;
        PolicyChanged?.Invoke(evaluation);
        MaybeEmitTimeWarnings(evaluation);

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

    private void MaybeEmitTimeWarnings(PolicyEvaluation evaluation)
    {
        // Only warn during normal allowed screen time with a real remaining budget.
        if (
            evaluation.Status != "allowed"
            || evaluation.RemainingMinutes <= 0
            || evaluation.RemainingMinutes >= 999
        )
        {
            _lastRemainingMinutes = evaluation.RemainingMinutes;
            return;
        }

        var remaining = evaluation.RemainingMinutes;

        if (_lastRemainingMinutes is int previous)
        {
            if (remaining > previous)
            {
                foreach (var threshold in TimeWarningThresholds)
                {
                    if (remaining > threshold)
                    {
                        _firedTimeWarnings.Remove(threshold);
                    }
                }
            }

            foreach (var threshold in TimeWarningThresholds)
            {
                if (previous > threshold && remaining <= threshold && _firedTimeWarnings.Add(threshold))
                {
                    TimeWarningRequested?.Invoke(
                        new TimeWarningPayload
                        {
                            ThresholdMinutes = threshold,
                            Message = FormatTimeWarningMessage(threshold, evaluation.LimitingFactor)
                        }
                    );
                }
            }
        }

        _lastRemainingMinutes = remaining;
    }

    private static string FormatTimeWarningMessage(int thresholdMinutes, string limitingFactor)
    {
        if (limitingFactor == "window")
        {
            return thresholdMinutes switch
            {
                60 => "1 hour left before allowed hours end",
                30 => "30 minutes left before allowed hours end",
                10 => "10 minutes left before allowed hours end",
                5 => "5 minutes left before allowed hours end",
                1 => "1 minute left before allowed hours end",
                _ => $"{thresholdMinutes} minutes left before allowed hours end"
            };
        }

        return thresholdMinutes switch
        {
            60 => "1 hour of screen time left",
            30 => "30 minutes of screen time left",
            10 => "10 minutes of screen time left",
            5 => "5 minutes of screen time left",
            1 => "1 minute of screen time left",
            _ => $"{thresholdMinutes} minutes of screen time left"
        };
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
        lock (_captureLock)
        {
            if (!_captureInFlight.Add(payload.SnapshotId))
            {
                return;
            }
        }

        try
        {
            byte[]? imageData = null;
            string? error = null;

            try
            {
                if (type == "capture:screen" || type == "screen")
                {
                    // BitBlt must run on the calling STA/UI thread.
                    imageData = CaptureService.CaptureScreen();
                    if (imageData == null) error = "Screen capture failed";
                }
                else if (type == "capture:webcam" || type == "webcam")
                {
                    imageData = CaptureService.CaptureWebcam();
                    if (imageData == null) error = "Webcam capture failed — no camera or frame";
                }
                else
                {
                    error = $"Unknown capture type: {type}";
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            // Upload + confirm off the UI thread so the tray stays responsive.
            await Task.Run(async () =>
            {
                if (imageData != null)
                {
                    var (uploaded, uploadError) = await CaptureService
                        .UploadCaptureAsync(payload.UploadUrl, imageData, payload.Token)
                        .ConfigureAwait(false);
                    await _api
                        .ConfirmSnapshotAsync(
                            payload.SnapshotId,
                            uploaded,
                            uploaded ? null : uploadError ?? "Upload failed"
                        )
                        .ConfigureAwait(false);
                }
                else
                {
                    await _api
                        .ConfirmSnapshotAsync(payload.SnapshotId, false, error)
                        .ConfigureAwait(false);
                }
            }).ConfigureAwait(false);
        }
        finally
        {
            lock (_captureLock)
            {
                _captureInFlight.Remove(payload.SnapshotId);
            }
        }
    }

    public async Task ProcessPendingCapturesAsync()
    {
        var pending = await _api.GetPendingCapturesAsync();
        foreach (var item in pending)
        {
            await HandleCaptureAsync(
                new CapturePayload
                {
                    SnapshotId = item.SnapshotId,
                    UploadUrl = item.UploadUrl,
                    Token = item.Token,
                    StorageKey = item.StorageKey
                },
                item.Type
            );
        }
    }

    public async Task ProcessPendingNudgesAsync()
    {
        var pending = await _api.GetPendingNudgesAsync();
        foreach (var item in pending)
        {
            TryRequestNudge(
                new NudgePayload
                {
                    NudgeId = item.NudgeId,
                    Message = item.Message,
                    AutoDismissSeconds = item.AutoDismissSeconds
                }
            );
        }
    }

    public Task AckNudgeAsync(string nudgeId, string status, string? response = null) =>
        _api.AckNudgeAsync(nudgeId, status, response);
}
