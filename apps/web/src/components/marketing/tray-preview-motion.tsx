"use client";

import { useEffect, useRef, useState } from "react";
import {
  TrayPanel,
  type TrayPanelProps,
} from "@/components/marketing/product-panels";

type TrayPhase =
  | "pairing-empty"
  | "pairing-code"
  | "paired"
  | "transition"
  | "running-start"
  | "running-drift"
  | "hold"
  | "reset";

type TrayFrame = {
  pairingOpacity: number;
  runningOpacity: number;
  pairingCode: string;
  pairingSuccess: boolean;
  timerMinutes: number;
  timerSeconds: number;
  usageBarPercent: number;
  barTransitionMs?: number;
};

const STEPS: { phase: TrayPhase; ms: number; frame: TrayFrame }[] = [
  {
    phase: "pairing-empty",
    ms: 400,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: "",
      pairingSuccess: false,
      timerMinutes: 42,
      timerSeconds: 0,
      usageBarPercent: 35,
    },
  },
  {
    phase: "pairing-code",
    ms: 1400,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: "482916",
      pairingSuccess: false,
      timerMinutes: 42,
      timerSeconds: 0,
      usageBarPercent: 35,
    },
  },
  {
    phase: "paired",
    ms: 700,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: "482916",
      pairingSuccess: true,
      timerMinutes: 42,
      timerSeconds: 0,
      usageBarPercent: 35,
    },
  },
  {
    phase: "transition",
    ms: 500,
    frame: {
      pairingOpacity: 0,
      runningOpacity: 1,
      pairingCode: "482916",
      pairingSuccess: false,
      timerMinutes: 42,
      timerSeconds: 0,
      usageBarPercent: 35,
      barTransitionMs: 400,
    },
  },
  {
    phase: "running-start",
    ms: 50,
    frame: {
      pairingOpacity: 0,
      runningOpacity: 1,
      pairingCode: "482916",
      pairingSuccess: false,
      timerMinutes: 42,
      timerSeconds: 0,
      usageBarPercent: 35,
    },
  },
  {
    phase: "running-drift",
    ms: 3950,
    frame: {
      pairingOpacity: 0,
      runningOpacity: 1,
      pairingCode: "482916",
      pairingSuccess: false,
      timerMinutes: 41,
      timerSeconds: 38,
      usageBarPercent: 33,
      barTransitionMs: 4000,
    },
  },
  {
    phase: "hold",
    ms: 1500,
    frame: {
      pairingOpacity: 0,
      runningOpacity: 1,
      pairingCode: "482916",
      pairingSuccess: false,
      timerMinutes: 41,
      timerSeconds: 38,
      usageBarPercent: 33,
      barTransitionMs: 400,
    },
  },
  {
    phase: "reset",
    ms: 500,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: "",
      pairingSuccess: false,
      timerMinutes: 42,
      timerSeconds: 0,
      usageBarPercent: 35,
      barTransitionMs: 400,
    },
  },
];

/** Full loop duration (~9s). */
export const TRAY_PREVIEW_LOOP_MS = STEPS.reduce(
  (sum, step) => sum + step.ms,
  0
);

const STATIC_FRAME: TrayFrame = {
  pairingOpacity: 0,
  runningOpacity: 1,
  pairingCode: "482916",
  pairingSuccess: false,
  timerMinutes: 42,
  timerSeconds: 0,
  usageBarPercent: 35,
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

function useTrayInView(ref: React.RefObject<HTMLElement | null>) {
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

export function AnimatedTrayPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { inView, hasStarted } = useTrayInView(containerRef);
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

  const panelProps: TrayPanelProps = {
    ...frame,
    childName: "Alex",
    animate,
  };

  return (
    <div ref={containerRef} className="flex justify-center md:justify-end">
      <TrayPanel {...panelProps} />
    </div>
  );
}
