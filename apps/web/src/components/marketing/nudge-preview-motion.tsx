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

type PreviewPhase = "idle" | "sending" | "waiting" | "delivered" | "seen" | "reset";

type PreviewState = {
  chip: NonNullable<ParentNudgeMockProps["chip"]>;
  sending: boolean;
  childVisible: boolean;
  animate: boolean;
};

const STEPS: { phase: PreviewPhase; ms: number }[] = [
  { phase: "idle", ms: 1400 },
  { phase: "sending", ms: 700 },
  { phase: "waiting", ms: 600 },
  { phase: "delivered", ms: 2600 },
  { phase: "seen", ms: 1600 },
  { phase: "reset", ms: 1200 },
];

/** Full loop duration (~8.1s). */
export const NUDGE_PREVIEW_LOOP_MS = STEPS.reduce((sum, step) => sum + step.ms, 0);

const STATIC_PREVIEW: PreviewState = {
  chip: "seen",
  sending: false,
  childVisible: true,
  animate: false,
};

function phaseToState(phase: PreviewPhase): PreviewState {
  switch (phase) {
    case "idle":
      return { chip: "none", sending: false, childVisible: false, animate: true };
    case "sending":
      return { chip: "none", sending: true, childVisible: false, animate: true };
    case "waiting":
      return {
        chip: "waiting",
        sending: false,
        childVisible: false,
        animate: true,
      };
    case "delivered":
      return {
        chip: "waiting",
        sending: false,
        childVisible: true,
        animate: true,
      };
    case "seen":
      return { chip: "seen", sending: false, childVisible: true, animate: true };
    case "reset":
      return { chip: "none", sending: false, childVisible: false, animate: true };
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
  const { childVisible, animate } = useContext(PreviewContext);
  const childProps: ChildNudgeMockProps = {
    visible: childVisible,
    animate,
  };
  return <ChildNudgeMock {...childProps} />;
}
