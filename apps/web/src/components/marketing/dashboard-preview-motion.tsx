"use client";

import { useEffect, useState } from "react";
import {
  DashboardPanel,
  type DashboardExtensionPhase,
  type DashboardPanelProps,
} from "@/components/marketing/product-panels";

type PreviewPhase =
  | "drift-start"
  | "drift"
  | "focus"
  | "approve"
  | "resolve"
  | "hold"
  | "reset";

type PreviewFrame = {
  alexMinutesLeft: number;
  alexBarPercent: number;
  extensionPhase: DashboardExtensionPhase;
  barTransitionMs?: number;
};

const STEPS: { phase: PreviewPhase; ms: number; frame: PreviewFrame }[] = [
  {
    phase: "drift-start",
    ms: 50,
    frame: {
      alexMinutesLeft: 42,
      alexBarPercent: 35,
      extensionPhase: "pending",
    },
  },
  {
    phase: "drift",
    ms: 2950,
    frame: {
      alexMinutesLeft: 41,
      alexBarPercent: 33,
      extensionPhase: "pending",
      barTransitionMs: 3000,
    },
  },
  {
    phase: "focus",
    ms: 800,
    frame: {
      alexMinutesLeft: 41,
      alexBarPercent: 33,
      extensionPhase: "focus",
      barTransitionMs: 400,
    },
  },
  {
    phase: "approve",
    ms: 1200,
    frame: {
      alexMinutesLeft: 56,
      alexBarPercent: 45,
      extensionPhase: "approved",
      barTransitionMs: 600,
    },
  },
  {
    phase: "resolve",
    ms: 1500,
    frame: {
      alexMinutesLeft: 56,
      alexBarPercent: 45,
      extensionPhase: "empty",
      barTransitionMs: 400,
    },
  },
  {
    phase: "hold",
    ms: 1500,
    frame: {
      alexMinutesLeft: 56,
      alexBarPercent: 45,
      extensionPhase: "empty",
      barTransitionMs: 400,
    },
  },
  {
    phase: "reset",
    ms: 1000,
    frame: {
      alexMinutesLeft: 42,
      alexBarPercent: 35,
      extensionPhase: "pending",
      barTransitionMs: 1000,
    },
  },
];

/** Full loop duration (~10s). */
export const DASHBOARD_PREVIEW_LOOP_MS = STEPS.reduce(
  (sum, step) => sum + step.ms,
  0
);

const STATIC_FRAME: PreviewFrame = {
  alexMinutesLeft: 42,
  alexBarPercent: 35,
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

export function AnimatedDashboardPanel() {
  const reducedMotion = usePrefersReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;

    const step = STEPS[stepIndex];
    const timer = window.setTimeout(() => {
      setStepIndex((index) => (index + 1) % STEPS.length);
    }, step.ms);

    return () => window.clearTimeout(timer);
  }, [stepIndex, reducedMotion]);

  const frame = reducedMotion ? STATIC_FRAME : STEPS[stepIndex].frame;

  const panelProps: DashboardPanelProps = {
    ...frame,
    animate: !reducedMotion,
  };

  return <DashboardPanel {...panelProps} />;
}
