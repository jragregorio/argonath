"use client";

import { cn } from "@warden/ui";
import {
  getPolicyRemainingDisplay,
  type PolicyRemainingDisplayInput,
} from "@/lib/policy-remaining-display";

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
          <p
            className={cn(
              "text-sm md:text-xs font-medium",
              // Plume undertone lifted for readable body text on dark surfaces
              "text-[color-mix(in_srgb,#e8e0f0_78%,var(--color-plume))]"
            )}
          >
            {display.afterHoursText}
          </p>
        ) : null}
      </div>
    );
  }

  return <p className={cn(mutedClassName, className)}>{display.statusText}</p>;
}
