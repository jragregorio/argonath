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
  PolicyRemainingMobileCaption,
  PolicyRemainingMobileHero,
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
        hideDescriptionOnMobile
      />

      <PendingExtensionBanner
        count={pendingRequests}
        href="/demo/activity"
      />

      <div className="md:hidden rounded-2xl border border-border px-4 py-3 text-base tabular-nums">
        <Link
          href="/demo/children"
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
              href="/demo/activity"
              className="font-semibold text-foreground hover:underline"
            >
              {pendingRequests} pending
            </Link>
          </>
        )}
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
            className="inline-flex min-h-11 items-center rounded-full border border-border px-3.5 text-sm font-medium text-primary"
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
                      <CardTitle className="truncate max-md:text-xl">
                        {child.displayName}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {`${onlineDevices}/${child.devices.length} device${
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
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
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
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              (+{evaluation.bonusMinutes})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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
                  {child.devices.map((device) => {
                    const pendingLock = pendingLocks[device.id];
                    const effectiveAdminLock =
                      pendingLock !== undefined
                        ? pendingLock
                        : device.adminLock;
                    const nudgeState = nudgeByDevice[device.id];
                    const nudgeBusy = Boolean(nudgeState?.nudgeId);

                    const deviceBadges = (
                      <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-1.5">
                        <Badge
                          variant={device.isOnline ? "success" : "secondary"}
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
                      <div
                        key={device.id}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="flex min-h-14 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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
            className="inline-flex min-h-11 items-center rounded-full border border-border px-3.5 text-sm font-medium text-muted-foreground"
          >
            View all →
          </Link>
        </div>
        <RecentActivityCard items={activity} />
      </div>
    </div>
  );
}
