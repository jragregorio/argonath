"use client";

import { useEffect, useRef } from "react";
import { useDashboardRefresh } from "@/lib/dashboard-refresh";

const RESUME_DEBOUNCE_MS = 400;
/** Ignore online/visibility noise during Capacitor / WebView cold start. */
const MOUNT_GRACE_MS = 2000;

/**
 * When the browser tab regains visibility or the network comes back online,
 * invalidate dashboard caches so badges and live data refresh without a reload.
 * Uses soft refresh (no router.refresh) to avoid Capacitor hydration crashes.
 */
export function DashboardVisibilityRefresh() {
  const { refreshDashboard } = useDashboardRefresh();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHiddenRef = useRef(false);
  const mountedAtRef = useRef(0);

  useEffect(() => {
    mountedAtRef.current = Date.now();

    function scheduleRefresh() {
      if (Date.now() - mountedAtRef.current < MOUNT_GRACE_MS) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void refreshDashboard({ soft: true });
      }, RESUME_DEBOUNCE_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        return;
      }
      // Capacitor WebView can fire visible on first paint; skip until we've been hidden.
      if (!wasHiddenRef.current) return;
      scheduleRefresh();
    }

    function onOnline() {
      // Only after a real background period — avoid cold-start `online` events.
      if (!wasHiddenRef.current) return;
      scheduleRefresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [refreshDashboard]);

  return null;
}
