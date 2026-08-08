"use client";

import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardThemeProvider } from "@/components/dashboard-theme";
import { DashboardVisibilityRefresh } from "@/components/dashboard-visibility-refresh";
import { NativeAppResumeRefresh } from "@/components/native-app-resume-refresh";
import { PushTokenSync } from "@/components/native-push-bootstrap";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { FamilyRealtimeProvider } from "@/lib/family-realtime";
import { ToastProvider } from "@/lib/toast";

/**
 * Dashboard chrome: theme, realtime, PTR (Capacitor), resume/visibility refresh.
 * FCM deep-link listener left out after client crash.
 * Theme provider lives here so Settings (and all dashboard pages) are always under context.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardThemeProvider>
      <FamilyRealtimeProvider>
        <ToastProvider>
          <PushTokenSync />
          <NativeAppResumeRefresh />
          <DashboardVisibilityRefresh />
          <PullToRefresh>
            <div className="flex w-full min-h-dvh flex-col overflow-x-hidden md:h-dvh md:min-h-0 md:flex-row md:overflow-hidden">
              <DashboardNav />
              <main className="relative flex-1 min-h-0 min-w-0 overflow-x-hidden p-5 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:overflow-y-auto md:p-8 md:pb-8">
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
          </PullToRefresh>
        </ToastProvider>
      </FamilyRealtimeProvider>
    </DashboardThemeProvider>
  );
}
