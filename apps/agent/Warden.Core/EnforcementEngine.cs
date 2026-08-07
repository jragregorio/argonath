using System.Text.Json;
using Warden.Core.Diagnostics;
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

    /// <summary>
    /// When an extension unlocks outside the allowed window, usage is counted from this
    /// baseline so leftover daily budget is not required before the timer moves.
    /// Preferred sources: server getPolicy baseline, then disk, then in-process pierce.
    /// </summary>
    private double? _outsideExtensionBaselineSeconds;
    private int _outsideExtensionBonusMinutes;
    private int? _persistedOutsideGrantBaselineUsedMinutes;
    private readonly OutsideGrantStateStore _outsideGrantStateStore = new();

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

    /// <summary>
    /// Session remaining with second precision. Daily budget uses accrued usage seconds;
    /// schedule windows use wall-clock seconds until window end so the UI does not freeze on :00.
    /// Outside the window, only unused bonus seconds remain (extension schedule pierce).
    /// </summary>
    public int GetRemainingSeconds()
    {
        if (IsLocked || IsAdminLocked) return 0;

        var eval = CurrentEvaluation;
        if (eval == null || eval.RemainingMinutes <= 0) return 0;
        // Paused / inactive policy sentinel.
        if (eval.RemainingMinutes >= 999) return eval.RemainingMinutes * 60;

        var limitSeconds = Math.Max(1, eval.DailyLimitMinutes + eval.BonusMinutes) * 60.0;
        var dailyRemainingSeconds = Math.Max(
            0,
            (int)Math.Floor(limitSeconds - UsedSecondsToday)
        );

        if (_currentPolicy == null || _currentPolicy.Policy.AllowedWindows.Count == 0)
            return dailyRemainingSeconds;

        var now = PolicyEngine.ResolveNow(_currentPolicy.Timezone);
        var windowRemainingSeconds = PolicyEngine.GetWindowRemainingSeconds(
            _currentPolicy.Policy.AllowedWindows,
            now
        );
        // Outside allowed hours: GetWindowRemainingSeconds is null — do not fall back to
        // full daily leftover; only unused extension/bonus time may remain.
        if (windowRemainingSeconds is null)
            return GetOutsideExtensionRemainingSeconds(eval);

        return Math.Min(dailyRemainingSeconds, windowRemainingSeconds.Value);
    }

    /// <summary>
    /// True when a schedule exists and the family clock is outside every allowed window.
    /// </summary>
    public bool IsOutsideAllowedWindow()
    {
        if (_currentPolicy == null || _currentPolicy.Policy.AllowedWindows.Count == 0)
            return false;

        var now = PolicyEngine.ResolveNow(_currentPolicy.Timezone);
        return PolicyEngine.GetWindowRemainingSeconds(
            _currentPolicy.Policy.AllowedWindows,
            now
        ) is null;
    }

    /// <summary>
    /// Extension pool progress while unlocked outside the allowed window.
    /// </summary>
    public bool TryGetOutsideExtensionUsage(out int usedMinutes, out int limitMinutes)
    {
        usedMinutes = 0;
        limitMinutes = 0;
        if (
            !IsOutsideAllowedWindow()
            || _currentPolicy == null
            || _currentPolicy.BonusMinutes <= 0
        )
        {
            return false;
        }

        var baseline = ResolveOutsideGrantBaselineUsedMinutes();
        if (baseline is null)
            return false;

        var bonus = _currentPolicy.BonusMinutes;
        var dailyLimit = _currentPolicy.Policy.DailyLimitMinutes;
        limitMinutes = Math.Max(
            1,
            PolicyEngine.GetOutsideExtensionGrantSize(bonus, baseline.Value, dailyLimit));
        var baselineSeconds = baseline.Value * 60.0;
        var consumedSeconds = Math.Max(0, UsedSecondsToday - baselineSeconds);
        usedMinutes = Math.Min(limitMinutes, (int)Math.Floor(consumedSeconds / 60.0));
        return true;
    }

    /// <summary>
    /// Remaining after-hours grant seconds. Uses second precision against the
    /// durable baseline (server/disk minutes × 60) so the tray does not freeze
    /// on whole minutes — same approach as the pre-0.6.10 local pierce path.
    /// </summary>
    private int GetOutsideExtensionRemainingSeconds(PolicyEvaluation eval)
    {
        var baseline = ResolveOutsideGrantBaselineUsedMinutes();
        if (baseline is int baselineUsed)
        {
            var grantSize = PolicyEngine.GetOutsideExtensionGrantSize(
                eval.BonusMinutes,
                baselineUsed,
                eval.DailyLimitMinutes);
            var grantSeconds = grantSize * 60.0;
            var baselineSeconds = baselineUsed * 60.0;
            var consumed = Math.Max(0, UsedSecondsToday - baselineSeconds);
            return Math.Max(0, (int)Math.Floor(grantSeconds - consumed));
        }

        return GetLocalOutsideExtensionRemainingSeconds(eval.BonusMinutes);
    }

    /// <summary>
    /// Server baseline from getPolicy, else same-day persisted baseline, else null.
    /// </summary>
    private int? ResolveOutsideGrantBaselineUsedMinutes()
    {
        if (_currentPolicy == null || _currentPolicy.BonusMinutes <= 0)
            return null;

        if (_currentPolicy.OutsideGrantBaselineUsedMinutes is int serverBaseline)
        {
            EnsurePersistedOutsideGrantLoaded();
            var chosen = _persistedOutsideGrantBaselineUsedMinutes is int localBaseline
                ? Math.Min(serverBaseline, localBaseline)
                : serverBaseline;
            PersistOutsideGrantBaseline(chosen, _currentPolicy.BonusMinutes);
            return chosen;
        }

        EnsurePersistedOutsideGrantLoaded();
        return _persistedOutsideGrantBaselineUsedMinutes;
    }

    private void EnsurePersistedOutsideGrantLoaded()
    {
        if (_persistedOutsideGrantBaselineUsedMinutes != null)
            return;

        var state = _outsideGrantStateStore.Load();
        if (state == null || string.IsNullOrWhiteSpace(state.Date))
            return;

        var today = FamilyCalendarDateString();
        if (!string.Equals(state.Date, today, StringComparison.Ordinal))
        {
            _outsideGrantStateStore.Clear();
            return;
        }

        if (_currentPolicy != null && _currentPolicy.BonusMinutes <= 0)
        {
            _outsideGrantStateStore.Clear();
            return;
        }

        _persistedOutsideGrantBaselineUsedMinutes = state.BaselineUsedMinutes;
        _outsideExtensionBonusMinutes = state.BonusMinutes;
    }

    private void PersistOutsideGrantBaseline(int baselineUsedMinutes, int bonusMinutes)
    {
        _persistedOutsideGrantBaselineUsedMinutes = baselineUsedMinutes;
        _outsideExtensionBonusMinutes = bonusMinutes;
        _outsideGrantStateStore.Save(
            new OutsideGrantState
            {
                Date = FamilyCalendarDateString(),
                BaselineUsedMinutes = baselineUsedMinutes,
                BonusMinutes = bonusMinutes
            });
    }

    private string FamilyCalendarDateString()
    {
        var now = PolicyEngine.ResolveNow(_currentPolicy?.Timezone);
        return now.ToString("yyyy-MM-dd");
    }

    private int GetLocalOutsideExtensionRemainingSeconds(int bonusMinutes)
    {
        SyncOutsideExtensionGrant(bonusMinutes);
        if (bonusMinutes <= 0 || _outsideExtensionBaselineSeconds is null) return 0;

        var bonusSeconds = bonusMinutes * 60.0;
        var consumed = Math.Max(0, UsedSecondsToday - _outsideExtensionBaselineSeconds.Value);
        return Math.Max(0, (int)Math.Floor(bonusSeconds - consumed));
    }

    private void SyncOutsideExtensionGrant(int bonusMinutes)
    {
        if (bonusMinutes <= 0)
        {
            ClearOutsideExtensionGrant();
            return;
        }

        EnsurePersistedOutsideGrantLoaded();
        if (_persistedOutsideGrantBaselineUsedMinutes != null)
        {
            // Already have a durable pierce — do not reset on process restart.
            if (bonusMinutes > _outsideExtensionBonusMinutes)
            {
                PersistOutsideGrantBaseline(
                    _persistedOutsideGrantBaselineUsedMinutes.Value,
                    bonusMinutes);
            }
            else
            {
                _outsideExtensionBonusMinutes = Math.Max(
                    _outsideExtensionBonusMinutes,
                    bonusMinutes);
            }
            return;
        }

        if (_outsideExtensionBaselineSeconds is null)
        {
            _outsideExtensionBaselineSeconds = UsedSecondsToday;
            _outsideExtensionBonusMinutes = bonusMinutes;
            PersistOutsideGrantBaseline(UsedMinutesForEnforcement(), bonusMinutes);
            return;
        }

        if (bonusMinutes > _outsideExtensionBonusMinutes)
        {
            _outsideExtensionBonusMinutes = bonusMinutes;
            if (_persistedOutsideGrantBaselineUsedMinutes is int b)
            {
                PersistOutsideGrantBaseline(b, bonusMinutes);
            }
            return;
        }

        if (bonusMinutes < _outsideExtensionBonusMinutes)
        {
            _outsideExtensionBaselineSeconds = UsedSecondsToday;
            _outsideExtensionBonusMinutes = bonusMinutes;
            PersistOutsideGrantBaseline(UsedMinutesForEnforcement(), bonusMinutes);
        }
    }

    private void ClearOutsideExtensionGrant()
    {
        _outsideExtensionBaselineSeconds = null;
        _outsideExtensionBonusMinutes = 0;
        _persistedOutsideGrantBaselineUsedMinutes = null;
        _outsideGrantStateStore.Clear();
    }

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
                _ = RefreshPolicyAsync(syncUsageFromServer: true);
                break;
            case "extension:denied":
                break;
            case "policy:updated":
            case "device:locked":
            case "device:unlocked":
                _ = RefreshPolicyAsync(syncUsageFromServer: true);
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
        if (_currentPolicy.ParentPin != null && config.ParentPin != _currentPolicy.ParentPin)
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
            ClearOutsideExtensionGrant();
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
            timeZoneIana: _currentPolicy.Timezone,
            outsideGrantBaselineUsedMinutes: _currentPolicy.OutsideGrantBaselineUsedMinutes
        );

        if (_currentPolicy.AdminLock)
        {
            evaluation.Status = "blocked";
            evaluation.RemainingMinutes = 0;
            evaluation.DailyRemainingMinutes = 0;
            evaluation.LimitingFactor = "daily_limit";
            evaluation.Message = "Locked down by parent";
            ClearOutsideExtensionGrant();
        }
        else if (IsOutsideAllowedWindow())
        {
            var bonus = _currentPolicy.BonusMinutes;
            var effectiveBaseline = ResolveOutsideGrantBaselineUsedMinutes();
            if (bonus > 0 && effectiveBaseline is int serverOrPersistedBaseline)
            {
                // Prefer durable baseline (server or disk). Apply second-precise
                // remaining so the tray counts down continuously (not frozen :00).
                PersistOutsideGrantBaseline(serverOrPersistedBaseline, bonus);
                _outsideExtensionBaselineSeconds = null;
                evaluation = PolicyEngine.Evaluate(
                    _currentPolicy.Policy,
                    UsedMinutesForEnforcement(),
                    bonus,
                    timeZoneIana: _currentPolicy.Timezone,
                    outsideGrantBaselineUsedMinutes: serverOrPersistedBaseline
                );

                var grantSeconds = GetOutsideExtensionRemainingSeconds(evaluation);
                if (grantSeconds <= 0)
                {
                    var lockedEval = PolicyEngine.Evaluate(
                        _currentPolicy.Policy,
                        UsedMinutesForEnforcement(),
                        bonusMinutes: 0,
                        timeZoneIana: _currentPolicy.Timezone
                    );
                    evaluation.Status = "outside_window";
                    evaluation.RemainingMinutes = 0;
                    evaluation.LimitingFactor = "window";
                    evaluation.NextWindowStart = lockedEval.NextWindowStart;
                    evaluation.Message = lockedEval.Message;
                }
                else
                {
                    evaluation.Status = "allowed";
                    evaluation.RemainingMinutes = Math.Max(
                        1,
                        (int)Math.Ceiling(grantSeconds / 60.0)
                    );
                    evaluation.LimitingFactor = "daily_limit";
                    evaluation.NextWindowStart = null;
                    evaluation.Message = null;
                }
            }
            else if (bonus > 0)
            {
                // No durable baseline yet — local pierce grant for lock timing until sync.
                var grantSeconds = GetLocalOutsideExtensionRemainingSeconds(bonus);
                if (grantSeconds <= 0)
                {
                    var lockedEval = PolicyEngine.Evaluate(
                        _currentPolicy.Policy,
                        UsedMinutesForEnforcement(),
                        bonusMinutes: 0,
                        timeZoneIana: _currentPolicy.Timezone
                    );
                    evaluation.Status = "outside_window";
                    evaluation.RemainingMinutes = 0;
                    evaluation.LimitingFactor = "window";
                    evaluation.NextWindowStart = lockedEval.NextWindowStart;
                    evaluation.Message = lockedEval.Message;
                }
                else
                {
                    evaluation.Status = "allowed";
                    evaluation.RemainingMinutes = Math.Max(
                        1,
                        (int)Math.Ceiling(grantSeconds / 60.0)
                    );
                    evaluation.LimitingFactor = "daily_limit";
                    evaluation.NextWindowStart = null;
                    evaluation.Message = null;
                }
            }
            else
            {
                ClearOutsideExtensionGrant();
            }
        }
        else
        {
            // Inside allowed hours — keep durable after-hours baseline on disk so a
            // later window exit does not look like a fresh full grant after restart.
            // Only clear the volatile in-process seconds pierce.
            _outsideExtensionBaselineSeconds = null;
        }

        CurrentEvaluation = evaluation;
        PolicyChanged?.Invoke(evaluation);
        MaybeEmitTimeWarnings(evaluation);

        var shouldLock = _currentPolicy.AdminLock || PolicyEngine.ShouldLock(evaluation);

        if (shouldLock && !_isLocked)
        {
            _isLocked = true;
            LockRequired?.Invoke();
            _ = NotifyLockedAsync(true);
        }
        else if (!shouldLock && _isLocked)
        {
            _isLocked = false;
            UnlockRequired?.Invoke();
            _ = NotifyLockedAsync(false);
        }
    }

    private async Task NotifyLockedAsync(bool isLocked)
    {
        try
        {
            await _api.SetLockedAsync(isLocked).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not DeviceUnpairedException)
        {
            WardenLog.Warn("Engine", $"SetLockedAsync({isLocked}) failed (non-fatal)", ex);
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

    public async Task SendHeartbeatAsync(bool previousSessionUnclean = false)
    {
        await _api.SendHeartbeatAsync(
            ActiveMinutesToday,
            IdleMinutesToday,
            _isLocked,
            previousSessionUnclean
        );
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
        catch (Exception ex)
        {
            // Best-effort; local flag still cleared below.
            WardenLog.Warn("Engine", "ClearAdminLockAsync failed", ex);
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
