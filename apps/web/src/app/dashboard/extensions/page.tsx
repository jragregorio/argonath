"use client";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ExtensionRequestCardsSkeleton } from "@/components/dashboard-skeletons";
import { getDeviceDisplayName } from "@warden/shared";
import { Check, X, Clock, History } from "lucide-react";
import { POLL_SAFETY_MS } from "@/lib/query-defaults";

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
      // extension:requested / approved / denied invalidate; safety if Realtime drops
      refetchInterval: POLL_SAFETY_MS,
    });
  const { data: history, isLoading: historyLoading } =
    trpc.extension.listHistory.useQuery(
      { limit: 50 },
      { refetchInterval: POLL_SAFETY_MS }
    );

  const resolve = trpc.extension.resolve.useMutation({
    onMutate: async ({ requestId }) => {
      await utils.extension.listPending.cancel();
      const previousPending = utils.extension.listPending.getData();
      utils.extension.listPending.setData(undefined, (old) =>
        old?.filter((request) => request.id !== requestId)
      );
      return { previousPending };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPending !== undefined) {
        utils.extension.listPending.setData(
          undefined,
          context.previousPending
        );
      }
      void utils.extension.listPending.invalidate();
    },
    onSuccess: () => {
      void utils.extension.listPending.invalidate();
      void utils.extension.listHistory.invalidate();
      void utils.dashboard.navBadges.invalidate();
      void utils.dashboard.overview.invalidate();
      void utils.dashboard.activity.invalidate();
      void utils.children.list.invalidate();
    },
  });

  const resolvingId =
    resolve.isPending && resolve.variables
      ? resolve.variables.requestId
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Extension requests"
        description="Approve or deny extra screen time, and review past decisions"
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pending</h2>

        {pendingLoading && !requests ? (
          <ExtensionRequestCardsSkeleton />
        ) : requests && requests.length > 0 ? (
          <div className="space-y-4">
            {requests.map((request) => {
              const busy = resolvingId === request.id;
              return (
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
                  <CardContent className="flex flex-col sm:flex-row gap-3">
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() =>
                        resolve.mutate({
                          requestId: request.id,
                          approved: true,
                        })
                      }
                      disabled={busy}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        resolve.mutate({
                          requestId: request.id,
                          approved: false,
                        })
                      }
                      disabled={busy}
                    >
                      <X className="w-4 h-4 mr-2" />
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
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No pending extension requests</p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">History</h2>

        {historyLoading && !history ? (
          <ExtensionRequestCardsSkeleton count={2} />
        ) : history && history.length > 0 ? (
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
    </div>
  );
}
