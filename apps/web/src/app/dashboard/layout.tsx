import { Suspense } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard-shell";
import { dashboardThemeFoucScript } from "@/components/dashboard-theme-constants";
import { prefetchDashboardShell } from "@/lib/trpc-server";

async function DashboardLayoutData({
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: dashboardThemeFoucScript }} />
      <Suspense fallback={<DashboardShell>{children}</DashboardShell>}>
        <DashboardLayoutData>{children}</DashboardLayoutData>
      </Suspense>
    </>
  );
}
