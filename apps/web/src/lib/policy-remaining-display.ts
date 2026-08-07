import {
  getOutsideExtensionRemainingMinutes,
  getPolicyStatusLabel,
  type PolicyEvaluation,
} from "@warden/shared";
import { formatClockInText } from "@/lib/time-format";

export type PolicyRemainingDisplayInput = Pick<
  PolicyEvaluation,
  | "status"
  | "limitingFactor"
  | "remainingMinutes"
  | "dailyRemainingMinutes"
  | "windowRemainingMinutes"
  | "windowCapacityMinutes"
  | "reachableMinutesToday"
  | "inWindow"
  | "nextWindowStart"
  | "message"
  | "usedMinutes"
  | "dailyLimitMinutes"
  | "bonusMinutes"
>;

export type PolicyRemainingDisplay = {
  layout: "window_binding" | "after_hours" | "default";
  statusText: string;
  primaryText: string | null;
  secondaryText: string | null;
  /** Usable bonus that applies after allowed hours end; null when not shown. */
  afterHoursText: string | null;
  primaryClassName: string;
  usedTodaySecondary: boolean;
};

const WINDOW_URGENCY_REMAINING_MINUTES = 60;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function isWindowBindingAllowed(
  evaluation: PolicyRemainingDisplayInput
): boolean {
  return (
    evaluation.status === "allowed" && evaluation.limitingFactor === "window"
  );
}

export function isAfterHoursBonusAllowed(
  evaluation: PolicyRemainingDisplayInput
): boolean {
  return (
    evaluation.status === "allowed" &&
    evaluation.inWindow === false &&
    evaluation.bonusMinutes > 0 &&
    evaluation.remainingMinutes > 0
  );
}

/**
 * Minutes of bonus that still apply once allowed hours end (in-window preview).
 * Matches unused after-hours grant size before pierce baseline exists.
 */
export function getUsableAfterHoursBonusMinutes(
  evaluation: Pick<
    PolicyRemainingDisplayInput,
    "bonusMinutes" | "usedMinutes" | "dailyLimitMinutes"
  >
): number {
  return getOutsideExtensionRemainingMinutes({
    bonusMinutes: evaluation.bonusMinutes,
    usedMinutesToday: evaluation.usedMinutes,
    dailyLimitMinutes: evaluation.dailyLimitMinutes,
    baselineUsedMinutes: null,
  });
}

/**
 * Progress fill for the binding constraint (option D):
 * - window binding → access left / today's window capacity
 * - after-hours bonus → session remaining / granted bonus
 * - daily limit → daily remaining / effective limit
 */
export function getBindingRemainingFraction(
  evaluation: PolicyRemainingDisplayInput
): number {
  if (
    evaluation.limitingFactor === "none" ||
    evaluation.remainingMinutes >= 999
  ) {
    return 1;
  }

  if (
    evaluation.status === "blocked" ||
    evaluation.status === "outside_window"
  ) {
    return 0;
  }

  if (isAfterHoursBonusAllowed(evaluation)) {
    return clamp01(
      evaluation.remainingMinutes /
        Math.max(evaluation.bonusMinutes, evaluation.remainingMinutes, 1)
    );
  }

  if (evaluation.limitingFactor === "window") {
    const remaining =
      evaluation.windowRemainingMinutes ?? evaluation.remainingMinutes;
    const capacity =
      evaluation.windowCapacityMinutes && evaluation.windowCapacityMinutes > 0
        ? evaluation.windowCapacityMinutes
        : evaluation.reachableMinutesToday;
    return clamp01(remaining / Math.max(capacity, remaining, 1));
  }

  const effectiveLimit =
    evaluation.dailyLimitMinutes + evaluation.bonusMinutes;
  if (effectiveLimit <= 0) return 0;
  return clamp01(evaluation.dailyRemainingMinutes / effectiveLimit);
}

export function getBindingRemainingPercent(
  evaluation: PolicyRemainingDisplayInput
): number {
  return Math.round(getBindingRemainingFraction(evaluation) * 100);
}

export function getWindowBindingPrimaryClassName(
  remainingMinutes: number
): string {
  if (remainingMinutes <= WINDOW_URGENCY_REMAINING_MINUTES) {
    return "font-medium text-amber-700 dark:text-amber-300";
  }
  return "font-medium text-foreground";
}

function buildDefaultStatusText(
  evaluation: PolicyRemainingDisplayInput
): string {
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
  return `${evaluation.remainingMinutes} min left now`;
}

export function getPolicyRemainingDisplay(
  evaluation: PolicyRemainingDisplayInput
): PolicyRemainingDisplay {
  const statusText = buildDefaultStatusText(evaluation);

  if (isWindowBindingAllowed(evaluation)) {
    const afterHoursBonus = getUsableAfterHoursBonusMinutes(evaluation);
    return {
      layout: "window_binding",
      statusText,
      primaryText: `${evaluation.remainingMinutes} min left today`,
      secondaryText: `Allowed hours ending · ${evaluation.dailyRemainingMinutes} min of daily budget left`,
      afterHoursText:
        afterHoursBonus > 0
          ? `+${afterHoursBonus} min allowed after hours end`
          : null,
      primaryClassName: getWindowBindingPrimaryClassName(
        evaluation.remainingMinutes
      ),
      usedTodaySecondary: true,
    };
  }

  if (isAfterHoursBonusAllowed(evaluation)) {
    return {
      layout: "after_hours",
      statusText,
      primaryText: `${evaluation.remainingMinutes} min left today`,
      secondaryText: `After-hours bonus · ${evaluation.dailyRemainingMinutes} min of daily budget left`,
      afterHoursText: null,
      primaryClassName: getWindowBindingPrimaryClassName(
        evaluation.remainingMinutes
      ),
      usedTodaySecondary: true,
    };
  }

  return {
    layout: "default",
    statusText,
    primaryText: null,
    secondaryText: null,
    afterHoursText: null,
    primaryClassName: "",
    usedTodaySecondary: false,
  };
}
