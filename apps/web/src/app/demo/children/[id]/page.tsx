"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Monitor,
  Unlock,
  ArrowRight,
} from "lucide-react";
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

  return (
    <div className="space-y-8">
      <InlineBackLink href="/demo/children" chipLabel="Children">
        Back to children
      </InlineBackLink>

      <PageHeader
        title={child.displayName}
        description="Device controls and today's usage (demo)"
      />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Today&apos;s screen time</CardTitle>
              <CardDescription className="mt-1">
                {evaluation.usedMinutes} / {effectiveLimit} min used
                {evaluation.bonusMinutes > 0 &&
                  ` (+${evaluation.bonusMinutes} bonus)`}
              </CardDescription>
            </div>
            <Badge variant={statusBadgeVariant(evaluation.status)}>
              {getPolicyStatusLabel(evaluation.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${progressBarClass(
                evaluation.status
              )}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {evaluation.remainingMinutes} min left now
            {evaluation.status === "outside_window" &&
              evaluation.nextWindowStart &&
              ` · Available again ${formatClockInText(evaluation.nextWindowStart)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Daily limit {child.dailyLimitMinutes} min · editing policies
            requires a real account
          </p>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Devices</h2>
        {child.devices.map((device) => {
          const pendingLock = pendingLocks[device.id];
          const effectiveAdminLock =
            pendingLock !== undefined ? pendingLock : device.adminLock;
          const nudgeState = nudgeByDevice[device.id];
          const nudgeBusy = Boolean(nudgeState?.nudgeId);

          return (
            <Card key={device.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    {getDeviceDisplayName(device)}
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={device.isOnline ? "success" : "secondary"}>
                      {device.isOnline ? "Online" : "Offline"}
                    </Badge>
                    {effectiveAdminLock && (
                      <Badge variant="destructive">Locked down</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {nudgeState?.label && (
                  <p className="text-sm text-muted-foreground">
                    {nudgeState.label}
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <NudgeControls
                    className="w-full sm:w-52 sm:shrink-0"
                    disabled={
                      !device.isPaired || !device.isOnline || nudgeBusy
                    }
                    isSending={nudgeState?.label === "Sending…"}
                    onSend={(message) => sendNudge(device.id, message)}
                  />
                  {effectiveAdminLock ? (
                    <Button
                      variant="outline"
                      className="w-full min-w-0 sm:flex-1"
                      onClick={() => setAdminLock(device.id, false)}
                      disabled={pendingLock !== undefined}
                    >
                      <Unlock className="mr-1.5 h-4 w-4" />
                      Release
                    </Button>
                  ) : (
                    <SwipeToLock
                      className="w-full min-w-0 sm:flex-1"
                      onConfirm={() => setAdminLock(device.id, true)}
                      disabled={!device.isPaired}
                      pending={pendingLock === true}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <Link
            href="/demo/activity"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all
            <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
          </Link>
        </div>
        <RecentActivityCard
          items={childActivity}
          hideChildName
          emptyDescription="Activity for this child will appear here"
        />
      </section>
    </div>
  );
}
