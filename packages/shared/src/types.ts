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
  /**
   * Today's merged allowed-window capacity in minutes.
   * 0 when no windows are configured or none apply today.
   */
  windowCapacityMinutes?: number;
  /**
   * True inside an allowed window, or when no windows are configured
   * (any-time within daily limit). False when outside scheduled hours.
   */
  inWindow?: boolean;
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
  blockedProcessNames?: string[];
};

export type ExtensionOverrideInput = {
  extraMinutes: number;
  expiresAt: Date;
  /** When the parent approved the grant. Used for pre-window wall-clock bridge. */
  createdAt?: Date;
  /**
   * Usage minutes when this after-hours grant started (first outside-window pierce).
   * When omitted/null, evaluatePolicy treats baseline as current used (instant grant).
   */
  outsideGrantBaselineUsedMinutes?: number | null;
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
  | "nudge:seen"
  | "message:received";

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

export type RunningApp = {
  processName: string; // e.g. "chrome"
  title: string; // window title
  isForeground: boolean;
};

export type AgentHeartbeat = {
  deviceId: string;
  activeMinutesToday: number;
  idleMinutesToday: number;
  isLocked: boolean;
  agentVersion: string;
  machineName: string;
  runningApps?: RunningApp[];
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
/** Push notification when lastSeenAt is older than this (avoids brief blips). */
export const DEVICE_OFFLINE_PUSH_THRESHOLD_SECONDS = 120;
export const IDLE_THRESHOLD_SECONDS = 300;

/** Product / dashboard version (keep in sync with Warden.Tray `<Version>`). */
export const APP_VERSION = "0.8.28";

/** Default text shown on the child PC when a parent sends a nudge without a custom message. */
export const DEFAULT_NUDGE_MESSAGE = "Your parent wants your attention";

export const NUDGE_RESPONSE_LABELS = {
  ok: "OK",
  on_my_way: "On my way",
  need_a_few: "Need a few minutes",
} as const;

export type NudgeResponseKey = keyof typeof NUDGE_RESPONSE_LABELS;

/** Typed text wins. Returns null if nothing to show. */
export function formatNudgeReply(
  response?: string | null,
  responseText?: string | null
): string | null {
  const typed = responseText?.trim();
  if (typed) return typed;

  if (!response) return null;
  const key = response as NudgeResponseKey;
  return NUDGE_RESPONSE_LABELS[key] ?? null;
}

export function isMeaningfulNudgeReply(
  response?: string | null,
  responseText?: string | null
): boolean {
  if (responseText?.trim()) return true;
  return response === "on_my_way" || response === "need_a_few";
}

/** FCM `data.type` for a child's meaningful nudge reply (sent to the nudging parent only). */
export const NUDGE_REPLY_PUSH_TYPE = "nudge:replied";

/**
 * Android notification tag for a nudge-reply push. The dashboard uses it to
 * cancel the system notification when the app is open (it shows a toast instead).
 */
export function nudgeReplyPushTag(nudgeId: string): string {
  return `nudge-reply:${nudgeId}`;
}

/** Toast / push body: `{child} replied: "typed"` or `{child} replied: On my way`. */
export function formatNudgeReplyMessage(
  childName: string,
  response?: string | null,
  responseText?: string | null
): string {
  const formatted = formatNudgeReply(response, responseText) ?? "OK";
  const body = responseText?.trim() ? `"${formatted}"` : formatted;
  return `${childName} replied: ${body}`;
}

// ─── Child → parent messages (Windows tray) ─────────────────────────────────

/** Quick buttons on the tray Message panel. Key is stored, label is the text. */
export const CHILD_MESSAGE_QUICK_LABELS = {
  come_here: "Can you come here?",
  done: "I'm done",
  need_help: "Need help",
} as const;

export type ChildMessageQuickKey = keyof typeof CHILD_MESSAGE_QUICK_LABELS;

export const CHILD_MESSAGE_QUICK_KEYS = Object.keys(
  CHILD_MESSAGE_QUICK_LABELS
) as [ChildMessageQuickKey, ...ChildMessageQuickKey[]];

export const CHILD_MESSAGE_MAX_LENGTH = 200;

/** Server-enforced per device: at most one message per this many seconds… */
export const CHILD_MESSAGE_MIN_INTERVAL_SECONDS = 30;
/** …and at most this many per rolling hour. */
export const CHILD_MESSAGE_MAX_PER_HOUR = 20;

/** FCM `data.type` for a child message (sent to every parent with the pref on). */
export const CHILD_MESSAGE_PUSH_TYPE = "message:received";

export function childMessagePushTag(messageId: string): string {
  return `child-message:${messageId}`;
}

/** Typed text wins; otherwise the quick label. Null when neither is usable. */
export function resolveChildMessageText(
  quick?: string | null,
  text?: string | null
): string | null {
  const typed = text?.trim();
  if (typed) return typed.slice(0, CHILD_MESSAGE_MAX_LENGTH);
  if (!quick) return null;
  return CHILD_MESSAGE_QUICK_LABELS[quick as ChildMessageQuickKey] ?? null;
}

export type ChildMessageRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/**
 * Pure rate-limit check. `recentSentAt` = this device's messages in the last
 * hour (any order). Returns how long to wait when blocked.
 */
export function checkChildMessageRateLimit(
  recentSentAt: readonly Date[],
  now: Date = new Date()
): ChildMessageRateLimitResult {
  const nowMs = now.getTime();
  const hourAgo = nowMs - 60 * 60 * 1000;
  const inHour = recentSentAt
    .map((d) => d.getTime())
    .filter((t) => t > hourAgo && t <= nowMs)
    .sort((a, b) => a - b);

  const latest = inHour[inHour.length - 1];
  const minGapMs = CHILD_MESSAGE_MIN_INTERVAL_SECONDS * 1000;
  if (latest !== undefined && nowMs - latest < minGapMs) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((minGapMs - (nowMs - latest)) / 1000),
    };
  }

  if (inHour.length >= CHILD_MESSAGE_MAX_PER_HOUR) {
    const oldestCounted = inHour[inHour.length - CHILD_MESSAGE_MAX_PER_HOUR];
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldestCounted + 60 * 60 * 1000 - nowMs) / 1000)
      ),
    };
  }

  return { ok: true };
}

export function isDeviceRecentlySeen(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastSeenAt) return false;
  const seenAt = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  if (Number.isNaN(seenAt.getTime())) return false;
  return now.getTime() - seenAt.getTime() <= DEVICE_ONLINE_THRESHOLD_SECONDS * 1000;
}

export function isDeviceOfflineForPush(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastSeenAt) return false;
  const seenAt = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  if (Number.isNaN(seenAt.getTime())) return false;
  return now.getTime() - seenAt.getTime() > DEVICE_OFFLINE_PUSH_THRESHOLD_SECONDS * 1000;
}

export const EXTENSION_PRESETS = [15, 30, 60] as const;

export function getDeviceChannelName(deviceId: string): string {
  return `device:${deviceId}`;
}
