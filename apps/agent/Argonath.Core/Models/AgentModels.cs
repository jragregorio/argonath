namespace Argonath.Core.Models;

public class AgentConfig
{
    public string ApiBaseUrl { get; set; } = "http://localhost:3000";
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
    public string AgentVersion { get; set; } = "1.0.0";
}

public class PairingResponse
{
    public string DeviceToken { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string ChildName { get; set; } = "";
}

public class HeartbeatRequest
{
    public string Action { get; set; } = "heartbeat";
    public int ActiveMinutesToday { get; set; }
    public int IdleMinutesToday { get; set; }
    public bool IsLocked { get; set; }
    public string AgentVersion { get; set; } = "1.0.0";
    public string MachineName { get; set; } = "";
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
    public string? ParentPin { get; set; }
    /// <summary>Parent-triggered lockdown from the dashboard.</summary>
    public bool AdminLock { get; set; }
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
    public int RemainingMinutes { get; set; }
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
    public string StorageKey { get; set; } = "";
}

public class ExtensionPayload
{
    public int ExtraMinutes { get; set; }
}
