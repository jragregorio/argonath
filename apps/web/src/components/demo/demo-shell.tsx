"use client";

import { DemoBanner } from "@/components/demo/demo-banner";
import { DemoFeedback } from "@/components/demo/demo-feedback";
import { DemoNav } from "@/components/demo/demo-nav";
import { DemoSignupPrompt } from "@/components/demo/signup-prompt";

export function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner />
      <div className="flex min-h-[calc(100dvh-2.75rem)] w-full flex-col overflow-x-hidden md:h-[calc(100dvh-2.75rem)] md:min-h-0 md:flex-row md:overflow-hidden">
        <DemoNav />
        <main className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden p-5 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:overflow-y-auto md:p-8 md:pb-8">
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
      <DemoFeedback />
      <DemoSignupPrompt />
    </>
  );
}
