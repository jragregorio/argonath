import { prisma } from "@warden/db";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export type PushNotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /**
   * Android notification tag. A later push with the same tag replaces the
   * earlier one, and the dashboard can cancel a tagged notification by tag.
   */
  androidTag?: string;
};

export type NotificationCategory =
  | "extension"
  | "device_online"
  | "device_offline"
  | "nudge_reply";

const CATEGORY_PREF_FIELD: Record<
  NotificationCategory,
  | "notifyExtensionRequests"
  | "notifyDeviceOnline"
  | "notifyDeviceOffline"
  | "notifyNudgeReplies"
> = {
  extension: "notifyExtensionRequests",
  device_online: "notifyDeviceOnline",
  device_offline: "notifyDeviceOffline",
  nudge_reply: "notifyNudgeReplies",
};

function readServiceAccount(): ServiceAccount | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      return JSON.parse(json) as ServiceAccount;
    } catch {
      console.error("[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim()?.replace(
    /\\n/g,
    "\n"
  );

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  return null;
}

export function isFcmConfigured(): boolean {
  return readServiceAccount() !== null;
}

function ensureApp() {
  const account = readServiceAccount();
  if (!account) return null;

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(account),
    });
  }

  return getMessaging();
}

/**
 * Send an FCM notification to every registered parent device for a family.
 * No-ops (and logs) when Firebase Admin env is not configured.
 */
export async function notifyFamilyParents(
  familyId: string,
  category: NotificationCategory,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  return sendToMatchingTokens({ familyId }, category, payload);
}

/**
 * Send an FCM notification to one parent's registered devices in a family
 * (e.g. the parent who sent a nudge). Respects that parent's category pref.
 */
export async function notifyParentUser(
  userId: string,
  familyId: string,
  category: NotificationCategory,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  return sendToMatchingTokens({ familyId, userId }, category, payload);
}

async function sendToMatchingTokens(
  scope: { familyId: string; userId?: string },
  category: NotificationCategory,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const messaging = ensureApp();
  if (!messaging) {
    console.warn(
      "[fcm] skipped — set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY"
    );
    return { sent: 0, failed: 0 };
  }

  const prefField = CATEGORY_PREF_FIELD[category];

  const rows = await prisma.pushToken.findMany({
    where: {
      familyId: scope.familyId,
      ...(scope.userId ? { userId: scope.userId } : {}),
      user: { [prefField]: true },
    },
    select: { id: true, token: true },
  });

  if (rows.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const data: Record<string, string> = {};
  if (payload.data) {
    for (const [key, value] of Object.entries(payload.data)) {
      data[key] = String(value);
    }
  }

  let sent = 0;
  let failed = 0;
  const staleTokenIds: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        await messaging.send({
          token: row.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data,
          android: {
            priority: "high",
            notification: {
              channelId: "warden_alerts",
              priority: "high",
              ...(payload.androidTag ? { tag: payload.androidTag } : {}),
            },
          },
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token") ||
          code.includes("invalid-argument")
        ) {
          staleTokenIds.push(row.id);
        }
        console.error("[fcm] send failed", code || error);
      }
    })
  );

  if (staleTokenIds.length > 0) {
    await prisma.pushToken.deleteMany({
      where: { id: { in: staleTokenIds } },
    });
  }

  return { sent, failed };
}
