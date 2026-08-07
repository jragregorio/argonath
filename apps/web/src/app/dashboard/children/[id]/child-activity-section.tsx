"use client";

import {
  RecentActivityCard,
  type RecentActivityItem,
} from "@/components/recent-activity-card";

type ChildActivitySectionProps = {
  items: RecentActivityItem[] | undefined;
};

export function ChildActivitySection({ items }: ChildActivitySectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Recent activity</h2>
      <RecentActivityCard
        items={items}
        hideChildName
        emptyDescription="Nudges, lockdowns, captures, and policy changes for this child will show here"
      />
    </div>
  );
}
