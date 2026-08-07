namespace Warden.Core.Models;

public class AgentConfig
{
    public string ApiBaseUrl { get; set; } = "";
    public string? SupabaseUrl { get; set; }
    public string? SupabaseAnonKey { get; set; }
    public string? DeviceToken { get; set; }
    public string? DeviceId { get; set; }
    public string? ChildName { get; set; }
    public string? ParentPin { get; set; }
}

public class PairingRequest
{
    public string Code { get; set; } = "";
    public string MachineName { get; set; } = "";
    /// <summary>Set by the API client from assembly version (AgentVersionInfo.Current).</summary>
    public string AgentVersion { get; set; } = "";
}

public class PairingResponse
{
    public string DeviceToken { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string ChildName { get; set; } = "";
    public string? ApiBaseUrl { get; set; }
    public string? SupabaseUrl { get; set; }
    public string? SupabaseAnonKey { get; set; }
}

public class HeartbeatRequest
{
    public string Action { get; set; } = "heartbeat";
    public int ActiveMinutesToday { get; set; }
    public int IdleMinutesToday { get; set; }
    public bool IsLocked { get; set; }
    /// <summary>Set by the API client from assembly version (AgentVersionInfo.Current).</summary>
    public string AgentVersion { get; set; } = "";
    public string MachineName { get; set; } = "";
    /// <summary>
    /// True once per boot when the previous process left the session marker
    /// (End Task, crash, power loss). Cleared client-side after a successful send.
    /// </summary>
    public bool PreviousSessionUnclean { get; set; }
}

public class AllowedWindow
{
    public int Day { get; set; }
    public string Start { get; set; } = "";
    public string End { get; set; } = "";
}

public class PolicyData
{
    public PolicyInfo Policy { get; set; } = new();
    /// <summary>Total active minutes across all of this child's devices today.</summary>
    public int UsedMinutesToday { get; set; }
    /// <summary>Active minutes for this device only today.</summary>
    public int ThisDeviceMinutes { get; set; }
    public int BonusMinutes { get; set; }
    /// <summary>
    /// Server usage baseline for after-hours extension countdown (minutes).
    /// Null when not yet pierced / not applicable.
    /// </summary>
    public int? OutsideGrantBaselineUsedMinutes { get; set; }
    public string? ParentPin { get; set; }
    /// <summary>Parent-triggered lockdown from the dashboard.</summary>
    public bool AdminLock { get; set; }
    /// <summary>IANA family timezone for allowed-hours evaluation (e.g. Asia/Manila).</summary>
    public string? Timezone { get; set; }
}

public class PolicyInfo
{
    public int DailyLimitMinutes { get; set; } = 120;
    public List<AllowedWindow> AllowedWindows { get; set; } = new();
    public bool IsActive { get; set; } = true;
}

public class PolicyEvaluation
{
    public string Status { get; set; } = "allowed";
    /// <summary>Session remaining: min(daily, window) when allowed; 0 blocked/outside; 999 inactive.</summary>
    public int RemainingMinutes { get; set; }
    public int DailyRemainingMinutes { get; set; }
    public int? WindowRemainingMinutes { get; set; }
    /// <summary>"daily_limit" | "window" | "none"</summary>
    public string LimitingFactor { get; set; } = "daily_limit";
    public int ReachableMinutesToday { get; set; }
    public int UsedMinutes { get; set; }
    public int DailyLimitMinutes { get; set; }
    public int BonusMinutes { get; set; }
    public string? NextWindowStart { get; set; }
    public string? Message { get; set; }
}

public class RealtimeEvent
{
    public string Type { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public object? Payload { get; set; }
    public string Timestamp { get; set; } = "";
}

public class CapturePayload
{
    public string SnapshotId { get; set; } = "";
    public string UploadUrl { get; set; } = "";
    public string? Token { get; set; }
    public string StorageKey { get; set; } = "";
}

public class PendingCapture
{
    public string SnapshotId { get; set; } = "";
    public string Type { get; set; } = "";
    public string UploadUrl { get; set; } = "";
    public string? Token { get; set; }
    public string StorageKey { get; set; } = "";
}

public class NudgePayload
{
    public string NudgeId { get; set; } = "";
    public string Message { get; set; } = "";
    public int AutoDismissSeconds { get; set; } = 45;
}

public class PendingNudge
{
    public string NudgeId { get; set; } = "";
    public string Message { get; set; } = "";
    public int AutoDismissSeconds { get; set; } = 45;
}

public class TimeWarningPayload
{
    public int ThresholdMinutes { get; set; }
    public string Message { get; set; } = "";
}

public class ExtensionPayload
{
    public int ExtraMinutes { get; set; }
}
