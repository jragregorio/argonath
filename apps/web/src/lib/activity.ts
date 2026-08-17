import {
  DEFAULT_NUDGE_MESSAGE,
  formatNudgeReply,
  isMeaningfulNudgeReply,
} from "@warden/shared";
import {
  Activity,
  Ban,
  Bell,
  Camera,
  Clock,
  Lock,
  Monitor,
  Settings,
  Unlock,
  Users,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  admin_lock: "Locked down a device",
  admin_unlock: "Released a lockdown",
  pairing_code_generated: "Generated a pairing code",
  capture_requested: "Requested a capture",
  nudge_sent: "Sent a nudge",
  snapshot_deleted: "Deleted a snapshot",
  extension_approved: "Approved extra screen time",
  extension_denied: "Denied extra screen time",
  bonus_granted: "Granted bonus screen time",
  bonus_cleared: "Cleared bonus screen time",
  policy_updated: "Updated screen time policy",
  app_blocked: "Blocked an app",
  app_unblocked: "Unblocked an app",
  child_created: "Added a child",
  child_renamed: "Renamed a child",
  child_deleted: "Removed a child",
  device_renamed: "Renamed a device",
  device_deleted: "Removed a device",
  device_online: "Device came online",
  device_offline: "Device went offline",
  family_renamed: "Renamed the family",
  pin_updated: "Updated the parent PIN",
  timezone_updated: "Updated family time zone",
};

const ACTION_ICONS: Record<string, LucideIcon> = {
  capture_requested: Camera,
  snapshot_deleted: Camera,
  snapshots_bulk_deleted: Camera,
  extension_approved: Clock,
  extension_denied: Clock,
  bonus_granted: Clock,
  bonus_cleared: Clock,
  policy_updated: Clock,
  app_blocked: Ban,
  app_unblocked: Ban,
  admin_lock: Lock,
  admin_unlock: Unlock,
  device_online: Wifi,
  device_offline: WifiOff,
  nudge_sent: Bell,
  child_created: Users,
  child_renamed: Users,
  child_deleted: Users,
  device_renamed: Monitor,
  device_deleted: Monitor,
  pairing_code_generated: Monitor,
  family_renamed: Settings,
  pin_updated: Settings,
  timezone_updated: Settings,
};

export function getActivityIcon(action: string): LucideIcon {
  return ACTION_ICONS[action] ?? Activity;
}

export type ActivityItemLike = {
  action: string;
  childName?: string | null;
  deviceName?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isCustomNudge(metadata?: Record<string, unknown> | null) {
  if (!metadata) return false;
  if (metadata.custom === true) return true;
  const message = metadata.message;
  return (
    typeof message === "string" &&
    message.trim().length > 0 &&
    message.trim() !== DEFAULT_NUDGE_MESSAGE
  );
}

export function getActivityLabel(action: string, metadata?: Record<string, unknown> | null) {
  if (action === "nudge_sent" && isCustomNudge(metadata)) {
    return "Sent a custom nudge";
  }
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

/** Quoted nudge body when present (custom or default). */
export function getActivityMessage(item: ActivityItemLike) {
  if (item.action !== "nudge_sent") return null;
  const message = item.metadata?.message;
  if (typeof message !== "string" || !message.trim()) return null;
  return message.trim();
}

/** Child reply on a nudge_sent row. Skip OK-only so old acks stay quiet. */
export function getActivityReply(item: ActivityItemLike) {
  if (item.action !== "nudge_sent" || !item.metadata) return null;
  const response =
    typeof item.metadata.response === "string" ? item.metadata.response : null;
  const responseText =
    typeof item.metadata.responseText === "string"
      ? item.metadata.responseText
      : null;
  if (!isMeaningfulNudgeReply(response, responseText)) return null;
  return formatNudgeReply(response, responseText);
}

export function formatActivityDetail(item: ActivityItemLike) {
  const parts: string[] = [];

  if (item.childName) parts.push(item.childName);
  if (item.deviceName) parts.push(item.deviceName);

  if (item.action === "capture_requested" || item.action === "snapshot_deleted") {
    const type = item.metadata?.type;
    if (type === "screen") parts.push("screenshot");
    if (type === "webcam") parts.push("webcam");
  }

  if (
    item.action === "extension_approved" ||
    item.action === "extension_denied" ||
    item.action === "bonus_granted" ||
    item.action === "bonus_cleared"
  ) {
    const minutes = item.metadata?.minutes;
    if (typeof minutes === "number") {
      parts.push(
        item.action === "bonus_cleared" ? `−${minutes} min` : `+${minutes} min`
      );
    }
  }

  if (item.action === "policy_updated") {
    const policy = item.metadata?.policy;
    if (policy && typeof policy === "object" && !Array.isArray(policy)) {
      const record = policy as Record<string, unknown>;
      if (typeof record.dailyLimitMinutes === "number") {
        parts.push(`${record.dailyLimitMinutes} min/day`);
      }
      if (record.isActive === false) {
        parts.push("policy off");
      } else if (record.isActive === true) {
        parts.push("policy on");
      }
    }
  }

  if (item.action === "app_blocked" || item.action === "app_unblocked") {
    const processName = item.metadata?.processName;
    if (typeof processName === "string" && processName.trim()) {
      parts.push(processName.trim());
    }
  }

  if (item.action === "timezone_updated") {
    const timeZone = item.metadata?.timeZone ?? item.metadata?.timezone;
    if (typeof timeZone === "string" && timeZone.trim()) {
      parts.push(timeZone.trim());
    }
  }

  if (item.action === "child_renamed" || item.action === "device_renamed") {
    const from =
      typeof item.metadata?.from === "string"
        ? item.metadata.from
        : typeof item.metadata?.previousName === "string"
          ? item.metadata.previousName
          : null;
    const to =
      typeof item.metadata?.to === "string"
        ? item.metadata.to
        : typeof item.metadata?.displayName === "string"
          ? item.metadata.displayName
          : null;
    if (from && to) parts.push(`${from} → ${to}`);
    else if (to) parts.push(to);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
