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
  Lock,
  Unlock,
  Users,
  Clock,
  ArrowRight,
  Activity,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getDeviceDisplayName,
  getPolicyStatusLabel,
  type PolicyStatus,
} from "@warden/shared";
import {
  optimisticAdminLock,
  rollbackAdminLock,
} from "@/lib/device-cache";
import {
  formatActivityDetail,
  getActivityLabel,
} from "@/lib/activity";
import { POLL_SAFETY_MS } from "@/lib/query-defaults";

function usagePercent(used: number, limit: number) {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
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
      // Covered by lock / policy / extension / device:online Realtime events
      refetchInterval: POLL_SAFETY_MS,
    }
  );
  const { data: activity } = trpc.dashboard.activity.useQuery(
    { limit: 20 },
    { refetchInterval: POLL_SAFETY_MS }
  );
  const [pendingLocks, setPendingLocks] = useState<
    Record<string, boolean | undefined>
  >({});
  const [showAllActivity, setShowAllActivity] = useState(false);
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
  const activityItems = activity ?? [];
  const visibleActivity = showAllActivity
    ? activityItems
    : activityItems.slice(0, 5);

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
      <div className="md:hidden grid grid-cols-3 gap-2">
        <Link href="/dashboard/children" className="block">
          <Card className="h-full p-3">
            <p className="text-[11px] text-muted-foreground truncate">Children</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              {children.length}
            </p>
          </Card>
        </Link>
        <Card className="h-full p-3">
          <p className="text-[11px] text-muted-foreground truncate">Online</p>
          <p className="text-xl font-semibold tabular-nums mt-0.5">
            {onlineCount}
            <span className="text-sm text-muted-foreground font-normal">
              /{devices.length}
            </span>
          </p>
        </Card>
        <Link href="/dashboard/extensions" className="block">
          <Card className="h-full p-3">
            <p className="text-[11px] text-muted-foreground truncate">Requests</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {children.map((child) => {
              const { evaluation } = child;
              const effectiveLimit =
                evaluation.dailyLimitMinutes + evaluation.bonusMinutes;
              const percent = usagePercent(
                evaluation.usedMinutes,
                effectiveLimit
              );
              const onlineDevices = child.devices.filter((d) => d.isOnline)
                .length;

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
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-[width] ${progressBarClass(
                            evaluation.status
                          )}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {evaluation.status === "allowed"
                          ? `${evaluation.remainingMinutes} min remaining`
                          : evaluation.message ??
                            getPolicyStatusLabel(evaluation.status)}
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
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
                            className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center"
                          >
                            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                              <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate min-w-0 flex-1">
                                {getDeviceDisplayName(device)}
                              </span>
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
                            <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
                              {nudgeByDevice[device.id]?.label && (
                                <span className="text-xs text-muted-foreground sm:text-right">
                                  {nudgeByDevice[device.id].label}
                                </span>
                              )}
                              <Button
                                variant="attention"
                                className="w-full sm:w-auto"
                                onClick={() =>
                                  sendNudge.mutate({ deviceId: device.id })
                                }
                                disabled={
                                  !device.isPaired ||
                                  !device.isOnline ||
                                  Boolean(nudgeByDevice[device.id]?.nudgeId) ||
                                  (sendNudge.isPending &&
                                    sendNudge.variables?.deviceId ===
                                      device.id)
                                }
                                title={
                                  !device.isPaired
                                    ? "Device must be paired first"
                                    : !device.isOnline
                                      ? "Device is offline"
                                      : "Send a gentle attention nudge"
                                }
                              >
                                <Bell className="w-4 h-4 mr-1.5" />
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
                                  <Unlock className="w-4 h-4 mr-1.5" />
                                  Release
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
                                  disabled={!device.isPaired}
                                  title={
                                    !device.isPaired
                                      ? "Device must be paired first"
                                      : undefined
                                  }
                                >
                                  <Lock className="w-4 h-4 mr-1.5" />
                                  Lock down
                                </Button>
                              )}
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
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Recent activity</h2>
        </div>

        {!activity || activity.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No activity yet</p>
              <p className="text-sm mt-1">
                Lockdowns, captures, approvals, and policy changes will show
                here
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border">
              {visibleActivity.map((item) => {
                const detail = formatActivityDetail(item);
                const actorName =
                  item.actor?.name?.trim() ||
                  item.actor?.email ||
                  (item.actor ? null : "Agent");

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-sm">
                        {getActivityLabel(item.action)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[detail, actorName ? `by ${actorName}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ul>
            {activityItems.length > 5 && (
              <div className="border-t border-border p-3">
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShowAllActivity((prev) => !prev)}
                >
                  {showAllActivity
                    ? "Show less"
                    : `Show ${activityItems.length - 5} more`}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
