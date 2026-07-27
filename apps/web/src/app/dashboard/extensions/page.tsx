"use client";

import { trpc } from "@/lib/trpc";
import { useFamilyRealtime } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Clock } from "lucide-react";

export default function ExtensionsPage() {
  const utils = trpc.useUtils();
  const { data: requests, isLoading } = trpc.extension.listPending.useQuery();
  const { data: devices } = trpc.device.list.useQuery();
  const resolve = trpc.extension.resolve.useMutation({
    onSuccess: () => {
      utils.extension.listPending.invalidate();
      utils.children.list.invalidate();
    },
  });

  const deviceIds = devices?.map((d) => d.id) ?? [];
  useFamilyRealtime(deviceIds, () => {
    utils.extension.listPending.invalidate();
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Extension requests"
        description="Approve or deny your child's requests for more screen time"
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
      ) : requests && requests.length > 0 ? (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    {request.child.displayName}
                  </CardTitle>
                  <Badge variant="warning">Pending</Badge>
                </div>
                <CardDescription>
                  Requesting +{request.requestedMinutes} minutes on{" "}
                  {request.device.machineName ?? "device"} ·{" "}
                  {new Date(request.createdAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button
                  onClick={() =>
                    resolve.mutate({ requestId: request.id, approved: true })
                  }
                  disabled={resolve.isPending}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    resolve.mutate({ requestId: request.id, approved: false })
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
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No pending extension requests</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
