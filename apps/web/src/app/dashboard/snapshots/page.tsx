"use client";

import { trpc } from "@/lib/trpc";
import { useFamilyRealtime } from "@/lib/realtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Video } from "lucide-react";

export default function SnapshotsPage() {
  const utils = trpc.useUtils();
  const { data: snapshots, isLoading } = trpc.snapshot.list.useQuery({});
  const { data: devices } = trpc.device.list.useQuery();

  const deviceIds = devices?.map((d) => d.id) ?? [];
  useFamilyRealtime(deviceIds, (event) => {
    if (event.type === "snapshot:ready") {
      utils.snapshot.list.invalidate();
    }
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Snapshots"
        description="On-demand screen and webcam captures from your children's devices"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden p-0">
              <Skeleton className="aspect-video w-full rounded-none rounded-t-xl" />
              <div className="p-6 pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-40" />
              </div>
            </Card>
          ))}
        </div>
      ) : snapshots && snapshots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {snapshots.map((snapshot) => (
            <Card key={snapshot.id} className="overflow-hidden">
              <div className="aspect-video bg-secondary relative">
                {snapshot.url ? (
                  <img
                    src={snapshot.url}
                    alt={`${snapshot.type} capture`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {snapshot.type === "screen" ? (
                      <Camera className="w-8 h-8" />
                    ) : (
                      <Video className="w-8 h-8" />
                    )}
                  </div>
                )}
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {snapshot.child.displayName}
                  </CardTitle>
                  <Badge variant="secondary">
                    {snapshot.type === "screen" ? "Screen" : "Webcam"}
                  </Badge>
                </div>
                <CardDescription>
                  {snapshot.device.machineName} ·{" "}
                  {new Date(snapshot.capturedAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No snapshots yet.</p>
            <p className="text-sm mt-1">
              Use the capture buttons on a child&apos;s device card to take a
              screenshot or webcam photo.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
