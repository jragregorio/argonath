"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getDeviceDisplayName } from "@warden/shared";
import { cn } from "@warden/ui";
import {
  getPolicyRemainingDisplay,
  type PolicyRemainingDisplayInput,
} from "@/lib/policy-remaining-display";
import { formatRelativeTime } from "@/lib/format-relative-time";

export type ChildRosterDevice = {
  id: string;
  displayName: string | null;
  machineName: string | null;
  isOnline: boolean;
  lastSeenAt?: Date | string | null;
};

export type ChildRosterItem = {
  id: string;
  displayName: string;
  href: string;
  devices: ChildRosterDevice[];
  evaluation?: PolicyRemainingDisplayInput;
};

function isAnyDeviceOnline(devices: ChildRosterDevice[]): boolean {
  return devices.some((d) => d.isOnline);
}

function getRemainingOneLiner(
  evaluation: PolicyRemainingDisplayInput | undefined
): string | null {
  if (!evaluation) return null;
  const display = getPolicyRemainingDisplay(evaluation);
  return display.primaryText ?? display.statusText;
}

function formatOnlineDeviceNames(devices: ChildRosterDevice[]): string | null {
  if (devices.length === 0) return null;
  const sorted = [...devices].sort(
    (a, b) => Number(b.isOnline) - Number(a.isOnline)
  );
  const names = sorted.map((d) => getDeviceDisplayName(d));
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function getMaxLastSeenAt(devices: ChildRosterDevice[]): Date | null {
  let max: Date | null = null;
  for (const d of devices) {
    if (!d.lastSeenAt) continue;
    const date =
      d.lastSeenAt instanceof Date ? d.lastSeenAt : new Date(d.lastSeenAt);
    if (Number.isNaN(date.getTime())) continue;
    if (!max || date.getTime() > max.getTime()) max = date;
  }
  return max;
}

function getOfflineSubtitle(devices: ChildRosterDevice[]): string {
  if (devices.length === 0) return "No devices paired";
  const maxSeen = getMaxLastSeenAt(devices);
  if (!maxSeen) return "Offline";
  return `Offline · ${formatRelativeTime(maxSeen)}`;
}

type ChildRosterListProps = {
  items: ChildRosterItem[];
  className?: string;
};

export function ChildRosterList({ items, className }: ChildRosterListProps) {
  const router = useRouter();

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

        const rowA11y =
          "cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

        if (online) {
          const remaining = getRemainingOneLiner(item.evaluation);
          const deviceNames = formatOnlineDeviceNames(item.devices);

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
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-base font-medium">
                  {item.displayName}
                </p>
                {remaining ? (
                  <p className="truncate text-sm text-muted-foreground">
                    {remaining}
                  </p>
                ) : null}
                {deviceNames ? (
                  <p className="truncate text-sm text-muted-foreground">
                    {deviceNames}
                  </p>
                ) : null}
              </div>
              <Badge variant="success" className="shrink-0">
                Online
              </Badge>
            </div>
          );
        }

        return (
          <div
            key={item.id}
            role="link"
            tabIndex={0}
            onClick={navigate}
            onKeyDown={handleKeyDown}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5",
              rowA11y
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium">
                {item.displayName}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {getOfflineSubtitle(item.devices)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
