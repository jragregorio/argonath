"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import {
  ActivityFeedSkeleton,
  ExtensionRequestCardsSkeleton,
} from "@/components/dashboard-skeletons";
import { RecentActivityCard } from "@/components/recent-activity-card";
import { PendingExtensionRequestCard } from "@/components/pending-extension-request-card";
import { Clock } from "lucide-react";
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

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pending</h2>

        {pendingLoading && !requests ? (
          <ExtensionRequestCardsSkeleton />
        ) : requests && requests.length > 0 ? (
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
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No pending extension requests</p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">All activity</h2>

        {activityLoading && !activity ? (
          <ActivityFeedSkeleton />
        ) : (
          <RecentActivityCard
            items={activity}
            initialVisible={ACTIVITY_LIMIT}
            emptyDescription="Lockdowns, captures, nudges, extensions, and policy changes will show here"
          />
        )}
      </section>
    </div>
  );
}
