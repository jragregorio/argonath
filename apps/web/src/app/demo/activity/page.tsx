"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { RecentActivityCard } from "@/components/recent-activity-card";
import { getDeviceDisplayName } from "@warden/shared";
import { Check, X, Clock } from "lucide-react";
import { useDemo } from "@/lib/demo/demo-provider";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/lib/format-relative-time";

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
                <Card key={request.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="flex min-w-0 items-center gap-2">
                        <Clock className="h-5 w-5 shrink-0" />
                        <span className="truncate">
                          {request.child.displayName}
                        </span>
                      </CardTitle>
                      <Badge variant="warning">Pending</Badge>
                    </div>
                    <CardDescription>
                      Requesting +{request.requestedMinutes} minutes on{" "}
                      {getDeviceDisplayName(request.device)} ·{" "}
                      <time
                        dateTime={new Date(request.createdAt).toISOString()}
                        title={formatAbsoluteTime(request.createdAt)}
                      >
                        {formatRelativeTime(request.createdAt)}
                      </time>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => handleApprove(request.id)}
                      disabled={busy}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full sm:w-auto"
                      onClick={() => handleDeny(request.id)}
                      disabled={busy}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Deny
                    </Button>
                  </CardContent>
                </Card>
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
