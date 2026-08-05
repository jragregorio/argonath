"use client";

import { useEffect, useRef, useState } from "react";
import {
  DashboardPanel,
  LockPanel,
  type DashboardExtensionPhase,
  type DashboardPanelProps,
  type LockPanelPhase,
} from "@/components/marketing/product-panels";

type ShowcasePhase =
  | "locked-idle"
  | "request-focus"
  | "request-sent"
  | "parent-notify"
  | "parent-focus"
  | "approved"
  | "resolve"
  | "hold"
  | "reset";

type ShowcaseFrame = {
  lockPhase: LockPanelPhase;
  alexMinutesLeft: number;
  alexBarPercent: number;
  extensionPhase: DashboardExtensionPhase;
  barTransitionMs?: number;
};

const LOCKED_DASHBOARD = {
  alexMinutesLeft: 0,
  alexBarPercent: 0,
  extensionPhase: "empty" as const,
};

const STEPS: { phase: ShowcasePhase; ms: number; frame: ShowcaseFrame }[] = [
  {
    phase: "locked-idle",
    ms: 2000,
    frame: { lockPhase: "idle", ...LOCKED_DASHBOARD },
  },
  {
    phase: "request-focus",
    ms: 800,
    frame: { lockPhase: "request-focus", ...LOCKED_DASHBOARD },
  },
  {
    phase: "request-sent",
    ms: 1000,
    frame: { lockPhase: "sent", ...LOCKED_DASHBOARD },
  },
  {
    phase: "parent-notify",
    ms: 700,
    frame: {
      lockPhase: "waiting",
      alexMinutesLeft: 0,
      alexBarPercent: 0,
      extensionPhase: "pending",
    },
  },
  {
    phase: "parent-focus",
    ms: 800,
    frame: {
      lockPhase: "waiting",
      alexMinutesLeft: 0,
      alexBarPercent: 0,
      extensionPhase: "focus",
    },
  },
  {
    phase: "approved",
    ms: 1200,
    frame: {
      lockPhase: "approved",
      alexMinutesLeft: 15,
      alexBarPercent: 12,
      extensionPhase: "approved",
      barTransitionMs: 600,
    },
  },
  {
    phase: "resolve",
    ms: 1500,
    frame: {
      lockPhase: "resuming",
      alexMinutesLeft: 15,
      alexBarPercent: 12,
      extensionPhase: "empty",
      barTransitionMs: 400,
    },
  },
  {
    phase: "hold",
    ms: 2000,
    frame: {
      lockPhase: "resuming",
      alexMinutesLeft: 15,
      alexBarPercent: 12,
      extensionPhase: "empty",
      barTransitionMs: 400,
    },
  },
  {
    phase: "reset",
    ms: 1000,
    frame: {
      lockPhase: "idle",
      ...LOCKED_DASHBOARD,
      barTransitionMs: 1000,
    },
  },
];

/** Full loop duration (~11s). */
export const SHOWCASE_PREVIEW_LOOP_MS = STEPS.reduce(
  (sum, step) => sum + step.ms,
  0
);

const STATIC_FRAME: ShowcaseFrame = {
  lockPhase: "idle",
  alexMinutesLeft: 0,
  alexBarPercent: 0,
  extensionPhase: "pending",
};

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function useShowcaseInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible =
          entry.isIntersecting && entry.intersectionRatio >= 0.5;
        setInView(visible);
        if (visible) {
          setHasStarted(true);
        }
      },
      { threshold: [0, 0.5, 1] }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return { inView, hasStarted };
}

export function AnimatedShowcasePanels() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { inView, hasStarted } = useShowcaseInView(containerRef);
  const [stepIndex, setStepIndex] = useState(0);

  const shouldAnimate = !reducedMotion && hasStarted && inView;

  useEffect(() => {
    if (!shouldAnimate) return;

    const step = STEPS[stepIndex];
    const timer = window.setTimeout(() => {
      setStepIndex((index) => (index + 1) % STEPS.length);
    }, step.ms);

    return () => window.clearTimeout(timer);
  }, [stepIndex, shouldAnimate]);

  const frame = reducedMotion ? STATIC_FRAME : STEPS[stepIndex].frame;
  const animate = !reducedMotion;

  const dashboardProps: DashboardPanelProps = {
    alexMinutesLeft: frame.alexMinutesLeft,
    alexBarPercent: frame.alexBarPercent,
    extensionPhase: frame.extensionPhase,
    barTransitionMs: frame.barTransitionMs,
    animate,
  };

  return (
    <div
      ref={containerRef}
      className="mt-12 grid items-start gap-8 lg:grid-cols-2"
    >
      <div className="order-2 lg:order-1">
        <DashboardPanel {...dashboardProps} />
      </div>
      <div className="order-1 lg:order-2">
        <LockPanel phase={frame.lockPhase} animate={animate} variant="desktop" />
      </div>
    </div>
  );
}
