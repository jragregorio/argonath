"use client";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import {
  ActivityFeedSkeleton,
  OverviewSkeleton,
} from "@/components/dashboard-skeletons";
import { Monitor, Unlock, Users, ChevronRight } from "lucide-react";
import { PendingExtensionBanner } from "@/components/pending-extension-banner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NudgeControls } from "@/components/nudge-controls";
import { SwipeToLock } from "@/components/swipe-to-lock";
import { RecentActivityCard } from "@/components/recent-activity-card";
import {
  getDeviceDisplayName,
  getEvaluationStatusLabel,
  type PolicyStatus,
} from "@warden/shared";
import { POLL_HEARTBEAT_MS } from "@/lib/query-defaults";
import { useDeviceActions } from "@/lib/use-device-actions";
import {
  evaluationStatusBadgeVariant,
  getPolicyRemainingDisplay,
  getBindingRemainingPercent,
} from "@/lib/policy-remaining-display";
import {
  PolicyRemainingFooter,
  PolicyRemainingMobileCaption,
  PolicyRemainingMobileHero,
  PolicyWindowRemainingPrimary,
} from "@/components/policy-remaining-status";
import { cn } from "@warden/ui";

function progressBarClass(status: PolicyStatus) {
  if (status === "blocked") return "bg-destructive";
  if (status === "outside_window") return "bg-yellow-500";
  return "bg-primary";
}

