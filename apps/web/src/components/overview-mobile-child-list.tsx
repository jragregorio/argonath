"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  getDeviceDisplayName,
  getEvaluationStatusLabel,
  type PolicyEvaluation,
  type PolicyStatus,
  type RunningApp,
} from "@warden/shared";
import { cn } from "@warden/ui";
import {
  evaluationStatusBadgeVariant,
  getBindingRemainingPercent,
  type PolicyRemainingDisplayInput,
} from "@/lib/policy-remaining-display";
import {
  PolicyRemainingMobileCaption,
  PolicyRemainingMobileHero,
} from "@/components/policy-remaining-status";
import { formatClockInText } from "@/lib/time-format";

function progressBarClass(status: PolicyStatus) {
  if (status === "blocked") return "bg-destructive";
  if (status === "outside_window") return "bg-yellow-500";
  return "bg-primary";
}

export type OverviewMobileChildDevice = {
  id: string;
  displayName: string | null;
  machineName: string | null;
  isOnline: boolean;
  isLocked: boolean;
  adminLock: boolean;
  runningApps?: RunningApp[] | null;
};

export type OverviewMobileChildItem = {
  id: string;
  displayName: string;
  href: string;
  evaluation: PolicyRemainingDisplayInput & Pick<PolicyEvaluation, "status">;
  devices: OverviewMobileChildDevice[];
};

function isAnyDeviceOnline(devices: OverviewMobileChildDevice[]): boolean {
  return devices.some((d) => d.isOnline);
}

function formatDeviceNames(devices: OverviewMobileChildDevice[]): string | null {
  if (devices.length === 0) return null;
  const sorted = [...devices].sort(
    (a, b) => Number(b.isOnline) - Number(a.isOnline)
  );
  const names = sorted.map((d) => getDeviceDisplayName(d));
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function getForegroundAppLabel(
  devices: OverviewMobileChildDevice[]
): string | null {
  const sorted = [...devices].sort(
    (a, b) => Number(b.isOnline) - Number(a.isOnline)
  );
  for (const device of sorted) {
    const apps = device.runningApps;
    if (!apps?.length) continue;
    const foreground = apps.find((a) => a.isForeground);
    if (foreground) {
      const label = foreground.title?.trim() || foreground.processName?.trim();
      if (label) return label;
    }
  }
  return null;
}

function getAwaySubtitle(
  devices: OverviewMobileChildDevice[],
  evaluation: PolicyRemainingDisplayInput
): string {
  if (devices.length === 0) return "No devices paired";
  if (evaluation.nextWindowStart) {
    return `Offline · ${formatClockInText(evaluation.nextWindowStart)}`;
  }
  return "Offline";
}

function shouldShowAwayStatusBadge(
  evaluation: PolicyRemainingDisplayInput
): boolean {
  const label = getEvaluationStatusLabel(evaluation);
  return label !== "Within limits";
}

type OverviewMobileChildListProps = {
  items: OverviewMobileChildItem[];
  className?: string;
};

export function OverviewMobileChildList({
  items,
  className,
}: OverviewMobileChildListProps) {
  const router = useRouter();

  const rowA11y =
    "cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => {
        const online = isAnyDeviceOnline(item.devices);
        const navigate = () => router.push(item.href);
        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate();
          }
        };

        if (online) {
          const { evaluation } = item;
          const percent = getBindingRemainingPercent(evaluation);
          const deviceNames = formatDeviceNames(item.devices);
          const foregroundApp = getForegroundAppLabel(item.devices);
          const footerParts = [deviceNames, foregroundApp].filter(Boolean);

          return (
            <div
              key={item.id}
              role="link"
              tabIndex={0}
              onClick={navigate}
              onKeyDown={handleKeyDown}
              className={cn(
                "rounded-2xl border border-border bg-card px-4 py-4",
                rowA11y
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-xl font-semibold">
                  {item.displayName}
                </p>
                <Badge
                  variant={evaluationStatusBadgeVariant(evaluation)}
                  className="shrink-0 text-sm px-3 py-1"
                >
                  {getEvaluationStatusLabel(evaluation)}
                </Badge>
              </div>

              <div className="mt-4 space-y-2">
                <PolicyRemainingMobileHero evaluation={evaluation} />
                <div className="h-3.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-[width] ${progressBarClass(
                      evaluation.status
                    )}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <PolicyRemainingMobileCaption evaluation={evaluation} />
              </div>

              <div className="mt-3 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                {footerParts.length > 0 ? (
                  <p className="min-w-0 flex-1 truncate">
                    {footerParts.join(" · ")}
                  </p>
                ) : (
                  <span className="min-w-0 flex-1" />
                )}
                <Badge variant="success" className="shrink-0">
                  Online
                </Badge>
              </div>
            </div>
          );
        }

        const awayLabel = getEvaluationStatusLabel(item.evaluation);
        const showAwayBadge = shouldShowAwayStatusBadge(item.evaluation);

        return (
          <div
            key={item.id}
            role="link"
            tabIndex={0}
            onClick={navigate}
            onKeyDown={handleKeyDown}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3",
              rowA11y
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium">
                {item.displayName}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {getAwaySubtitle(item.devices, item.evaluation)}
              </p>
            </div>
            {showAwayBadge ? (
              <Badge
                variant={evaluationStatusBadgeVariant(item.evaluation)}
                className="shrink-0 text-xs px-2.5 py-0.5"
              >
                {awayLabel}
              </Badge>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
