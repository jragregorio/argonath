import { HydrationBoundary } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard-shell";
import { prefetchDashboardShell } from "@/lib/trpc-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = await prefetchDashboardShell();

  return (
    <HydrationBoundary state={state ?? undefined}>
      <DashboardShell>{children}</DashboardShell>
    </HydrationBoundary>
  );
}
