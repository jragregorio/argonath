export type AllowedWindow = {
  day: number; // 1=Monday, 7=Sunday
  start: string; // "HH:mm"
  end: string; // "HH:mm"
};

export type PolicyStatus = "allowed" | "blocked" | "outside_window";

export type PolicyEvaluation = {
  status: PolicyStatus;
  remainingMinutes: number;
  usedMinutes: number;
  dailyLimitMinutes: number;
  bonusMinutes: number;
  nextWindowStart?: string;
  message?: string;
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
  | "extension:approved"
  | "extension:denied"
  | "snapshot:ready"
  | "policy:updated";

export type RealtimeEvent<T = unknown> = {
  type: RealtimeEventType;
  deviceId: string;
  payload?: T;
  timestamp: string;
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
export const HEARTBEAT_INTERVAL_SECONDS = 60;
export const IDLE_THRESHOLD_SECONDS = 300;

export const EXTENSION_PRESETS = [15, 30, 60] as const;

export function getDeviceChannelName(deviceId: string): string {
  return `device:${deviceId}`;
}
