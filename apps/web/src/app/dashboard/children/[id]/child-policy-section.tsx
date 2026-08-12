"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeToLock } from "@/components/swipe-to-lock";
import type { AllowedWindow } from "@warden/shared";
import {
  getDeviceDisplayName,
  getPolicyReach,
} from "@warden/shared";
import {
  Check,
  ChevronDown,
} from "lucide-react";
import { AllowedWindowsSummary } from "@/components/allowed-windows-summary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  formatReachAdvisory,
  windowsEqual,
} from "./child-detail-helpers";

const AllowedWindowsEditor = dynamic(
  () =>
    import("@/components/allowed-windows-editor").then(
      (mod) => mod.AllowedWindowsEditor
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-40 w-full" />,
  }
);

const AllowedWindowsDialog = dynamic(
  () =>
    import("@/components/allowed-windows-dialog").then(
      (mod) => mod.AllowedWindowsDialog
    ),
  { ssr: false }
);

type PolicyRecord = {
  dailyLimitMinutes: number;
  allowedWindows: unknown;
  isActive: boolean;
};

type ChildPolicySectionProps = {
  childId: string;
  policy: PolicyRecord | undefined;
};

export function ChildPolicySection({ childId, policy }: ChildPolicySectionProps) {
  const utils = trpc.useUtils();
  const { data: family } = trpc.family.get.useQuery();

  const updatePolicy = trpc.policy.update.useMutation({
    onSuccess: () => {
      utils.policy.getEvaluation.invalidate({ childId });
      utils.children.get.invalidate({ childId });
      utils.dashboard.overview.invalidate();
      setDailyLimit(null);
      setAllowedWindows(null);
      setIsActive(null);
      setPolicySavedAt(Date.now());
      setPolicyEditorOpen(false);
      setScheduleDialogOpen(false);
    },
  });

  const [policySavedAt, setPolicySavedAt] = useState<number | null>(null);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [allowedWindows, setAllowedWindows] = useState<AllowedWindow[] | null>(
    null
  );
  const [isActive, setIsActive] = useState<boolean | null>(null);

  const savedLimit = policy?.dailyLimitMinutes ?? 120;
  const savedWindows =
    (policy?.allowedWindows as AllowedWindow[] | undefined) ?? [];
  const savedActive = policy?.isActive ?? true;

  const currentLimit = dailyLimit ?? savedLimit;
  const currentWindows = allowedWindows ?? savedWindows;
  const currentActive = isActive ?? savedActive;

  const policyDirty =
    currentLimit !== savedLimit ||
    currentActive !== savedActive ||
    !windowsEqual(currentWindows, savedWindows);

  const showPolicySaved =
    policySavedAt !== null && Date.now() - policySavedAt < 4000 && !policyDirty;

  useEffect(() => {
    if (!policySavedAt) return;
    const timer = window.setTimeout(() => setPolicySavedAt(null), 4000);
    return () => window.clearTimeout(timer);
  }, [policySavedAt]);

  const handleSavePolicy = () => {
    updatePolicy.mutate({
      childId,
      dailyLimitMinutes: currentLimit,
      allowedWindows: currentWindows,
      isActive: currentActive,
    });
  };

  const handleSaveSchedule = (windows: AllowedWindow[]) => {
    updatePolicy.mutate({
      childId,
      dailyLimitMinutes: currentLimit,
      allowedWindows: windows,
      isActive: currentActive,
    });
  };

  const scheduleAlsoSavingNote = (() => {
    const notes: string[] = [];
    if (currentLimit !== savedLimit) {
      notes.push(`daily limit (${currentLimit} min)`);
    }
    if (currentActive !== savedActive) {
      notes.push(`policy ${currentActive ? "on" : "off"}`);
    }
    if (notes.length === 0) return null;
    return `Also saves your unsaved ${notes.join(" and ")}`;
  })();

  const openScheduleDialog = () => {
    updatePolicy.reset();
    setScheduleDialogOpen(true);
  };

  const discardPolicyChanges = () => {
    setDailyLimit(null);
    setAllowedWindows(null);
    setIsActive(null);
    setPolicySavedAt(null);
  };

  const policyReach = getPolicyReach({
    dailyLimitMinutes: currentLimit,
    allowedWindows: currentWindows,
  });
  const showReachAdvisory =
    policyReach.constrainedDays.length > 0 &&
    policyReach.minWindowedCapacityMinutes !== null;
  const hasRoomierScheduledDays = new Set(
    policyReach.byDay
      .filter((d) => policyReach.constrainedDays.includes(d.day))
      .map((d) => d.capacityMinutes)
  ).size > 1;

  const renderPolicyEditor = (
    idPrefix: string,
    mode: "card" | "sheet",
    options?: { showActiveToggle?: boolean }
  ) => {
    const showActiveToggle = options?.showActiveToggle ?? true;

    return (
      <div className="space-y-4">
        {showActiveToggle && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`${idPrefix}-active`}
              checked={currentActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor={`${idPrefix}-active`}>Policy active</Label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor={`${idPrefix}-limit`}>Daily limit</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${idPrefix}-limit`}
              type="number"
              min={0}
              max={1440}
              step={1}
              value={currentLimit}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setDailyLimit(0);
                  return;
                }
                if (!/^\d+$/.test(raw)) return;
                setDailyLimit(Math.min(1440, parseInt(raw, 10)));
              }}
              onKeyDown={(e) => {
                if (["e", "E", "+", "-", ".", ","].includes(e.key)) {
                  e.preventDefault();
                }
              }}
              className="w-28 text-center tabular-nums"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-describedby={`${idPrefix}-limit-unit`}
            />
            <span
              id={`${idPrefix}-limit-unit`}
              className="text-sm text-muted-foreground"
            >
              minutes
            </span>
          </div>
        </div>

        {mode === "card" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Allowed windows</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openScheduleDialog}
              >
                Edit schedule
              </Button>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <AllowedWindowsSummary
                windows={currentWindows}
                aria-live="polite"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Allowed windows</Label>
            <AllowedWindowsEditor
              windows={currentWindows}
              onChange={setAllowedWindows}
              timeZone={family?.timezone}
            />
          </div>
        )}

        {showReachAdvisory && policyReach.minWindowedCapacityMinutes !== null && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <p className="text-sm text-foreground">
              {formatReachAdvisory(
                policyReach.constrainedDays,
                policyReach.byDay,
                currentLimit
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasRoomierScheduledDays
                ? `The button below matches the daily limit to the tightest scheduled day, so days with longer windows are capped at ${policyReach.minWindowedCapacityMinutes} min too.`
                : `The button below matches the daily limit to these hours, so the full window can be used.`}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDailyLimit(policyReach.minWindowedCapacityMinutes!)
              }
            >
              Set daily limit to {policyReach.minWindowedCapacityMinutes} min
            </Button>
          </div>
        )}

        {mode === "card" && (
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              className="w-full sm:w-auto"
              onClick={handleSavePolicy}
              disabled={updatePolicy.isPending || !policyDirty}
            >
              {updatePolicy.isPending ? "Saving..." : "Save policy"}
            </Button>
            {policyDirty && (
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={discardPolicyChanges}
                disabled={updatePolicy.isPending}
              >
                Discard
              </Button>
            )}
          </div>
        )}
        {updatePolicy.isError && (
          <p className="text-sm text-destructive">
            {updatePolicy.error.message || "Could not save policy"}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <Card className="order-2 flex w-full flex-col">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Screen time policy</CardTitle>
              <CardDescription>
                Set daily limits and allowed time windows
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="hidden items-center gap-2 md:flex">
                <input
                  type="checkbox"
                  id="desktop-header-active"
                  checked={currentActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="desktop-header-active">Policy active</Label>
              </div>
              {policyDirty ? (
                <Badge variant="warning">Unsaved changes</Badge>
              ) : showPolicySaved ? (
                <Badge variant="success">
                  <Check className="w-3 h-3 mr-1" />
                  Saved
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground md:hidden">
            <p>
              <span className="text-foreground font-medium">
                {currentLimit} min/day
              </span>
              {currentActive ? "" : " · policy off"}
            </p>
            <AllowedWindowsSummary
              windows={currentWindows}
              className="mt-0.5"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full md:hidden"
            onClick={() => setPolicyEditorOpen(true)}
          >
            <ChevronDown className="w-4 h-4 mr-2" />
            Edit limits
          </Button>

          <div className="hidden md:block space-y-4">
            {renderPolicyEditor("desktop", "card", {
              showActiveToggle: false,
            })}
          </div>
        </CardContent>
      </Card>

      <BottomSheet
        open={policyEditorOpen}
        onClose={() => setPolicyEditorOpen(false)}
        title="Edit limits"
        description="Daily limit and allowed time windows"
        showDone={false}
        footer={
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              onClick={handleSavePolicy}
              disabled={updatePolicy.isPending || !policyDirty}
            >
              {updatePolicy.isPending ? "Saving..." : "Save policy"}
            </Button>
            {policyDirty ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={discardPolicyChanges}
                disabled={updatePolicy.isPending}
              >
                Discard
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setPolicyEditorOpen(false)}
              >
                Done
              </Button>
            )}
          </div>
        }
      >
        <div className="mb-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              {currentLimit} min/day
            </span>
            {currentActive ? "" : " · policy off"}
          </p>
          <AllowedWindowsSummary
            windows={currentWindows}
            className="mt-0.5"
          />
        </div>
        {renderPolicyEditor("sheet", "sheet")}
      </BottomSheet>

      <AllowedWindowsDialog
        open={scheduleDialogOpen}
        windows={currentWindows}
        onSave={handleSaveSchedule}
        onClose={() => setScheduleDialogOpen(false)}
        saving={updatePolicy.isPending}
        errorMessage={
          scheduleDialogOpen && updatePolicy.isError
            ? updatePolicy.error.message || "Could not save schedule"
            : null
        }
        alsoSavingNote={scheduleAlsoSavingNote}
        timeZone={family?.timezone}
      />
    </>
  );
}
