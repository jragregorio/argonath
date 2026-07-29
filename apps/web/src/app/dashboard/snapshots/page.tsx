"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useFamilyRealtime } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getDeviceDisplayName } from "@warden/shared";
import { Camera, Loader2, Trash2, Video, X } from "lucide-react";

type SnapshotStatusFilter = "all" | "ready" | "pending" | "failed";

function statusBadgeVariant(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "pending") return "warning" as const;
  return "secondary" as const;
}

function statusLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Pending";
  return status;
}

export default function SnapshotsPage() {
  const utils = trpc.useUtils();
  const [childFilter, setChildFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] =
    useState<SnapshotStatusFilter>("all");
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const listInput = {
    ...(childFilter !== "all" ? { childId: childFilter } : {}),
    status: statusFilter,
  };

  const { data: children } = trpc.children.list.useQuery();
  const { data: snapshots, isLoading } = trpc.snapshot.list.useQuery(listInput, {
    refetchInterval: 5000,
  });
  const { data: devices } = trpc.device.list.useQuery();
  const markAllViewed = trpc.snapshot.markAllViewed.useMutation({
    onSuccess: () => {
      utils.dashboard.navBadges.invalidate();
    },
  });
  const deleteSnapshot = trpc.snapshot.delete.useMutation({
    onSuccess: () => {
      utils.snapshot.list.invalidate();
      utils.dashboard.navBadges.invalidate();
      utils.dashboard.activity.invalidate();
      setLightboxId((current) =>
        current && deleteSnapshot.variables?.snapshotId === current
          ? null
          : current
      );
    },
  });

  useEffect(() => {
    markAllViewed.mutate();
    // Mark ready snapshots as viewed once when opening this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only
  }, []);

  const deviceIds = devices?.map((d) => d.id) ?? [];
  useFamilyRealtime(deviceIds, (event) => {
    if (
      event.type === "snapshot:ready" ||
      event.type === "snapshot:failed"
    ) {
      utils.snapshot.list.invalidate();
      markAllViewed.mutate();
    }
  });

  useEffect(() => {
    if (!lightboxId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxId]);

  const lightbox = snapshots?.find((snapshot) => snapshot.id === lightboxId);

  const confirmDelete = (snapshotId: string) => {
    const ok = window.confirm("Delete this snapshot? This cannot be undone.");
    if (ok) deleteSnapshot.mutate({ snapshotId });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Snapshots"
        description="On-demand screen and webcam captures from your children's devices"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="child-filter"
            className="block text-xs text-muted-foreground mb-1"
          >
            Child
          </label>
          <select
            id="child-filter"
            value={childFilter}
            onChange={(e) => setChildFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm min-w-[10rem]"
          >
            <option value="all">All children</option>
            {children?.map((child) => (
              <option key={child.id} value={child.id}>
                {child.displayName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="status-filter"
            className="block text-xs text-muted-foreground mb-1"
          >
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as SnapshotStatusFilter)
            }
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm min-w-[9rem]"
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

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
            <Card key={snapshot.id} className="overflow-hidden p-0">
              <button
                type="button"
                className="aspect-video bg-secondary relative w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  if (snapshot.status === "ready" && snapshot.url) {
                    setLightboxId(snapshot.id);
                  }
                }}
                disabled={snapshot.status !== "ready" || !snapshot.url}
              >
                {snapshot.url ? (
                  <img
                    src={snapshot.url}
                    alt={`${snapshot.type} capture`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                    {snapshot.status === "pending" ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : snapshot.type === "screen" ? (
                      <Camera className="w-8 h-8" />
                    ) : (
                      <Video className="w-8 h-8" />
                    )}
                    <span className="text-xs">
                      {snapshot.status === "pending"
                        ? "Waiting for device…"
                        : snapshot.status === "failed"
                          ? "Capture failed"
                          : "Preview unavailable"}
                    </span>
                  </div>
                )}
              </button>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm truncate">
                    {snapshot.child.displayName}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={statusBadgeVariant(snapshot.status)}>
                      {statusLabel(snapshot.status)}
                    </Badge>
                    <Badge variant="secondary">
                      {snapshot.type === "screen" ? "Screen" : "Webcam"}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  {getDeviceDisplayName(snapshot.device)} ·{" "}
                  {new Date(snapshot.capturedAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-4 pt-0 flex gap-2">
                {snapshot.status === "ready" && snapshot.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLightboxId(snapshot.id)}
                  >
                    View
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => confirmDelete(snapshot.id)}
                  disabled={deleteSnapshot.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No snapshots match these filters.</p>
            <p className="text-sm mt-1">
              Use the capture buttons on a child&apos;s device card to take a
              screenshot or webcam photo.
            </p>
          </CardContent>
        </Card>
      )}

      {lightbox && lightbox.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Snapshot preview"
          onClick={() => setLightboxId(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {lightbox.child.displayName} ·{" "}
                  {lightbox.type === "screen" ? "Screen" : "Webcam"}
                </p>
                <p className="text-sm text-white/70">
                  {getDeviceDisplayName(lightbox.device)} ·{" "}
                  {new Date(lightbox.capturedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => confirmDelete(lightbox.id)}
                  disabled={deleteSnapshot.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:text-white hover:bg-white/10"
                  onClick={() => setLightboxId(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <img
              src={lightbox.url}
              alt={`${lightbox.type} capture`}
              className="w-full max-h-[80vh] object-contain rounded-lg bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
