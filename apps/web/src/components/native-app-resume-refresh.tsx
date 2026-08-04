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

    let removed = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;

    void app
      .addListener("appStateChange", ({ isActive }) => {
        if (!isActive) return;
        const now = Date.now();
        if (now - lastResumeRef.current < RESUME_DEBOUNCE_MS) return;
        lastResumeRef.current = now;
        void refreshDashboard();
      })
      .then((handle) => {
        if (removed) {
          void handle.remove();
        } else {
          listenerHandle = handle;
        }
      });

    return () => {
      removed = true;
      void listenerHandle?.remove();
    };
  }, [refreshDashboard]);

  return null;
}
