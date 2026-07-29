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
import { POLL_BACKGROUND_MS, POLL_LIVE_MS } from "@/lib/query-defaults";

type RealtimeListener = (event: RealtimeEvent) => void;

type FamilyRealtimeContextValue = {
  badgeFor: (href: string) => number;
  subscribe: (listener: RealtimeListener) => () => void;
};

const FamilyRealtimeContext =
  createContext<FamilyRealtimeContextValue | null>(null);

function invalidateForEvent(
  utils: ReturnType<typeof trpc.useUtils>,
  event: RealtimeEvent
) {
  const type = event.type;

  if (
    type.startsWith("extension:") ||
    type === "device:locked" ||
    type === "device:unlocked" ||
    type === "policy:updated" ||
    type === "nudge:seen" ||
    type === "nudge:show"
  ) {
    void utils.dashboard.overview.invalidate();
    void utils.dashboard.activity.invalidate();
    void utils.children.list.invalidate();
    void utils.children.get.invalidate();
    void utils.policy.getEvaluation.invalidate();
    void utils.device.list.invalidate();
  }

  if (type.startsWith("extension:")) {
    void utils.extension.listPending.invalidate();
    void utils.extension.listHistory.invalidate();
    void utils.dashboard.navBadges.invalidate();
  }

  if (type === "snapshot:ready" || type === "snapshot:failed") {
    void utils.snapshot.list.invalidate();
    void utils.dashboard.navBadges.invalidate();
    void utils.children.get.invalidate();
  }

  if (type === "device:locked" || type === "device:unlocked") {
    void utils.dashboard.navBadges.invalidate();
  }
}

export function FamilyRealtimeProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const listenersRef = useRef(new Set<RealtimeListener>());

  const { data: badges } = trpc.dashboard.navBadges.useQuery(undefined, {
    refetchInterval: POLL_LIVE_MS,
  });
  const { data: devices } = trpc.device.list.useQuery(undefined, {
    refetchInterval: POLL_BACKGROUND_MS,
  });

  const deviceIds = useMemo(
    () => devices?.map((d) => d.id) ?? [],
    [devices]
  );
  const deviceIdsKey = deviceIds.join(",");

  useEffect(() => {
    return subscribeDeviceChannels(deviceIds, (event) => {
      invalidateForEvent(utils, event);
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
