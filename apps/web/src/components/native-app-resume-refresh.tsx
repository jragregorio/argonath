"use client";

import { useEffect, useRef } from "react";
import { getCapacitorPlugins, isNativeCapacitor } from "@/lib/capacitor-native";
import { useDashboardRefresh } from "@/lib/dashboard-refresh";

const RESUME_DEBOUNCE_MS = 400;

type AppPlugin = {
  addListener: (
    event: "appStateChange",
    cb: (state: { isActive: boolean }) => void
  ) => Promise<{ remove: () => Promise<void> }>;
};

/**
 * On Capacitor native resume, invalidate dashboard caches so the remote WebView
 * shows fresh data without a full reload. Uses the injected bridge (no npm
 * `@capacitor/*` imports — those break the remote-URL Next client).
 */
export function NativeAppResumeRefresh() {
  const { refreshDashboard } = useDashboardRefresh();
  const lastResumeRef = useRef(0);

  useEffect(() => {
    if (!isNativeCapacitor()) {
      return;
    }

    const app = getCapacitorPlugins()?.App as AppPlugin | undefined;
    if (!app?.addListener) {
      return;
    }

    let cancelled = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;
    let sawInactive = false;

    void (async () => {
      try {
        const result = app.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            sawInactive = true;
            return;
          }
          // Ignore the first isActive:true on cold start (WebView initial load).
          if (!sawInactive) return;
          const now = Date.now();
          if (now - lastResumeRef.current < RESUME_DEBOUNCE_MS) return;
          lastResumeRef.current = now;
          void refreshDashboard();
        });
        const handle = await Promise.resolve(result);
        if (cancelled) {
          await handle?.remove?.();
        } else {
          listenerHandle = handle;
        }
      } catch (error) {
        console.error("[warden] App resume listener failed:", error);
      }
    })();

    return () => {
      cancelled = true;
      try {
        void listenerHandle?.remove?.();
      } catch {
        // Bridge remove can throw if the plugin is partially available.
      }
    };
  }, [refreshDashboard]);

  return null;
}
