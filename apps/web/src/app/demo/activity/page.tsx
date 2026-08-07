"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { RecentActivityCard } from "@/components/recent-activity-card";
import { PendingExtensionRequestCard } from "@/components/pending-extension-request-card";
import { Clock } from "lucide-react";
import { useDemo } from "@/lib/demo/demo-provider";

const ACTIVITY_LIMIT = 100;

export default function DemoActivityPage() {
  const {
    pendingExtensions,
    activity,
    approveExtension,
    denyExtension,
  } = useDemo();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleApprove = (requestId: string) => {
    setResolvingId(requestId);
    approveExtension(requestId);
    window.setTimeout(() => setResolvingId(null), 400);
  };

  const handleDeny = (requestId: string) => {
    setResolvingId(requestId);
    denyExtension(requestId);
    window.setTimeout(() => setResolvingId(null), 400);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Pending requests and family history"
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pending</h2>

        {pendingExtensions.length > 0 ? (
          <div className="space-y-4">
            {pendingExtensions.map((request) => {
              const busy = resolvingId === request.id;
              return (
                <PendingExtensionRequestCard
                  key={request.id}
                  request={request}
                  busy={busy}
                  onApprove={() => handleApprove(request.id)}
                  onDeny={() => handleDeny(request.id)}
                />
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Clock className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p>No pending extension requests</p>
              <p className="mt-1 text-sm">
                Approve Alex&apos;s request from the demo, or reload to reset.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">All activity</h2>
        <RecentActivityCard
          items={activity}
          initialVisible={ACTIVITY_LIMIT}
          emptyDescription="Lockdowns, captures, nudges, extensions, and policy changes will show here"
        />
      </section>
    </div>
  );
}
