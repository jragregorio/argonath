"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useFamilyRealtime } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { AllowedWindow } from "@warden/shared";
import { getDeviceDisplayName, getPolicyStatusLabel } from "@warden/shared";
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Lock,
  Monitor,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  Video,
  ChevronDown,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/dev-config";
import {
  optimisticAdminLock,
  rollbackAdminLock,
} from "@/lib/device-cache";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AllowedWindowsEditor } from "@/components/allowed-windows-editor";

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

function windowsEqual(a: AllowedWindow[], b: AllowedWindow[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (window, i) =>
      window.day === b[i].day &&
      window.start === b[i].start &&
      window.end === b[i].end
  );
}

function formatWindowsSummary(windows: AllowedWindow[]) {
  if (windows.length === 0) {
    return "Allowed any time (within daily limit)";
  }

  const byRange = new Map<string, number[]>();
  for (const window of windows) {
    const key = `${window.start}–${window.end}`;
    const days = byRange.get(key) ?? [];
    days.push(window.day);
    byRange.set(key, days);
  }

  return [...byRange.entries()]
    .map(([range, days]) => {
      const labels = days
        .sort((a, b) => a - b)
        .map(
          (day) => DAYS.find((d) => d.value === day)?.label ?? `Day ${day}`
        );
      return `${labels.join(", ")} ${range}`;
    })
    .join(" · ");
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

  const { data: child, isLoading } = trpc.children.get.useQuery(
    { childId },
    { refetchInterval: 5000 }
  );
  const { data: evaluation } = trpc.policy.getEvaluation.useQuery(
    { childId },
    { refetchInterval: 10_000 }
  );
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
  const setAdminLock = trpc.device.setAdminLock.useMutation({
    onMutate: async ({ deviceId, locked }) => {
      setPendingLocks((prev) => ({ ...prev, [deviceId]: locked }));
      return optimisticAdminLock(utils, deviceId, locked, childId);
    },
    onError: (_err, vars, context) => {
      rollbackAdminLock(utils, context);
      setPendingLocks((prev) => {
        const next = { ...prev };
        delete next[vars.deviceId];
        return next;
      });
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
      // #region agent log
      fetch('http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8f2974'},body:JSON.stringify({sessionId:'8f2974',location:'children/[id]/page.tsx:sendNudge',message:'nudge created',data:{deviceId,nudgeId:data.id,expiresAt:data.expiresAt,autoDismissSeconds:data.autoDismissSeconds,status:data.status},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setNudgeByDevice((prev) => ({
        ...prev,
        [deviceId]: { nudgeId: data.id, label: "Waiting…" },
      }));
      void utils.dashboard.activity.invalidate();
    },
    onError: (err, { deviceId }) => {
      setNudgeByDevice((prev) => ({
        ...prev,
        [deviceId]: { nudgeId: "", label: err.message },
      }));
    },
  });

  useEffect(() => {
    const active = Object.entries(nudgeByDevice).filter(([, v]) => v.nudgeId);
    if (active.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      for (const [deviceId, state] of active) {
        try {
          const nudge = await utils.device.getNudge.fetch({
            nudgeId: state.nudgeId,
          });
          if (cancelled) return;

          // #region agent log
          fetch('http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8f2974'},body:JSON.stringify({sessionId:'8f2974',location:'children/[id]/page.tsx:poll',message:'getNudge poll',data:{deviceId,nudgeId:state.nudgeId,status:nudge.status,response:nudge.response,expiresAt:nudge.expiresAt,createdAt:nudge.createdAt,msToExpiry:nudge.expiresAt?new Date(nudge.expiresAt).getTime()-Date.now():null},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
          // #endregion

          let label = state.label;
          if (nudge.status === "delivered") label = "Delivered";
          else if (nudge.status === "seen") {
            label =
              nudge.response === "on_my_way" ? "Seen · On my way" : "Seen · OK";
          } else if (nudge.status === "expired") label = "Expired";
          else if (nudge.status === "pending") label = "Waiting…";

          setNudgeByDevice((prev) => {
            const cur = prev[deviceId];
            if (!cur || cur.nudgeId !== state.nudgeId || cur.label === label) {
              return prev;
            }
            return { ...prev, [deviceId]: { ...cur, label } };
          });

          if (nudge.status === "seen" || nudge.status === "expired") {
            window.setTimeout(() => {
              setNudgeByDevice((prev) => {
                const cur = prev[deviceId];
                if (!cur || cur.nudgeId !== state.nudgeId) return prev;
                const next = { ...prev };
                delete next[deviceId];
                return next;
              });
            }, 5000);
          }
        } catch {
          // Keep last label.
        }
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [nudgeByDevice, utils.device.getNudge]);

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
    void utils.snapshot.list.invalidate();
    clearCaptureFeedbackSoon(deviceId, 4000);
  };

  const finishCaptureFailure = (deviceId: string, message: string) => {
    stopCapturePoll(deviceId);
    setCaptureFeedback((prev) => ({
      ...prev,
      [deviceId]: { message, tone: "error" },
    }));
    clearCaptureFeedbackSoon(deviceId, 6000);
  };

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
      setCaptureFeedback((prev) => ({
        ...prev,
        [deviceId]: {
          message:
            type === "screen"
              ? "Requesting screenshot…"
              : "Requesting webcam capture…",
          tone: "pending",
        },
      }));
    },
    onSuccess: (data, { deviceId, type }) => {
      setCaptureFeedback((prev) => ({
        ...prev,
        [deviceId]: {
          message:
            type === "screen"
              ? "Screenshot requested — waiting for device…"
              : "Webcam capture requested — waiting for device…",
          tone: "pending",
        },
      }));
      watchCaptureStatus(deviceId, data.id);
      void utils.snapshot.list.invalidate();
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
  const [policySavedAt, setPolicySavedAt] = useState<number | null>(null);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);

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
    if (device?.deviceToken) {
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
  useFamilyRealtime(deviceIds, (event) => {
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
    void utils.children.get.invalidate({ childId });
    void utils.policy.getEvaluation.invalidate({ childId });
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-5 w-64 max-w-full" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56 max-w-full mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-9 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/children"
          className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>
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

  const confirmDeleteChild = () => {
    const deviceCount = child.devices.length;
    const ok = window.confirm(
      `Delete ${child.displayName} and ${deviceCount} connected device${deviceCount === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (ok) deleteChild.mutate({ childId });
  };

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

  const confirmDeleteDevice = (device: {
    id: string;
    displayName?: string | null;
    machineName?: string | null;
  }) => {
    const label = getDeviceDisplayName(device);
    const ok = window.confirm(
      `Remove device "${label}"? The agent will need to be paired again to reconnect.`
    );
    if (ok) deleteDevice.mutate({ deviceId: device.id });
  };

  const effectiveLimit = evaluation
    ? evaluation.dailyLimitMinutes + evaluation.bonusMinutes
    : 0;
  const remainingFraction =
    !evaluation || effectiveLimit <= 0
      ? 0
      : Math.min(
          1,
          Math.max(0, evaluation.remainingMinutes / effectiveLimit)
        );
  const usageFillClass =
    !evaluation ||
    evaluation.status !== "allowed" ||
    remainingFraction <= 0.2
      ? "bg-destructive/35"
      : "bg-primary/30";

  const renderPolicyEditor = (
    idPrefix: string,
    windowsExpanded = false
  ) => (
    <div className="space-y-4">
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

      <div>
        <Label htmlFor={`${idPrefix}-limit`}>Daily limit (minutes)</Label>
        <Input
          id={`${idPrefix}-limit`}
          type="number"
          min={0}
          max={1440}
          value={currentLimit}
          onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
          className="mt-1"
        />
      </div>

      <AllowedWindowsEditor
        windows={currentWindows}
        onChange={setAllowedWindows}
        defaultExpanded={windowsExpanded}
      />

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
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
      {updatePolicy.isError && (
        <p className="text-sm text-destructive">
          {updatePolicy.error.message || "Could not save policy"}
        </p>
      )}
    </div>
  );

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
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/children"
          className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>

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
              onClick={confirmDeleteChild}
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
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={confirmDeleteChild}
                  disabled={deleteChild.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleteChild.isPending ? "Deleting..." : "Delete child"}
                </Button>
              </div>
            }
          />
        )}

        {evaluation && (
          <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-card md:mt-2 md:border-0 md:bg-transparent">
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
                <span className="text-sm text-foreground/90 md:text-muted-foreground">
                  {evaluation.usedMinutes} / {effectiveLimit} min used today
                  {evaluation.bonusMinutes > 0 &&
                    ` (+${evaluation.bonusMinutes} bonus)`}
                </span>
                <span className="hidden md:inline text-xs text-muted-foreground">
                  Refreshes every 10s from agent heartbeats
                </span>
              </div>
              {evaluation.status === "allowed" ? (
                <p className="text-sm text-muted-foreground mt-2 md:hidden">
                  {evaluation.remainingMinutes} min remaining today
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-2 md:hidden">
                  {evaluation.message ??
                    getPolicyStatusLabel(evaluation.status)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card className="order-2 self-start w-full">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Screen time policy</CardTitle>
                <CardDescription>
                  Set daily limits and allowed time windows
                </CardDescription>
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
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground font-medium">
                  {currentLimit} min/day
                </span>
                {currentActive ? "" : " · policy off"}
              </p>
              <p className="mt-0.5">{formatWindowsSummary(currentWindows)}</p>
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
              {renderPolicyEditor("desktop")}
            </div>
          </CardContent>
        </Card>

        <Card className="order-1 self-start w-full">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>
              Pair the Windows agent using a one-time code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {child.devices.map((device) => {
              const pendingLock = pendingLocks[device.id];
              const effectiveAdminLock =
                pendingLock !== undefined ? pendingLock : device.adminLock;
              const feedback = captureFeedback[device.id];
              const captureBusy = feedback?.tone === "pending";

              return (
                <div
                  key={device.id}
                  className="flex flex-col gap-3 p-3 rounded-lg border border-border"
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
                            <p className="font-medium truncate">
                              {getDeviceDisplayName(device)}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => startRenameDevice(device)}
                              title="Rename device"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {device.machineName &&
                          device.displayName &&
                          device.machineName !== device.displayName
                            ? `${device.machineName} · `
                            : ""}
                          Agent v{device.agentVersion ?? "?"} ·{" "}
                          {device.lastSeenAt
                            ? `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                            : "Never connected"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={device.isOnline ? "success" : "secondary"}
                      >
                        {device.isOnline ? "Online" : "Offline"}
                      </Badge>
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

                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
                    {nudgeByDevice[device.id]?.label && (
                      <span className="text-xs text-muted-foreground sm:mr-1">
                        {nudgeByDevice[device.id].label}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => sendNudge.mutate({ deviceId: device.id })}
                      disabled={
                        !device.deviceToken ||
                        !device.isOnline ||
                        Boolean(nudgeByDevice[device.id]?.nudgeId) ||
                        sendNudge.isPending
                      }
                      title={
                        !device.deviceToken
                          ? "Device must be paired first"
                          : !device.isOnline
                            ? "Device is offline"
                            : "Send a gentle attention nudge"
                      }
                    >
                      <Bell className="w-4 h-4 mr-2" />
                      Nudge
                    </Button>
                    {effectiveAdminLock ? (
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          setAdminLock.mutate({
                            deviceId: device.id,
                            locked: false,
                          })
                        }
                      >
                        <Unlock className="w-4 h-4 mr-2" />
                        Release lockdown
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          setAdminLock.mutate({
                            deviceId: device.id,
                            locked: true,
                          })
                        }
                        disabled={!device.deviceToken}
                        title={
                          !device.deviceToken
                            ? "Device must be paired first"
                            : "Immediately lock this device"
                        }
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Lock down
                      </Button>
                    )}

                    {device.isOnline && isSupabaseConfigured() && (
                      <>
                        <Button
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            requestCapture.mutate({
                              deviceId: device.id,
                              type: "screen",
                            })
                          }
                          disabled={captureBusy}
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Screenshot
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            requestCapture.mutate({
                              deviceId: device.id,
                              type: "webcam",
                            })
                          }
                          disabled={captureBusy}
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Webcam
                        </Button>
                      </>
                    )}

                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => confirmDeleteDevice(device)}
                      disabled={deleteDevice.isPending}
                      title="Remove device"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                  {feedback && (
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

            {pairingCode ? (
              <div className="hidden md:block p-4 rounded-lg bg-primary/10 border border-primary/30">
                {renderPairingContent()}
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void startPairing()}
                disabled={generateCode.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {generateCode.isPending
                  ? "Generating..."
                  : "Generate pairing code"}
              </Button>
            )}

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
      </div>

      <BottomSheet
        open={policyEditorOpen}
        onClose={() => setPolicyEditorOpen(false)}
        title="Edit limits"
        description="Daily limit and allowed time windows"
      >
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground mb-4">
          <p>
            <span className="text-foreground font-medium">
              {currentLimit} min/day
            </span>
            {currentActive ? "" : " · policy off"}
          </p>
          <p className="mt-0.5">{formatWindowsSummary(currentWindows)}</p>
        </div>
        {renderPolicyEditor("sheet", false)}
      </BottomSheet>

      <BottomSheet
        open={Boolean(pairingCode)}
        onClose={() => setPairingCode(null)}
        title="Pairing code"
        description="Enter this code in the Windows agent"
      >
        {renderPairingContent()}
      </BottomSheet>
    </div>
  );
}
