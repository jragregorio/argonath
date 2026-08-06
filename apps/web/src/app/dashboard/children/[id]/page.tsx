"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { useFamilyRealtimeEvent } from "@/lib/family-realtime";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ChildDetailSkeleton } from "@/components/dashboard-skeletons";
import { SwipeToLock } from "@/components/swipe-to-lock";
import type { AllowedWindow, PolicyStatus } from "@warden/shared";
import {
  getDeviceDisplayName,
  getPolicyReach,
  getPolicyStatusLabel,
} from "@warden/shared";
import {
  Camera,
  Check,
  Copy,
  Monitor,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  Video,
  ChevronDown,
  Download,
} from "lucide-react";
import { InlineBackLink } from "@/components/sticky-back-chip";
import { isSupabaseConfigured } from "@/lib/dev-config";
import {
  optimisticAdminLock,
  rollbackAdminLock,
} from "@/lib/device-cache";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { NudgeControls } from "@/components/nudge-controls";
import { RecentActivityCard } from "@/components/recent-activity-card";
import { POLL_HEARTBEAT_MS } from "@/lib/query-defaults";
import { AllowedWindowsSummary } from "@/components/allowed-windows-summary";
import { formatClockInText } from "@/lib/time-format";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";

const AllowedWindowsEditor = dynamic(
  () =>
    import("@/components/allowed-windows-editor").then(
      (mod) => mod.AllowedWindowsEditor
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-40 w-full" />,
  }
);

const AllowedWindowsDialog = dynamic(
  () =>
    import("@/components/allowed-windows-dialog").then(
      (mod) => mod.AllowedWindowsDialog
    ),
  { ssr: false }
);

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

type CaptureFeedback = {
  message: string;
  tone: "pending" | "success" | "error";
};

type PairingCodeState = {
  code: string;
  expiresAt: Date;
  deviceId: string;
};

type ConfirmState =
  | { type: "delete-child" }
  | { type: "clear-bonus" }
  | { type: "delete-device"; deviceId: string; deviceLabel: string }
  | null;

function windowsEqual(a: AllowedWindow[], b: AllowedWindow[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (window, i) =>
      window.day === b[i].day &&
      window.start === b[i].start &&
      window.end === b[i].end
  );
}

function formatDayRange(days: number[]): string {
  if (days.length === 0) return "";
  const sorted = [...days].sort((a, b) => a - b);
  const labels = sorted.map(
    (day) => DAYS.find((d) => d.value === day)?.label ?? `Day ${day}`
  );
  // Collapse contiguous runs: Mon,Tue,Wed,Thu,Fri → Mon-Fri
  const ranges: string[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const contiguous =
      i < sorted.length && sorted[i] === sorted[i - 1] + 1;
    if (!contiguous) {
      if (i - 1 === start) {
        ranges.push(labels[start]);
      } else if (i - 1 === start + 1) {
        ranges.push(`${labels[start]}, ${labels[i - 1]}`);
      } else {
        ranges.push(`${labels[start]}-${labels[i - 1]}`);
      }
      start = i;
    }
  }
  return ranges.join(", ");
}

/** Group constrained days by capacity for accurate advisory copy. */
function formatReachAdvisory(
  constrainedDays: number[],
  byDay: { day: number; capacityMinutes: number }[],
  dailyLimitMinutes: number
): string {
  const capacityByDay = new Map(
    byDay.map((d) => [d.day, d.capacityMinutes] as const)
  );
  const byCapacity = new Map<number, number[]>();
  for (const day of constrainedDays) {
    const capacity = capacityByDay.get(day) ?? 0;
    const list = byCapacity.get(capacity) ?? [];
    list.push(day);
    byCapacity.set(capacity, list);
  }
  // Tightest first so the common single-group case matches prior wording.
  const groups = [...byCapacity.entries()].sort((a, b) => a[0] - b[0]);

  if (groups.length === 1) {
    const [capacity, days] = groups[0];
    return `On ${formatDayRange(days)} these hours only allow ${capacity} of the ${dailyLimitMinutes} minutes/day you've set.`;
  }

  const clauses = groups.map(([capacity, days], index) => {
    const range = formatDayRange(days);
    if (index === 0) {
      return `On ${range} these hours allow only ${capacity} min`;
    }
    return `on ${range} ${capacity} min`;
  });
  const joined =
    clauses.length === 2
      ? `${clauses[0]}, and ${clauses[1]}`
      : `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
  return `${joined}, of the ${dailyLimitMinutes} minutes/day you've set.`;
}

