"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useFamilyRealtimeEvent } from "@/lib/family-realtime";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { OverviewSkeleton } from "@/components/dashboard-skeletons";
import {
  Monitor,
  AlertCircle,
  Unlock,
  Users,
  Clock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NudgeControls } from "@/components/nudge-controls";
import { SwipeToLock } from "@/components/swipe-to-lock";
import { RecentActivityCard } from "@/components/recent-activity-card";
import {
  getDeviceDisplayName,
  getPolicyStatusLabel,
  type PolicyStatus,
} from "@warden/shared";
import { formatClockInText } from "@/lib/time-format";
import {
  optimisticAdminLock,
  rollbackAdminLock,
} from "@/lib/device-cache";
import { POLL_HEARTBEAT_MS } from "@/lib/query-defaults";

function remainingPercent(remaining: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((remaining / limit) * 100));
}

function progressBarClass(status: PolicyStatus) {
  if (status === "blocked") return "bg-destructive";
  if (status === "outside_window") return "bg-yellow-500";
  return "bg-primary";
}

function statusBadgeVariant(status: PolicyStatus) {
  if (status === "allowed") return "success" as const;
  if (status === "blocked") return "destructive" as const;
  return "warning" as const;
}

export default function DashboardOverviewPage() {
  const utils = trpc.useUtils();
  const { data: overview, isLoading } = trpc.dashboard.overview.useQuery(
    undefined,
    {
      // Online / usage follow heartbeats; Realtime covers lock/policy/extension
      refetchInterval: POLL_HEARTBEAT_MS,
    }
  );
  const { data: activity } = trpc.dashboard.activity.useQuery(
    { limit: 20 },
    { refetchInterval: POLL_HEARTBEAT_MS }
  );
  const [pendingLocks, setPendingLocks] = useState<
    Record<string, boolean | undefined>
  >({});
  const [nudgeByDevice, setNudgeByDevice] = useState<
    Record<string, { nudgeId: string; label: string }>
  >({});

  const setAdminLock = trpc.device.setAdminLock.useMutation({
    onMutate: async ({ deviceId, locked }) => {
      setPendingLocks((prev) => ({ ...prev, [deviceId]: locked }));
      return optimisticAdminLock(utils, deviceId, locked);
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
      void utils.dashboard.overview.invalidate();
      void utils.dashboard.activity.invalidate();
      void utils.device.list.invalidate();
      void utils.children.list.invalidate();
    },
  });

  const sendNudge = trpc.device.sendNudge.useMutation({
    onMutate: ({ deviceId }) => {
      setNudgeByDevice((prev) => ({
        ...prev,
        [deviceId]: { nudgeId: prev[deviceId]?.nudgeId ?? "", label: "Sending…" },
      }));
    },
    onSuccess: (data, { deviceId }) => {
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

  const devices = overview?.children.flatMap((child) => child.devices) ?? [];

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

  useEffect(() => {
    if (!overview?.children.length) return;
    setPendingLocks((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const child of overview.children) {
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
      }

      return changed ? next : prev;
    });
  }, [overview]);

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  const children = overview?.children ?? [];
  const pendingRequests = overview?.pendingRequests ?? 0;
  const onlineCount = devices.filter((d) => d.isOnline).length;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Desktop title — mobile uses fixed top bar page title */}
      <div className="hidden md:block">
        <PageHeader
          title="Dashboard"
          description="Screen time, device status, and lockdowns at a glance"
        />
      </div>

      {pendingRequests > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {pendingRequests} extension request
                  {pendingRequests === 1 ? "" : "s"} waiting
                </p>
                <p className="text-sm text-muted-foreground">
                  Review and approve or deny extra screen time
                </p>
              </div>
            </div>
            <Link href="/dashboard/extensions" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto" variant="outline">
                Review requests
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Mobile compact stats strip */}
      <div className="md:hidden grid grid-cols-3 gap-2.5">
        <Link href="/dashboard/children" className="block">
          <Card className="h-full p-3.5">
            <p className="text-xs text-muted-foreground truncate">Children</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              {children.length}
            </p>
          </Card>
        </Link>
        <Card className="h-full p-3.5">
          <p className="text-xs text-muted-foreground truncate">Online</p>
          <p className="text-xl font-semibold tabular-nums mt-0.5">
            {onlineCount}
            <span className="text-sm text-muted-foreground font-normal">
              /{devices.length}
            </span>
          </p>
        </Card>
        <Link href="/dashboard/extensions" className="block">
          <Card className="h-full p-3.5">
            <p className="text-xs text-muted-foreground truncate">Requests</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              {pendingRequests}
            </p>
          </Card>
        </Link>
      </div>

      {/* Desktop summary cards */}
      <div className="hidden md:grid md:grid-cols-3 gap-4">
        <Link href="/dashboard/children" className="block group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="relative mb-0">
              <div className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <CardDescription>Children</CardDescription>
              <CardTitle className="text-3xl">{children.length}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Card>
          <CardHeader className="relative mb-0">
            <div className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <CardDescription>Devices online</CardDescription>
            <CardTitle className="text-3xl">
              {onlineCount}
              <span className="text-lg text-muted-foreground font-normal">
                /{devices.length}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Link href="/dashboard/extensions" className="block group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="relative mb-0">
              <div className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <CardDescription>Pending requests</CardDescription>
              <CardTitle className="text-3xl">{pendingRequests}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Children</h2>
          <Link
            href="/dashboard/children"
            className="text-sm text-primary hover:underline"
          >
            Manage
          </Link>
        </div>

        {children.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="mb-1">No children yet.</p>
              <p className="text-sm mb-4">
                Add a child, then pair their PC with Warden.
              </p>
              <Link href="/dashboard/children">
                <Button className="w-full sm:w-auto">Add a child</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-md:gap-5">
            {children.map((child) => {
              const { evaluation } = child;
              const effectiveLimit =
                evaluation.dailyLimitMinutes + evaluation.bonusMinutes;
              const percent = remainingPercent(
                evaluation.dailyRemainingMinutes,
                effectiveLimit
              );
              const onlineDevices = child.devices.filter((d) => d.isOnline)
                .length;

              const statusText =
                evaluation.limitingFactor === "none" ||
                evaluation.remainingMinutes >= 999
                  ? "Limits paused"
                  : evaluation.status === "outside_window"
                    ? evaluation.nextWindowStart &&
                      evaluation.dailyRemainingMinutes > 0
                      ? `Available again: ${formatClockInText(evaluation.nextWindowStart)} — ${evaluation.dailyRemainingMinutes} min of today's budget left`
                      : formatClockInText(
                          evaluation.message ??
                            getPolicyStatusLabel(evaluation.status)
                        )
                    : evaluation.status === "blocked"
                      ? formatClockInText(
                          evaluation.message ??
                            getPolicyStatusLabel(evaluation.status)
                        )
                      : evaluation.limitingFactor === "window"
                        ? `${evaluation.remainingMinutes} min left now (allowed hours ending) · ${evaluation.dailyRemainingMinutes} min of daily budget left`
                        : `${evaluation.remainingMinutes} min left now`;

              return (
                <Card key={child.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate">
                          {child.displayName}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {child.devices.length === 0
                            ? "No devices paired"
                            : `${onlineDevices}/${child.devices.length} device${
                                child.devices.length === 1 ? "" : "s"
                              } online`}
                        </CardDescription>
                      </div>
                      <Badge variant={statusBadgeVariant(evaluation.status)}>
                        {getPolicyStatusLabel(evaluation.status)}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">
                          Today&apos;s screen time
                        </span>
                        <span className="font-medium tabular-nums">
                          {evaluation.usedMinutes} / {effectiveLimit} min
                          {evaluation.bonusMinutes > 0 && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              (+{evaluation.bonusMinutes})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2.5 md:h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-[width] ${progressBarClass(
                            evaluation.status
                          )}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="text-sm md:text-xs text-muted-foreground">
                        {statusText}
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 max-md:space-y-4">
                    {child.devices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Pair a device from this child&apos;s page to monitor
                        usage and lockdown.
                      </p>
                    ) : (
                      child.devices.map((device) => {
                        const pendingLock = pendingLocks[device.id];
                        const effectiveAdminLock =
                          pendingLock !== undefined
                            ? pendingLock
                            : device.adminLock;

                        return (
                          <div
                            key={device.id}
                            className="space-y-2.5 max-md:space-y-3 rounded-lg border border-border/60 px-3 py-2.5 max-md:px-4 max-md:py-3"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {getDeviceDisplayName(device)}
                              </span>
                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                                <Badge
                                  variant={
                                    device.isOnline ? "success" : "secondary"
                                  }
                                >
                                  {device.isOnline ? "Online" : "Offline"}
                                </Badge>
                                {device.isLocked && !effectiveAdminLock && (
                                  <Badge variant="secondary">Locked</Badge>
                                )}
                                {effectiveAdminLock && (
                                  <Badge variant="destructive">
                                    Locked down
                                  </Badge>
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
                                {effectiveAdminLock ? (
                                  <Button
                                    variant="outline"
                                    className="w-full min-w-0 sm:flex-1"
                                    onClick={() =>
                                      setAdminLock.mutate({
                                        deviceId: device.id,
                                        locked: false,
                                      })
                                    }
                                  >
                                    <Unlock className="mr-1.5 h-4 w-4" />
                                    Release
                                  </Button>
                                ) : (
                                  <SwipeToLock
                                    className="w-full min-w-0 sm:flex-1"
                                    onConfirm={() =>
                                      setAdminLock.mutate({
                                        deviceId: device.id,
                                        locked: true,
                                      })
                                    }
                                    disabled={!device.isPaired}
                                    pending={
                                      setAdminLock.isPending &&
                                      setAdminLock.variables?.deviceId ===
                                        device.id &&
                                      setAdminLock.variables?.locked === true
                                    }
                                    title={
                                      !device.isPaired
                                        ? "Device must be paired first"
                                        : "Swipe to immediately lock this device"
                                    }
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}

                    <Link
                      href={`/dashboard/children/${child.id}`}
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      Manage {child.displayName}
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Recent activity</h2>
        </div>
        <RecentActivityCard items={activity} />
      </div>
    </div>
  );
}
