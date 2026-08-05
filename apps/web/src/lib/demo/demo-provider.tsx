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
  SIGNUP_PROMPT_DISMISSED_KEY,
} from "./fixtures";
import type { DemoFeedback, DemoState } from "./types";

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
  const [state, setState] = useState<DemoState>(() => createInitialDemoState());
  const nudgeTimersRef = useRef<Map<string, number>>(new Map());
  const feedbackTimerRef = useRef<number | null>(null);

  const showFeedback = useCallback((message: string, tone: DemoFeedback["tone"] = "default") => {
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
    if (sessionStorage.getItem(SIGNUP_PROMPT_DISMISSED_KEY) === "1") return;
    setState((prev) => ({ ...prev, signupPromptOpen: true }));
  }, []);

  const recordInteractiveAction = useCallback(() => {
    maybeOpenSignupPrompt();
  }, [maybeOpenSignupPrompt]);

  const dismissSignupPrompt = useCallback(() => {
    sessionStorage.setItem(SIGNUP_PROMPT_DISMISSED_KEY, "1");
    setState((prev) => ({ ...prev, signupPromptOpen: false }));
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
              [deviceId]: { nudgeId, label: "Seen" },
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
      }, 5200);
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
