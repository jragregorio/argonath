"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  consumePendingPushPath,
  extractPathFromPushPayload,
  isSafeDashboardPath,
} from "@/lib/push-deeplink";

type CapacitorPushPlugin = {
  addListener: (
    event: string,
    cb: (payload: unknown) => void
  ) => Promise<{ remove: () => Promise<void> }>;
};

function navigateIfSafe(
  router: ReturnType<typeof useRouter>,
  path: string | null
) {
  if (path && isSafeDashboardPath(path)) {
    router.push(path);
  }
}

/**
 * Handles FCM notification taps inside the authenticated dashboard.
 * Consumes paths queued during cold-start bootstrap in NativePushBootstrap.
 */
export function NativePushDeepLink() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    navigateIfSafe(routerRef.current, consumePendingPushPath());

    const capacitor = (
      window as Window & {
        Capacitor?: { Plugins?: { PushNotifications?: CapacitorPushPlugin } };
      }
    ).Capacitor;
    const push = capacitor?.Plugins?.PushNotifications;
    if (!push) {
      return;
    }

    let cancelled = false;
    let handle: { remove: () => Promise<void> } | undefined;

    void push
      .addListener("pushNotificationActionPerformed", (payload) => {
        const path = extractPathFromPushPayload(payload);
        navigateIfSafe(routerRef.current, path);
      })
      .then((listener) => {
        if (cancelled) {
          void listener.remove();
        } else {
          handle = listener;
        }
      });

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, []);

  return null;
}
