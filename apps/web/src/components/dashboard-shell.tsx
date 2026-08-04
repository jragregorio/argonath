"use client";

import { DashboardNav } from "@/components/dashboard-nav";
import { PushTokenSync } from "@/components/native-push-bootstrap";
import { FamilyRealtimeProvider } from "@/lib/family-realtime";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <FamilyRealtimeProvider>
      <PushTokenSync />
      <div className="flex w-full min-h-dvh flex-col overflow-x-hidden md:h-dvh md:min-h-0 md:flex-row md:overflow-hidden">
        <DashboardNav />
        <main className="relative flex-1 min-h-0 min-w-0 overflow-x-hidden p-5 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:overflow-y-auto md:p-8 md:pb-8">
          <div
            className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-attention/8 blur-[100px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -left-20 bottom-20 h-64 w-64 rounded-full bg-primary/10 blur-[90px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </FamilyRealtimeProvider>
  );
}
