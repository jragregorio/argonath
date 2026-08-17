"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_NUDGE_MESSAGE } from "@warden/shared";
import type { RecentActivityItem } from "@/components/recent-activity-card";
import {
  createInitialDemoState,
  DEMO_IDS,
  SIGNUP_PROMPT_ACTION_COUNT_KEY,
  SIGNUP_PROMPT_DISMISS_COUNT_KEY,
  SIGNUP_PROMPT_DISMISSED_KEY,
  SIGNUP_PROMPT_FIRST_DISMISS_AT_KEY,
  SIGNUP_PROMPT_SECOND_DELAY_MS,
  SIGNUP_PROMPT_SECOND_MIN_ACTIONS,
} from "./fixtures";
import type { DemoFeedback, DemoState } from "./types";
import { BLOCKING_OVERLAY_EVENT, isBlockingOverlayOpen } from "@/lib/overlay-events";

function readSessionInt(key: string): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(key);
  if (raw == null || raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** How many times the signup prompt has been dismissed this tab session (0–2). */
function getSignupDismissCount(): number {
  if (typeof window === "undefined") return 0;
  // Legacy one-and-done flag from earlier demo builds
  if (sessionStorage.getItem(SIGNUP_PROMPT_DISMISSED_KEY) === "1") return 2;
  return Math.min(2, Math.max(0, readSessionInt(SIGNUP_PROMPT_DISMISS_COUNT_KEY)));
}

type DemoContextValue = {
  overview: DemoState["overview"];
  pendingExtensions: DemoState["pendingExtensions"];
  activity: RecentActivityItem[];
  nudgeByDevice: DemoState["nudgeByDevice"];
  pendingLocks: DemoState["pendingLocks"];
  signupPromptOpen: boolean;
  feedback: DemoFeedback | null;
  pendingRequestCount: number;
  dismissSignupPrompt: () => void;
  approveExtension: (requestId: string) => void;
  denyExtension: (requestId: string) => void;
  sendNudge: (deviceId: string, message?: string) => void;
  setAdminLock: (deviceId: string, locked: boolean) => void;
  dismissFeedback: () => void;
  getChildById: (childId: string) => DemoState["overview"]["children"][number] | undefined;
};

const DemoContext = createContext<DemoContextValue | null>(null);

function newActivityId() {
  return `demo-act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newNudgeId() {
  return `demo-nudge-${Date.now()}`;
}

function findChildDevice(
  children: DemoState["overview"]["children"],
  deviceId: string
) {
  for (const child of children) {
    const device = child.devices.find((d) => d.id === deviceId);
    if (device) return { child, device };
  }
  return null;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  // Stable anchor on SSR + first client paint; refresh to Date.now() after mount
  // so relative timestamps stay fresh without hydration mismatches.
  const [state, setState] = useState<DemoState>(() => createInitialDemoState());
  const nudgeTimersRef = useRef<Map<string, number>>(new Map());
  const feedbackTimerRef = useRef<number | null>(null);
  const secondPromptTimerRef = useRef<number | null>(null);
  /** Bumps when dismiss count changes so the late-second timer can reschedule. */
  const [signupPromptEpoch, setSignupPromptEpoch] = useState(0);

  useEffect(() => {
    setState(createInitialDemoState(Date.now()));
  }, []);

  const showFeedback = useCallback((message: string, tone: DemoFeedback["tone"] = "default") => {
    if (isBlockingOverlayOpen()) return;
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    const id = `feedback-${Date.now()}`;
    setState((prev) => ({
      ...prev,
      feedback: { id, message, tone },
    }));
    feedbackTimerRef.current = window.setTimeout(() => {
      setState((prev) =>
        prev.feedback?.id === id ? { ...prev, feedback: null } : prev
      );
    }, 4000);
  }, []);

  const maybeOpenSignupPrompt = useCallback(() => {
    if (typeof window === "undefined") return;
    const dismissCount = getSignupDismissCount();
    if (dismissCount >= 2) return;

    const openPrompt = () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      setState((prev) =>
        prev.signupPromptOpen
          ? prev
          : { ...prev, signupPromptOpen: true, feedback: null }
      );
    };

    if (dismissCount === 0) {
      // First prompt: after the first interactive action
      openPrompt();
      return;
    }

    // Second prompt (late): 5+ actions OR 2.5 min since first dismiss — whichever first
    const actionCount = readSessionInt(SIGNUP_PROMPT_ACTION_COUNT_KEY);
    const firstDismissAt = readSessionInt(SIGNUP_PROMPT_FIRST_DISMISS_AT_KEY);
    const elapsed =
      firstDismissAt > 0 ? Date.now() - firstDismissAt : 0;
    if (
      actionCount >= SIGNUP_PROMPT_SECOND_MIN_ACTIONS ||
      elapsed >= SIGNUP_PROMPT_SECOND_DELAY_MS
    ) {
      openPrompt();
    }
  }, []);

  const recordInteractiveAction = useCallback(() => {
    if (typeof window === "undefined") return;
    const next = readSessionInt(SIGNUP_PROMPT_ACTION_COUNT_KEY) + 1;
    sessionStorage.setItem(SIGNUP_PROMPT_ACTION_COUNT_KEY, String(next));
    maybeOpenSignupPrompt();
  }, [maybeOpenSignupPrompt]);

  const dismissSignupPrompt = useCallback(() => {
    if (typeof window === "undefined") return;
    const prevCount = getSignupDismissCount();
    const nextCount = Math.min(2, prevCount + 1);
    sessionStorage.setItem(SIGNUP_PROMPT_DISMISS_COUNT_KEY, String(nextCount));
    if (nextCount === 1) {
      sessionStorage.setItem(
        SIGNUP_PROMPT_FIRST_DISMISS_AT_KEY,
        String(Date.now())
      );
    }
    if (nextCount >= 2) {
      sessionStorage.setItem(SIGNUP_PROMPT_DISMISSED_KEY, "1");
    }
    setState((prev) => ({ ...prev, signupPromptOpen: false }));
    setSignupPromptEpoch((n) => n + 1);
  }, []);

  // Schedule second prompt on the time path (even if the user stops interacting)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (secondPromptTimerRef.current) {
      window.clearTimeout(secondPromptTimerRef.current);
      secondPromptTimerRef.current = null;
    }

    const dismissCount = getSignupDismissCount();
    if (dismissCount !== 1) return;

    const firstDismissAt = readSessionInt(SIGNUP_PROMPT_FIRST_DISMISS_AT_KEY);
    if (firstDismissAt <= 0) return;

    const remaining =
      SIGNUP_PROMPT_SECOND_DELAY_MS - (Date.now() - firstDismissAt);
    if (remaining <= 0) {
      maybeOpenSignupPrompt();
      return;
    }

    secondPromptTimerRef.current = window.setTimeout(() => {
      secondPromptTimerRef.current = null;
      maybeOpenSignupPrompt();
    }, remaining);

    return () => {
      if (secondPromptTimerRef.current) {
        window.clearTimeout(secondPromptTimerRef.current);
        secondPromptTimerRef.current = null;
      }
    };
  }, [maybeOpenSignupPrompt, signupPromptEpoch]);

  useEffect(() => {
    const onOverlay = () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      setState((prev) =>
        prev.feedback ? { ...prev, feedback: null } : prev
      );
    };
    window.addEventListener(BLOCKING_OVERLAY_EVENT, onOverlay);
    return () => window.removeEventListener(BLOCKING_OVERLAY_EVENT, onOverlay);
  }, []);

  const dismissFeedback = useCallback(() => {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setState((prev) => ({ ...prev, feedback: null }));
  }, []);

  const updateOverviewChildren = useCallback(
    (
      updater: (
        children: DemoState["overview"]["children"]
      ) => DemoState["overview"]["children"]
    ) => {
      setState((prev) => {
        const nextChildren = updater(prev.overview.children);
        return {
          ...prev,
          overview: {
            ...prev.overview,
            children: nextChildren,
          },
        };
      });
    },
    []
  );

  const prependActivity = useCallback((item: RecentActivityItem) => {
    setState((prev) => ({
      ...prev,
      activity: [item, ...prev.activity],
    }));
  }, []);

  const approveExtension = useCallback(
    (requestId: string) => {
      setState((prev) => {
        const request = prev.pendingExtensions.find((r) => r.id === requestId);
        if (!request) return prev;

        const nextPending = prev.pendingExtensions.filter(
          (r) => r.id !== requestId
        );
        const minutes = request.requestedMinutes;

        const nextChildren = prev.overview.children.map((child) => {
          if (child.id !== request.child.id) return child;
          const evaluation = child.evaluation;
          const bonusMinutes = evaluation.bonusMinutes + minutes;
          const dailyRemainingMinutes =
            evaluation.dailyRemainingMinutes + minutes;
          return {
            ...child,
            evaluation: {
              ...evaluation,
              bonusMinutes,
              dailyRemainingMinutes,
              remainingMinutes: Math.min(
                evaluation.remainingMinutes + minutes,
                dailyRemainingMinutes
              ),
            },
          };
        });

        const activityItem: RecentActivityItem = {
          id: newActivityId(),
          action: "extension_approved",
          createdAt: new Date(),
          childName: request.child.displayName,
          deviceName: request.device.displayName ?? request.device.machineName,
          metadata: { minutes },
        };

        return {
          ...prev,
          pendingExtensions: nextPending,
          overview: {
            pendingRequests: nextPending.length,
            children: nextChildren,
          },
          activity: [activityItem, ...prev.activity],
        };
      });
      showFeedback("Extension approved — Alex now has +15 min.", "success");
      recordInteractiveAction();
    },
    [recordInteractiveAction, showFeedback]
  );

  const denyExtension = useCallback(
    (requestId: string) => {
      setState((prev) => {
        const request = prev.pendingExtensions.find((r) => r.id === requestId);
        if (!request) return prev;

        const nextPending = prev.pendingExtensions.filter(
          (r) => r.id !== requestId
        );

        const activityItem: RecentActivityItem = {
          id: newActivityId(),
          action: "extension_denied",
          createdAt: new Date(),
          childName: request.child.displayName,
          deviceName: request.device.displayName ?? request.device.machineName,
          metadata: { minutes: request.requestedMinutes },
        };

        return {
          ...prev,
          pendingExtensions: nextPending,
          overview: {
            ...prev.overview,
            pendingRequests: nextPending.length,
          },
          activity: [activityItem, ...prev.activity],
        };
      });
      showFeedback("Extension request denied.");
    },
    [showFeedback]
  );

  const sendNudge = useCallback(
    (deviceId: string, message?: string) => {
      const nudgeId = newNudgeId();
      const trimmed = message?.trim();
      const body =
        trimmed && trimmed.length > 0 ? trimmed : DEFAULT_NUDGE_MESSAGE;

      setState((prev) => ({
        ...prev,
        nudgeByDevice: {
          ...prev.nudgeByDevice,
          [deviceId]: { nudgeId, label: "Sending…" },
        },
      }));

      const match = findChildDevice(state.overview.children, deviceId);
      const childName = match?.child.displayName ?? "Child";
      const deviceName =
        match?.device.displayName ??
        match?.device.machineName ??
        "Device";

      window.setTimeout(() => {
        setState((prev) => {
          const cur = prev.nudgeByDevice[deviceId];
          if (!cur || cur.nudgeId !== nudgeId) return prev;
          return {
            ...prev,
            nudgeByDevice: {
              ...prev.nudgeByDevice,
              [deviceId]: { nudgeId, label: "Waiting…" },
            },
          };
        });
      }, 600);

      window.setTimeout(() => {
        setState((prev) => {
          const cur = prev.nudgeByDevice[deviceId];
          if (!cur || cur.nudgeId !== nudgeId) return prev;
          return {
            ...prev,
            nudgeByDevice: {
              ...prev.nudgeByDevice,
              [deviceId]: { nudgeId, label: "On my way" },
            },
          };
        });
        prependActivity({
          id: newActivityId(),
          action: "nudge_sent",
          createdAt: new Date(),
          childName,
          deviceName,
          metadata: {
            message: body,
            custom: Boolean(trimmed && trimmed.length > 0),
            response: "on_my_way",
          },
        });
        showFeedback(`Nudge sent to ${childName}.`);
        recordInteractiveAction();
      }, 2200);

      window.setTimeout(() => {
        setState((prev) => {
          const cur = prev.nudgeByDevice[deviceId];
          if (!cur || cur.nudgeId !== nudgeId) return prev;
          const next = { ...prev.nudgeByDevice };
          delete next[deviceId];
          return { ...prev, nudgeByDevice: next };
        });
      }, 22_000);
    },
    [
      prependActivity,
      recordInteractiveAction,
      showFeedback,
      state.overview.children,
    ]
  );

  const setAdminLock = useCallback(
    (deviceId: string, locked: boolean) => {
      setState((prev) => ({
        ...prev,
        pendingLocks: { ...prev.pendingLocks, [deviceId]: locked },
      }));

      window.setTimeout(() => {
        updateOverviewChildren((children) =>
          children.map((child) => ({
            ...child,
            devices: child.devices.map((device) => {
              if (device.id !== deviceId) return device;
              return {
                ...device,
                adminLock: locked,
                isLocked: locked,
              };
            }),
          }))
        );

        setState((prev) => {
          const nextLocks = { ...prev.pendingLocks };
          delete nextLocks[deviceId];
          return { ...prev, pendingLocks: nextLocks };
        });

        const match = findChildDevice(state.overview.children, deviceId);
        const childName = match?.child.displayName ?? "Child";
        const deviceName =
          match?.device.displayName ??
          match?.device.machineName ??
          "Device";

        prependActivity({
          id: newActivityId(),
          action: locked ? "admin_lock" : "admin_unlock",
          createdAt: new Date(),
          childName,
          deviceName,
        });

        showFeedback(
          locked
            ? `${deviceName} locked down.`
            : `${deviceName} lock released.`,
          locked ? "default" : "success"
        );
        recordInteractiveAction();
      }, 500);
    },
    [
      prependActivity,
      recordInteractiveAction,
      showFeedback,
      state.overview.children,
      updateOverviewChildren,
    ]
  );

  const getChildById = useCallback(
    (childId: string) =>
      state.overview.children.find((child) => child.id === childId),
    [state.overview.children]
  );

  useEffect(() => {
    const timers = nudgeTimersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const value = useMemo(
    (): DemoContextValue => ({
      overview: state.overview,
      pendingExtensions: state.pendingExtensions,
      activity: state.activity,
      nudgeByDevice: state.nudgeByDevice,
      pendingLocks: state.pendingLocks,
      signupPromptOpen: state.signupPromptOpen,
      feedback: state.feedback,
      pendingRequestCount: state.pendingExtensions.length,
      dismissSignupPrompt,
      approveExtension,
      denyExtension,
      sendNudge,
      setAdminLock,
      dismissFeedback,
      getChildById,
    }),
    [
      approveExtension,
      denyExtension,
      dismissFeedback,
      dismissSignupPrompt,
      getChildById,
      sendNudge,
      setAdminLock,
      state.activity,
      state.feedback,
      state.nudgeByDevice,
      state.overview,
      state.pendingExtensions,
      state.pendingLocks,
      state.signupPromptOpen,
    ]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error("useDemo must be used within DemoProvider");
  }
  return ctx;
}

export { DEMO_IDS };
