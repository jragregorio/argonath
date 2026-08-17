"use client";

import { useId, useState } from "react";
import { notFound } from "next/navigation";
import { useParams } from "next/navigation";
import { ClockPlus, Monitor, Unlock } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { NudgeControls } from "@/components/nudge-controls";
import { SwipeToLock } from "@/components/swipe-to-lock";
import { RecentActivityCard } from "@/components/recent-activity-card";
import { AllowedWindowsSummary } from "@/components/allowed-windows-summary";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Modal } from "@/components/ui/modal";
import { VisibleAppsCard } from "@/components/visible-apps-card";
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
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";
import { cn } from "@warden/ui";

const GRANT_PRESETS = [15, 30, 60] as const;
const GRANT_MINUTES_MIN = 1;
const GRANT_MINUTES_MAX = 240;

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
    blockApp,
    unblockApp,
    grantBonus,
    clearBonus,
  } = useDemo();

  const child = getChildById(childId);
  if (!child) notFound();

  const { evaluation } = child;
  const effectiveLimit =
    evaluation.dailyLimitMinutes + evaluation.bonusMinutes;
  const percent = getBindingRemainingPercent(evaluation);
  const childActivity = activity.filter(
    (item) => item.childName === child.displayName
  );

  const remainingDisplay = getPolicyRemainingDisplay(evaluation);
  const isDesktop = useIsDesktopMd();
  const grantInputId = useId();

  const [grantBonusOpen, setGrantBonusOpen] = useState(false);
  const [grantMinutes, setGrantMinutes] = useState(15);
  const [grantCustomMode, setGrantCustomMode] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const [clearBonusOpen, setClearBonusOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const openGrantBonus = () => {
    setGrantMinutes(15);
    setGrantCustomMode(false);
    setGrantBonusOpen(true);
  };

  const closeGrantBonus = () => {
    if (grantBusy) return;
    setGrantBonusOpen(false);
    setGrantMinutes(15);
    setGrantCustomMode(false);
  };

  const confirmGrantBonus = () => {
    if (
      grantMinutes < GRANT_MINUTES_MIN ||
      grantMinutes > GRANT_MINUTES_MAX ||
      grantBusy
    ) {
      return;
    }
    setGrantBusy(true);
    grantBonus(childId, grantMinutes);
    setGrantBusy(false);
    setGrantBonusOpen(false);
    setGrantMinutes(15);
    setGrantCustomMode(false);
  };

  const requestClearBonus = () => {
    if (evaluation.bonusMinutes <= 0) return;
    setClearBonusOpen(true);
  };

  const confirmClearBonus = () => {
    setClearBusy(true);
    clearBonus(childId);
    setClearBusy(false);
    setClearBonusOpen(false);
  };

  const grantBonusForm = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GRANT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={grantBusy}
            onClick={() => {
              setGrantMinutes(preset);
              setGrantCustomMode(false);
            }}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11",
              !grantCustomMode && grantMinutes === preset
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            +{preset} min
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor={grantInputId}>Custom minutes</Label>
        <Input
          id={grantInputId}
          type="number"
          inputMode="numeric"
          min={GRANT_MINUTES_MIN}
          max={GRANT_MINUTES_MAX}
          value={grantCustomMode ? grantMinutes : ""}
          placeholder={`${GRANT_MINUTES_MIN}–${GRANT_MINUTES_MAX}`}
          onChange={(event) => {
            setGrantCustomMode(true);
            const next = Number.parseInt(event.target.value, 10);
            setGrantMinutes(Number.isFinite(next) ? next : 0);
          }}
          onFocus={() => setGrantCustomMode(true)}
          disabled={grantBusy}
          className="max-w-[10rem]"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Bonus expires at the end of today and unlocks all of {child.displayName}
        &apos;s devices.
      </p>
    </div>
  );

  const grantBonusFooter = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="ghost"
        onClick={closeGrantBonus}
        disabled={grantBusy}
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={confirmGrantBonus}
        disabled={
          grantBusy ||
          grantMinutes < GRANT_MINUTES_MIN ||
          grantMinutes > GRANT_MINUTES_MAX
        }
      >
        <ClockPlus className="mr-1.5 h-4 w-4" />
        {grantBusy ? "Granting…" : `Grant +${grantMinutes} min`}
      </Button>
    </div>
  );

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
                <Badge variant={evaluationStatusBadgeVariant(evaluation)}>
                  {getEvaluationStatusLabel(evaluation)}
                </Badge>
                <span
                  className={cn(
                    "text-sm",
                    remainingDisplay.usedTodaySecondary
                      ? "text-muted-foreground"
                      : "text-foreground/90 md:text-muted-foreground"
                  )}
                >
                  {evaluation.usedMinutes} / {effectiveLimit} min used today
                  {evaluation.bonusMinutes > 0 &&
                    ` (+${evaluation.bonusMinutes} bonus)`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs max-md:min-h-9"
                  onClick={openGrantBonus}
                  disabled={grantBusy}
                >
                  <ClockPlus className="mr-1 h-3.5 w-3.5" />
                  {grantBusy ? "Granting…" : "Grant bonus"}
                </Button>
                {evaluation.bonusMinutes > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={requestClearBonus}
                    disabled={clearBusy}
                  >
                    {clearBusy ? "Clearing…" : "Clear bonus"}
                  </Button>
                )}
              </div>
              <div className="mt-3 max-w-md space-y-2">
                <PolicyWindowRemainingPrimary evaluation={evaluation} />
                <div className="hidden h-2 w-full overflow-hidden rounded-full bg-muted md:block">
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
                  className="flex min-h-[12rem] flex-col gap-4 rounded-lg border border-border p-4 max-md:p-5 sm:p-5"
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
              <Badge variant={evaluationStatusBadgeVariant(evaluation)}>
                {getEvaluationStatusLabel(evaluation)}
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
              <PolicyWindowRemainingPrimary evaluation={evaluation} />
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Today&apos;s usage
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
              <PolicyRemainingFooter
                evaluation={evaluation}
                mutedClassName="text-xs text-muted-foreground"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Editing limits and schedules requires a real account.
            </p>
          </CardContent>
        </Card>
      </div>

      <VisibleAppsCard
        devices={child.devices}
        blockedProcessNames={child.blockedProcessNames}
        onBlock={(processName) => blockApp(childId, processName)}
        onUnblock={(processName) => unblockApp(childId, processName)}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <RecentActivityCard
          items={childActivity}
          hideChildName
          emptyDescription="Nudges, lockdowns, captures, and policy changes for this child will show here"
        />
      </section>

      {isDesktop ? (
        <Modal
          open={grantBonusOpen}
          onClose={closeGrantBonus}
          title="Grant bonus screen time"
          description={`Add extra minutes for ${child.displayName} today`}
          className="w-[min(24rem,calc(100vw-2rem))]"
          footer={grantBonusFooter}
        >
          {grantBonusForm}
        </Modal>
      ) : (
        <BottomSheet
          open={grantBonusOpen}
          onClose={closeGrantBonus}
          title="Grant bonus screen time"
          description={`Add extra minutes for ${child.displayName} today`}
          showDone={false}
          footer={grantBonusFooter}
        >
          {grantBonusForm}
        </BottomSheet>
      )}

      <ConfirmDialog
        open={clearBonusOpen}
        onClose={() => setClearBonusOpen(false)}
        title="Clear bonus minutes?"
        description={`Clear +${evaluation.bonusMinutes} bonus minutes for ${child.displayName}? Their daily limit returns to ${evaluation.dailyLimitMinutes} min. If they've already used more than that, devices will lock.`}
        confirmLabel="Clear bonus"
        busy={clearBusy}
        onConfirm={confirmClearBonus}
      />
    </div>
  );
}
