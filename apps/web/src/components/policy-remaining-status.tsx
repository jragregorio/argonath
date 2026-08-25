"use client";

import { cn } from "@warden/ui";
import {
  getPolicyRemainingDisplay,
  getUsableAfterHoursBonusMinutes,
  type PolicyRemainingDisplayInput,
} from "@/lib/policy-remaining-display";

/** Single mobile caption: used/limit today, optional bonus, optional after-hours suffix. */
export function getPolicyRemainingMobileCaption(
  evaluation: PolicyRemainingDisplayInput
): string {
  const effectiveLimit =
    evaluation.dailyLimitMinutes + evaluation.bonusMinutes;
  let caption = `${evaluation.usedMinutes} / ${effectiveLimit} min today`;
  if (evaluation.bonusMinutes > 0) {
    caption += ` (+${evaluation.bonusMinutes})`;
  }
  const display = getPolicyRemainingDisplay(evaluation);
  if (display.afterHoursText) {
    const afterHoursBonus = getUsableAfterHoursBonusMinutes(evaluation);
    if (afterHoursBonus > 0) {
      caption += ` · +${afterHoursBonus} after hours`;
    }
  }
  return caption;
}

type PolicyRemainingStatusProps = {
  evaluation: PolicyRemainingDisplayInput;
  className?: string;
  mutedClassName?: string;
};

/** Primary remaining line when schedule or after-hours bonus is the binding story. */
export function PolicyWindowRemainingPrimary({
  evaluation,
  className,
}: PolicyRemainingStatusProps) {
  const display = getPolicyRemainingDisplay(evaluation);
  if (
    (display.layout !== "window_binding" &&
      display.layout !== "after_hours") ||
    !display.primaryText
  ) {
    return null;
  }

  return (
    <p
      className={cn(
        "text-sm tabular-nums",
        display.primaryClassName,
        className
      )}
    >
      {display.primaryText}
    </p>
  );
}

/** Secondary window/after-hours line(s), or the default single status line. */
export function PolicyRemainingFooter({
  evaluation,
  className,
  mutedClassName = "text-sm md:text-xs text-muted-foreground",
}: PolicyRemainingStatusProps) {
  const display = getPolicyRemainingDisplay(evaluation);

  if (
    display.layout === "window_binding" ||
    display.layout === "after_hours"
  ) {
    return (
      <div className={cn("space-y-0.5", className)}>
        <p className={mutedClassName}>{display.secondaryText}</p>
        {display.afterHoursText ? (
          <p className="text-sm md:text-xs font-medium text-bonus-foreground">
            {display.afterHoursText}
          </p>
        ) : null}
      </div>
    );
  }

  return <p className={cn(mutedClassName, className)}>{display.statusText}</p>;
}

/** Mobile hero: binding remaining at text-2xl, or status line at text-base when no primary. */
export function PolicyRemainingMobileHero({
  evaluation,
  className,
}: PolicyRemainingStatusProps) {
  const display = getPolicyRemainingDisplay(evaluation);

  if (display.primaryText) {
    return (
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          display.primaryClassName,
          className
        )}
      >
        {display.primaryText}
      </p>
    );
  }

  return (
    <p className={cn("text-base font-semibold", className)}>
      {display.statusText}
    </p>
  );
}

/** Mobile single caption under hero (and optional bar). */
export function PolicyRemainingMobileCaption({
  evaluation,
  className,
}: PolicyRemainingStatusProps) {
  return (
    <p className={cn("text-sm tabular-nums text-muted-foreground", className)}>
      {getPolicyRemainingMobileCaption(evaluation)}
    </p>
  );
}
