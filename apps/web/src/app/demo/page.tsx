"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Monitor,
  AlertCircle,
  Unlock,
  Users,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NudgeControls } from "@/components/nudge-controls";
import { SwipeToLock } from "@/components/swipe-to-lock";
import { RecentActivityCard } from "@/components/recent-activity-card";
import {
  getDeviceDisplayName,
  getPolicyStatusLabel,
} from "@warden/shared";
import { formatClockInText } from "@/lib/time-format";
import { useDemo } from "@/lib/demo/demo-provider";
import {
  progressBarClass,
  remainingPercent,
  statusBadgeVariant,
} from "@/lib/demo/overview-helpers";

export default function DemoOverviewPage() {
  const router = useRouter();
  const {
    overview,
    activity,
    nudgeByDevice,
    pendingLocks,
    sendNudge,
    setAdminLock,
  } = useDemo();

  const children = overview.children;
  const pendingRequests = overview.pendingRequests;
  const devices = children.flatMap((child) => child.devices);
  const onlineCount = devices.filter((d) => d.isOnline).length;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Dashboard"
        description="Screen time, device status, and lockdowns at a glance"
      />

      {pendingRequests > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
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
            <Link href="/demo/activity" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto" variant="outline">
                Review requests
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:hidden">
        <Link href="/demo/children" className="block">
          <Card className="h-full p-3.5">
            <p className="truncate text-xs text-muted-foreground">Children</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">
              {children.length}
            </p>
          </Card>
        </Link>
        <Card className="h-full p-3.5">
          <p className="truncate text-xs text-muted-foreground">Online</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {onlineCount}
            <span className="text-sm font-normal text-muted-foreground">
              /{devices.length}
            </span>
          </p>
        </Card>
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-2">
        <Link href="/demo/children" className="group block">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="relative mb-0">
              <div className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <CardDescription>Children</CardDescription>
              <CardTitle className="text-3xl">{children.length}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Card>
          <CardHeader className="relative mb-0">
            <div className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <CardDescription>Devices online</CardDescription>
            <CardTitle className="text-3xl">
              {onlineCount}
              <span className="text-lg font-normal text-muted-foreground">
                /{devices.length}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Children</h2>
          <Link
            href="/demo/children"
            className="text-sm text-primary hover:underline"
          >
            Manage
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 max-md:gap-5 lg:grid-cols-2">
          {children.map((child) => {
            const { evaluation } = child;
            const effectiveLimit =
              evaluation.dailyLimitMinutes + evaluation.bonusMinutes;
            const percent = remainingPercent(
              evaluation.dailyRemainingMinutes,
              effectiveLimit
            );
            const onlineDevices = child.devices.filter((d) => d.isOnline).length;
            const manageHref = `/demo/children/${child.id}`;

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
                  className="cursor-pointer rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">
                        {child.displayName}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {`${onlineDevices}/${child.devices.length} device${
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
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            (+{evaluation.bonusMinutes})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted md:h-2">
                      <div
                        className={`h-full rounded-full transition-[width] ${progressBarClass(
                          evaluation.status
                        )}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground md:text-xs">
                      {statusText}
                    </p>
                  </div>
                </CardHeader>

                <CardContent
                  className="space-y-3 max-md:space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {child.devices.length > 0 && (
                    <p className="flex items-center gap-1 text-xs font-medium text-primary/80 md:hidden">
                      Tap a device to nudge or lock
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                    </p>
                  )}
                  {child.devices.map((device) => {
                    const pendingLock = pendingLocks[device.id];
                    const effectiveAdminLock =
                      pendingLock !== undefined
                        ? pendingLock
                        : device.adminLock;
                    const nudgeState = nudgeByDevice[device.id];
                    const nudgeBusy = Boolean(nudgeState?.nudgeId);

                    const deviceBadges = (
                      <div className="flex shrink-0 flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-2">
                        <Badge
                          variant={device.isOnline ? "success" : "secondary"}
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
                      <div
                        key={device.id}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
                          role="link"
                          tabIndex={0}
                          onClick={navigateToManageDevice}
                          onKeyDown={handleDeviceRowKeyDown}
                        >
                          <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {getDeviceDisplayName(device)}
                          </span>
                          {deviceBadges}
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        </div>

                        <div className="hidden space-y-2.5 rounded-lg border border-border/60 px-3 py-2.5 md:block">
                          <div className="flex min-w-0 items-center gap-2">
                            <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {getDeviceDisplayName(device)}
                            </span>
                            {deviceBadges}
                          </div>

                          <div className="space-y-2">
                            {nudgeState?.label && (
                              <span className="text-xs text-muted-foreground">
                                {nudgeState.label}
                              </span>
                            )}
                            <div className="flex flex-row items-stretch gap-2">
                              <NudgeControls
                                className="w-52 shrink-0"
                                disabled={
                                  !device.isPaired ||
                                  !device.isOnline ||
                                  nudgeBusy
                                }
                                isSending={nudgeState?.label === "Sending…"}
                                onSend={(message) =>
                                  sendNudge(device.id, message)
                                }
                              />
                              {effectiveAdminLock ? (
                                <Button
                                  variant="outline"
                                  className="min-w-0 flex-1"
                                  onClick={() =>
                                    setAdminLock(device.id, false)
                                  }
                                  disabled={pendingLock !== undefined}
                                >
                                  <Unlock className="mr-1.5 h-4 w-4" />
                                  Release
                                </Button>
                              ) : (
                                <SwipeToLock
                                  className="min-w-0 flex-1"
                                  onConfirm={() =>
                                    setAdminLock(device.id, true)
                                  }
                                  disabled={!device.isPaired}
                                  pending={pendingLock === true}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Recent activity</h2>
          <Link
            href="/demo/activity"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        <RecentActivityCard items={activity} />
      </div>
    </div>
  );
}
