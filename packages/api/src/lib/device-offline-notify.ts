import { prisma } from "@warden/db";
import {
  DEFAULT_TIME_ZONE,
  DEVICE_OFFLINE_PUSH_THRESHOLD_SECONDS,
  getDeviceDisplayName,
} from "@warden/shared";
import { notifyFamilyParents } from "./fcm";

export type DeviceOfflineNotifyResult = {
  checked: number;
  notified: number;
  failed: number;
};

function formatOfflineTime(lastSeenAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(lastSeenAt);
}

/**
 * Find paired devices stale beyond the offline push threshold and notify parents once per episode.
 */
export async function notifyStaleDeviceOffline(
  now: Date = new Date()
): Promise<DeviceOfflineNotifyResult> {
  const staleBefore = new Date(
    now.getTime() - DEVICE_OFFLINE_PUSH_THRESHOLD_SECONDS * 1000
  );

  const candidates = await prisma.device.findMany({
    where: {
      lastSeenAt: { not: null, lt: staleBefore },
      deviceToken: { not: null },
    },
    select: {
      id: true,
      childId: true,
      displayName: true,
      machineName: true,
      lastSeenAt: true,
      offlineNotifiedAt: true,
      child: {
        select: {
          displayName: true,
          familyId: true,
          family: { select: { timezone: true } },
        },
      },
    },
  });

  const toNotify = candidates.filter(
    (device) =>
      device.lastSeenAt &&
      (!device.offlineNotifiedAt ||
        device.offlineNotifiedAt <= device.lastSeenAt)
  );

  let notified = 0;
  let failed = 0;

  for (const device of toNotify) {
    const lastSeenAt = device.lastSeenAt!;
    const timeZone = device.child.family.timezone || DEFAULT_TIME_ZONE;
    const deviceLabel = getDeviceDisplayName(device);
    const timeLabel = formatOfflineTime(lastSeenAt, timeZone);

    try {
      const result = await notifyFamilyParents(device.child.familyId, {
        title: "Device offline",
        body: `${device.child.displayName}'s ${deviceLabel} went offline at ${timeLabel}`,
        data: {
          type: "device:offline",
          deviceId: device.id,
          childId: device.childId,
          path: `/dashboard/children/${device.childId}`,
        },
      });

      if (result.sent > 0 || (result.sent === 0 && result.failed === 0)) {
        await prisma.device.update({
          where: { id: device.id },
          data: { offlineNotifiedAt: now },
        });
        notified += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("[device-offline] notify failed", device.id, error);
    }
  }

  return { checked: candidates.length, notified, failed };
}
