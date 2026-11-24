"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/page-header";
import {
  ActivityFeedSkeleton,
  ExtensionRequestCardsSkeleton,
} from "@/components/dashboard-skeletons";
import { RecentActivityCard } from "@/components/recent-activity-card";
import { PendingExtensionRequestCard } from "@/components/pending-extension-request-card";
import { FilterChip, FilterChipRow } from "@/components/filter-chip";
import {
  ACTIVITY_CATEGORY_LABELS,
  collapsePresenceRuns,
  getActivityCategory,
  type ActivityCategory,
} from "@/lib/activity";
import { POLL_SAFETY_MS } from "@/lib/query-defaults";
import { useToast } from "@/lib/toast";

const ACTIVITY_LIMIT = 100;

export default function ActivityPage() {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: requests, isLoading: pendingLoading } =
    trpc.extension.listPending.useQuery(undefined, {
      refetchInterval: POLL_SAFETY_MS,
    });
  const { data: activity, isLoading: activityLoading } =
    trpc.dashboard.activity.useQuery(
      { limit: ACTIVITY_LIMIT },
      { refetchInterval: POLL_SAFETY_MS }
    );
  const [childFilter, setChildFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<
    ActivityCategory | "all"
  >("all");

  // Chips only for children / categories that actually appear in the feed.
  const childNames = useMemo(
    () =>
      [
        ...new Set(
          (activity ?? [])
            .map((item) => item.childName)
            .filter((name): name is string => Boolean(name))
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [activity]
  );
  const categories = useMemo(() => {
    const present = new Set(
      (activity ?? []).map((item) => getActivityCategory(item.action))
    );
    return (Object.keys(ACTIVITY_CATEGORY_LABELS) as ActivityCategory[]).filter(
      (category) => present.has(category)
    );
  }, [activity]);

  const filteredActivity = useMemo(() => {
    if (!activity) return undefined;
    const filtered = activity.filter(
      (item) =>
        (childFilter === "all" || item.childName === childFilter) &&
        (categoryFilter === "all" ||
          getActivityCategory(item.action) === categoryFilter)
    );
    return collapsePresenceRuns(filtered);
  }, [activity, childFilter, categoryFilter]);

  const resolve = trpc.extension.resolve.useMutation({
    onMutate: async ({ requestId }) => {
      await utils.extension.listPending.cancel();
      const previousPending = utils.extension.listPending.getData();
      const request = previousPending?.find((r) => r.id === requestId);
      utils.extension.listPending.setData(undefined, (old) =>
        old?.filter((request) => request.id !== requestId)
      );
      return { previousPending, request };
    },
    onError: (err, _vars, context) => {
      if (context?.previousPending !== undefined) {
        utils.extension.listPending.setData(
          undefined,
          context.previousPending
        );
      }
      void utils.extension.listPending.invalidate();
      showToast(err.message || "Could not resolve extension request", "error");
    },
    onSuccess: (_data, { approved }, context) => {
      const request = context?.request;
      if (approved) {
        const minutes = request?.requestedMinutes;
        const childName = request?.child.displayName ?? "Child";
        showToast(
          minutes != null
            ? `Extension approved — ${childName} now has +${minutes} min.`
            : `Extension approved for ${childName}.`,
          "success"
        );
      } else {
        showToast("Extension request denied.");
      }
      void utils.extension.listPending.invalidate();
      void utils.dashboard.navBadges.invalidate();
      void utils.dashboard.overview.invalidate();
      void utils.dashboard.activity.invalidate();
      void utils.children.list.invalidate();
    },
  });

  const resolvingId =
    resolve.isPending && resolve.variables
      ? resolve.variables.requestId
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Pending requests and family history"
      />

      {/* Pending only takes space when there is something to decide. */}
      {pendingLoading && !requests ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Pending</h2>
          <ExtensionRequestCardsSkeleton />
        </section>
      ) : requests && requests.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Pending{" "}
            <span className="text-muted-foreground font-normal">
              ({requests.length})
            </span>
          </h2>
          <div className="space-y-4">
            {requests.map((request) => {
              const busy = resolvingId === request.id;
              return (
                <PendingExtensionRequestCard
                  key={request.id}
                  request={request}
                  busy={busy}
                  onApprove={() =>
                    resolve.mutate({
                      requestId: request.id,
                      approved: true,
                    })
                  }
                  onDeny={() =>
                    resolve.mutate({
                      requestId: request.id,
                      approved: false,
                    })
                  }
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">All activity</h2>

        {(childNames.length > 1 || categories.length > 1) && (
          <div className="space-y-3">
            {childNames.length > 1 && (
              <FilterChipRow label="Child">
                <FilterChip
                  active={childFilter === "all"}
                  onClick={() => setChildFilter("all")}
                >
                  All
                </FilterChip>
                {childNames.map((name) => (
                  <FilterChip
                    key={name}
                    active={childFilter === name}
                    onClick={() => setChildFilter(name)}
                  >
                    {name}
                  </FilterChip>
                ))}
              </FilterChipRow>
            )}
            {categories.length > 1 && (
              <FilterChipRow label="Type">
                <FilterChip
                  active={categoryFilter === "all"}
                  onClick={() => setCategoryFilter("all")}
                >
                  All
                </FilterChip>
                {categories.map((category) => (
                  <FilterChip
                    key={category}
                    active={categoryFilter === category}
                    onClick={() => setCategoryFilter(category)}
                  >
                    {ACTIVITY_CATEGORY_LABELS[category]}
                  </FilterChip>
                ))}
              </FilterChipRow>
            )}
          </div>
        )}

        {activityLoading && !activity ? (
          <ActivityFeedSkeleton />
        ) : (
          <RecentActivityCard
            items={filteredActivity}
            initialVisible={ACTIVITY_LIMIT}
            groupByDay
            emptyDescription={
              childFilter !== "all" || categoryFilter !== "all"
                ? "Nothing matches these filters"
                : "Lockdowns, captures, nudges, extensions, and policy changes will show here"
            }
          />
        )}
      </section>
    </div>
  );
}
