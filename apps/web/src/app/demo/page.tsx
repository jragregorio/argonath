"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Monitor, Unlock, Users, ChevronRight } from "lucide-react";
import { PendingExtensionBanner } from "@/components/pending-extension-banner";
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
  getEvaluationStatusLabel,
} from "@warden/shared";
import { useDemo } from "@/lib/demo/demo-provider";
import { progressBarClass } from "@/lib/demo/overview-helpers";
import {
  evaluationStatusBadgeVariant,
  getBindingRemainingPercent,
  getPolicyRemainingDisplay,
} from "@/lib/policy-remaining-display";
import {
  PolicyRemainingFooter,
  PolicyWindowRemainingPrimary,
} from "@/components/policy-remaining-status";
import { cn } from "@warden/ui";

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

      <PendingExtensionBanner
        count={pendingRequests}
        href="/demo/activity"
      />

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
            const percent = getBindingRemainingPercent(evaluation);
            const onlineDevices = child.devices.filter((d) => d.isOnline).length;
            const manageHref = `/demo/children/${child.id}`;
            const remainingDisplay = getPolicyRemainingDisplay(evaluation);

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
                    <Badge variant={evaluationStatusBadgeVariant(evaluation)}>
                      {getEvaluationStatusLabel(evaluation)}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2">
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
                    <PolicyRemainingFooter evaluation={evaluation} />
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
