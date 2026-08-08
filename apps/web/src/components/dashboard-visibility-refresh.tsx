"use client";

import { useEffect, useRef } from "react";
import { useDashboardRefresh } from "@/lib/dashboard-refresh";

const RESUME_DEBOUNCE_MS = 400;

/**
 * When the browser tab regains visibility or the network comes back online,
 * invalidate dashboard caches so badges and live data refresh without a reload.
 */
export function DashboardVisibilityRefresh() {
  const { refreshDashboard } = useDashboardRefresh();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleRefresh() {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void refreshDashboard();
      }, RESUME_DEBOUNCE_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      scheduleRefresh();
    }

    function onOnline() {
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
