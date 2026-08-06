"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { cn } from "@warden/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatActivityDetail,
  getActivityLabel,
  getActivityMessage,
} from "@/lib/activity";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/lib/format-relative-time";

export type RecentActivityItem = {
  id: string;
  action: string;
  createdAt: Date | string;
  metadata?: Record<string, unknown> | null;
  actor?: {
    name?: string | null;
    email?: string | null;
  } | null;
  childName?: string | null;
  deviceName?: string | null;
};

type RecentActivityCardProps = {
  items: RecentActivityItem[] | undefined;
  /** Hide child name in the detail line (useful on the child detail page). */
  hideChildName?: boolean;
  /** Denser rows (timestamp always under detail, including desktop). */
  compact?: boolean;
  initialVisible?: number;
  emptyDescription?: string;
};

export function RecentActivityCard({
  items,
  hideChildName = false,
  compact = false,
  initialVisible = 5,
  emptyDescription = "Lockdowns, captures, nudges, and policy changes will show here",
}: RecentActivityCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activityItems = items ?? [];
  const visible = showAll
    ? activityItems
    : activityItems.slice(0, initialVisible);

  const toggleExpanded = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent
          className={cn(
            "text-center text-muted-foreground",
            compact ? "px-4 py-8" : "py-10"
          )}
        >
          <Activity
            className={cn(
              "mx-auto mb-3 opacity-50",
              compact ? "h-8 w-8" : "h-10 w-10"
            )}
          />
          <p>No activity yet</p>
          <p className="mt-1 text-sm">{emptyDescription}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-border">
        {visible.map((item) => {
          const detail = formatActivityDetail({
            ...item,
            childName: hideChildName ? null : item.childName,
          });
          const message = getActivityMessage(item);
          const actorName =
            item.actor?.name?.trim() ||
            item.actor?.email ||
            (item.actor ? null : "Agent");
          const when = formatRelativeTime(item.createdAt);
          const whenTitle = formatAbsoluteTime(item.createdAt);
          const expanded = expandedId === item.id;

          return (
            <li
              key={item.id}
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              className={cn(
                "cursor-pointer px-4 py-3 sm:px-5 sm:py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                compact
                  ? "space-y-1"
                  : "flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-3"
              )}
              onClick={() => toggleExpanded(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleExpanded(item.id);
                }
              }}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">
                  {getActivityLabel(item.action, item.metadata)}
                </p>
                {message && (
                  <p className="text-sm text-foreground/90">
                    &ldquo;{message}&rdquo;
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {[detail, actorName ? `by ${actorName}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {/* Stacked timestamp: always on mobile; also when compact on desktop */}
                <time
                  dateTime={new Date(item.createdAt).toISOString()}
                  title={whenTitle}
                  className={cn(
                    "text-xs tabular-nums text-muted-foreground",
                    !compact && "md:hidden"
                  )}
                >
                  {when}
                </time>
                {expanded && (
                  <p className="text-xs text-muted-foreground/80">
                    {whenTitle}
                  </p>
                )}
              </div>
              {!compact && (
                <time
                  dateTime={new Date(item.createdAt).toISOString()}
                  title={whenTitle}
                  className="hidden shrink-0 text-xs tabular-nums text-muted-foreground md:block"
                >
                  {when}
                </time>
              )}
            </li>
          );
        })}
      </ul>
      {activityItems.length > initialVisible && (
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll
              ? "Show less"
              : `Show ${activityItems.length - initialVisible} more`}
          </Button>
        </div>
      )}
    </Card>
  );
}