function progressBarClass(status: PolicyStatus) {
  if (status === "blocked") return "bg-destructive";
  if (status === "outside_window") return "bg-yellow-500";
  return "bg-primary";
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function captureToneClass(tone: CaptureFeedback["tone"]) {
  if (tone === "success") return "text-green-400";
  if (tone === "error") return "text-destructive";
  return "text-muted-foreground";
}

export default function ChildDetailPage() {
  const params = useParams();
  const router = useRouter();
  const childId = params.id as string;
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const isDesktop = useIsDesktopMd();

  const { data: child, isLoading } = trpc.children.get.useQuery(
    { childId },
    {
      placeholderData: keepPreviousData,
      // Heartbeats update lastSeen/usage; device:online Realtime covers reconnect
      refetchInterval: POLL_HEARTBEAT_MS,
    }
  );
  const { data: evaluation } = trpc.policy.getEvaluation.useQuery(
    { childId },
    {
      placeholderData: keepPreviousData,
      // Usage ticks via heartbeats; policy/extension Realtime covers other changes
      refetchInterval: POLL_HEARTBEAT_MS,
    }
  );
  const { data: activity } = trpc.dashboard.activity.useQuery(
    { limit: 30, childId },
    { refetchInterval: POLL_HEARTBEAT_MS }
  );
  // Re-enable after Supabase plan upgrade (Free plan caps Storage objects at 50MB;
  // the MSI is ~84MB). Publish with: npm run publish:agent -- --msi …
  const INSTALLER_DOWNLOAD_ENABLED = false;
  const { data: latestRelease, isLoading: latestReleaseLoading } =
    trpc.agentRelease.latest.useQuery(undefined, {
      enabled: INSTALLER_DOWNLOAD_ENABLED,
    });
  const updatePolicy = trpc.policy.update.useMutation({
    onSuccess: () => {
      utils.policy.getEvaluation.invalidate({ childId });
      utils.children.get.invalidate({ childId });
      utils.dashboard.overview.invalidate();
      setDailyLimit(null);
      setAllowedWindows(null);
      setIsActive(null);
      setPolicySavedAt(Date.now());
      setPolicyEditorOpen(false);
      setScheduleDialogOpen(false);
    },
  });
  const clearBonus = trpc.extension.clearBonus.useMutation({
    onSuccess: () => {
      void utils.policy.getEvaluation.invalidate({ childId });
      void utils.children.get.invalidate({ childId });
      void utils.dashboard.overview.invalidate();
      void utils.dashboard.activity.invalidate();
    },
  });
  const renameChild = trpc.children.rename.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.children.list.invalidate();
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
      setEditingChildName(false);
    },
  });
  const deleteChild = trpc.children.delete.useMutation({
    onSuccess: () => {
      utils.children.list.invalidate();
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
      router.push("/dashboard/children");
    },
  });
  const generateCode = trpc.device.generatePairingCode.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
    },
  });
  const renameDevice = trpc.device.rename.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
      setEditingDeviceId(null);
    },
  });
  const deleteDevice = trpc.device.delete.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
    },
  });
  const dismissUncleanExit = trpc.device.dismissUncleanExit.useMutation({
    onSuccess: () => {
      void utils.children.get.invalidate({ childId });
      void utils.device.list.invalidate();
    },
  });
  const setAdminLock = trpc.device.setAdminLock.useMutation({
    onMutate: async ({ deviceId, locked }) => {
      setPendingLocks((prev) => ({ ...prev, [deviceId]: locked }));
      return optimisticAdminLock(utils, deviceId, locked, childId);
    },
    onSuccess: (_data, { deviceId, locked }) => {
      const device = child?.devices.find((d) => d.id === deviceId);
      const deviceName = device ? getDeviceDisplayName(device) : "Device";
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
    onSettled: () => {
      void utils.children.get.invalidate({ childId });
      void utils.device.list.invalidate();
      void utils.dashboard.overview.invalidate();
    },
  });
  const [pendingLocks, setPendingLocks] = useState<
    Record<string, boolean | undefined>
  >({});
  const [nudgeByDevice, setNudgeByDevice] = useState<
    Record<string, { nudgeId: string; label: string }>
  >({});
  const [captureFeedback, setCaptureFeedback] = useState<
    Record<string, CaptureFeedback>
  >({});
  const capturePollersRef = useRef<Record<string, number>>({});

  const sendNudge = trpc.device.sendNudge.useMutation({
    onMutate: ({ deviceId }) => {
      setNudgeByDevice((prev) => ({
        ...prev,
        [deviceId]: { nudgeId: prev[deviceId]?.nudgeId ?? "", label: "Sending…" },
      }));
    },
    onSuccess: (data, { deviceId }) => {
      const childName = child?.displayName ?? "Child";
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

  // Fallback poll when Realtime is slow/missing; keyed by nudge ids only
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

  const clearCaptureFeedbackSoon = (deviceId: string, delayMs = 3000) => {
    window.setTimeout(() => {
      setCaptureFeedback((prev) => {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
    }, delayMs);
  };

  const stopCapturePoll = (deviceId: string) => {
    const timer = capturePollersRef.current[deviceId];
    if (timer) {
      window.clearInterval(timer);
      delete capturePollersRef.current[deviceId];
    }
  };

  const finishCaptureSuccess = (deviceId: string) => {
    stopCapturePoll(deviceId);
    setCaptureFeedback((prev) => ({
      ...prev,
      [deviceId]: { message: "Capture received", tone: "success" },
    }));
    showToast("Capture received", "success");
    clearCaptureFeedbackSoon(deviceId, 4000);
  };

  const finishCaptureFailure = (deviceId: string, message: string) => {
    stopCapturePoll(deviceId);
    setCaptureFeedback((prev) => ({
      ...prev,
      [deviceId]: { message, tone: "error" },
    }));
    showToast(message, "error");
    clearCaptureFeedbackSoon(deviceId, 6000);
  };

  // Bounded 1s poll fallback; Realtime snapshot:ready/failed is primary
  const watchCaptureStatus = (deviceId: string, snapshotId: string) => {
    stopCapturePoll(deviceId);

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const status = await utils.snapshot.getStatus.fetch({ snapshotId });
          if (status.status === "ready") {
            finishCaptureSuccess(deviceId);
            return;
          }
          if (status.status === "failed") {
            finishCaptureFailure(deviceId, "Capture failed");
            return;
          }
          if (Date.now() - startedAt > 20_000) {
            finishCaptureFailure(deviceId, "Timed out — try again");
          }
        } catch {
          if (Date.now() - startedAt > 20_000) {
            finishCaptureFailure(deviceId, "Timed out — try again");
          }
        }
      })();
    }, 1000);

    capturePollersRef.current[deviceId] = timer;
  };

  useEffect(() => {
    return () => {
      Object.values(capturePollersRef.current).forEach((timer) =>
        window.clearInterval(timer)
      );
      capturePollersRef.current = {};
    };
  }, []);

  const requestCapture = trpc.snapshot.requestCapture.useMutation({
    onMutate: ({ deviceId, type }) => {
      const startedMessage =
        type === "screen"
          ? "Requesting screenshot…"
          : "Requesting webcam capture…";
      setCaptureFeedback((prev) => ({
        ...prev,
        [deviceId]: { message: startedMessage, tone: "pending" },
      }));
      showToast(startedMessage);
    },
    onSuccess: (data, { deviceId, type }) => {
      const waitingMessage =
        type === "screen"
          ? "Screenshot requested — waiting for device…"
          : "Webcam capture requested — waiting for device…";
      setCaptureFeedback((prev) => ({
        ...prev,
        [deviceId]: { message: waitingMessage, tone: "pending" },
      }));
      watchCaptureStatus(deviceId, data.id);
    },
    onError: (err, { deviceId }) => {
      finishCaptureFailure(deviceId, err.message || "Capture failed");
    },
  });

  const [pairingCode, setPairingCode] = useState<PairingCodeState | null>(null);
  const [pairingNotice, setPairingNotice] = useState<string | null>(null);
  const [pairingTick, setPairingTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [editingChildName, setEditingChildName] = useState(false);
  const [childNameDraft, setChildNameDraft] = useState("");
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceNameDraft, setDeviceNameDraft] = useState("");
  const [deviceMoreOpenId, setDeviceMoreOpenId] = useState<string | null>(null);
  const [childActionsOpen, setChildActionsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const deviceMoreRef = useRef<HTMLDivElement | null>(null);
  const [policySavedAt, setPolicySavedAt] = useState<number | null>(null);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const policy = child?.policies[0];
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [allowedWindows, setAllowedWindows] = useState<AllowedWindow[] | null>(
    null
  );
  const [isActive, setIsActive] = useState<boolean | null>(null);

  const savedLimit = policy?.dailyLimitMinutes ?? 120;
  const savedWindows =
    (policy?.allowedWindows as AllowedWindow[] | undefined) ?? [];
  const savedActive = policy?.isActive ?? true;

  const currentLimit = dailyLimit ?? savedLimit;
  const currentWindows = allowedWindows ?? savedWindows;
  const currentActive = isActive ?? savedActive;

  const policyDirty =
    currentLimit !== savedLimit ||
    currentActive !== savedActive ||
    !windowsEqual(currentWindows, savedWindows);

  const showPolicySaved =
    policySavedAt !== null && Date.now() - policySavedAt < 4000 && !policyDirty;

  useEffect(() => {
    if (!policySavedAt) return;
    const timer = window.setTimeout(() => setPolicySavedAt(null), 4000);
    return () => window.clearTimeout(timer);
  }, [policySavedAt]);

  useEffect(() => {
    if (!deviceMoreOpenId || !isDesktop) return;

    const onPointerDown = (event: MouseEvent) => {
      if (
        deviceMoreRef.current &&
        !deviceMoreRef.current.contains(event.target as Node)
      ) {
        setDeviceMoreOpenId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeviceMoreOpenId(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [deviceMoreOpenId, isDesktop]);

  useEffect(() => {
    if (!pairingCode) return;

    const expiresAt = new Date(pairingCode.expiresAt).getTime();
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      setPairingCode(null);
      setPairingNotice("Pairing code expired — generate a new one");
      return;
    }

    const expireTimer = window.setTimeout(() => {
      setPairingCode(null);
      setPairingNotice("Pairing code expired — generate a new one");
    }, remaining);

    const tickTimer = window.setInterval(() => {
      setPairingTick((value) => value + 1);
    }, 1000);

    return () => {
      window.clearTimeout(expireTimer);
      window.clearInterval(tickTimer);
    };
  }, [pairingCode]);

  useEffect(() => {
    if (!pairingNotice) return;
    const timer = window.setTimeout(() => setPairingNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [pairingNotice]);

  useEffect(() => {
    if (!pairingCode || !child) return;
    const device = child.devices.find((d) => d.id === pairingCode.deviceId);
    if (device?.isPaired) {
      setPairingCode(null);
      setPairingNotice("Device paired successfully");
    }
  }, [child, pairingCode]);

  const pairingRemainingMs = useMemo(() => {
    if (!pairingCode) return 0;
    void pairingTick;
    return new Date(pairingCode.expiresAt).getTime() - Date.now();
  }, [pairingCode, pairingTick]);

  useEffect(() => {
    if (!child?.devices.length) return;
    setPendingLocks((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const device of child.devices) {
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
  }, [child?.devices]);

  const deviceIds = child?.devices.map((d) => d.id) ?? [];
  useFamilyRealtimeEvent((event) => {
    if (event.type === "nudge:seen") {
      const payload = event.payload as { nudgeId?: string } | undefined;
      if (payload?.nudgeId) {
        applyNudgeStatus(event.deviceId, payload.nudgeId, "seen");
      }
      return;
    }

    if (!deviceIds.includes(event.deviceId)) return;

    if (event.type === "snapshot:ready") {
      finishCaptureSuccess(event.deviceId);
    }
    if (event.type === "snapshot:failed") {
      const payload = event.payload as { errorMessage?: string } | undefined;
      finishCaptureFailure(
        event.deviceId,
        payload?.errorMessage || "Capture failed"
      );
    }
  });

  if (isLoading) {
    return <ChildDetailSkeleton />;
  }

  if (!child) {
    return (
      <div className="space-y-4">
        <InlineBackLink />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Child not found</p>
            <p className="text-sm mt-1">
              It may have been removed, or you don&apos;t have access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSavePolicy = () => {
    updatePolicy.mutate({
      childId,
      dailyLimitMinutes: currentLimit,
      allowedWindows: currentWindows,
      isActive: currentActive,
    });
  };

  const handleSaveSchedule = (windows: AllowedWindow[]) => {
    updatePolicy.mutate({
      childId,
      dailyLimitMinutes: currentLimit,
      allowedWindows: windows,
      isActive: currentActive,
    });
  };

  const scheduleAlsoSavingNote = (() => {
    const notes: string[] = [];
    if (currentLimit !== savedLimit) {
      notes.push(`daily limit (${currentLimit} min)`);
    }
    if (currentActive !== savedActive) {
      notes.push(`policy ${currentActive ? "on" : "off"}`);
    }
    if (notes.length === 0) return null;
    return `Also saves your unsaved ${notes.join(" and ")}`;
  })();

  const openScheduleDialog = () => {
    updatePolicy.reset();
    setScheduleDialogOpen(true);
  };

  const discardPolicyChanges = () => {
    setDailyLimit(null);
    setAllowedWindows(null);
    setIsActive(null);
    setPolicySavedAt(null);
  };

  const startRenameChild = () => {
    setChildNameDraft(child.displayName);
    setEditingChildName(true);
  };

  const saveChildName = () => {
    const next = childNameDraft.trim();
    if (!next || next === child.displayName) {
      setEditingChildName(false);
      return;
    }
    renameChild.mutate({ childId, displayName: next });
  };

  const requestDeleteChild = () => {
    setConfirmState({ type: "delete-child" });
  };

  const requestClearBonus = () => {
    if (!evaluation || evaluation.bonusMinutes <= 0) return;
    setConfirmState({ type: "clear-bonus" });
  };

  const requestDeleteDevice = (device: {
    id: string;
    displayName?: string | null;
    machineName?: string | null;
  }) => {
    setConfirmState({
      type: "delete-device",
      deviceId: device.id,
      deviceLabel: getDeviceDisplayName(device),
    });
  };

  const handleConfirmDestructive = () => {
    if (!confirmState) return;
    switch (confirmState.type) {
      case "delete-child":
        deleteChild.mutate(
          { childId },
          { onSuccess: () => setConfirmState(null) }
        );
        break;
      case "clear-bonus":
        clearBonus.mutate(
          { childId },
          { onSuccess: () => setConfirmState(null) }
        );
        break;
      case "delete-device":
        deleteDevice.mutate(
          { deviceId: confirmState.deviceId },
          { onSuccess: () => setConfirmState(null) }
        );
        break;
    }
  };

  const confirmDialogCopy = (() => {
    if (!confirmState) {
      return { title: "", description: "", confirmLabel: "Confirm", busy: false };
    }
    if (confirmState.type === "delete-child") {
      const deviceCount = child.devices.length;
      return {
        title: "Delete child?",
        description: `Delete ${child.displayName} and ${deviceCount} connected device${deviceCount === 1 ? "" : "s"}? This cannot be undone.`,
        confirmLabel: "Delete child",
        busy: deleteChild.isPending,
      };
    }
    if (confirmState.type === "clear-bonus") {
      if (!evaluation) {
        return {
          title: "",
          description: "",
          confirmLabel: "Confirm",
          busy: false,
        };
      }
      return {
        title: "Clear bonus minutes?",
        description: `Clear +${evaluation.bonusMinutes} bonus minutes for ${child.displayName}? Their daily limit returns to ${evaluation.dailyLimitMinutes} min. If they've already used more than that, devices will lock.`,
        confirmLabel: "Clear bonus",
        busy: clearBonus.isPending,
      };
    }
    return {
      title: "Remove device?",
      description: `Remove device "${confirmState.deviceLabel}"? The agent will need to be paired again to reconnect.`,
      confirmLabel: "Remove device",
      busy: deleteDevice.isPending,
    };
  })();

  const deviceMoreTarget = child.devices.find((d) => d.id === deviceMoreOpenId);

  const startRenameDevice = (device: {
    id: string;
    displayName?: string | null;
    machineName?: string | null;
  }) => {
    setEditingDeviceId(device.id);
    setDeviceNameDraft(getDeviceDisplayName(device));
  };

  const saveDeviceName = (deviceId: string) => {
    const next = deviceNameDraft.trim();
    if (!next) {
      setEditingDeviceId(null);
      return;
    }
    renameDevice.mutate({ deviceId, displayName: next });
  };

  const effectiveLimit = evaluation
    ? evaluation.dailyLimitMinutes + evaluation.bonusMinutes
    : 0;
  const dailyRemaining = evaluation?.dailyRemainingMinutes ?? 0;
  const remainingFraction =
    !evaluation || effectiveLimit <= 0
      ? 0
      : Math.min(1, Math.max(0, dailyRemaining / effectiveLimit));
  const usageFillClass =
    !evaluation ||
    evaluation.status === "blocked" ||
    remainingFraction <= 0.2
      ? "bg-destructive/35"
      : evaluation.status === "outside_window"
        ? "bg-yellow-500/35"
        : "bg-primary/30";

  const policyReach = getPolicyReach({
    dailyLimitMinutes: currentLimit,
    allowedWindows: currentWindows,
  });
  const showReachAdvisory =
    policyReach.constrainedDays.length > 0 &&
    policyReach.minWindowedCapacityMinutes !== null;
  const hasRoomierScheduledDays = new Set(
    policyReach.byDay
      .filter((d) => policyReach.constrainedDays.includes(d.day))
      .map((d) => d.capacityMinutes)
  ).size > 1;

  const evaluationStatusText = (() => {
    if (!evaluation) return null;
    if (
      evaluation.limitingFactor === "none" ||
      evaluation.remainingMinutes >= 999
    ) {
      return "Limits paused";
    }
    if (evaluation.status === "outside_window") {
      const next = evaluation.nextWindowStart;
      const daily = evaluation.dailyRemainingMinutes;
      if (next && daily > 0) {
        return `Available again: ${formatClockInText(next)} — ${daily} min of today's budget left`;
      }
      return formatClockInText(
        evaluation.message ?? getPolicyStatusLabel(evaluation.status)
      );
    }
    if (evaluation.status === "blocked") {
      return formatClockInText(
        evaluation.message ?? getPolicyStatusLabel(evaluation.status)
      );
    }
    if (evaluation.limitingFactor === "window") {
      return `${evaluation.remainingMinutes} min left now (allowed hours ending) · ${evaluation.dailyRemainingMinutes} min of daily budget left`;
    }
    return `${evaluation.remainingMinutes} min left now`;
  })();

  const renderPolicyEditor = (
    idPrefix: string,
    mode: "card" | "sheet",
    options?: { showActiveToggle?: boolean }
  ) => {
    const showActiveToggle = options?.showActiveToggle ?? true;

    return (
    <div className="space-y-4">
      {showActiveToggle && (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id={`${idPrefix}-active`}
            checked={currentActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded"
          />
          <Label htmlFor={`${idPrefix}-active`}>Policy active</Label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor={`${idPrefix}-limit`}>Daily limit</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-limit`}
            type="number"
            min={0}
            max={1440}
            step={1}
            value={currentLimit}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setDailyLimit(0);
                return;
              }
              if (!/^\d+$/.test(raw)) return;
              setDailyLimit(Math.min(1440, parseInt(raw, 10)));
            }}
            onKeyDown={(e) => {
              if (["e", "E", "+", "-", ".", ","].includes(e.key)) {
                e.preventDefault();
              }
            }}
            className="w-28 text-center tabular-nums"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-describedby={`${idPrefix}-limit-unit`}
          />
          <span
            id={`${idPrefix}-limit-unit`}
            className="text-sm text-muted-foreground"
          >
            minutes
          </span>
        </div>
      </div>

      {mode === "card" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Allowed windows</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openScheduleDialog}
            >
              Edit schedule
            </Button>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
            <AllowedWindowsSummary
              windows={currentWindows}
              aria-live="polite"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Allowed windows</Label>
          <AllowedWindowsEditor
            windows={currentWindows}
            onChange={setAllowedWindows}
          />
        </div>
      )}

      {showReachAdvisory && policyReach.minWindowedCapacityMinutes !== null && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-sm text-foreground">
            {formatReachAdvisory(
              policyReach.constrainedDays,
              policyReach.byDay,
              currentLimit
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasRoomierScheduledDays
              ? `The button below matches the daily limit to the tightest scheduled day, so days with longer windows are capped at ${policyReach.minWindowedCapacityMinutes} min too.`
              : `The button below matches the daily limit to these hours, so the full window can be used.`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDailyLimit(policyReach.minWindowedCapacityMinutes!)
            }
          >
            Set daily limit to {policyReach.minWindowedCapacityMinutes} min
          </Button>
        </div>
      )}

      {mode === "card" && (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            className="w-full sm:w-auto"
            onClick={handleSavePolicy}
            disabled={updatePolicy.isPending || !policyDirty}
          >
            {updatePolicy.isPending ? "Saving..." : "Save policy"}
          </Button>
          {policyDirty && (
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={discardPolicyChanges}
              disabled={updatePolicy.isPending}
            >
              Discard
            </Button>
          )}
        </div>
      )}
      {updatePolicy.isError && (
        <p className="text-sm text-destructive">
          {updatePolicy.error.message || "Could not save policy"}
        </p>
      )}
    </div>
    );
  };

  const renderPairingContent = () =>
    pairingCode ? (
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Enter this code in the Windows agent
        </p>
        <p className="text-4xl font-mono font-bold tracking-widest">
          {pairingCode.code}
        </p>
        <p className="text-sm font-medium tabular-nums">
          Expires in {formatCountdown(pairingRemainingMs)}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(pairingCode.expiresAt).toLocaleTimeString()}
        </p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-2 pt-1">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              void navigator.clipboard.writeText(pairingCode.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <Copy className="w-4 h-4 mr-2" />
            {copied ? "Copied!" : "Copy code"}
          </Button>
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => setPairingCode(null)}
          >
            Dismiss
          </Button>
        </div>
      </div>
    ) : null;

  async function startPairing() {
    const result = await generateCode.mutateAsync({ childId });
    setPairingNotice(null);
    setPairingCode({
      code: result.code,
      expiresAt: new Date(result.expiresAt),
      deviceId: result.deviceId,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <InlineBackLink className="mb-3" />

        {editingChildName ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveChildName();
              }}
            >
              <Input
                value={childNameDraft}
                onChange={(e) => setChildNameDraft(e.target.value)}
                className="max-w-xs text-lg font-semibold h-11"
                autoFocus
                maxLength={50}
              />
              <Button type="submit" size="sm" disabled={renameChild.isPending}>
                {renameChild.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingChildName(false)}
              >
                Cancel
              </Button>
            </form>
            <Button
              variant="destructive"
              size="sm"
              onClick={requestDeleteChild}
              disabled={deleteChild.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteChild.isPending ? "Deleting..." : "Delete child"}
            </Button>
          </div>
        ) : (
          <PageHeader
            title={child.displayName}
            action={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden min-h-11 min-w-11"
                  onClick={() => setChildActionsOpen(true)}
                  aria-label="More actions"
                  title="More actions"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
                <div className="hidden md:flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startRenameChild}
                    title="Rename child"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={requestDeleteChild}
                    disabled={deleteChild.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleteChild.isPending ? "Deleting..." : "Delete child"}
                  </Button>
                </div>
              </>
            }
          />
        )}

        {evaluation && (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-border bg-card md:mt-2 md:border-0 md:bg-transparent">
            {/* Remaining-time fill behind content (same idea as the tray usage card) */}
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500 ease-out md:hidden ${usageFillClass}`}
              style={{ width: `${remainingFraction * 100}%` }}
              aria-hidden
            />
            <div className="relative z-10 p-4 md:p-0">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  variant={
                    evaluation.status === "allowed" ? "success" : "warning"
                  }
                >
                  {getPolicyStatusLabel(evaluation.status)}
                </Badge>
                <span
                  className="text-sm text-foreground/90 md:text-muted-foreground"
                  title="Refreshes every 30s from agent heartbeats (realtime updates sooner)"
                >
                  {evaluation.usedMinutes} / {effectiveLimit} min used today
                  {evaluation.bonusMinutes > 0 &&
                    ` (+${evaluation.bonusMinutes} bonus)`}
                </span>
                {evaluation.bonusMinutes > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={requestClearBonus}
                    disabled={clearBonus.isPending}
                  >
                    {clearBonus.isPending ? "Clearing…" : "Clear bonus"}
                  </Button>
                )}
              </div>
              <div className="mt-3 max-w-md space-y-2">
                <div className="hidden h-2 w-full overflow-hidden rounded-full bg-muted md:block">
                  <div
                    className={`h-full rounded-full transition-[width] ${progressBarClass(
                      evaluation.status
                    )}`}
                    style={{ width: `${remainingFraction * 100}%` }}
                  />
                </div>
                <p className="text-sm md:text-xs text-muted-foreground">
                  {evaluationStatusText}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <Card className="order-1 flex w-full flex-col">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>
              Pair the Windows agent using a one-time code
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
            {child.devices.map((device) => {
              const pendingLock = pendingLocks[device.id];
              const effectiveAdminLock =
                pendingLock !== undefined ? pendingLock : device.adminLock;
              const feedback = captureFeedback[device.id];
              const captureBusy = feedback?.tone === "pending";

              return (
                <div
                  key={device.id}
                  className="flex min-h-[12rem] flex-1 flex-col justify-between gap-4 rounded-lg border border-border p-4 max-md:p-5 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Monitor className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        {editingDeviceId === device.id ? (
                          <form
                            className="flex flex-wrap items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveDeviceName(device.id);
                            }}
                          >
                            <Input
                              value={deviceNameDraft}
                              onChange={(e) =>
                                setDeviceNameDraft(e.target.value)
                              }
                              className="h-9 max-w-[12rem]"
                              autoFocus
                              maxLength={50}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              disabled={renameDevice.isPending}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingDeviceId(null)}
                            >
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-lg font-semibold tracking-tight">
                              {getDeviceDisplayName(device)}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 max-md:min-h-11 max-md:min-w-11 max-md:h-11"
                              onClick={() => startRenameDevice(device)}
                              title="Rename device"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        <div className="text-sm md:text-xs text-muted-foreground">
                          <p>
                            {child.displayName} Agent v
                            {device.agentVersion ?? "?"}
                          </p>
                          <p>
                            {device.lastSeenAt
                              ? new Date(device.lastSeenAt).toLocaleString()
                              : "Never connected"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-2">
                      <Badge
                        variant={device.isOnline ? "success" : "secondary"}
                      >
                        {device.isOnline ? "Online" : "Offline"}
                      </Badge>
                      {device.lastUncleanExitAt && (
                        <Badge variant="destructive">Unclean exit</Badge>
                      )}
                      {effectiveAdminLock && (
                        <Badge variant="destructive">Locked down</Badge>
                      )}
                      {pendingLock !== undefined && (
                        <Badge variant="secondary">
                          {pendingLock
                            ? "Sending lock..."
                            : "Waiting for unlock..."}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {device.lastUncleanExitAt && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                      <p>
                        Warden on this device did not shut down cleanly
                        {device.lastUncleanExitAt
                          ? ` (detected ${new Date(device.lastUncleanExitAt).toLocaleString()})`
                          : ""}
                        . That usually means Task Manager End Task, a crash, or
                        a hard power cut — not a normal Exit. It should
                        auto-relaunch within about a minute.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7"
                        disabled={dismissUncleanExit.isPending}
                        onClick={() =>
                          dismissUncleanExit.mutate({ deviceId: device.id })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 max-md:gap-3">
                    {nudgeByDevice[device.id]?.label && (
                      <span className="text-sm md:text-xs text-muted-foreground">
                        {nudgeByDevice[device.id].label}
                      </span>
                    )}
                    <div className="flex flex-col gap-2 max-md:gap-3 sm:flex-row sm:items-stretch">
                      <NudgeControls
                        className="w-full sm:w-52 sm:shrink-0"
                        disabled={
                          !device.isPaired ||
                          !device.isOnline ||
                          Boolean(nudgeByDevice[device.id]?.nudgeId)
                        }
                        isSending={
                          sendNudge.isPending &&
                          sendNudge.variables?.deviceId === device.id
                        }
                        title={
                          !device.isPaired
                            ? "Device must be paired first"
                            : !device.isOnline
                              ? "Device is offline"
                              : "Send a gentle attention nudge"
                        }
                        onSend={(message) =>
                          sendNudge.mutate({
                            deviceId: device.id,
                            message,
                          })
                        }
                      />
                      <div className="flex w-full min-w-0 items-stretch gap-2 max-md:gap-3 sm:flex-1">
                        {effectiveAdminLock ? (
                          <Button
                            variant="outline"
                            className="min-w-0 flex-1"
                            onClick={() =>
                              setAdminLock.mutate({
                                deviceId: device.id,
                                locked: false,
                              })
                            }
                          >
                            <Unlock className="mr-2 h-4 w-4" />
                            Release
                          </Button>
                        ) : (
                          <SwipeToLock
                            className="min-w-0 flex-1"
                            onConfirm={() =>
                              setAdminLock.mutate({
                                deviceId: device.id,
                                locked: true,
                              })
                            }
                            disabled={!device.isPaired}
                            pending={
                              setAdminLock.isPending &&
                              setAdminLock.variables?.deviceId === device.id &&
                              setAdminLock.variables?.locked === true
                            }
                            title={
                              !device.isPaired
                                ? "Device must be paired first"
                                : "Swipe to immediately lock this device"
                            }
                          />
                        )}

                        <div
                          className="relative shrink-0"
                          ref={
                            deviceMoreOpenId === device.id
                              ? deviceMoreRef
                              : undefined
                          }
                        >
                          <Button
                            variant="outline"
                            className="px-3 max-md:min-w-11"
                            onClick={() =>
                              setDeviceMoreOpenId((prev) =>
                                prev === device.id ? null : device.id
                              )
                            }
                            aria-expanded={deviceMoreOpenId === device.id}
                            aria-haspopup="menu"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">More</span>
                          </Button>
                          {isDesktop && deviceMoreOpenId === device.id && (
                            <div
                              role="menu"
                              className="absolute right-0 z-20 mt-1.5 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
                            >
                              {device.isOnline && isSupabaseConfigured() && (
                                <>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-secondary disabled:opacity-50"
                                    disabled={captureBusy}
                                    onClick={() => {
                                      setDeviceMoreOpenId(null);
                                      requestCapture.mutate({
                                        deviceId: device.id,
                                        type: "screen",
                                      });
                                    }}
                                  >
                                    <Camera className="w-4 h-4 text-muted-foreground" />
                                    Screenshot
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-secondary disabled:opacity-50"
                                    disabled={captureBusy}
                                    onClick={() => {
                                      setDeviceMoreOpenId(null);
                                      requestCapture.mutate({
                                        deviceId: device.id,
                                        type: "webcam",
                                      });
                                    }}
                                  >
                                    <Video className="w-4 h-4 text-muted-foreground" />
                                    Webcam
                                  </button>
                                  <div className="my-1 border-t border-border" />
                                </>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-secondary disabled:opacity-50"
                                disabled={deleteDevice.isPending}
                                onClick={() => {
                                  setDeviceMoreOpenId(null);
                                  requestDeleteDevice(device);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove device
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {feedback?.tone === "pending" && (
                    <p
                      className={`text-xs ${captureToneClass(feedback.tone)}`}
                      role="status"
                    >
                      {feedback.message}
                    </p>
                  )}
                </div>
              );
            })}
            </div>

            {pairingCode ? (
              <div className="hidden md:block p-4 rounded-lg bg-primary/10 border border-primary/30">
                {renderPairingContent()}
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full max-md:mt-1 sm:w-auto"
                onClick={() => void startPairing()}
                disabled={generateCode.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {generateCode.isPending
                  ? "Generating..."
                  : "Generate pairing code"}
              </Button>
            )}

            <div className="hidden space-y-2 border-t border-border pt-4 md:block">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={
                  !INSTALLER_DOWNLOAD_ENABLED ||
                  !latestRelease?.downloadUrl ||
                  latestReleaseLoading
                }
                onClick={() => {
                  if (
                    !INSTALLER_DOWNLOAD_ENABLED ||
                    !latestRelease?.downloadUrl
                  ) {
                    return;
                  }
                  window.open(
                    latestRelease.downloadUrl,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
                title={
                  !INSTALLER_DOWNLOAD_ENABLED
                    ? "Temporarily unavailable"
                    : latestRelease
                      ? `Download Warden ${latestRelease.version} for Windows`
                      : "Installer not published yet"
                }
              >
                <Download className="w-4 h-4 mr-2" />
                Download for Windows
              </Button>
              {!INSTALLER_DOWNLOAD_ENABLED ? (
                <p className="text-xs text-muted-foreground">
                  Temporarily unavailable
                </p>
              ) : latestReleaseLoading ? (
                <p className="text-xs text-muted-foreground">
                  Checking for installer…
                </p>
              ) : latestRelease ? (
                <p className="text-xs text-muted-foreground">
                  v{latestRelease.version}
                  {latestRelease.sizeBytes > 0
                    ? ` · ~${(latestRelease.sizeBytes / (1024 * 1024)).toFixed(0)} MB`
                    : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Installer not published yet
                </p>
              )}
            </div>

            {pairingNotice && (
              <p
                className={`text-sm text-center ${
                  pairingNotice.includes("successfully")
                    ? "text-green-400"
                    : "text-muted-foreground"
                }`}
                role="status"
              >
                {pairingNotice}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="order-2 flex w-full flex-col">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>Screen time policy</CardTitle>
                <CardDescription>
                  Set daily limits and allowed time windows
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="hidden items-center gap-2 md:flex">
                  <input
                    type="checkbox"
                    id="desktop-header-active"
                    checked={currentActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="desktop-header-active">Policy active</Label>
                </div>
                {policyDirty ? (
                  <Badge variant="warning">Unsaved changes</Badge>
                ) : showPolicySaved ? (
                  <Badge variant="success">
                    <Check className="w-3 h-3 mr-1" />
                    Saved
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground md:hidden">
              <p>
                <span className="text-foreground font-medium">
                  {currentLimit} min/day
                </span>
                {currentActive ? "" : " · policy off"}
              </p>
              <AllowedWindowsSummary
                windows={currentWindows}
                className="mt-0.5"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full md:hidden"
              onClick={() => setPolicyEditorOpen(true)}
            >
              <ChevronDown className="w-4 h-4 mr-2" />
              Edit limits
            </Button>

            <div className="hidden md:block space-y-4">
              {renderPolicyEditor("desktop", "card", {
                showActiveToggle: false,
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <RecentActivityCard
          items={activity}
          hideChildName
          emptyDescription="Nudges, lockdowns, captures, and policy changes for this child will show here"
        />
      </div>

      <BottomSheet
        open={policyEditorOpen}
        onClose={() => setPolicyEditorOpen(false)}
        title="Edit limits"
        description="Daily limit and allowed time windows"
        showDone={false}
        footer={
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              onClick={handleSavePolicy}
              disabled={updatePolicy.isPending || !policyDirty}
            >
              {updatePolicy.isPending ? "Saving..." : "Save policy"}
            </Button>
            {policyDirty ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={discardPolicyChanges}
                disabled={updatePolicy.isPending}
              >
                Discard
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setPolicyEditorOpen(false)}
              >
                Done
              </Button>
            )}
          </div>
        }
      >
        <div className="mb-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              {currentLimit} min/day
            </span>
            {currentActive ? "" : " · policy off"}
          </p>
          <AllowedWindowsSummary
            windows={currentWindows}
            className="mt-0.5"
          />
        </div>
        {renderPolicyEditor("sheet", "sheet")}
      </BottomSheet>

      <AllowedWindowsDialog
        open={scheduleDialogOpen}
        windows={currentWindows}
        onSave={handleSaveSchedule}
        onClose={() => setScheduleDialogOpen(false)}
        saving={updatePolicy.isPending}
        errorMessage={
          scheduleDialogOpen && updatePolicy.isError
            ? updatePolicy.error.message || "Could not save schedule"
            : null
        }
        alsoSavingNote={scheduleAlsoSavingNote}
      />

      <BottomSheet
        open={Boolean(pairingCode)}
        onClose={() => setPairingCode(null)}
        title="Pairing code"
        description="Enter this code in the Windows agent"
      >
        {renderPairingContent()}
      </BottomSheet>

      <BottomSheet
        open={childActionsOpen}
        onClose={() => setChildActionsOpen(false)}
        title={child.displayName}
        showDone={false}
      >
        <div className="flex flex-col gap-3 pb-1">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-3 max-md:min-h-14"
            onClick={() => {
              setChildActionsOpen(false);
              startRenameChild();
            }}
          >
            <Pencil className="h-5 w-5" />
            Rename
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-start gap-3 max-md:min-h-14"
            disabled={deleteChild.isPending}
            onClick={() => {
              setChildActionsOpen(false);
              requestDeleteChild();
            }}
          >
            <Trash2 className="h-5 w-5" />
            Delete child
          </Button>
        </div>
      </BottomSheet>

      {deviceMoreTarget && (
        <BottomSheet
          open={!isDesktop && deviceMoreOpenId === deviceMoreTarget.id}
          onClose={() => setDeviceMoreOpenId(null)}
          title={getDeviceDisplayName(deviceMoreTarget)}
          showDone={false}
        >
          <div className="flex flex-col gap-3 pb-1">
            {deviceMoreTarget.isOnline && isSupabaseConfigured() && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-3 max-md:min-h-14"
                  disabled={
                    captureFeedback[deviceMoreTarget.id]?.tone === "pending"
                  }
                  onClick={() => {
                    setDeviceMoreOpenId(null);
                    requestCapture.mutate({
                      deviceId: deviceMoreTarget.id,
                      type: "screen",
                    });
                  }}
                >
                  <Camera className="h-5 w-5" />
                  Screenshot
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-3 max-md:min-h-14"
                  disabled={
                    captureFeedback[deviceMoreTarget.id]?.tone === "pending"
                  }
                  onClick={() => {
                    setDeviceMoreOpenId(null);
                    requestCapture.mutate({
                      deviceId: deviceMoreTarget.id,
                      type: "webcam",
                    });
                  }}
                >
                  <Video className="h-5 w-5" />
                  Webcam
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="destructive"
              className="w-full justify-start gap-3 max-md:min-h-14"
              disabled={deleteDevice.isPending}
              onClick={() => {
                setDeviceMoreOpenId(null);
                requestDeleteDevice(deviceMoreTarget);
              }}
            >
              <Trash2 className="h-5 w-5" />
              Remove device
            </Button>
          </div>
        </BottomSheet>
      )}

      <ConfirmDialog
        open={confirmState !== null}
        onClose={() => setConfirmState(null)}
        title={confirmDialogCopy.title}
        description={confirmDialogCopy.description}
        confirmLabel={confirmDialogCopy.confirmLabel}
        busy={confirmDialogCopy.busy}
        onConfirm={handleConfirmDestructive}
      />
    </div>
  );
}
