"use client";

import { notFound } from "next/navigation";
import { useParams } from "next/navigation";
import { Monitor, Unlock } from "lucide-react";
import { InlineBackLink } from "@/components/sticky-back-chip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { NudgeControls } from "@/components/nudge-controls";
import { SwipeToLock } from "@/components/swipe-to-lock";
import { RecentActivityCard } from "@/components/recent-activity-card";
import { AllowedWindowsSummary } from "@/components/allowed-windows-summary";
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

export default function DemoChildDetailPage() {
  const params = useParams();
  const childId = params.id as string;
  const {
    getChildById,
    activity,
    nudgeByDevice,
    pendingLocks,
    sendNudge,
    setAdminLock,
  } = useDemo();

  const child = getChildById(childId);
  if (!child) notFound();

  const { evaluation } = child;
  const effectiveLimit =
    evaluation.dailyLimitMinutes + evaluation.bonusMinutes;
  const percent = remainingPercent(
    evaluation.dailyRemainingMinutes,
    effectiveLimit
  );
  const childActivity = activity.filter(
    (item) => item.childName === child.displayName
  );

  const evaluationStatusText = (() => {
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

  return (
    <div className="space-y-6">
      <div>
        <InlineBackLink href="/demo/children" className="mb-3" />

        <PageHeader
          title={child.displayName}
          description="Device controls and screen time policy"
        />

        {evaluation && (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-border bg-card md:mt-2 md:border-0 md:bg-transparent">
            <div className="relative z-10 p-4 md:p-0">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={statusBadgeVariant(evaluation.status)}>
                  {getPolicyStatusLabel(evaluation.status)}
                </Badge>
                <span className="text-sm text-foreground/90 md:text-muted-foreground">
                  {evaluation.usedMinutes} / {effectiveLimit} min used today
                  {evaluation.bonusMinutes > 0 &&
                    ` (+${evaluation.bonusMinutes} bonus)`}
                </span>
              </div>
              <div className="mt-3 max-w-md space-y-2">
                <div className="hidden h-2 w-full overflow-hidden rounded-full bg-muted md:block">
                  <div
                    className={`h-full rounded-full transition-[width] ${progressBarClass(
                      evaluation.status
                    )}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground md:text-xs">
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
              Nudge or lock devices paired with this child
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {child.devices.map((device) => {
              const pendingLock = pendingLocks[device.id];
              const effectiveAdminLock =
                pendingLock !== undefined ? pendingLock : device.adminLock;
              const nudgeState = nudgeByDevice[device.id];
              const nudgeBusy = Boolean(nudgeState?.nudgeId);

              return (
                <div
                  key={device.id}
                  className="flex min-h-[12rem] flex-1 flex-col justify-between gap-4 rounded-lg border border-border p-4 max-md:p-5 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Monitor className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold tracking-tight">
                          {getDeviceDisplayName(device)}
                        </p>
                        <div className="text-sm text-muted-foreground md:text-xs">
                          <p>
                            {child.displayName} Agent v
                            {device.agentVersion ?? "?"}
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

                  <div className="flex flex-col gap-2 max-md:gap-3">
                    {nudgeState?.label && (
                      <span className="text-sm text-muted-foreground md:text-xs">
                        {nudgeState.label}
                      </span>
                    )}
                    <div className="flex flex-col gap-2 max-md:gap-3 sm:flex-row sm:items-stretch">
                      <NudgeControls
                        className="w-full sm:w-52 sm:shrink-0"
                        disabled={
                          !device.isPaired || !device.isOnline || nudgeBusy
                        }
                        isSending={nudgeState?.label === "Sending…"}
                        onSend={(message) => sendNudge(device.id, message)}
                      />
                      <div className="flex w-full min-w-0 items-stretch sm:flex-1">
                        {effectiveAdminLock ? (
                          <Button
                            variant="outline"
                            className="min-w-0 flex-1"
                            onClick={() => setAdminLock(device.id, false)}
                            disabled={pendingLock !== undefined}
                          >
                            <Unlock className="mr-2 h-4 w-4" />
                            Release
                          </Button>
                        ) : (
                          <SwipeToLock
                            className="min-w-0 flex-1"
                            onConfirm={() => setAdminLock(device.id, true)}
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

        <Card className="order-2 flex w-full flex-col">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>Screen time policy</CardTitle>
                <CardDescription>
                  Set daily limits and allowed time windows
                </CardDescription>
              </div>
              <Badge variant={statusBadgeVariant(evaluation.status)}>
                {getPolicyStatusLabel(evaluation.status)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  {child.dailyLimitMinutes} min/day
                </span>
                {child.policyActive ? "" : " · policy off"}
              </p>
              <AllowedWindowsSummary
                windows={child.allowedWindows}
                className="mt-0.5"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Today&apos;s usage
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
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-[width] ${progressBarClass(
                    evaluation.status
                  )}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {evaluationStatusText}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Editing limits and schedules requires a real account.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <RecentActivityCard
          items={childActivity}
          hideChildName
          emptyDescription="Nudges, lockdowns, captures, and policy changes for this child will show here"
        />
      </section>
    </div>
  );
}
