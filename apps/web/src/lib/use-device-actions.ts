"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useFamilyRealtimeEvent } from "@/lib/family-realtime";
import {
  optimisticAdminLock,
  rollbackAdminLock,
} from "@/lib/device-cache";
import { useToast } from "@/lib/toast";

type DeviceForActions = {
  id: string;
  adminLock: boolean;
  isLocked: boolean;
};

type UseDeviceActionsOptions = {
  devices: DeviceForActions[];
  childId?: string;
  scope: "overview" | "child";
  getDeviceLabel: (deviceId: string) => string;
  getChildLabel?: (deviceId: string) => string;
};

type SetAdminLockInput = { deviceId: string; locked: boolean };
type SendNudgeInput = { deviceId: string; message?: string };

type DeviceLockMutation = {
  mutate: (variables: SetAdminLockInput) => void;
  isPending: boolean;
  variables?: SetAdminLockInput;
};

type DeviceNudgeMutation = {
  mutate: (variables: SendNudgeInput) => void;
  isPending: boolean;
  variables?: SendNudgeInput;
};

export type UseDeviceActionsReturn = {
  pendingLocks: Record<string, boolean | undefined>;
  nudgeByDevice: Record<string, { nudgeId: string; label: string }>;
  setAdminLock: DeviceLockMutation;
  sendNudge: DeviceNudgeMutation;
  getEffectiveAdminLock: (device: DeviceForActions) => boolean;
};

export function useDeviceActions({
  devices,
  childId,
  scope,
  getDeviceLabel,
  getChildLabel,
}: UseDeviceActionsOptions): UseDeviceActionsReturn {
  const utils = trpc.useUtils();
  const { showToast } = useToast();

  const [pendingLocks, setPendingLocks] = useState<
    Record<string, boolean | undefined>
  >({});
  const [nudgeByDevice, setNudgeByDevice] = useState<
    Record<string, { nudgeId: string; label: string }>
  >({});

  const invalidateAfterLock = () => {
    if (scope === "overview") {
      void utils.dashboard.overview.invalidate();
      void utils.dashboard.activity.invalidate();
      void utils.device.list.invalidate();
      void utils.children.list.invalidate();
      return;
    }

    if (childId) {
      void utils.children.get.invalidate({ childId });
    }
    void utils.device.list.invalidate();
    void utils.dashboard.overview.invalidate();
  };

  const setAdminLock = trpc.device.setAdminLock.useMutation({
    onMutate: async ({ deviceId, locked }) => {
      setPendingLocks((prev) => ({ ...prev, [deviceId]: locked }));
      return optimisticAdminLock(utils, deviceId, locked, childId);
    },
    onSuccess: (_data, { deviceId, locked }) => {
      const deviceName = getDeviceLabel(deviceId);
      showToast(
        locked ? `${deviceName} locked down.` : `${deviceName} lock released.`,
        locked ? "default" : "success"
      );
    },
    onError: (err, vars, context) => {
      rollbackAdminLock(utils, context);
      setPendingLocks((prev) => {
        const next = { ...prev };
        delete next[vars.deviceId];
        return next;
      });
      showToast(err.message || "Could not update device lock", "error");
    },
    onSettled: invalidateAfterLock,
  });

  const sendNudge = trpc.device.sendNudge.useMutation({
    onMutate: ({ deviceId }) => {
      setNudgeByDevice((prev) => ({
        ...prev,
        [deviceId]: {
          nudgeId: prev[deviceId]?.nudgeId ?? "",
          label: "Sending…",
        },
      }));
    },
    onSuccess: (data, { deviceId }) => {
      const childName = getChildLabel?.(deviceId) ?? "Child";
      setNudgeByDevice((prev) => ({
        ...prev,
        [deviceId]: { nudgeId: data.id, label: "Waiting…" },
      }));
      showToast(`Nudge sent to ${childName}.`, "success");
      void utils.dashboard.activity.invalidate();
    },
    onError: (err, { deviceId }) => {
      setNudgeByDevice((prev) => ({
        ...prev,
        [deviceId]: { nudgeId: "", label: err.message },
      }));
      showToast(err.message || "Could not send nudge", "error");
    },
  });

  const activeNudgeKey = useMemo(
    () =>
      Object.entries(nudgeByDevice)
        .filter(([, v]) => v.nudgeId)
        .map(([deviceId, v]) => `${deviceId}:${v.nudgeId}`)
        .sort()
        .join("|"),
    [nudgeByDevice]
  );

  const clearNudgeSoon = (deviceId: string, nudgeId: string) => {
    window.setTimeout(() => {
      setNudgeByDevice((prev) => {
        const cur = prev[deviceId];
        if (!cur || cur.nudgeId !== nudgeId) return prev;
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
    }, 5000);
  };

  const applyNudgeStatus = (
    deviceId: string,
    nudgeId: string,
    status: string
  ) => {
    let label = "Waiting…";
    if (status === "delivered") label = "Delivered";
    else if (status === "seen") label = "Seen";
    else if (status === "expired") label = "Expired";
    else if (status === "pending") label = "Waiting…";

    setNudgeByDevice((prev) => {
      const cur = prev[deviceId];
      if (!cur || cur.nudgeId !== nudgeId || cur.label === label) {
        return prev;
      }
      return { ...prev, [deviceId]: { ...cur, label } };
    });

    if (status === "seen" || status === "expired") {
      clearNudgeSoon(deviceId, nudgeId);
    }
  };

  useFamilyRealtimeEvent((event) => {
    if (event.type !== "nudge:seen") return;
    const payload = event.payload as { nudgeId?: string } | undefined;
    const nudgeId = payload?.nudgeId;
    if (!nudgeId) return;
    applyNudgeStatus(event.deviceId, nudgeId, "seen");
  });

  useEffect(() => {
    if (!activeNudgeKey) return;

    const active = activeNudgeKey.split("|").map((pair) => {
      const [deviceId, nudgeId] = pair.split(":");
      return { deviceId, nudgeId };
    });

    let cancelled = false;
    const poll = async () => {
      await Promise.all(
        active.map(async ({ deviceId, nudgeId }) => {
          try {
            const nudge = await utils.device.getNudge.fetch({ nudgeId });
            if (cancelled) return;
            applyNudgeStatus(deviceId, nudgeId, nudge.status);
          } catch {
            // Keep last label.
          }
        })
      );
    };

    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeNudgeKey is the stable membership key
  }, [activeNudgeKey, utils.device.getNudge]);

  const devicesLockKey = useMemo(
    () =>
      devices
        .map((d) => `${d.id}:${Number(d.adminLock)}:${Number(d.isLocked)}`)
        .join(","),
    [devices]
  );

  useEffect(() => {
    if (!devices.length) return;
    setPendingLocks((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const device of devices) {
        const pending = prev[device.id];
        if (pending === undefined) continue;

        const confirmed = pending
          ? device.adminLock && device.isLocked
          : !device.adminLock && !device.isLocked;

        if (confirmed) {
          delete next[device.id];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [devices, devicesLockKey]);

  const getEffectiveAdminLock = (device: DeviceForActions) => {
    const pending = pendingLocks[device.id];
    return pending !== undefined ? pending : device.adminLock;
  };

  return {
    pendingLocks,
    nudgeByDevice,
    setAdminLock: setAdminLock as DeviceLockMutation,
    sendNudge: sendNudge as DeviceNudgeMutation,
    getEffectiveAdminLock,
  };
}
