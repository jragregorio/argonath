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

/** Primary remaining line when allowed hours are the binding limit. */
export function PolicyWindowRemainingPrimary({
  evaluation,
  className,
}: PolicyRemainingStatusProps) {
  const display = getPolicyRemainingDisplay(evaluation);
  if (display.layout !== "window_binding" || !display.primaryText) {
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

/** Secondary window-binding line, or the default single status line. */
export function PolicyRemainingFooter({
  evaluation,
  className,
  mutedClassName = "text-sm md:text-xs text-muted-foreground",
}: PolicyRemainingStatusProps) {
  const display = getPolicyRemainingDisplay(evaluation);
  const text =
    display.layout === "window_binding"
      ? display.secondaryText
      : display.statusText;

  return <p className={cn(mutedClassName, className)}>{text}</p>;
}
