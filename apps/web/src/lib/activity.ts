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
  family_renamed: "Renamed the family",
  pin_updated: "Updated the parent PIN",
};

export function getActivityLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export function formatActivityDetail(item: {
  action: string;
  childName?: string | null;
  deviceName?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
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

  return parts.length > 0 ? parts.join(" · ") : null;
}
