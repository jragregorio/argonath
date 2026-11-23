"use client";

import { useEffect, useRef } from "react";
import {
  CHILD_MESSAGE_PUSH_TYPE,
  childMessagePushTag,
  NUDGE_REPLY_PUSH_TYPE,
  nudgeReplyPushTag,
} from "@warden/shared";
import {
  CHILD_MESSAGE_PUSH_EVENT,
  NUDGE_REPLY_PUSH_EVENT,
  type ChildMessagePushDetail,
  type NudgeReplyPushDetail,
} from "@/components/nudge-reply-toaster";
import { trpc } from "@/lib/trpc";
import {
  extractPathFromPushPayload,
  isSafeDashboardPath,
  storePendingPushPath,
} from "@/lib/push-deeplink";

const FCM_TOKEN_KEY = "warden_fcm_token";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: {
      checkPermissions: () => Promise<{ receive: string }>;
      requestPermissions: () => Promise<{ receive: string }>;
      register: () => Promise<void>;
      createChannel: (channel: {
        id: string;
        name: string;
        description: string;
        importance: number;
        visibility: number;
        vibration: boolean;
        sound?: string;
      }) => Promise<void>;
      addListener: (
        event: string,
        cb: (payload: unknown) => void
      ) => Promise<{ remove: () => Promise<void> }>;
      removeAllListeners: () => Promise<void>;
      removeDeliveredNotifications?: (options: {
        notifications: { id: number | string; tag?: string }[];
      }) => Promise<void>;
    };
  };
};

const DEFAULT_CHANNEL_ID = "warden_alerts";

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(FCM_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string) {
  try {
    localStorage.setItem(FCM_TOKEN_KEY, token);
  } catch {
    // ignore quota / private mode
  }
}

function tokenFromRegistrationPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { value?: unknown }).value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Registers FCM via the Capacitor bridge injected into the remote WebView.
 * Persists the token in localStorage for upload after sign-in.
 * No-ops in the normal browser (Vercel desktop).
 */
export function NativePushBootstrap() {
  useEffect(() => {
    const capacitor = (window as Window & { Capacitor?: CapacitorBridge })
      .Capacitor;
    if (!capacitor?.isNativePlatform?.()) {
      return;
    }

    const push = capacitor.Plugins?.PushNotifications;
    if (!push) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await push.removeAllListeners();
        await push.addListener("registration", (payload) => {
          const token = tokenFromRegistrationPayload(payload);
          if (token) {
            storeToken(token);
            console.info("[warden] FCM token registered");
          }
        });
        await push.addListener("registrationError", (error) => {
          console.error("[warden] Push registration error:", error);
        });
        // While the dashboard is on screen, Android still posts a system
        // notification. For nudge replies and child messages, cancel it and
        // show the in-app toast instead.
        //
        // This listener can also fire while the app is in the background (the
        // WebView stays alive), so only act when the page is actually visible.
        // Otherwise the parent never sees the notification (2026-11-24 bug).
        await push.addListener("pushNotificationReceived", (payload) => {
          if (document.visibilityState !== "visible") return;
          const { data, body, title } = (payload ?? {}) as {
            data?: Record<string, unknown>;
            body?: unknown;
            title?: unknown;
          };
          if (data?.type === CHILD_MESSAGE_PUSH_TYPE) {
            const messageId =
              typeof data.messageId === "string" ? data.messageId : "";
            if (!messageId) return;
            void push
              .removeDeliveredNotifications?.({
                notifications: [{ id: 0, tag: childMessagePushTag(messageId) }],
              })
              .catch((error) => {
                console.warn("[warden] Could not clear child message notification:", error);
              });
            if (typeof body === "string" && body.length > 0) {
              window.dispatchEvent(
                new CustomEvent<ChildMessagePushDetail>(CHILD_MESSAGE_PUSH_EVENT, {
                  detail: {
                    messageId,
                    title: typeof title === "string" ? title : "",
                    message: body,
                  },
                })
              );
            }
            return;
          }
          if (data?.type !== NUDGE_REPLY_PUSH_TYPE) return;
          const nudgeId = typeof data.nudgeId === "string" ? data.nudgeId : "";
          if (!nudgeId) return;
          // FCM posts tagged notifications with id 0.
          void push
            .removeDeliveredNotifications?.({
              notifications: [{ id: 0, tag: nudgeReplyPushTag(nudgeId) }],
            })
            .catch((error) => {
              console.warn("[warden] Could not clear nudge reply notification:", error);
            });
          if (typeof body === "string" && body.length > 0) {
            window.dispatchEvent(
              new CustomEvent<NudgeReplyPushDetail>(NUDGE_REPLY_PUSH_EVENT, {
                detail: { nudgeId, message: body },
              })
            );
          }
        });
        await push.addListener("pushNotificationActionPerformed", (payload) => {
          const path = extractPathFromPushPayload(payload);
          if (path && isSafeDashboardPath(path)) {
            storePendingPushPath(path);
          }
        });

        if (capacitor.getPlatform?.() === "android") {
          await push.createChannel({
            id: DEFAULT_CHANNEL_ID,
            name: "Warden",
            description: "Alerts for extension requests and account activity",
            importance: 5,
            visibility: 1,
            vibration: true,
            sound: "warden_notif",
          });
        }

        let perm = await push.checkPermissions();
        if (perm.receive === "prompt") {
          perm = await push.requestPermissions();
        }
        if (cancelled || perm.receive !== "granted") {
          return;
        }

        await push.register();
      } catch (error) {
        console.error("[warden] Native push bootstrap failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

/**
 * Uploads the stored FCM token to the API once the parent is signed in.
 * Mount inside the authenticated dashboard shell only.
 */
export function PushTokenSync() {
  const { mutate, isPending } = trpc.push.registerToken.useMutation();
  const uploadedRef = useRef<string | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    const capacitor = (window as Window & { Capacitor?: CapacitorBridge })
      .Capacitor;
    if (!capacitor?.isNativePlatform?.()) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const tryUpload = () => {
      if (cancelled || pendingRef.current || isPending) return;
      const token = readStoredToken();
      if (!token || uploadedRef.current === token) {
        return;
      }
      pendingRef.current = true;
      mutate(
        { token, platform: "android" },
        {
          onSuccess: () => {
            uploadedRef.current = token;
            pendingRef.current = false;
            console.info("[warden] FCM token synced to server");
          },
          onError: (error) => {
            pendingRef.current = false;
            console.error("[warden] FCM token sync failed:", error.message);
            attempts += 1;
            if (!cancelled && attempts < 5) {
              window.setTimeout(tryUpload, 2000 * attempts);
            }
          },
        }
      );
    };

    tryUpload();
    const interval = window.setInterval(tryUpload, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mutate, isPending]);

  return null;
}
