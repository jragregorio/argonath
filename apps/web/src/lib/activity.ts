import { DEFAULT_NUDGE_MESSAGE } from "@warden/shared";

const ACTION_LABELS: Record<string, string> = {
  admin_lock: "Locked down a device",
  admin_unlock: "Released a lockdown",
  pairing_code_generated: "Generated a pairing code",
  capture_requested: "Requested a capture",
  nudge_sent: "Sent a nudge",
  snapshot_deleted: "Deleted a snapshot",
  extension_approved: "Approved extra screen time",
  extension_denied: "Denied extra screen time",
  bonus_cleared: "Cleared bonus screen time",
  policy_updated: "Updated screen time policy",
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
