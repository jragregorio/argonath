"use client";

import { useEffect, useRef, useState } from "react";
import {
  TrayPanel,
  type TrayPanelProps,
} from "@/components/marketing/product-panels";

type TrayPhase =
  | "pairing-empty"
  | "pairing-typing"
  | "pairing-hold"
  | "pairing-press"
  | "paired"
  | "transition"
  | "running"
  | "reset";

type TrayFrame = {
  pairingOpacity: number;
  runningOpacity: number;
  pairingCode: string;
  pairingSuccess: boolean;
  showPairingCaret?: boolean;
  pairButtonPressed?: boolean;
  timerMinutes?: number;
  timerSeconds?: number;
  usageBarPercent?: number;
  barTransitionMs?: number;
};

const FULL_PAIRING_CODE = "482916";
const PAIRING_CODE_LENGTH = FULL_PAIRING_CODE.length;
const PAIRING_TYPE_TICK_MS = 200;

/** Clock at start of the Running segment (00:42:00). */
const RUNNING_START_SECONDS = 42 * 60;
const RUNNING_BAR_START_PERCENT = 35;
/** Matches the original 42:00 → 41:38 drift (2% over 22 clock seconds). */
const RUNNING_BAR_PERCENT_PER_SECOND = 2 / 22;
const RUNNING_TICK_MS = 1000;

const RUNNING_PHASES = new Set<TrayPhase>(["running"]);
const PAIRING_TYPING_PHASES = new Set<TrayPhase>(["pairing-typing"]);

function secondsToTrayTimer(totalSeconds: number) {
  return {
    timerMinutes: Math.floor(totalSeconds / 60),
    timerSeconds: totalSeconds % 60,
  };
}

function secondsToUsageBar(remainingSeconds: number) {
  const elapsed = RUNNING_START_SECONDS - remainingSeconds;
  return RUNNING_BAR_START_PERCENT - elapsed * RUNNING_BAR_PERCENT_PER_SECOND;
}

const STEPS: { phase: TrayPhase; ms: number; frame: TrayFrame }[] = [
  {
    phase: "pairing-empty",
    ms: 400,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: "",
      pairingSuccess: false,
      showPairingCaret: true,
    },
  },
  {
    phase: "pairing-typing",
    ms: 1200,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: "",
      pairingSuccess: false,
      showPairingCaret: true,
    },
  },
  {
    phase: "pairing-hold",
    ms: 200,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: FULL_PAIRING_CODE,
      pairingSuccess: false,
      showPairingCaret: false,
    },
  },
  {
    phase: "pairing-press",
    ms: 150,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: FULL_PAIRING_CODE,
      pairingSuccess: false,
      showPairingCaret: false,
      pairButtonPressed: true,
    },
  },
  {
    phase: "paired",
    ms: 550,
    frame: {
      pairingOpacity: 1,
      runningOpacity: 0,
      pairingCode: FULL_PAIRING_CODE,
      pairingSuccess: true,
      showPairingCaret: false,
    },
  },
  {
    phase: "transition",
    ms: 500,
    frame: {
      pairingOpacity: 0,
      runningOpacity: 1,
      pairingCode: FULL_PAIRING_CODE,
      pairingSuccess: false,
      barTransitionMs: 400,
    },
  },
  {
    phase: "running",
    ms: 5500,
    frame: {
      pairingOpacity: 0,
      runningOpacity: 1,
      pairingCode: FULL_PAIRING_CODE,
      pairingSuccess: false,
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
      showPairingCaret: false,
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
  pairingCode: FULL_PAIRING_CODE,
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
  const [remainingSeconds, setRemainingSeconds] = useState(
    RUNNING_START_SECONDS
  );
  const [typedDigitCount, setTypedDigitCount] = useState(0);

  const shouldAnimate = !reducedMotion && hasStarted && inView;
  const step = STEPS[stepIndex];
  const isRunningPhase = RUNNING_PHASES.has(step.phase);
  const isPairingTypingPhase = PAIRING_TYPING_PHASES.has(step.phase);

  useEffect(() => {
    if (!shouldAnimate) return;

    const timer = window.setTimeout(() => {
      setStepIndex((index) => (index + 1) % STEPS.length);
    }, step.ms);

    return () => window.clearTimeout(timer);
  }, [stepIndex, shouldAnimate, step.ms]);

  useEffect(() => {
    if (step.phase === "running") {
      setRemainingSeconds(RUNNING_START_SECONDS);
    }
  }, [stepIndex, step.phase]);

  useEffect(() => {
    if (step.phase === "pairing-typing") {
      setTypedDigitCount(0);
    }
  }, [stepIndex, step.phase]);

  useEffect(() => {
    if (!shouldAnimate || !isRunningPhase) return;

    const interval = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, RUNNING_TICK_MS);

    return () => window.clearInterval(interval);
  }, [shouldAnimate, isRunningPhase]);

  useEffect(() => {
    if (!shouldAnimate || !isPairingTypingPhase) return;

    const interval = window.setInterval(() => {
      setTypedDigitCount((count) =>
        Math.min(PAIRING_CODE_LENGTH, count + 1)
      );
    }, PAIRING_TYPE_TICK_MS);

    return () => window.clearInterval(interval);
  }, [shouldAnimate, isPairingTypingPhase]);

  const frame = reducedMotion
    ? STATIC_FRAME
    : isRunningPhase
      ? {
          ...step.frame,
          ...secondsToTrayTimer(remainingSeconds),
          usageBarPercent: secondsToUsageBar(remainingSeconds),
          barTransitionMs: RUNNING_TICK_MS,
        }
      : isPairingTypingPhase
        ? {
            ...step.frame,
            pairingCode: FULL_PAIRING_CODE.slice(0, typedDigitCount),
          }
        : step.phase === "transition"
          ? {
              ...step.frame,
              ...secondsToTrayTimer(RUNNING_START_SECONDS),
              usageBarPercent: RUNNING_BAR_START_PERCENT,
            }
          : step.frame;

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
