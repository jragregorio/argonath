"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ChildNudgeMock,
  ParentNudgeMock,
  type ChildNudgeMockProps,
  type ParentNudgeMockProps,
} from "@/components/marketing/product-panels";

type PreviewPhase =
  | "idle"
  | "sending"
  | "waiting"
  | "countdown-3"
  | "countdown-2"
  | "countdown-1"
  | "ok-ready"
  | "ok-pressed"
  | "seen"
  | "reset";

type PreviewState = {
  chip: NonNullable<ParentNudgeMockProps["chip"]>;
  sending: boolean;
  childVisible: boolean;
  animate: boolean;
  okSeconds: number;
  okEnabled: boolean;
  okPressed: boolean;
};

const STEPS: { phase: PreviewPhase; ms: number }[] = [
  { phase: "idle", ms: 1400 },
  { phase: "sending", ms: 700 },
  { phase: "waiting", ms: 600 },
  { phase: "countdown-3", ms: 1000 },
  { phase: "countdown-2", ms: 1000 },
  { phase: "countdown-1", ms: 1000 },
  { phase: "ok-ready", ms: 700 },
  { phase: "ok-pressed", ms: 350 },
  { phase: "seen", ms: 1600 },
  { phase: "reset", ms: 1200 },
];

/** Full loop duration (~9.55s). */
export const NUDGE_PREVIEW_LOOP_MS = STEPS.reduce((sum, step) => sum + step.ms, 0);

const STATIC_PREVIEW: PreviewState = {
  chip: "seen",
  sending: false,
  childVisible: true,
  animate: false,
  okSeconds: 0,
  okEnabled: true,
  okPressed: false,
};

function phaseToState(phase: PreviewPhase): PreviewState {
  switch (phase) {
    case "idle":
      return {
        chip: "none",
        sending: false,
        childVisible: false,
        animate: true,
        okSeconds: 3,
        okEnabled: false,
        okPressed: false,
      };
    case "sending":
      return {
        chip: "none",
        sending: true,
        childVisible: false,
        animate: true,
        okSeconds: 3,
        okEnabled: false,
        okPressed: false,
      };
    case "waiting":
      return {
        chip: "waiting",
        sending: false,
        childVisible: false,
        animate: true,
        okSeconds: 3,
        okEnabled: false,
        okPressed: false,
      };
    case "countdown-3":
      return {
        chip: "waiting",
        sending: false,
        childVisible: true,
        animate: true,
        okSeconds: 3,
        okEnabled: false,
        okPressed: false,
      };
    case "countdown-2":
      return {
        chip: "waiting",
        sending: false,
        childVisible: true,
        animate: true,
        okSeconds: 2,
        okEnabled: false,
        okPressed: false,
      };
    case "countdown-1":
      return {
        chip: "waiting",
        sending: false,
        childVisible: true,
        animate: true,
        okSeconds: 1,
        okEnabled: false,
        okPressed: false,
      };
    case "ok-ready":
      return {
        chip: "waiting",
        sending: false,
        childVisible: true,
        animate: true,
        okSeconds: 0,
        okEnabled: true,
        okPressed: false,
      };
    case "ok-pressed":
      return {
        chip: "waiting",
        sending: false,
        childVisible: true,
        animate: true,
        okSeconds: 0,
        okEnabled: true,
        okPressed: true,
      };
    case "seen":
      return {
        chip: "seen",
        sending: false,
        childVisible: true,
        animate: true,
        okSeconds: 0,
        okEnabled: true,
        okPressed: false,
      };
    case "reset":
      return {
        chip: "none",
        sending: false,
        childVisible: false,
        animate: true,
        okSeconds: 3,
        okEnabled: false,
        okPressed: false,
      };
  }
}

const PreviewContext = createContext<PreviewState>(STATIC_PREVIEW);

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

export function NudgePreviewProvider({ children }: { children: ReactNode }) {
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

  const state = reducedMotion
    ? STATIC_PREVIEW
    : phaseToState(STEPS[stepIndex].phase);

  return (
    <PreviewContext.Provider value={state}>{children}</PreviewContext.Provider>
  );
}

export function AnimatedParentNudgeMock() {
  const { chip, sending } = useContext(PreviewContext);
  return <ParentNudgeMock chip={chip} sending={sending} />;
}

export function AnimatedChildNudgeMock() {
  const { childVisible, animate, okSeconds, okEnabled, okPressed } =
    useContext(PreviewContext);
  const childProps: ChildNudgeMockProps = {
    visible: childVisible,
    animate,
    okSeconds,
    okEnabled,
    okPressed,
  };
  return <ChildNudgeMock {...childProps} />;
}
