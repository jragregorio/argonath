"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { cn } from "@warden/ui";
import { useDashboardRefresh } from "@/lib/dashboard-refresh";

const PULL_THRESHOLD = 72;
const MAX_PULL = 100;
const TOP_EPSILON = 2;

function isAtScrollTop(): boolean {
  return (
    window.scrollY <= TOP_EPSILON &&
    document.documentElement.scrollTop <= TOP_EPSILON
  );
}

function isMobileViewport(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

type TouchState = {
  tracking: boolean;
  armed: boolean;
  startY: number;
  startX: number;
};

/**
 * Mobile-native pull-to-refresh for dashboard content. Only arms at scroll top
 * when vertical pull dominates; ignores swipe-to-lock targets.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refreshDashboard } = useDashboardRefresh();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchRef = useRef<TouchState>({
    tracking: false,
    armed: false,
    startY: 0,
    startX: 0,
  });
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const setPullSafe = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isMobileViewport()) {
      return;
    }

    const onTouchStart = (event: TouchEvent) => {
      if (!isAtScrollTop() || refreshingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-swipe-lock], [data-ptr-ignore]")
      ) {
        return;
      }

      touchRef.current = {
        tracking: true,
        armed: false,
        startY: touch.clientY,
        startX: touch.clientX,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const state = touchRef.current;
      if (!state.tracking || refreshingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dy = touch.clientY - state.startY;
      const dx = touch.clientX - state.startX;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
        state.tracking = false;
        state.armed = false;
        setPullSafe(0);
        return;
      }

      if (dy <= 0 || !isAtScrollTop()) {
        state.armed = false;
        setPullSafe(0);
        return;
      }

      if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.25) {
        state.armed = true;
      }

      if (state.armed) {
        setPullSafe(Math.min(dy * 0.45, MAX_PULL));
      }
    };

    const finishGesture = () => {
      const state = touchRef.current;
      const shouldRefresh =
        state.armed && pullRef.current >= PULL_THRESHOLD && !refreshingRef.current;
      state.tracking = false;
      state.armed = false;

      if (!shouldRefresh) {
        setPullSafe(0);
        return;
      }

      setRefreshing(true);
      setPullSafe(PULL_THRESHOLD);
      void refreshDashboard().finally(() => {
        setRefreshing(false);
        setPullSafe(0);
      });
    };

    const onTouchEnd = () => finishGesture();
    const onTouchCancel = () => {
      touchRef.current.tracking = false;
      touchRef.current.armed = false;
      setPullSafe(0);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [refreshDashboard, setPullSafe]);

  const showIndicator = pull > 0 || refreshing;

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-40 flex justify-center transition-opacity duration-200 md:hidden",
          showIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
          transform: `translateY(${Math.min(pull, MAX_PULL)}px)`,
        }}
        aria-hidden={!showIndicator}
        aria-live="polite"
      >
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
          <Loader2
            className={cn(
              "h-3.5 w-3.5",
              refreshing ? "animate-spin text-primary" : "text-muted-foreground"
            )}
          />
          {refreshing ? "Refreshing…" : pull >= PULL_THRESHOLD ? "Release to refresh" : "Pull to refresh"}
        </div>
      </div>
      {children}
    </>
  );
}
