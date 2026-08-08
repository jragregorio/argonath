"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

type TrpcUtils = ReturnType<typeof trpc.useUtils>;

/** Invalidate main dashboard query families (shared across pages). */
export async function invalidateDashboardQueries(utils: TrpcUtils) {
  await Promise.allSettled([
    utils.dashboard.overview.invalidate(),
    utils.dashboard.activity.invalidate(),
    utils.dashboard.navBadges.invalidate(),
    utils.children.list.invalidate(),
    utils.device.list.invalidate(),
    utils.extension.listPending.invalidate(),
    utils.extension.listHistory.invalidate(),
    utils.snapshot.list.invalidate(),
    utils.children.get.invalidate(),
    utils.policy.getEvaluation.invalidate(),
  ]);
}

type RefreshOptions = {
  /** Invalidate React Query only — skip RSC `router.refresh()` (safer on Capacitor resume). */
  soft?: boolean;
};

export function useDashboardRefresh() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const inFlightRef = useRef(false);

  const refreshDashboard = useCallback(
    async (options?: RefreshOptions) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await invalidateDashboardQueries(utils);
        if (!options?.soft) {
          router.refresh();
        }
      } catch (error) {
        console.error("[warden] dashboard refresh failed:", error);
      } finally {
        inFlightRef.current = false;
      }
    },
    [utils, router]
  );

  return { refreshDashboard };
}
