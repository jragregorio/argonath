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
    /// <summary>While bonus is active, only warn near expiry (skip 60/30 comfort warnings).</summary>
    private static readonly int[] BonusActiveTimeWarningThresholds = [10, 5, 1];
    private readonly HashSet<int> _firedTimeWarnings = new();
    private int? _lastRemainingMinutes;
    /// <summary>Set on extension:approved until policy refresh baselines remaining (blocks races).</summary>
    private volatile bool _suppressTimeWarnings;
    /// <summary>-1 until first successful getPolicy; used to detect bonus increases on poll.</summary>
    private int _lastKnownBonusMinutes = -1;
    private DateTime _lastBonusNoticeUtc = DateTime.MinValue;
    private int _lastBonusNoticeExtraMinutes = int.MinValue;
    private DateTime _usageDayLocal = DateTime.Today;

    /// <summary>
    /// When an extension unlocks outside the allowed window, usage is counted from this
    /// baseline so leftover daily budget is not required before the timer moves.
    /// Preferred sources: server getPolicy baseline, then disk, then in-process pierce.
    /// </summary>
    private double? _outsideExtensionBaselineSeconds;
    private int _outsideExtensionBonusMinutes;
    private int? _persistedOutsideGrantBaselineUsedMinutes;
    private string? _outsideGrantPersistedDate;
    private bool? _lastIsOutsideAllowedWindow;
    /// <summary>Usage when we last entered an allowed window; used to forgive in-window burn against after-hours pierce.</summary>
    private int? _usedMinutesWhenEnteredAllowedWindow;
    private readonly OutsideGrantStateStore _outsideGrantStateStore = new();

    public event Action<PolicyEvaluation>? PolicyChanged;
    public event Action? LockRequired;
    public event Action? UnlockRequired;
    public event Action<RealtimeEvent>? RealtimeEventReceived;
    public event Action<CapturePayload, string>? CaptureRequested;
    public event Action<NudgePayload>? NudgeRequested;
    public event Action<TimeWarningPayload>? TimeWarningRequested;
    public event Action<ExtensionPayload>? ExtensionApprovedNoticeRequested;

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
    /// When both exist, keep the earlier pierce (min) unless the local pierce has
    /// already exhausted the grant while the server baseline still has time — that
    /// happens after a fresh post-window parent grant and a stale disk baseline.
    /// </summary>
    private int? ResolveOutsideGrantBaselineUsedMinutes()
    {
        if (_currentPolicy == null || _currentPolicy.BonusMinutes <= 0)
            return null;

        if (_currentPolicy.OutsideGrantBaselineUsedMinutes is int serverBaseline)
        {
            EnsurePersistedOutsideGrantLoaded();
            if (_persistedOutsideGrantBaselineUsedMinutes is int localBaseline)
            {
                var bonus = _currentPolicy.BonusMinutes;
                var dailyLimit = _currentPolicy.Policy.DailyLimitMinutes;
                var used = UsedMinutesForEnforcement();
                var remLocal = PolicyEngine.GetOutsideExtensionRemainingMinutes(
                    bonus,
                    used,
                    dailyLimit,
                    localBaseline);
                var remServer = PolicyEngine.GetOutsideExtensionRemainingMinutes(
                    bonus,
                    used,
                    dailyLimit,
                    serverBaseline);

                // Stale local zeros the session while server still has grant.
                // Or server is behind a fresh window-exit pierce on disk.
                var chosen =
                    remLocal <= 0 && remServer > 0
                        ? serverBaseline
                        : remServer <= 0 && remLocal > 0
                            ? localBaseline
                            : Math.Min(serverBaseline, localBaseline);
                PersistOutsideGrantBaseline(chosen, bonus);
                return chosen;
            }

            PersistOutsideGrantBaseline(serverBaseline, _currentPolicy.BonusMinutes);
            return serverBaseline;
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
        _outsideGrantPersistedDate = today;
    }

    private void PersistOutsideGrantBaseline(int baselineUsedMinutes, int bonusMinutes)
    {
        var date = FamilyCalendarDateString();
        if (
            _persistedOutsideGrantBaselineUsedMinutes == baselineUsedMinutes
            && _outsideExtensionBonusMinutes == bonusMinutes
            && string.Equals(_outsideGrantPersistedDate, date, StringComparison.Ordinal)
        )
        {
            return;
        }

        _persistedOutsideGrantBaselineUsedMinutes = baselineUsedMinutes;
        _outsideExtensionBonusMinutes = bonusMinutes;

        try
        {
            _outsideGrantStateStore.Save(
                new OutsideGrantState
                {
                    Date = date,
                    BaselineUsedMinutes = baselineUsedMinutes,
                    BonusMinutes = bonusMinutes
                });
            _outsideGrantPersistedDate = date;
        }
        catch (Exception ex)
        {
            WardenLog.Warn(
                "Engine",
                $"Outside-grant persist failed (non-fatal): baseline={baselineUsedMinutes} bonus={bonusMinutes}",
                ex);
        }
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
        _outsideGrantPersistedDate = null;
        _usedMinutesWhenEnteredAllowedWindow = null;
        _outsideGrantStateStore.Clear();
    }

    /// <summary>
    /// When leaving allowed hours, in-window usage must not consume the after-hours
    /// bonus pool. Shift an existing pierce by in-window growth, or pierce at current used.
    /// </summary>
    private void AdjustOutsideGrantBaselineForWindowExit(int bonusMinutes)
    {
        var used = UsedMinutesForEnforcement();
        EnsurePersistedOutsideGrantLoaded();

        int? existing = _currentPolicy?.OutsideGrantBaselineUsedMinutes;
        if (existing is null)
        {
            existing = _persistedOutsideGrantBaselineUsedMinutes;
        }
        else if (_persistedOutsideGrantBaselineUsedMinutes is int local)
        {
            existing = Math.Min(existing.Value, local);
        }

        if (
            _usedMinutesWhenEnteredAllowedWindow is int usedAtWindowEnter
            && existing is int baseline
        )
        {
            var growth = Math.Max(0, used - usedAtWindowEnter);
            var shifted = Math.Min(used, baseline + growth);
            PersistOutsideGrantBaseline(shifted, bonusMinutes);
            WardenLog.Info(
                "Engine",
                $"Window-exit baseline shift: used={used}m enter={usedAtWindowEnter}m was={baseline}m now={shifted}m bonus={bonusMinutes}m"
            );
        }
        else
        {
            PersistOutsideGrantBaseline(used, bonusMinutes);
            WardenLog.Info(
                "Engine",
                $"Window-exit fresh pierce: used={used}m bonus={bonusMinutes}m"
            );
        }

        _outsideExtensionBaselineSeconds = UsedSecondsToday;
        _usedMinutesWhenEnteredAllowedWindow = null;
    }

    public EnforcementEngine(WardenApiClient api, ConfigStore configStore)
    {
        _api = api;
        _configStore = configStore;
    }

    public void HandleRealtimeEvent(RealtimeEvent evt)
    {
        RealtimeEventReceived?.Invoke(evt);
        WardenLog.Info("Realtime", $"event={evt.Type}");

        switch (evt.Type)
        {
            case "extension:approved":
                BeginExtensionApprovedTimeWarningSuppress();
                RaiseExtensionApprovedNotice(evt);
                _ = RefreshPolicyAfterExtensionApprovedAsync();
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

    private void BeginExtensionApprovedTimeWarningSuppress()
    {
        _suppressTimeWarnings = true;
        _firedTimeWarnings.Clear();
        _lastRemainingMinutes = null;
        // Do not clear durable outside-grant state here — that raced unlock and could
        // leave IsLocked/UI inconsistent. Fresh pierce happens after policy refresh.
    }

    private async Task RefreshPolicyAfterExtensionApprovedAsync()
    {
        try
        {
            await RefreshPolicyAsync(syncUsageFromServer: true).ConfigureAwait(false);

            // Parent just granted/approved while outside: pierce at current used so the
            // new bonus is fully available (in-window burn / stale baseline cannot zero it).
            if (
                _currentPolicy != null
                && _currentPolicy.BonusMinutes > 0
                && IsOutsideAllowedWindow()
            )
            {
                var used = UsedMinutesForEnforcement();
                PersistOutsideGrantBaseline(used, _currentPolicy.BonusMinutes);
                _outsideExtensionBaselineSeconds = UsedSecondsToday;
                WardenLog.Info(
                    "Engine",
                    $"Post-approve outside pierce: used={used}m bonus={_currentPolicy.BonusMinutes}m"
                );
                EvaluateAndEnforce();
            }
        }
        finally
        {
            // RefreshPolicy → EvaluateAndEnforce already baselined remaining under suppress.
            _suppressTimeWarnings = false;
        }
    }

    private void RaiseExtensionApprovedNotice(RealtimeEvent evt)
    {
        ExtensionPayload payload;
        if (evt.Payload != null)
        {
            var json = evt.Payload is JsonElement el
                ? el.GetRawText()
                : JsonSerializer.Serialize(evt.Payload);
            payload = JsonSerializer.Deserialize<ExtensionPayload>(json, JsonOptions)
                ?? new ExtensionPayload();
        }
        else
        {
            payload = new ExtensionPayload();
        }

        TryNotifyBonusGranted(payload.ExtraMinutes, "realtime");
    }

    /// <summary>
    /// Show the Extra time AttentionWindow for any grant size.
    /// Debounce only collapses realtime+poll duplicates of the same grant (same
    /// extra minutes within a few seconds) — stacked grants must each notify.
    /// </summary>
    private void TryNotifyBonusGranted(int extraMinutes, string source)
    {
        var extra = Math.Max(0, extraMinutes);
        var now = DateTime.UtcNow;
        var isDuplicate =
            extra == _lastBonusNoticeExtraMinutes
            && (now - _lastBonusNoticeUtc).TotalSeconds < 4;

        if (isDuplicate)
        {
            WardenLog.Info(
                "Engine",
                $"Bonus notice skipped (duplicate); source={source} extra={extra}"
            );
            return;
        }

        _lastBonusNoticeUtc = now;
        _lastBonusNoticeExtraMinutes = extra;
        var payload = new ExtensionPayload { ExtraMinutes = extra };
        WardenLog.Info(
            "Engine",
            $"Bonus grant notice: +{payload.ExtraMinutes}m source={source}"
        );
        ExtensionApprovedNoticeRequested?.Invoke(payload);
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

        var bonus = _currentPolicy.BonusMinutes;
        if (_lastKnownBonusMinutes >= 0 && bonus > _lastKnownBonusMinutes)
        {
            var delta = bonus - _lastKnownBonusMinutes;
            // Poll path (realtime often missed): show Extra time notice when bonus rises.
            TryNotifyBonusGranted(delta, "policy-poll");
        }
        else if (_lastKnownBonusMinutes >= 0 && bonus < _lastKnownBonusMinutes)
        {
            // Bonus cleared/reduced — allow a future grant to notify again immediately.
            _lastBonusNoticeUtc = DateTime.MinValue;
            _lastBonusNoticeExtraMinutes = int.MinValue;
        }

        _lastKnownBonusMinutes = bonus;

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
            _usedMinutesWhenEnteredAllowedWindow = null;
        }
        else if (IsOutsideAllowedWindow())
        {
            var bonus = _currentPolicy.BonusMinutes;
            var enteringOutside = _lastIsOutsideAllowedWindow != true;
            if (enteringOutside && bonus > 0)
            {
                AdjustOutsideGrantBaselineForWindowExit(bonus);
            }

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
            if (_lastIsOutsideAllowedWindow != false)
            {
                _usedMinutesWhenEnteredAllowedWindow = UsedMinutesForEnforcement();
            }
        }

        CurrentEvaluation = evaluation;
        PolicyChanged?.Invoke(evaluation);
        MaybeEmitTimeWarnings(evaluation);

        var isOutsideWindow = IsOutsideAllowedWindow();
        if (_lastIsOutsideAllowedWindow is bool wasOutside && wasOutside != isOutsideWindow)
        {
            LogOutsideWindowDiagnostics(
                isOutsideWindow ? "entered outside window" : "left outside window",
                evaluation);
        }
        _lastIsOutsideAllowedWindow = isOutsideWindow;

        var shouldLock = _currentPolicy.AdminLock || PolicyEngine.ShouldLock(evaluation);

        if (shouldLock && !_isLocked)
        {
            if (isOutsideWindow)
            {
                LogOutsideWindowDiagnostics("locking outside window", evaluation);
            }

            _isLocked = true;
            LockRequired?.Invoke();
            _ = NotifyLockedAsync(true);
        }
        else if (!shouldLock && _isLocked)
        {
            if (isOutsideWindow)
            {
                LogOutsideWindowDiagnostics("unlocking outside window", evaluation);
            }

            _isLocked = false;
            UnlockRequired?.Invoke();
            _ = NotifyLockedAsync(false);
        }
    }

    private void LogOutsideWindowDiagnostics(string transition, PolicyEvaluation evaluation)
    {
        var used = UsedMinutesForEnforcement();
        var bonus = _currentPolicy?.BonusMinutes ?? 0;
        var baseline = _persistedOutsideGrantBaselineUsedMinutes;
        var grantRemaining = GetOutsideExtensionRemainingSeconds(evaluation);
        WardenLog.Info(
            "Engine",
            $"Outside-window {transition}: used={used}m bonus={bonus}m baseline={baseline?.ToString() ?? "null"} grantRemaining={grantRemaining}s status={evaluation.Status}");
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

        // After parent grant/approve: baseline new remaining, do not emit on this cycle.
        if (_suppressTimeWarnings)
        {
            _lastRemainingMinutes = remaining;
            return;
        }

        // With active bonus: never warn about schedule ending (after-hours pierce continues).
        // Only warn near expiry of the bonus/daily remaining (10/5/1).
        if (evaluation.BonusMinutes > 0 && evaluation.LimitingFactor == "window")
        {
            _lastRemainingMinutes = remaining;
            return;
        }

        // With active bonus, only resume warnings near expiry (10/5/1) — not 60/30.
        var thresholds =
            evaluation.BonusMinutes > 0
                ? BonusActiveTimeWarningThresholds
                : TimeWarningThresholds;

        if (_lastRemainingMinutes is int previous)
        {
            if (remaining > previous)
            {
                foreach (var threshold in thresholds)
                {
                    if (remaining > threshold)
                    {
                        _firedTimeWarnings.Remove(threshold);
                    }
                }
            }

            foreach (var threshold in thresholds)
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
