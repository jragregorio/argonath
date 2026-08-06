import { Suspense } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import { OverviewSkeleton } from "@/components/dashboard-skeletons";
import { prefetchDashboardOverview } from "@/lib/trpc-server";
import OverviewClient from "./overview-client";

async function OverviewWithData() {
  const state = await prefetchDashboardOverview();
  return (
    <HydrationBoundary state={state ?? undefined}>
      <OverviewClient />
    </HydrationBoundary>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewWithData />
    </Suspense>
  );
}
