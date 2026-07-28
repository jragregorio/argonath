"use client";

import { useFamilyRealtime } from "@/lib/realtime";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Monitor, AlertCircle, Lock, Unlock, Users, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDeviceDisplayName } from "@warden/shared";
import {
  optimisticAdminLock,
  rollbackAdminLock,
} from "@/lib/device-cache";

export default function DashboardPage() {
  const utils = trpc.useUtils();
  const { data: children, isLoading } = trpc.children.list.useQuery();
  const { data: devices } = trpc.device.list.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const { data: pendingRequests } = trpc.extension.listPending.useQuery();
  const setAdminLock = trpc.device.setAdminLock.useMutation({
    onMutate: async ({ deviceId, locked }) =>
      optimisticAdminLock(utils, deviceId, locked),
    onError: (_err, _vars, context) => rollbackAdminLock(utils, context),
    onSettled: () => {
      void utils.device.list.invalidate();
      void utils.children.list.invalidate();
    },
  });

  const deviceIds = devices?.map((d) => d.id) ?? [];

  useFamilyRealtime(deviceIds, () => {
    utils.children.list.invalidate();
    utils.device.list.invalidate();
    utils.extension.listPending.invalidate();
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-9 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <div>
          <Skeleton className="h-7 w-28 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-28 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Monitor your family's screen time at a glance"
      />

      {pendingRequests && pendingRequests.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              Pending extension requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {pendingRequests.length} request(s) waiting for your approval
            </p>
            <Link
              href="/dashboard/extensions"
              className="text-primary hover:underline text-sm"
            >
              Review requests →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="relative">
            <div className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <CardDescription>Children</CardDescription>
            <CardTitle className="text-3xl">{children?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="relative">
            <div className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <CardDescription>Devices online</CardDescription>
            <CardTitle className="text-3xl">
              {devices?.filter((d) => d.isOnline).length ?? 0}
              <span className="text-lg text-muted-foreground font-normal">
                /{devices?.length ?? 0}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="relative">
            <div className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <CardDescription>Pending requests</CardDescription>
            <CardTitle className="text-3xl">
              {pendingRequests?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Devices</h2>
        {devices && devices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {devices.map((device) => (
              <Card key={device.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Monitor className="w-5 h-5" />
                      {getDeviceDisplayName(device)}
                    </CardTitle>
                    <Badge variant={device.isOnline ? "success" : "secondary"}>
                      {device.isOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-2">
                    <span>{device.child.displayName}</span>
                    {device.isLocked && <Badge variant="secondary">Locked</Badge>}
                    {device.adminLock && (
                      <Badge variant="destructive">Locked down</Badge>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  {device.adminLock ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAdminLock.mutate({
                          deviceId: device.id,
                          locked: false,
                        })
                      }
                    >
                      <Unlock className="w-4 h-4 mr-2" />
                      Release lockdown
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setAdminLock.mutate({
                          deviceId: device.id,
                          locked: true,
                        })
                      }
                      disabled={!device.deviceToken}
                      title={
                        !device.deviceToken
                          ? "Device must be paired first"
                          : undefined
                      }
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      LOCK DOWN
                    </Button>
                  )}
                  <Link
                    href={`/dashboard/children/${device.child.id}`}
                    className="text-primary hover:underline text-sm"
                  >
                    Manage →
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No devices paired yet.</p>
              <Link
                href="/dashboard/children"
                className="text-primary hover:underline text-sm mt-2 inline-block"
              >
                Add a child and pair a device →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
