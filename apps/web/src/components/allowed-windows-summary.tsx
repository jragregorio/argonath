import type { AllowedWindow } from "@warden/shared";
import { cn } from "@warden/ui";
import {
  ALLOWED_ANY_TIME_MESSAGE,
  formatDayLabels,
  formatTimeRange12,
  groupWindowsByRange,
} from "@/lib/time-format";

type AllowedWindowsSummaryProps = {
  windows: AllowedWindow[];
  className?: string;
  "aria-live"?: "polite" | "assertive" | "off";
};

export function AllowedWindowsSummary({
  windows,
  className,
  "aria-live": ariaLive,
}: AllowedWindowsSummaryProps) {
  if (windows.length === 0) {
    return (
      <p
        className={cn("text-sm text-muted-foreground", className)}
        aria-live={ariaLive}
      >
        {ALLOWED_ANY_TIME_MESSAGE}
      </p>
    );
  }

  const groups = groupWindowsByRange(windows);

  return (
    <ul
      className={cn("space-y-1 text-sm text-muted-foreground", className)}
      aria-live={ariaLive}
    >
      {groups.map(({ days, start, end }) => (
        <li
          key={`${start}|${end}|${days.join(",")}`}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
        >
          <span className="text-foreground">{formatDayLabels(days)}</span>
          <span className="shrink-0 tabular-nums">
            {formatTimeRange12(start, end)}
          </span>
        </li>
      ))}
    </ul>
  );
}