export default function DashboardOverviewPage() {
  const router = useRouter();
  const { data: overview, isLoading } = trpc.dashboard.overview.useQuery(
    undefined,
    {
      // Online / usage follow heartbeats; Realtime covers lock/policy/extension
      refetchInterval: POLL_HEARTBEAT_MS,
    }
  );
  const { data: activity, isLoading: activityLoading } =
    trpc.dashboard.activity.useQuery(
      { limit: 20, includeDevicePresence: false },
      { refetchInterval: POLL_HEARTBEAT_MS }
    );
  const devices = overview?.children.flatMap((child) => child.devices) ?? [];

  const {
    pendingLocks,
    nudgeByDevice,
    setAdminLock,
    sendNudge,
    getEffectiveAdminLock,
  } = useDeviceActions({
    devices,
    scope: "overview",
    getDeviceLabel: (deviceId) => {
      const device = devices.find((d) => d.id === deviceId);
      return device ? getDeviceDisplayName(device) : "Device";
    },
    getChildLabel: (deviceId) =>
      overview?.children.find((child) =>
        child.devices.some((d) => d.id === deviceId)
      )?.displayName ?? "Child",
  });

  if (isLoading && !overview) {
    return <OverviewSkeleton />;
  }

  const children = overview?.children ?? [];
  const pendingRequests = overview?.pendingRequests ?? 0;
  const onlineCount = devices.filter((d) => d.isOnline).length;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Dashboard"
        description="Screen time, device status, and lockdowns at a glance"
        hideDescriptionOnMobile
      />

      <PendingExtensionBanner count={pendingRequests} />

      {/* Mobile compact stats strip */}
      <div className="md:hidden rounded-2xl border border-border px-4 py-3 text-base tabular-nums">
        <Link
          href="/dashboard/children"
          className="font-semibold text-foreground hover:underline"
        >
          {children.length} {children.length === 1 ? "child" : "children"}
        </Link>
        <span className="text-muted-foreground"> · </span>
        <span>
          <span className="font-semibold">{onlineCount}</span>
          <span className="text-muted-foreground">/{devices.length} online</span>
        </span>
        {pendingRequests > 0 && (
          <>
            <span className="text-muted-foreground"> · </span>
            <Link
              href="/dashboard/activity"
              className="font-semibold text-foreground hover:underline"
            >
              {pendingRequests} pending
            </Link>
          </>
        )}
      </div>

      {/* Desktop summary cards */}
      <div className="hidden md:grid md:grid-cols-2 gap-4">
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
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Children</h2>
          <Link
            href="/dashboard/children"
            className="inline-flex min-h-11 items-center rounded-full border border-border px-3.5 text-sm font-medium text-primary"
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
              const percent = getBindingRemainingPercent(evaluation);
              const onlineDevices = child.devices.filter((d) => d.isOnline)
                .length;

              const remainingDisplay = getPolicyRemainingDisplay(evaluation);

              const manageHref = `/dashboard/children/${child.id}`;

              const navigateToManage = () => {
                router.push(manageHref);
              };

              const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigateToManage();
                }
              };

              return (
                <Card
                  key={child.id}
                  className="transition-colors hover:border-primary/40"
                >
                  <CardHeader
                    role="link"
                    tabIndex={0}
                    onClick={navigateToManage}
                    onKeyDown={handleHeaderKeyDown}
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-t-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate max-md:text-xl">
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
                      <Badge
                        variant={evaluationStatusBadgeVariant(evaluation)}
                        className="max-md:text-sm max-md:px-3 max-md:py-1"
                      >
                        {getEvaluationStatusLabel(evaluation)}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="md:hidden space-y-2">
                        <PolicyRemainingMobileHero evaluation={evaluation} />
                        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-[width] ${progressBarClass(
                              evaluation.status
                            )}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <PolicyRemainingMobileCaption evaluation={evaluation} />
                      </div>
                      <div className="hidden md:block space-y-2">
                        <PolicyWindowRemainingPrimary evaluation={evaluation} />
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">
                            Today&apos;s screen time
                          </span>
                          <span
                            className={cn(
                              "tabular-nums",
                              remainingDisplay.usedTodaySecondary
                                ? "text-muted-foreground"
                                : "font-medium"
                            )}
                          >
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
                        <PolicyRemainingFooter evaluation={evaluation} />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent
                    className="space-y-3 max-md:space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {child.devices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Pair a device from this child&apos;s page to monitor
                        usage and lockdown.
                      </p>
                    ) : (
                      <>
                        {child.devices.map((device) => {
                        const pendingLock = pendingLocks[device.id];
                        const effectiveAdminLock = getEffectiveAdminLock(device);

                        const deviceBadges = (
                          <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-1.5">
                            <Badge
                              variant={
                                device.isOnline ? "success" : "secondary"
                              }
                              className="max-md:text-sm max-md:px-3 max-md:py-1"
                            >
                              {device.isOnline ? "Online" : "Offline"}
                            </Badge>
                            {device.isLocked && !effectiveAdminLock && (
                              <Badge
                                variant="secondary"
                                className="max-md:text-sm max-md:px-3 max-md:py-1"
                              >
                                Locked
                              </Badge>
                            )}
                            {effectiveAdminLock && (
                              <Badge
                                variant="destructive"
                                className="max-md:text-sm max-md:px-3 max-md:py-1"
                              >
                                Locked down
                              </Badge>
                            )}
                            {pendingLock !== undefined && (
                              <Badge
                                variant="secondary"
                                className="max-md:text-sm max-md:px-3 max-md:py-1"
                              >
                                {pendingLock
                                  ? "Sending lock..."
                                  : "Waiting for unlock..."}
                              </Badge>
                            )}
                          </div>
                        );

                        const navigateToManageDevice = () => {
                          router.push(manageHref);
                        };

                        const handleDeviceRowKeyDown = (
                          e: React.KeyboardEvent
                        ) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigateToManageDevice();
                          }
                        };

                        return (
                          <div key={device.id} onClick={(e) => e.stopPropagation()}>
                            {/* Mobile: compact status row (header navigates to child detail) */}
                            <div
                              className="md:hidden flex min-h-14 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              role="link"
                              tabIndex={0}
                              onClick={navigateToManageDevice}
                              onKeyDown={handleDeviceRowKeyDown}
                            >
                              <Monitor className="h-5 w-5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-base font-medium">
                                {getDeviceDisplayName(device)}
                              </span>
                              {deviceBadges}
                              <ChevronRight
                                className="h-5 w-5 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            </div>

                            {/* Desktop: full device controls */}
                            <div className="hidden space-y-2.5 rounded-lg border border-border/60 px-3 py-2.5 md:block">
                              <div className="flex min-w-0 items-center gap-2">
                                <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                  {getDeviceDisplayName(device)}
                                </span>
                                {deviceBadges}
                              </div>

                              <div className="space-y-2">
                                {nudgeByDevice[device.id]?.label && (
                                  <span className="block break-words text-xs text-muted-foreground">
                                    {nudgeByDevice[device.id].label}
                                  </span>
                                )}
                                <div className="flex flex-row items-stretch gap-2">
                                  <NudgeControls
                                    className="w-52 shrink-0"
                                    disabled={
                                      !device.isPaired ||
                                      !device.isOnline ||
                                      Boolean(nudgeByDevice[device.id]?.nudgeId)
                                    }
                                    isSending={
                                      sendNudge.isPending &&
                                      sendNudge.variables?.deviceId ===
                                        device.id
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
                                      className="min-w-0 flex-1"
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
                          </div>
                        );
                      })}
                      </>
                    )}

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
          <Link
            href="/dashboard/activity"
            className="inline-flex min-h-11 items-center rounded-full border border-border px-3.5 text-sm font-medium text-muted-foreground"
          >
            View all →
          </Link>
        </div>
        {activity === undefined && activityLoading ? (
          <ActivityFeedSkeleton />
        ) : (
          <RecentActivityCard items={activity} />
        )}
      </div>
    </div>
  );
}
