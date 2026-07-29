"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { RealtimeEvent } from "@warden/shared";
import { trpc } from "@/lib/trpc";
import { subscribeDeviceChannels } from "@/lib/realtime";
import { POLL_BACKGROUND_MS, POLL_SAFETY_MS } from "@/lib/query-defaults";

type RealtimeListener = (event: RealtimeEvent) => void;

type FamilyRealtimeContextValue = {
  badgeFor: (href: string) => number;
  subscribe: (listener: RealtimeListener) => () => void;
};

const FamilyRealtimeContext =
  createContext<FamilyRealtimeContextValue | null>(null);

type DeviceListRow = {
  id: string;
  child: { id: string };
};

function childIdForDevice(
  devices: DeviceListRow[] | undefined,
  deviceId: string
): string | undefined {
  return devices?.find((d) => d.id === deviceId)?.child.id;
}

function invalidateForEvent(
  utils: ReturnType<typeof trpc.useUtils>,
  event: RealtimeEvent,
  devices: DeviceListRow[] | undefined
) {
  const type = event.type;
  const childId = childIdForDevice(devices, event.deviceId);

  // Nudge rows only — sendNudge/ackNudge do not touch children, policy, or devices.
  // Pages listen via useFamilyRealtimeEvent for label updates.
  if (type === "nudge:seen" || type === "nudge:show") {
    return;
  }

  if (
    type === "extension:requested" ||
    type === "extension:approved" ||
    type === "extension:denied"
  ) {
    void utils.extension.listPending.invalidate();
    void utils.dashboard.navBadges.invalidate();
    void utils.dashboard.overview.invalidate();
    void utils.dashboard.activity.invalidate();
    if (type !== "extension:requested") {
      void utils.extension.listHistory.invalidate();
      void utils.children.list.invalidate();
      void utils.device.list.invalidate();
      if (childId) {
        void utils.children.get.invalidate({ childId });
        void utils.policy.getEvaluation.invalidate({ childId });
      } else {
        // device.list cache miss — cannot scope without guessing childId
        void utils.children.get.invalidate();
        void utils.policy.getEvaluation.invalidate();
      }
    }
    return;
  }

  if (type === "device:locked" || type === "device:unlocked") {
    void utils.device.list.invalidate();
    void utils.children.list.invalidate();
    void utils.dashboard.overview.invalidate();
    void utils.dashboard.activity.invalidate();
    void utils.dashboard.navBadges.invalidate();
    if (childId) {
      void utils.children.get.invalidate({ childId });
    } else {
      // device.list cache miss — cannot scope without guessing childId
      void utils.children.get.invalidate();
    }
    return;
  }

  if (type === "policy:updated") {
    void utils.children.list.invalidate();
    void utils.dashboard.overview.invalidate();
    void utils.dashboard.activity.invalidate();
    if (childId) {
      void utils.children.get.invalidate({ childId });
      void utils.policy.getEvaluation.invalidate({ childId });
    } else {
      // device.list cache miss — cannot scope without guessing childId
      void utils.children.get.invalidate();
      void utils.policy.getEvaluation.invalidate();
    }
    return;
  }

  if (type === "snapshot:ready" || type === "snapshot:failed") {
    void utils.snapshot.list.invalidate();
    void utils.dashboard.navBadges.invalidate();
    void utils.dashboard.activity.invalidate();
    return;
  }

  if (type === "device:online" || type === "device:offline") {
    void utils.device.list.invalidate();
    void utils.children.list.invalidate();
    void utils.dashboard.overview.invalidate();
    if (childId) {
      void utils.children.get.invalidate({ childId });
    } else {
      // device.list cache miss — cannot scope without guessing childId
      void utils.children.get.invalidate();
    }
  }
}

export function FamilyRealtimeProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const listenersRef = useRef(new Set<RealtimeListener>());

  const { data: badges } = trpc.dashboard.navBadges.useQuery(undefined, {
    // extension:* / snapshot:* invalidate badges; safety net if Realtime drops
    refetchInterval: POLL_SAFETY_MS,
  });
  const { data: devices } = trpc.device.list.useQuery(undefined, {
    // device:offline is never broadcast — keep a moderate poll for online decay
    refetchInterval: POLL_BACKGROUND_MS,
  });

  const deviceIds = useMemo(
    () => devices?.map((d) => d.id) ?? [],
    [devices]
  );
  const deviceIdsKey = deviceIds.join(",");
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  useEffect(() => {
    return subscribeDeviceChannels(deviceIds, (event) => {
      invalidateForEvent(utils, event, devicesRef.current);
      listenersRef.current.forEach((listener) => {
        try {
          listener(event);
        } catch {
          // Page listeners must not break the shared bus.
        }
      });
    });
    // deviceIdsKey captures membership; utils is a stable tRPC proxy.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [deviceIdsKey]);

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const badgeFor = useCallback(
    (href: string): number => {
      if (href === "/dashboard/extensions") return badges?.pendingRequests ?? 0;
      if (href === "/dashboard/snapshots") return badges?.unviewedSnapshots ?? 0;
      return 0;
    },
    [badges]
  );

  const value = useMemo(
    () => ({ badgeFor, subscribe }),
    [badgeFor, subscribe]
  );

  return (
    <FamilyRealtimeContext.Provider value={value}>
      {children}
    </FamilyRealtimeContext.Provider>
  );
}

export function useNavBadges() {
  const ctx = useContext(FamilyRealtimeContext);
  if (!ctx) {
    throw new Error("useNavBadges must be used within FamilyRealtimeProvider");
  }
  return { badgeFor: ctx.badgeFor };
}

/** Subscribe to family realtime events without opening extra channels. */
export function useFamilyRealtimeEvent(onEvent: RealtimeListener) {
  const ctx = useContext(FamilyRealtimeContext);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((event) => {
      callbackRef.current(event);
    });
  }, [ctx]);
}
