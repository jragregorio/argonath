import { HydrationBoundary } from "@tanstack/react-query";
import { prefetchDashboardOverview } from "@/lib/trpc-server";
import DashboardOverviewPage from "./overview-client";

export default async function DashboardPage() {
  const state = await prefetchDashboardOverview();

  if (!state) {
    return <DashboardOverviewPage />;
  }

  return (
    <HydrationBoundary state={state}>
      <DashboardOverviewPage />
    </HydrationBoundary>
  );
}
