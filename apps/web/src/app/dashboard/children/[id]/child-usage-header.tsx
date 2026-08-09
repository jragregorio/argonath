"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@warden/api/router-type";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getEvaluationStatusLabel } from "@warden/shared";
import { ClockPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { InlineBackLink } from "@/components/sticky-back-chip";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { progressBarClass } from "./child-detail-helpers";
import {
  evaluationStatusBadgeVariant,
  getBindingRemainingFraction,
  getPolicyRemainingDisplay,
} from "@/lib/policy-remaining-display";
import {
  PolicyRemainingFooter,
  PolicyWindowRemainingPrimary,
} from "@/components/policy-remaining-status";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";
import { cn } from "@warden/ui";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ChildForHeader = RouterOutputs["children"]["get"];
type Evaluation = RouterOutputs["policy"]["getEvaluation"];

type ChildUsageHeaderProps = {
  child: ChildForHeader;
  childId: string;
  evaluation: Evaluation | undefined;
};

type ConfirmState = { type: "delete-child" } | { type: "clear-bonus" } | null;

const GRANT_PRESETS = [15, 30, 60] as const;
const GRANT_MINUTES_MIN = 1;
const GRANT_MINUTES_MAX = 240;

export function ChildUsageHeader({
  child,
  childId,
  evaluation,
}: ChildUsageHeaderProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const clearBonus = trpc.extension.clearBonus.useMutation({
    onSuccess: () => {
      void utils.policy.getEvaluation.invalidate({ childId });
      void utils.children.get.invalidate({ childId });
      void utils.dashboard.overview.invalidate();
      void utils.dashboard.activity.invalidate();
    },
  });
  const grantBonus = trpc.extension.grantBonus.useMutation({
    onSuccess: () => {
      void utils.policy.getEvaluation.invalidate({ childId });
      void utils.children.get.invalidate({ childId });
      void utils.dashboard.overview.invalidate();
      void utils.dashboard.activity.invalidate();
      setGrantBonusOpen(false);
      setGrantMinutes(15);
      setGrantCustomMode(false);
    },
  });
  const renameChild = trpc.children.rename.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.children.list.invalidate();
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
      setEditingChildName(false);
    },
  });
  const deleteChild = trpc.children.delete.useMutation({
    onSuccess: () => {
      utils.children.list.invalidate();
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
      router.push("/dashboard/children");
    },
  });

  const [editingChildName, setEditingChildName] = useState(false);
  const [childNameDraft, setChildNameDraft] = useState("");
  const [childActionsOpen, setChildActionsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [grantBonusOpen, setGrantBonusOpen] = useState(false);
  const [grantMinutes, setGrantMinutes] = useState(15);
  const [grantCustomMode, setGrantCustomMode] = useState(false);
  const grantInputId = useId();
  const isDesktop = useIsDesktopMd();

  const startRenameChild = () => {
    setChildNameDraft(child.displayName);
    setEditingChildName(true);
  };

  const saveChildName = () => {
    const next = childNameDraft.trim();
    if (!next || next === child.displayName) {
      setEditingChildName(false);
      return;
    }
    renameChild.mutate({ childId, displayName: next });
  };

  const requestDeleteChild = () => {
    setConfirmState({ type: "delete-child" });
  };

  const requestClearBonus = () => {
    if (!evaluation || evaluation.bonusMinutes <= 0) return;
    setConfirmState({ type: "clear-bonus" });
  };

  const openGrantBonus = () => {
    setGrantMinutes(15);
    setGrantCustomMode(false);
    setGrantBonusOpen(true);
  };

  const closeGrantBonus = () => {
    if (grantBonus.isPending) return;
    setGrantBonusOpen(false);
    setGrantMinutes(15);
    setGrantCustomMode(false);
  };

  const confirmGrantBonus = () => {
    if (
      grantMinutes < GRANT_MINUTES_MIN ||
      grantMinutes > GRANT_MINUTES_MAX ||
      grantBonus.isPending
    ) {
      return;
    }
    grantBonus.mutate({ childId, minutes: grantMinutes });
  };

  const handleConfirmDestructive = () => {
    if (!confirmState) return;
    switch (confirmState.type) {
      case "delete-child":
        deleteChild.mutate(
          { childId },
          { onSuccess: () => setConfirmState(null) }
        );
        break;
      case "clear-bonus":
        clearBonus.mutate(
          { childId },
          { onSuccess: () => setConfirmState(null) }
        );
        break;
    }
  };

  const confirmDialogCopy = (() => {
    if (!confirmState) {
      return { title: "", description: "", confirmLabel: "Confirm", busy: false };
    }
    if (confirmState.type === "delete-child") {
      const deviceCount = child.devices.length;
      return {
        title: "Delete child?",
        description: `Delete ${child.displayName} and ${deviceCount} connected device${deviceCount === 1 ? "" : "s"}? This cannot be undone.`,
        confirmLabel: "Delete child",
        busy: deleteChild.isPending,
      };
    }
    if (!evaluation) {
      return {
        title: "",
        description: "",
        confirmLabel: "Confirm",
        busy: false,
      };
    }
    return {
      title: "Clear bonus minutes?",
      description: `Clear +${evaluation.bonusMinutes} bonus minutes for ${child.displayName}? Their daily limit returns to ${evaluation.dailyLimitMinutes} min. If they've already used more than that, devices will lock.`,
      confirmLabel: "Clear bonus",
      busy: clearBonus.isPending,
    };
  })();

  const effectiveLimit = evaluation
    ? evaluation.dailyLimitMinutes + evaluation.bonusMinutes
    : 0;
  const remainingFraction = evaluation
    ? getBindingRemainingFraction(evaluation)
    : 0;
  const usageFillClass =
    !evaluation ||
    evaluation.status === "blocked" ||
    remainingFraction <= 0.2
      ? "bg-destructive/35"
      : evaluation.status === "outside_window"
        ? "bg-yellow-500/35"
        : "bg-primary/30";

  const remainingDisplay = evaluation
    ? getPolicyRemainingDisplay(evaluation)
    : null;

  const grantBonusForm = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GRANT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={grantBonus.isPending}
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
          disabled={grantBonus.isPending}
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
        disabled={grantBonus.isPending}
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={confirmGrantBonus}
        disabled={
          grantBonus.isPending ||
          grantMinutes < GRANT_MINUTES_MIN ||
          grantMinutes > GRANT_MINUTES_MAX
        }
      >
        <ClockPlus className="mr-1.5 h-4 w-4" />
        {grantBonus.isPending ? "Granting…" : `Grant +${grantMinutes} min`}
      </Button>
    </div>
  );

  return (
    <>
      <div>
        <InlineBackLink className="mb-3" />

        {editingChildName ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveChildName();
              }}
            >
              <Input
                value={childNameDraft}
                onChange={(e) => setChildNameDraft(e.target.value)}
                className="max-w-xs text-lg font-semibold h-11"
                autoFocus
                maxLength={50}
              />
              <Button type="submit" size="sm" disabled={renameChild.isPending}>
                {renameChild.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingChildName(false)}
              >
                Cancel
              </Button>
            </form>
            <Button
              variant="destructive"
              size="sm"
              onClick={requestDeleteChild}
              disabled={deleteChild.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteChild.isPending ? "Deleting..." : "Delete child"}
            </Button>
          </div>
        ) : (
          <PageHeader
            title={child.displayName}
            description="Devices, screen time limits, and captures for this child"
            action={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden min-h-11 min-w-11"
                  onClick={() => setChildActionsOpen(true)}
                  aria-label="More actions"
                  title="More actions"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
                <div className="hidden md:flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startRenameChild}
                    title="Rename child"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={requestDeleteChild}
                    disabled={deleteChild.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleteChild.isPending ? "Deleting..." : "Delete child"}
                  </Button>
                </div>
              </>
            }
          />
        )}

        {evaluation && (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-border bg-card md:mt-2 md:border-0 md:bg-transparent">
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500 ease-out md:hidden ${usageFillClass}`}
              style={{ width: `${remainingFraction * 100}%` }}
              aria-hidden
            />
            <div className="relative z-10 p-4 md:p-0">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  variant={evaluationStatusBadgeVariant(evaluation)}
                >
                  {getEvaluationStatusLabel(evaluation)}
                </Badge>
                <span
                  className={cn(
                    "text-sm",
                    remainingDisplay?.usedTodaySecondary
                      ? "text-muted-foreground"
                      : "text-foreground/90 md:text-muted-foreground"
                  )}
                  title="Refreshes every 30s from agent heartbeats (realtime updates sooner)"
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
                  disabled={grantBonus.isPending}
                >
                  <ClockPlus className="mr-1 h-3.5 w-3.5" />
                  {grantBonus.isPending ? "Granting…" : "Grant bonus"}
                </Button>
                {evaluation.bonusMinutes > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={requestClearBonus}
                    disabled={clearBonus.isPending}
                  >
                    {clearBonus.isPending ? "Clearing…" : "Clear bonus"}
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
                    style={{ width: `${remainingFraction * 100}%` }}
                  />
                </div>
                <PolicyRemainingFooter evaluation={evaluation} />
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomSheet
        open={childActionsOpen}
        onClose={() => setChildActionsOpen(false)}
        title={child.displayName}
        showDone={false}
      >
        <div className="flex flex-col gap-3 pb-1">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-3 max-md:min-h-14"
            disabled={!evaluation || grantBonus.isPending}
            onClick={() => {
              setChildActionsOpen(false);
              openGrantBonus();
            }}
          >
            <ClockPlus className="h-5 w-5" />
            Grant bonus
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-3 max-md:min-h-14"
            onClick={() => {
              setChildActionsOpen(false);
              startRenameChild();
            }}
          >
            <Pencil className="h-5 w-5" />
            Rename
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-start gap-3 max-md:min-h-14"
            disabled={deleteChild.isPending}
            onClick={() => {
              setChildActionsOpen(false);
              requestDeleteChild();
            }}
          >
            <Trash2 className="h-5 w-5" />
            Delete child
          </Button>
        </div>
      </BottomSheet>

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
        open={confirmState !== null}
        onClose={() => setConfirmState(null)}
        title={confirmDialogCopy.title}
        description={confirmDialogCopy.description}
        confirmLabel={confirmDialogCopy.confirmLabel}
        busy={confirmDialogCopy.busy}
        onConfirm={handleConfirmDestructive}
      />
    </>
  );
}
