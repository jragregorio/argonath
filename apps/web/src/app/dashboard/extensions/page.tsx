"use client";

import { trpc } from "@/lib/trpc";
import { useFamilyRealtime } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getDeviceDisplayName } from "@warden/shared";
import { Check, X, Clock, History } from "lucide-react";

function formatWhen(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function resolverLabel(user: { name: string | null; email: string } | null) {
  if (!user) return null;
  return user.name?.trim() || user.email;
}

export default function ExtensionsPage() {
  const utils = trpc.useUtils();
  const { data: requests, isLoading: pendingLoading } =
    trpc.extension.listPending.useQuery(undefined, {
      refetchInterval: 5000,
    });
  const { data: history, isLoading: historyLoading } =
    trpc.extension.listHistory.useQuery(
      { limit: 50 },
      { refetchInterval: 15_000 }
    );
  const { data: devices } = trpc.device.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  const resolve = trpc.extension.resolve.useMutation({
    onSuccess: () => {
      utils.extension.listPending.invalidate();
      utils.extension.listHistory.invalidate();
      utils.children.list.invalidate();
      utils.dashboard.navBadges.invalidate();
      utils.dashboard.overview.invalidate();
    },
  });

  const deviceIds = devices?.map((d) => d.id) ?? [];
  useFamilyRealtime(deviceIds, () => {
    utils.extension.listPending.invalidate();
    utils.extension.listHistory.invalidate();
    utils.dashboard.navBadges.invalidate();
    utils.dashboard.overview.invalidate();
  });

  const isLoading = pendingLoading || historyLoading;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Extension requests"
        description="Approve or deny extra screen time, and review past decisions"
      />

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-64 max-w-full mt-2" />
              </CardHeader>
              <CardContent className="flex gap-3">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Pending</h2>

            {requests && requests.length > 0 ? (
              <div className="space-y-4">
                {requests.map((request) => (
                  <Card key={request.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2 min-w-0">
                          <Clock className="w-5 h-5 shrink-0" />
                          <span className="truncate">
                            {request.child.displayName}
                          </span>
                        </CardTitle>
                        <Badge variant="warning">Pending</Badge>
                      </div>
                      <CardDescription>
                        Requesting +{request.requestedMinutes} minutes on{" "}
                        {getDeviceDisplayName(request.device)} ·{" "}
                        {formatWhen(request.createdAt)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex gap-3">
                      <Button
                        onClick={() =>
                          resolve.mutate({
                            requestId: request.id,
                            approved: true,
                          })
                        }
                        disabled={resolve.isPending}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          resolve.mutate({
                            requestId: request.id,
                            approved: false,
                          })
                        }
                        disabled={resolve.isPending}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Deny
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No pending extension requests</p>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">History</h2>

            {history && history.length > 0 ? (
              <div className="space-y-3">
                {history.map((request) => {
                  const approved = request.status === "approved";
                  const who = resolverLabel(request.resolvedByUser);

                  return (
                    <Card key={request.id} className="py-4 px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <History className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">
                              {request.child.displayName}
                            </span>
                            <Badge
                              variant={approved ? "success" : "destructive"}
                            >
                              {approved ? "Approved" : "Denied"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            +{request.requestedMinutes} minutes on{" "}
                            {getDeviceDisplayName(request.device)}
                            {who ? ` · by ${who}` : ""}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {formatWhen(request.resolvedAt ?? request.createdAt)}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No resolved requests yet</p>
                  <p className="text-sm mt-1">
                    Approved and denied requests will show up here
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
