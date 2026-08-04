"use client";

import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useDashboardRefresh } from "@/lib/dashboard-refresh";

const RESUME_DEBOUNCE_MS = 400;

/**
 * On Capacitor native resume, invalidate dashboard caches so the remote WebView
 * shows fresh data without a full reload. No-ops in the normal browser.
 */
export function NativeAppResumeRefresh() {
  const { refreshDashboard } = useDashboardRefresh();
  const lastResumeRef = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let removed = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;

    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      const now = Date.now();
      if (now - lastResumeRef.current < RESUME_DEBOUNCE_MS) return;
      lastResumeRef.current = now;
      void refreshDashboard();
    }).then((handle) => {
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
