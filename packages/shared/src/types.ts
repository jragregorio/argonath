export type AllowedWindow = {
  day: number; // 1=Monday, 7=Sunday
  start: string; // "HH:mm"
  end: string; // "HH:mm"
};

export type PolicyStatus = "allowed" | "blocked" | "outside_window";

/** Which constraint binds session remaining right now. On a tie, prefer daily_limit. */
export type LimitingFactor = "daily_limit" | "window" | "none";

export type PolicyEvaluation = {
  status: PolicyStatus;
  /**
   * Session remaining: min(dailyRemaining, windowRemaining) when allowed;
   * 0 when blocked or outside_window; 999 when policy is inactive.
   */
  remainingMinutes: number;
  /** max(0, dailyLimit + bonus - used). Populated in every branch. */
  dailyRemainingMinutes: number;
  /** Minutes until the current merged window run closes. Undefined when no windows or outside. */
  windowRemainingMinutes?: number;
  /** Which constraint binds remainingMinutes right now. */
  limitingFactor: LimitingFactor;
  /**
   * Whole-day capacity: min(dailyLimit + bonus, merged window capacity for today).
   * Equals dailyLimit + bonus when allowedWindows is empty.
   */
  reachableMinutesToday: number;
  usedMinutes: number;
  dailyLimitMinutes: number;
  bonusMinutes: number;
  nextWindowStart?: string;
  message?: string;
};

/** Per-weekday capacity for parent advisory (draft-friendly, no usage needed). */
export type PolicyReachDay = {
  day: number;
  /** Merged window minutes for this weekday (0 if no windows that day). */
  capacityMinutes: number;
  /** True when this day has ≥1 window and capacity is below dailyLimitMinutes. */
  constrained: boolean;
};

export type PolicyReach = {
  dailyLimitMinutes: number;
  byDay: PolicyReachDay[];
  /** Days with ≥1 window whose capacity is below the daily limit. */
  constrainedDays: number[];
  /**
   * Smallest capacity among days that have ≥1 window.
   * Null when allowedWindows is empty (any-time schedule).
   */
  minWindowedCapacityMinutes: number | null;
};

export type ScreenTimePolicyInput = {
  dailyLimitMinutes: number;
  allowedWindows: AllowedWindow[];
  isActive: boolean;
};

export type ExtensionOverrideInput = {
  extraMinutes: number;
  expiresAt: Date;
};

export type RealtimeEventType =
  | "device:online"
  | "device:offline"
  | "device:locked"
  | "device:unlocked"
  | "capture:screen"
  | "capture:webcam"
  | "extension:requested"
  | "extension:approved"
  | "extension:denied"
  | "snapshot:ready"
  | "snapshot:failed"
  | "policy:updated"
  | "nudge:show"
  | "nudge:seen";

export type RealtimeEvent<T = unknown> = {
  type: RealtimeEventType;
  deviceId: string;
  payload?: T;
  timestamp: string;
};

export type NudgeCommandPayload = {
  nudgeId: string;
  message: string;
  /** Auto-dismiss after this many seconds (phase 1 gentle). */
  autoDismissSeconds: number;
};

export type CaptureCommandPayload = {
  snapshotId: string;
  uploadUrl: string;
  storageKey: string;
};

export type AgentHeartbeat = {
  deviceId: string;
  activeMinutesToday: number;
  idleMinutesToday: number;
  isLocked: boolean;
  agentVersion: string;
  machineName: string;
};

export type AgentPolicySync = {
  policy: ScreenTimePolicyInput;
  usedMinutesToday: number;
  bonusMinutes: number;
  pendingExtensionApproved?: number;
};

/** Parent nickname if set, otherwise agent-reported machine name. */
export function getDeviceDisplayName(device: {
  displayName?: string | null;
  machineName?: string | null;
}): string {
  return device.displayName?.trim() || device.machineName?.trim() || "Unnamed device";
}

export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_CODE_EXPIRY_MINUTES = 15;
export const CAPTURE_RATE_LIMIT_PER_HOUR = 10;
export const SNAPSHOT_RETENTION_DAYS = 7;
/** How often the Windows agent posts heartbeats (Tray/Agent tick). */
export const HEARTBEAT_INTERVAL_SECONDS = 5;
/** Online if a heartbeat arrived within this many missed intervals. */
export const DEVICE_ONLINE_THRESHOLD_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3;
export const IDLE_THRESHOLD_SECONDS = 300;

/** Product / dashboard version (keep in sync with Warden.Tray `<Version>`). */
export const APP_VERSION = "0.6.2";

/** Default text shown on the child PC when a parent sends a nudge without a custom message. */
export const DEFAULT_NUDGE_MESSAGE = "Your parent wants your attention";

export function isDeviceRecentlySeen(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastSeenAt) return false;
  const seenAt = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  if (Number.isNaN(seenAt.getTime())) return false;
  return now.getTime() - seenAt.getTime() <= DEVICE_ONLINE_THRESHOLD_SECONDS * 1000;
}

export const EXTENSION_PRESETS = [15, 30, 60] as const;

export function getDeviceChannelName(deviceId: string): string {
  return `device:${deviceId}`;
}
