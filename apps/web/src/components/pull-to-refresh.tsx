"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@warden/ui";
import { isNativeCapacitor } from "@/lib/capacitor-native";
import { useDashboardRefresh } from "@/lib/dashboard-refresh";

const PULL_THRESHOLD = 72;
const MAX_PULL = 100;
const SETTLED_PULL = 56;
const TOP_EPSILON = 2;
const DONE_MS = 900;

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

type PtrPhase = "idle" | "pulling" | "refreshing" | "done";

/**
 * Mobile-native pull-to-refresh for dashboard content. Only arms at scroll top
 * when vertical pull dominates; ignores swipe-to-lock targets.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refreshDashboard } = useDashboardRefresh();
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<PtrPhase>("idle");
  const [dragging, setDragging] = useState(false);
  const touchRef = useRef<TouchState>({
    tracking: false,
    armed: false,
    startY: 0,
    startX: 0,
  });
  const pullRef = useRef(0);
  const phaseRef = useRef<PtrPhase>("idle");
  const doneTimerRef = useRef<number | null>(null);

  const setPullSafe = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  const setPhaseSafe = useCallback((next: PtrPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    return () => {
      if (doneTimerRef.current !== null) {
        window.clearTimeout(doneTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isNativeCapacitor() || !isMobileViewport()) {
      return;
    }

    const busy = () =>
      phaseRef.current === "refreshing" || phaseRef.current === "done";

    const onTouchStart = (event: TouchEvent) => {
      if (!isAtScrollTop() || busy()) return;
      const touch = event.touches[0];
      if (!touch) return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-swipe-lock], [data-ptr-ignore]")
      ) {
        return;
      }

      setDragging(true);
      touchRef.current = {
        tracking: true,
        armed: false,
        startY: touch.clientY,
        startX: touch.clientX,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const state = touchRef.current;
      if (!state.tracking || busy()) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dy = touch.clientY - state.startY;
      const dx = touch.clientX - state.startX;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
        state.tracking = false;
        state.armed = false;
        setDragging(false);
        setPhaseSafe("idle");
        setPullSafe(0);
        return;
      }

      if (dy <= 0 || !isAtScrollTop()) {
        state.armed = false;
        setPhaseSafe("idle");
        setPullSafe(0);
        return;
      }

      if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.25) {
        state.armed = true;
      }

      if (state.armed) {
        const next = Math.min(dy * 0.45, MAX_PULL);
        setPullSafe(next);
        setPhaseSafe("pulling");
      }
    };

    const finishGesture = () => {
      const state = touchRef.current;
      const shouldRefresh =
        state.armed && pullRef.current >= PULL_THRESHOLD && !busy();
      state.tracking = false;
      state.armed = false;
      setDragging(false);

      if (!shouldRefresh) {
        setPhaseSafe("idle");
        setPullSafe(0);
        return;
      }

      setPhaseSafe("refreshing");
      setPullSafe(SETTLED_PULL);
      void refreshDashboard()
        .catch(() => {})
        .finally(() => {
          setPhaseSafe("done");
          setPullSafe(SETTLED_PULL);
          if (doneTimerRef.current !== null) {
            window.clearTimeout(doneTimerRef.current);
          }
          doneTimerRef.current = window.setTimeout(() => {
            setPhaseSafe("idle");
            setPullSafe(0);
            doneTimerRef.current = null;
          }, DONE_MS);
        });
    };

    const onTouchEnd = () => finishGesture();
    const onTouchCancel = () => {
      touchRef.current.tracking = false;
      touchRef.current.armed = false;
      setDragging(false);
      if (!busy()) {
        setPhaseSafe("idle");
        setPullSafe(0);
      }
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
  }, [refreshDashboard, setPullSafe, setPhaseSafe]);

  const showIndicator = pull > 0 || phase === "refreshing" || phase === "done";
  const ready = pull >= PULL_THRESHOLD && phase === "pulling";

  let label = "Pull to refresh";
  if (phase === "refreshing") label = "Refreshing…";
  else if (phase === "done") label = "Updated";
  else if (ready) label = "Release to refresh";

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-40 flex justify-center md:hidden",
          "transition-[opacity,transform] ease-out",
          dragging ? "duration-0" : "duration-300",
          showIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
          transform: `translateY(${Math.min(pull, MAX_PULL)}px)`,
        }}
        aria-hidden={!showIndicator}
        aria-live="polite"
      >
        <div
          className={cn(
            "flex min-w-[10.5rem] items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm transition-colors duration-200",
            phase === "done"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border/60 bg-background/90 text-muted-foreground"
          )}
        >
          {phase === "done" ? (
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          ) : (
            <Loader2
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                phase === "refreshing"
                  ? "animate-spin text-primary"
                  : ready
                    ? "rotate-180 text-primary"
                    : "text-muted-foreground"
              )}
              aria-hidden="true"
            />
          )}
          <span className="tabular-nums">{label}</span>
        </div>
      </div>
      {children}
    </>
  );
}
