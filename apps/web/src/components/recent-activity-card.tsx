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
  /** Denser rows for narrow columns (timestamp under detail). */
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
  const activityItems = items ?? [];
  const visible = showAll
    ? activityItems
    : activityItems.slice(0, initialVisible);

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
          const when = new Date(item.createdAt).toLocaleString();

          return (
            <li
              key={item.id}
              className={cn(
                "px-4 py-3",
                compact
                  ? "space-y-1"
                  : "flex flex-wrap items-start justify-between gap-3 sm:px-5 sm:py-3.5"
              )}
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
                {compact && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {when}
                  </p>
                )}
              </div>
              {!compact && (
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {when}
                </p>
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
