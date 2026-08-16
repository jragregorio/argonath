"use client";

import { useParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { ChildDetailSkeleton } from "@/components/dashboard-skeletons";
import { InlineBackLink } from "@/components/sticky-back-chip";
import { POLL_HEARTBEAT_MS } from "@/lib/query-defaults";
import { ChildActivitySection } from "./child-activity-section";
import { ChildDevicesSection } from "./child-devices-section";
import { ChildPolicySection } from "./child-policy-section";
import { ChildVisibleAppsSection } from "./child-visible-apps-section";
import { ChildUsageHeader } from "./child-usage-header";

export default function ChildDetailPage() {
  const params = useParams();
  const childId = params.id as string;

  const { data: child, isLoading } = trpc.children.get.useQuery(
    { childId },
    {
      placeholderData: keepPreviousData,
      refetchInterval: POLL_HEARTBEAT_MS,
    }
  );
  const { data: evaluation } = trpc.policy.getEvaluation.useQuery(
    { childId },
    {
      placeholderData: keepPreviousData,
      refetchInterval: POLL_HEARTBEAT_MS,
    }
  );
  const { data: activity } = trpc.dashboard.activity.useQuery(
    { limit: 30, childId },
    { refetchInterval: POLL_HEARTBEAT_MS }
  );

  if (isLoading) {
    return <ChildDetailSkeleton />;
  }

  if (!child) {
    return (
      <div className="space-y-4">
        <InlineBackLink />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Child not found</p>
            <p className="text-sm mt-1">
              It may have been removed, or you don&apos;t have access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChildUsageHeader
        child={child}
        childId={childId}
        evaluation={evaluation}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <ChildDevicesSection child={child} childId={childId} />
        <ChildPolicySection childId={childId} policy={child.policies[0]} />
      </div>

      <ChildVisibleAppsSection devices={child.devices} />

      <ChildActivitySection items={activity} />
    </div>
  );
}
