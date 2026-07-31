"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
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
  initialVisible?: number;
  emptyDescription?: string;
};

export function RecentActivityCard({
  items,
  hideChildName = false,
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
        <CardContent className="py-10 text-center text-muted-foreground">
          <Activity className="mx-auto mb-3 h-10 w-10 opacity-50" />
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

          return (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5"
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
              </div>
              <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </p>
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
