"use client";

import { useEffect, useState } from "react";
import { useFamilyRealtime } from "@/lib/realtime";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Monitor,
  AlertCircle,
  Lock,
  Unlock,
  Users,
  Clock,
  ArrowRight,
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

export default function DashboardPage() {
  const utils = trpc.useUtils();
  const { data: overview, isLoading } = trpc.dashboard.overview.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const [pendingLocks, setPendingLocks] = useState<
    Record<string, boolean | undefined>
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
      void utils.device.list.invalidate();
      void utils.children.list.invalidate();
    },
  });

  const devices = overview?.children.flatMap((child) => child.devices) ?? [];

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

  const deviceIds = devices.map((d) => d.id);

  useFamilyRealtime(deviceIds, () => {
    utils.dashboard.overview.invalidate();
    utils.extension.listPending.invalidate();
    utils.dashboard.navBadges.invalidate();
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-9 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <div>
          <Skeleton className="h-7 w-28 mb-4" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-2 w-full mt-4 rounded-full" />
                  <Skeleton className="h-4 w-36 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const children = overview?.children ?? [];
  const pendingRequests = overview?.pendingRequests ?? 0;
  const onlineCount = devices.filter((d) => d.isOnline).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Screen time, device status, and lockdowns at a glance"
      />

      {pendingRequests > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
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
            <Link href="/dashboard/extensions">
              <Button size="sm" variant="outline">
                Review requests
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            Manage children
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
                <Button size="sm">Add a child</Button>
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
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5"
                          >
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
                            {effectiveAdminLock ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-auto"
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
                                size="sm"
                                className="ml-auto"
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
                                    : undefined
                                }
                              >
                                <Lock className="w-4 h-4 mr-1.5" />
                                Lock down
                              </Button>
                            )}
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
    </div>
  );
}
