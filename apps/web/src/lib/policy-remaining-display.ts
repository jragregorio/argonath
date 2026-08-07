import {
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
  | "nextWindowStart"
  | "message"
>;

export type PolicyRemainingDisplay = {
  layout: "window_binding" | "default";
  statusText: string;
  primaryText: string | null;
  secondaryText: string | null;
  primaryClassName: string;
  usedTodaySecondary: boolean;
};

const WINDOW_URGENCY_REMAINING_MINUTES = 60;

export function isWindowBindingAllowed(
  evaluation: PolicyRemainingDisplayInput
): boolean {
  return (
    evaluation.status === "allowed" && evaluation.limitingFactor === "window"
  );
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
    return {
      layout: "window_binding",
      statusText,
      primaryText: `${evaluation.remainingMinutes} min left today`,
      secondaryText: `Allowed hours ending · ${evaluation.dailyRemainingMinutes} min of daily budget left`,
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
    primaryClassName: "",
    usedTodaySecondary: false,
  };
}
